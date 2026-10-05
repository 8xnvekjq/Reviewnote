import test from 'node:test';
import assert from 'node:assert/strict';
import { createBroadcastTransport } from '../../src/features/exam/broadcastTransport.ts';
import { parseAssist, receiveAssist, emptyAssist } from '../../src/features/exam/ink/inkAssist.ts';

test('assist uses private acknowledged broadcast, unwraps envelopes, reports drops and failed sends, shares event bindings', async () => {
  let connected = true;
  let deliver: (message: any) => void = () => {};
  let notify: (state: string) => void = () => {};
  let response = 'ok', sends = 0;
  let student = emptyAssist();
  const ready: boolean[] = [];
  const other: unknown[] = [];
  const channel = {
    state: 'joining',
    on(type: string, filter: unknown, receive: typeof deliver) {
      assert.equal(type, 'broadcast'); assert.deepEqual(filter, { event: '*' }); deliver = receive; return this;
    },
    subscribe(status: typeof notify) { notify = status; return this; },
    async send(message: any) { sends++; if (response === 'reject') throw new Error('offline'); if (response === 'ok') deliver(message); return response; },
  };
  let joins = 0;
  const transport = createBroadcastTransport({
    realtime: { async setAuth() {}, isConnected: () => connected },
    channel(topic: string, config: unknown) {
      joins++; assert.equal(topic, 'exam-assist:attempt');
      assert.deepEqual(config, { config: { private: true, broadcast: { self: false, ack: true }, presence: { enabled: false } } });
      return channel;
    },
    async removeChannel() { return 'ok'; },
  } as unknown as Parameters<typeof createBroadcastTransport>[0]);
  const handle = transport.open('exam-assist:attempt', 'assist', value => {
    const parsed = parseAssist(value); assert.ok(parsed); student = receiveAssist(student, parsed, 'question', 100);
  }, value => ready.push(value));
  const message = { version: 1, kind: 'stroke', questionId: 'question', strokeId: 'stroke', points: [{ x: .2, y: .3 }], seq: 0, done: true };
  assert.equal(await handle.send('assist', message), false); assert.equal(sends, 0);
  await Promise.resolve(); channel.state = 'joined'; notify('SUBSCRIBED');
  assert.equal(await handle.send('assist', message), true); assert.equal(student.strokes.size, 1);
  const second = transport.open('exam-assist:attempt', 'another-event', value => other.push(value), () => {});
  deliver({ event: 'another-event', payload: 42 }); assert.deepEqual(other, [42]); assert.equal(joins, 1);
  response = 'error'; assert.equal(await handle.send('assist', message), false);
  response = 'timed out'; assert.equal(await handle.send('assist', message), false);
  response = 'reject'; assert.equal(await handle.send('assist', message), false);
  connected = false; assert.equal(await handle.send('assist', message), false); assert.equal(sends, 4);
  connected = true; notify('TIMED_OUT'); assert.equal(await handle.send('assist', message), false);
  response = 'ok'; notify('SUBSCRIBED'); assert.equal(await handle.send('assist', { version: 1, kind: 'clear', questionId: 'question' }), true);
  assert.equal(student.strokes.size, 0); assert.deepEqual(ready, [true, false, true]);
  handle.close(); second.close(); await Promise.resolve(); await Promise.resolve();
});

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
        async send(message: unknown) { this.sent.push(message); return 'ok'; },
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
  channels[0].callback({ event: 'ink', payload: 'hello' }); assert.deepEqual(heard,['hello']);
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
    async send(message: unknown) { sent.push(message); return 'ok'; },
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
  const heard: unknown[] = [];
  const assist = transport.open('exam-assist:attempt', 'assist', value => heard.push(value), () => {});
  await waitForJoin(3);
  assert.deepEqual(joins[2].config.broadcast, { self: false, ack: true });
  assert.equal(joins[2].config.private, true);
  assert.equal(joins[2].config.presence.enabled, false);
  const payload = { version: 1, kind: 'clear', questionId: 'question' };
  // Real installed SDK binding/filter/transform path, at the Phoenix wire boundary.
  (client.realtime.channels[2].channelAdapter as any).channel.trigger('broadcast', { event: 'assist', payload });
  assert.deepEqual(heard, [payload]);
  ink.close(); watch.close(); assist.close(); await Promise.resolve(); await Promise.resolve();
});
