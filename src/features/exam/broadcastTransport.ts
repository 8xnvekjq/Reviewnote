import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export interface LiveChannel { send(event: string, payload: unknown): void; close(): void }
export interface LiveTransport {
  open(topic: string, event: string, receive: (payload: unknown) => void, status: (ready: boolean) => void): LiveChannel;
}

/** One underlying subscription per topic, including React StrictMode effect replay. */
export function createBroadcastTransport(client: Pick<SupabaseClient, 'channel' | 'removeChannel' | 'realtime'>): LiveTransport {
  type Listener = { event: string; receive: (payload: unknown) => void; status: (ready: boolean) => void };
  type Entry = { channel?: RealtimeChannel; ready: boolean; closing: boolean; listeners: Set<Listener> };
  const entries = new Map<string, Entry>();
  return {
    open(topic, event, receive, status) {
      let entry = entries.get(topic);
      if (!entry) { entry = { ready: false, closing: false, listeners: new Set() }; entries.set(topic, entry); }
      const current = entry;
      const listener = { event, receive, status };
      current.listeners.add(listener);
      const start = () => {
        try {
          current.channel = client.channel(topic, { config: { private: true, broadcast: { self: false, ack: false } } });
          current.channel.on('broadcast', { event }, ({ payload }) => {
            if (!current.closing) for (const item of current.listeners) if (item.event === event) item.receive(payload);
          });
          current.channel.subscribe(state => {
            current.ready = state === 'SUBSCRIBED' && !current.closing;
            for (const item of current.listeners) item.status(current.ready);
          });
        } catch { current.ready = false; for (const item of current.listeners) item.status(false); }
      };
      if (!current.channel && !current.closing) start();
      else queueMicrotask(() => { if (current.listeners.has(listener)) status(current.ready); });
      return {
        send(name, payload) {
          const channel = current.channel;
          // send() otherwise falls back to HTTP in supabase-js. Drop instead.
          if (!current.listeners.has(listener) || !current.ready || current.closing || channel?.state !== 'joined' || !client.realtime.isConnected()) return;
          try { void channel.send({ type: 'broadcast', event: name, payload }).catch(() => {}); } catch { /* polling fallback */ }
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
              if (current.listeners.size) start(); else entries.delete(topic);
            }).catch(() => { /* no extra retry load: polling remains available */ });
          });
        },
      };
    },
  };
}
