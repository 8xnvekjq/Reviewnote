import test from 'node:test';
import assert from 'node:assert/strict';
import { createBroadcastTransport } from '../../src/features/exam/broadcastTransport.ts';

test('private transport shares topics across StrictMode replay, drops offline sends, and serializes a pending leave/rejoin', async () => {
  let connected = true, created = 0, removed = 0;
  let finishLeave: () => void = () => {};
  const channels: Array<any> = [];
  const client = {
    realtime: { isConnected: () => connected },
    channel(topic: string, options: unknown) {
      created++;
      assert.equal(topic, 'exam-live:paper');
      assert.deepEqual(options, { config: { private: true, broadcast: { self: false, ack: false } } });
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
  finishLeave(); await Promise.resolve(); await Promise.resolve();
  assert.equal(created,2); third.send('ink', {}); assert.equal(channels[1].sent.length, 1);
  channels[1].send = () => Promise.reject(new Error('offline'));
  third.send('ink', {}); await Promise.resolve();
  channels[1].send = () => { throw new Error('offline'); };
  assert.doesNotThrow(() => third.send('ink', {}));
  third.close(); await Promise.resolve(); finishLeave(); await Promise.resolve();
});
