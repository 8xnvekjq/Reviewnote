import test from 'node:test';
import assert from 'node:assert/strict';
import { createBroadcastTransport } from '../../src/features/exam/broadcastTransport.ts';

test('private transport shares topics across StrictMode replay, drops offline sends, and serializes a pending leave/rejoin', async () => {
  let connected = true, created = 0, removed = 0;
  let finishLeave: () => void = () => {};
  const channels: Array<any> = [];
  const client = {
    realtime: { isConnected: () => connected, async setAuth() {} },
    channel(topic: string, options: unknown) {
      created++;
      assert.equal(topic, 'exam-live:paper');
      assert.deepEqual(options, { config: { private: true, broadcast: { self: false, ack: false }, presence: { enabled: true } } });
      const channel = {
        state: 'joined', sent: [] as unknown[], callback: (_: unknown) => {}, status: (_: string) => {},
        on(_type: string, _filter: unknown, fn: (message: unknown) => void) { this.callback = fn; return this; },
        subscribe(fn: (state: string) => void) { this.status = fn; fn('SUBSCRIBED'); return this; },
        async send(message: unknown) { this.sent.push(message); },
      };
      channels.push(channel); return channel;
    },
    removeChannel(channel: { state: string }) {
      removed++; channel.state = 'leaving';
      return new Promise(resolve => { finishLeave = () => resolve('ok'); });
    },
  };
  const transport = createBroadcastTransport(client as unknown as Parameters<typeof createBroadcastTransport>[0]);
  const heard: unknown[] = [];
  const first = transport.open('exam-live:paper','ink', value => heard.push(value), () => {});
  await Promise.resolve();
  first.send('ink', { sequence: 1 }); assert.equal(channels[0].sent.length, 1);
  connected = false; first.send('ink', {}); assert.equal(channels[0].sent.length, 1);
  connected = true; channels[0].state = 'errored'; first.send('ink', {}); assert.equal(channels[0].sent.length, 1);
  channels[0].state = 'joined';
  first.close();
  const second = transport.open('exam-live:paper','ink', value => heard.push(value), () => {});
  await Promise.resolve();
  assert.equal(created,1); assert.equal(removed,0, 'effect replay retains the existing subscription');
  channels[0].callback({ payload: 'hello' }); assert.deepEqual(heard,['hello']);
  first.send('ink', {}); assert.equal(channels[0].sent.length, 1, 'disposed handle cannot send');
  second.close(); await Promise.resolve(); assert.equal(removed,1);
  const third = transport.open('exam-live:paper','ink', () => {}, () => {});
  third.send('ink', {}); assert.equal(created,1, 'wait for leave acknowledgement');
  finishLeave(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(created,2); third.send('ink', {}); assert.equal(channels[1].sent.length, 1);
  channels[1].send = () => Promise.reject(new Error('offline'));
  third.send('ink', {}); await Promise.resolve();
  channels[1].send = () => { throw new Error('offline'); };
  assert.doesNotThrow(() => third.send('ink', {}));
  third.close(); await Promise.resolve(); finishLeave(); await Promise.resolve();
});

test('private join waits for fresh auth, reports failures once, recovers, and never sends before subscribed', async () => {
  let resolveAuth: () => void = () => {};
  let authCalls = 0, channelCalls = 0;
  const ready: boolean[] = [], warnings: unknown[][] = [], sent: unknown[] = [];
  let status: (state: string, error?: Error) => void = () => {};
  const channel = {
    state: 'joining',
    on() { return this; },
    subscribe(fn: typeof status) { status = fn; return this; },
    async send(message: unknown) { sent.push(message); },
  };
  const client = {
    realtime: {
      isConnected: () => true,
      setAuth(...args: unknown[]) {
        assert.deepEqual(args, [], 'do not pin a stale manual JWT');
        authCalls++;
        return new Promise<void>(resolve => { resolveAuth = resolve; });
      },
    },
    channel(_topic: string, options: unknown) {
      channelCalls++;
      assert.deepEqual(options, { config: { private: true, broadcast: { self: false, ack: false }, presence: { enabled: false } } });
      return channel;
    },
    async removeChannel() { return 'ok'; },
  };
  const originalWarn = console.warn;
  console.warn = (...args) => { warnings.push(args); };
  try {
    const transport = createBroadcastTransport(client as unknown as Parameters<typeof createBroadcastTransport>[0]);
    const first = transport.open('exam-live-watch:paper','watch', () => {}, value => ready.push(value));
    first.close();
    const second = transport.open('exam-live-watch:paper','watch', () => {}, value => ready.push(value));
    await Promise.resolve();
    assert.equal(authCalls, 1); assert.equal(channelCalls, 0);
    second.send('watch', {}); assert.equal(sent.length, 0);
    resolveAuth(); await Promise.resolve();
    assert.equal(channelCalls, 1);
    status('CHANNEL_ERROR', new Error('Unauthorized: no read permission'));
    status('CHANNEL_ERROR', new Error('Unauthorized: no read permission'));
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0][0]), /exam-live-watch:paper.*Unauthorized/);
    channel.state = 'joined'; status('SUBSCRIBED');
    second.send('watch', {}); assert.equal(sent.length, 1);
    status('TIMED_OUT'); second.send('watch', {}); assert.equal(sent.length, 1);
    assert.deepEqual(ready, [false, false, false, true, false]);
    second.close(); await Promise.resolve(); await Promise.resolve();
  } finally { console.warn = originalWarn; }
});

test('closing during auth prevents orphan subscriptions and a new open resolves auth again', async () => {
  const pending: Array<() => void> = [];
  let created = 0;
  const client = {
    realtime: { isConnected: () => true, setAuth: () => new Promise<void>(resolve => pending.push(resolve)) },
    channel() { created++; return { on() { return this; }, subscribe() { return this; } }; },
    async removeChannel() { return 'ok'; },
  };
  const transport = createBroadcastTransport(client as unknown as Parameters<typeof createBroadcastTransport>[0]);
  transport.open('exam-live:paper','ink', () => {}, () => {}).close();
  await Promise.resolve();
  const next = transport.open('exam-live:paper','ink', () => {}, () => {});
  pending[0](); await Promise.resolve(); assert.equal(created, 0);
  pending[1](); await Promise.resolve(); assert.equal(created, 1);
  next.close(); await Promise.resolve(); await Promise.resolve();
});

test('installed supabase-js sends the session JWT and presence-enabled private join payload', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  let token = 'session-one';
  const client = createClient('https://example.supabase.co', 'anon-key', { accessToken: async () => token });
  client.realtime.isConnected = () => true;
  const originalChannel = client.channel.bind(client);
  const joins: any[] = [];
  client.channel = ((topic: string, options: any) => {
    const channel = originalChannel(topic, options);
    // Stop at the Phoenix wire boundary: real SDK auth, channel and subscribe
    // build the payload, but no socket or HTTP request is made.
    channel.channelAdapter.subscribe = (() => {
      joins.push(channel.joinPush.payload());
      return { receive() { return this; } };
    }) as any;
    return channel;
  }) as typeof client.channel;
  client.removeChannel = async channel => {
    client.realtime.channels = client.realtime.channels.filter(item => item !== channel);
    return 'ok';
  };
  const transport = createBroadcastTransport(client);
  const waitForJoin = async (count: number) => {
    for (let turn = 0; turn < 20 && joins.length < count; turn++) await Promise.resolve();
    assert.equal(joins.length, count);
  };
  const ink = transport.open('exam-live:paper', 'ink', () => {}, () => {});
  await waitForJoin(1);
  assert.equal(client.realtime.channels[0].topic, 'realtime:exam-live:paper');
  assert.equal(joins[0].access_token, 'session-one');
  assert.deepEqual(joins[0].config, {
    private: true, broadcast: { self: false, ack: false },
    presence: { enabled: true }, postgres_changes: [],
  });
  token = 'session-refreshed';
  const watch = transport.open('exam-live-watch:paper', 'watch', () => {}, () => {});
  await waitForJoin(2);
  assert.equal(joins[1].access_token, 'session-refreshed');
  assert.equal(joins[1].config.presence.enabled, false);
  assert.equal(client.realtime.channels[0].joinPush.payload().access_token, 'session-refreshed');
  ink.close(); watch.close(); await Promise.resolve(); await Promise.resolve();
});
