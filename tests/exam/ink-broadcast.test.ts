import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptLiveSequence, addLiveHint, applyBroadcast, composeLiveView, createInkBatcher, LIVE_BATCH_MS, LIVE_HINT_TTL_MS, LIVE_MAX_BYTES,
  liveSequenceGap, parseLiveInk, payloadFits, pruneLiveHints, vanishedStrokes, watching,
} from '../../src/features/exam/ink/inkBroadcast.ts';
import { nextLiveFrame } from '../../src/features/exam/ui/liveFrame.ts';
import { applyLiveInk } from '../../src/features/exam/ink/inkLive.ts';
import type { InkStroke } from '../../src/features/exam/contract.ts';

const a: InkStroke = { id: 'a', tool: 'pen', color: '#123456', size: 3, points: [] };
const b = { ...a, id: 'b' };
const message = { version: 1 as const, attemptId: 'attempt', questionId: 'question', number: 1, sessionId: 'session', sequence: 1,
  added: [{ index: 0, stroke: a }], removed: [] };

test('fixed 750ms window coalesces additions/removals, bounds latency while drawing, cancels stopped watchers', () => {
  let now = 0;
  const tasks = new Map<number, { at: number; fn: () => void }>();
  let id = 0;
  const advance = (ms: number) => { now += ms; for (const [key, task] of tasks) if (task.at <= now) { tasks.delete(key); task.fn(); } };
  const sent: typeof message[] = [];
  const batch = createInkBatcher(m => sent.push(m), {
    schedule(fn, ms) { tasks.set(++id, { at: now + ms, fn }); return id; }, cancel(timer) { tasks.delete(timer as number); },
  }, 'session');
  batch.change('attempt', 'question', 1, [], [a]);
  advance(500);
  batch.change('attempt', 'question', 1, [a], [a, b]);
  advance(LIVE_BATCH_MS - 501); assert.equal(sent.length, 0);
  advance(1); assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].added.map(x => x.stroke.id), ['a', 'b']);
  batch.change('attempt', 'question', 1, [a, b], [b]);
  batch.change('attempt', 'question', 1, [b], []);
  advance(LIVE_BATCH_MS);
  assert.deepEqual(sent[1].removed, ['a', 'b']); assert.equal(sent[1].sequence, 2);
  batch.change('attempt', 'question', 1, [], [a]); batch.clear(); advance(1000);
  assert.equal(sent.length, 2);
});

test('idempotent additions, erasure, undo replacements, and authoritative server reconciliation', () => {
  const canonical = { revision: 4, strokes: [b] };
  const hinted = applyBroadcast(canonical.strokes, message);
  assert.deepEqual(hinted.map(x => x.id), ['a', 'b']);
  assert.deepEqual(applyBroadcast(hinted, message), hinted);
  assert.deepEqual(applyBroadcast(hinted, { ...message, added: [], removed: ['a'] }), [b]);
  assert.deepEqual(applyBroadcast([a, b], { ...message, removed: ['a'], added: [{ index: 0, stroke: { ...a, color: '#fff' } }] })[0].color, '#fff');
  const result = applyLiveInk(canonical, { mode: 'delta', revision: 4, batches: [] });
  assert.deepEqual(result, canonical, 'RPC uses canonical baseline, never optimistic strokes');
  assert.deepEqual(applyLiveInk(canonical, { mode: 'full', revision: 5, strokes: [] }), { revision: 5, strokes: [] });
});

test('watch leases expire at sixty seconds, stopping one admin preserves other watchers', () => {
  const watchers = new Map([['one', 1000], ['two', 2000]]);
  assert.equal(watching(watchers, 60999), true);
  watchers.delete('two');
  assert.equal(watching(watchers, 60999), true);
  assert.equal(watching(watchers, 61000), false);
  assert.equal(watching(watchers, 999), false);
  assert.equal(watching(new Map(), 1000), false);
});

test('replayed and out-of-order batches are ignored; a reopened student session can restart its sequence', () => {
  const sequences = new Map<string, number>();
  assert.equal(acceptLiveSequence(sequences, { ...message, sequence: 2 }), true);
  assert.equal(acceptLiveSequence(sequences, message), false);
  assert.equal(acceptLiveSequence(sequences, { ...message, sequence: 2 }), false);
  assert.equal(acceptLiveSequence(sequences, { ...message, sessionId: 'new' }), true);
  for (let i = 0; i < 200; i++) acceptLiveSequence(sequences, { ...message, sessionId: `session-${i}` });
  assert.equal(sequences.size, 128);
});

test('UTF-8 byte cap, invalid/laser messages ignored, oversized batches skipped', () => {
  assert.equal(payloadFits('x'.repeat(LIVE_MAX_BYTES - 2)), true);
  assert.equal(payloadFits('x'.repeat(LIVE_MAX_BYTES - 1)), false);
  assert.equal(payloadFits('한'.repeat(LIVE_MAX_BYTES / 2)), false);
  assert.deepEqual(parseLiveInk(message), message);
  assert.equal(parseLiveInk({ ...message, sequence: NaN }), null);
  assert.equal(parseLiveInk({ ...message, added: [{ index: 0, stroke: { ...a, tool: 'laser' } }] }), null);
  assert.equal(parseLiveInk({ ...message, added: [{ index: 0, stroke: { ...a, shape: { kind: 'line' } } }] }), null);
  const sent: unknown[] = [];
  let flush = () => {};
  const batch = createInkBatcher(m => sent.push(m), { schedule(fn) { flush = fn; return 1; }, cancel() {} }, 's');
  batch.change('attempt', 'q', 1, [], [{ ...a, color: 'x'.repeat(LIVE_MAX_BYTES) }]); flush();
  assert.equal(sent.length, 0);
});

const c = { ...a, id: 'c' };
const msg = (sequence: number, questionId: string, added: InkStroke[], removed: string[] = [], number = 1, at = 0) =>
  ({ ...message, sequence, questionId, number, added: added.map((stroke, index) => ({ index: at + index, stroke })), removed });
const row = (questionId: string, revision: number, strokes: InkStroke[], imageUrl = `/${questionId}.png`) =>
  ({ attemptId: 'attempt', questionId, number: 1, imageUrl, updatedAt: '2026-10-04T00:00:00.000Z', ink: { revision, strokes } });

test('missing strokes: a poll snapshot older than the broadcast keeps the broadcast strokes', () => {
  // Server saved [a] (revision 1); the student then drew b, which only reached the admin by broadcast.
  let log = addLiveHint(undefined, msg(1, 'q', [a]), 1000);
  log = addLiveHint(log, msg(2, 'q', [b], [], 1, 1), 2000);
  const canon = { q: [a] } as Record<string, InkStroke[]>;
  log = pruneLiveHints(log, q => canon[q], 3000);
  assert.deepEqual(log.map(e => e.message.sequence), [2], 'message 1 is in the snapshot, message 2 is not yet');
  const view = composeLiveView(row('q', 1, [a]), log, () => undefined, () => undefined);
  assert.deepEqual(view.ink?.strokes.map(s => s.id), ['a', 'b'], 'the authoritative replacement does not erase b');
  // After the 5-second save the snapshot contains b and the hint is dropped.
  assert.deepEqual(pruneLiveHints(log, () => [a, b], 4000), []);
  // Expired hints fall back to the server even if never confirmed.
  assert.deepEqual(pruneLiveHints(log, () => [a], 2000 + LIVE_HINT_TTL_MS), []);
});

test('missing strokes: erasures and undo stay correct when hints are replayed over a newer snapshot', () => {
  let log = addLiveHint(undefined, msg(1, 'q', [b]), 0);
  log = addLiveHint(log, msg(2, 'q', [], ['b']), 100);
  assert.deepEqual(composeLiveView(row('q', 1, [a]), log, () => undefined, () => undefined).ink?.strokes.map(s => s.id), ['a']);
  // Removal-only messages never confirm: they cannot prove the snapshot is newer, and replaying them is harmless.
  assert.equal(pruneLiveHints(log, () => [a], 200).length, 2);
  // A later confirmed message drops everything before it, so a lost erase cannot resurrect a stroke forever.
  log = addLiveHint(log, msg(3, 'q', [c]), 300);
  assert.deepEqual(pruneLiveHints(log, () => [a, c], 400), []);
});

test('missing strokes: a slower save of the previous question does not pull the view back', () => {
  // Student drew c on q2 (broadcast); the poll still reports q1 because q1's save landed last.
  const log = addLiveHint(addLiveHint(undefined, msg(1, 'q1', [b]), 0), msg(2, 'q2', [c], [], 2), 100);
  const cache = new Map([['q2', { revision: 3, strokes: [a] }]]);
  const view = composeLiveView(row('q1', 5, [b]), log, q => cache.get(q), q => `/img/${q}.png`);
  assert.equal(view.questionId, 'q2'); assert.equal(view.number, 2); assert.equal(view.imageUrl, '/img/q2.png');
  assert.deepEqual(view.ink?.strokes.map(s => s.id), ['c', 'a'], 'q2 starts from its cached server ink, not an empty page');
  assert.equal(view.ink?.revision, 3);
  // q1 confirmed by its own snapshot; q2 still pending.
  assert.deepEqual(pruneLiveHints(log, q => (q === 'q1' ? [b] : [a]), 200).map(e => e.message.questionId), ['q2']);
  // q2 confirmed while q1's leftover hint is unconfirmed (stale q1 cache): the view must not flip back to q1.
  const pruned = pruneLiveHints(addLiveHint(log, msg(3, 'q2', [b], [], 2), 150), q => (q === 'q2' ? [a, c, b] : []), 200);
  assert.deepEqual(pruned, []);
});

test('diagnostics: sequence gaps and strokes that vanish on a poll', () => {
  const sequences = new Map<string, number>();
  assert.equal(liveSequenceGap(sequences, message), 0);
  acceptLiveSequence(sequences, message);
  assert.equal(liveSequenceGap(sequences, { ...message, sequence: 4 }), 2);
  assert.equal(liveSequenceGap(sequences, { ...message, sequence: 1 }), 0, 'replays are not gaps');
  assert.equal(liveSequenceGap(sequences, { ...message, sessionId: 'reopened', sequence: 1 }), 0);
  assert.equal(vanishedStrokes([a, b, c], [a]), 2);
  assert.equal(vanishedStrokes(undefined, [a]), 0);
});

test('batcher numbers only sent messages and flushes the question edited last', () => {
  const sent: Array<{ questionId: string; sequence: number }> = [];
  let flush = () => {};
  const batch = createInkBatcher(m => sent.push(m), { schedule(fn) { flush = fn; return 1; }, cancel() {} }, 's');
  batch.change('attempt', 'q', 1, [], [a]); batch.change('attempt', 'q', 1, [a], []); flush();
  assert.equal(sent.length, 0, 'net-empty window sends nothing');
  batch.change('attempt', 'q1', 1, [], [a]);
  batch.change('attempt', 'q2', 2, [], [b]);
  batch.change('attempt', 'q1', 1, [a], [a, c]);
  flush();
  assert.deepEqual(sent, sent.map((m, i) => ({ ...m, sequence: i + 1 })), 'no false gaps');
  assert.deepEqual(sent.map(m => m.questionId), ['q2', 'q1'], 'the current question arrives last');
});

test('Live cell switches image and ink together only once the new image is ready', () => {
  const f1 = { questionId: 'q1', number: 1, imageUrl: '/1.png', strokes: [a] };
  const f2 = { questionId: 'q2', number: 2, imageUrl: '/2.png', strokes: [b] };
  const ready = new Set(['/1.png']);
  const isReady = (url: string) => ready.has(url);
  assert.equal(nextLiveFrame(null, f2, isReady), null, 'placeholder, never ink without its image');
  assert.equal(nextLiveFrame(f1, f2, isReady), f1, 'previous frame stays while q2 decodes');
  assert.equal(nextLiveFrame(f1, { ...f2, imageUrl: '' }, isReady), f1, 'unknown image keeps the previous frame');
  ready.add('/2.png');
  assert.equal(nextLiveFrame(f1, f2, isReady), f2);
  const more = { ...f1, strokes: [a, b] };
  assert.equal(nextLiveFrame(f1, more, () => false), more, 'same image updates ink immediately');
});
