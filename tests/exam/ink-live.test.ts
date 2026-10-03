import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLiveInk } from '../../src/features/exam/ink/inkLive.ts';
import { inkDelta } from '../../src/features/exam/ink/inkReplay.ts';
import type { InkStroke } from '../../src/features/exam/contract.ts';
import { startLivePolling, pollBackoff, type PollEnvironment } from '../../src/features/exam/ui/livePolling.ts';

const stroke = (id: string): InkStroke => ({ id, tool: 'pen', color: '#123456', size: 2, points: [] });
test('live ink adds, erases, replaces and restores in the same order as replay; rejects gaps', () => {
  const initial = { revision: 3, strokes: [stroke('a'), stroke('b')] };
  const changed = [stroke('b'), stroke('c')];
  const delta = { mode: 'delta' as const, revision: 5, batches: [
    { revision: 4, events: [inkDelta(initial.strokes, changed, 'erase')] },
    { revision: 5, events: [inkDelta(changed, [], 'clear'), inkDelta([], changed, 'undo')] },
  ] };
  assert.deepEqual(applyLiveInk(initial, delta), applyLiveInk(null, { mode: 'full', revision: 5, strokes: changed }));
  assert.deepEqual(initial.strokes.map(s => s.id), ['a', 'b']);
  assert.equal(applyLiveInk(initial, { ...delta, batches: delta.batches.slice(1) }), null);
  assert.equal(applyLiveInk(initial, { ...delta, revision: 6 }), null);
  assert.equal(applyLiveInk(null, delta), null);
  assert.equal(applyLiveInk(initial, { mode: 'full', revision: 2, strokes: [] }), null);
  assert.deepEqual(applyLiveInk(initial, { mode: 'delta', revision: 3, batches: [] }), initial);
});

test('poller bounds backoff, skips concurrent calls, pauses hidden and stops after unmount', async () => {
  let hidden = false, listener = () => {}, scheduled: (() => void) | undefined, delay = 0, calls = 0;
  let resolve: () => void = () => {};
  let reject: (err: Error) => void = () => {};
  const env: PollEnvironment = {
    hidden: () => hidden,
    schedule: (callback, ms) => { scheduled = callback; delay = ms; return 1; },
    cancel: () => { scheduled = undefined; },
    subscribe: callback => { listener = callback; return () => { listener = () => {}; }; },
  };
  const stop = startLivePolling(() => { calls++; return new Promise<void>((res, rej) => { resolve = res; reject = rej; }); }, env);
  listener(); listener(); assert.equal(calls, 1);
  reject(new Error('offline')); await Promise.resolve(); await Promise.resolve(); assert.equal(delay, 10000);
  scheduled!(); assert.equal(calls, 2);
  hidden = true; listener(); resolve(); await Promise.resolve(); await Promise.resolve(); assert.equal(scheduled, undefined);
  hidden = false; listener(); assert.equal(calls, 3);
  resolve(); await Promise.resolve(); await Promise.resolve(); assert.equal(delay, 5000);
  stop(); listener(); assert.equal(calls, 3); assert.equal(scheduled, undefined);
  assert.deepEqual([0,1,2,3,4,100].map(n => pollBackoff(n)), [5000,10000,20000,40000,60000,60000]);
});
