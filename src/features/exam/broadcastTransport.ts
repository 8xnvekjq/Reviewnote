import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export interface LiveChannel { send(event: string, payload: unknown): void | Promise<boolean>; close(): void }
export interface LiveTransport {
  open(topic: string, event: string, receive: (payload: unknown) => void, status: (ready: boolean) => void): LiveChannel;
}

/** One underlying subscription per topic, including React StrictMode effect replay. */
export function createBroadcastTransport(client: Pick<SupabaseClient, 'channel' | 'removeChannel' | 'realtime'>): LiveTransport {
  type Listener = { event: string; receive: (payload: unknown) => void; status: (ready: boolean) => void };
  type Entry = { channel?: RealtimeChannel; starting?: boolean; ready: boolean; closing: boolean; listeners: Set<Listener> };
  const entries = new Map<string, Entry>();
  const warned = new Set<string>();
  const warn = (topic: string, reason: string) => {
    if (warned.has(topic)) return;
    warned.add(topic);
    console.warn(`[exam-live] ${topic}: ${reason}`);
  };
  return {
    open(topic, event, receive, status) {
      let entry = entries.get(topic);
      if (!entry) { entry = { ready: false, closing: false, listeners: new Set() }; entries.set(topic, entry); }
      const current = entry;
      const listener = { event, receive, status };
      current.listeners.add(listener);
      const start = async () => {
        current.starting = true;
        try {
          // Resolve the current session before joining a private channel, even on
          // an already-connected singleton socket. Keep callback-based token refresh.
          await client.realtime.setAuth();
          if (entries.get(topic) !== current || !current.listeners.size || current.closing) return;
          current.channel = client.channel(topic, { config: { private: true, broadcast: { self: false, ack: topic.startsWith('exam-assist:') },
            // Realtime requires a read permission to join. Ink publishers have
            // presence read only; no client tracks presence or receives other ink.
            presence: { enabled: topic.startsWith('exam-live:') } } });
          current.channel.on('broadcast', { event: '*' }, ({ event: name, payload }) => {
            if (!current.closing) for (const item of current.listeners) if (item.event === name) item.receive(payload);
          });
          current.channel.subscribe((state, error) => {
            current.ready = state === 'SUBSCRIBED' && !current.closing;
            if (!current.closing && (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT')) warn(topic, error?.message ?? state);
            for (const item of current.listeners) item.status(current.ready);
          });
        } catch (error) {
          current.ready = false;
          warn(topic, error instanceof Error ? error.message : 'Channel setup failed');
          for (const item of current.listeners) item.status(false);
        } finally { current.starting = false; }
      };
      if (!current.channel && !current.closing && !current.starting) void start();
      else queueMicrotask(() => { if (current.listeners.has(listener)) status(current.ready); });
      return {
        async send(name, payload) {
          const channel = current.channel;
          // send() otherwise falls back to HTTP in supabase-js. Drop instead.
          if (!current.listeners.has(listener) || !current.ready || current.closing || channel?.state !== 'joined' || !client.realtime.isConnected()) return false;
          try {
            const result = await channel.send({ type: 'broadcast', event: name, payload });
            if (result !== 'ok') { warn(topic, `Send failed: ${result}`); return false; }
            return true;
          } catch (error) { warn(topic, error instanceof Error ? error.message : 'Send failed'); return false; }
        },
        close() {
          current.listeners.delete(listener);
          queueMicrotask(() => {
            if (current.listeners.size || current.closing) return;
            current.closing = true; current.ready = false;
            const channel = current.channel;
            if (!channel) { entries.delete(topic); return; }
            void client.removeChannel(channel).then(() => {
              current.channel = undefined; current.closing = false;
              if (current.listeners.size) void start(); else entries.delete(topic);
            }).catch(() => { /* no extra retry load: polling remains available */ });
          });
        },
      };
    },
  };
}
