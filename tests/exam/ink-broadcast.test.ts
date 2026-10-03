import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptLiveSequence, applyBroadcast, createInkBatcher, LIVE_BATCH_MS, LIVE_MAX_BYTES, parseLiveInk, payloadFits, reconcileLiveView, watching } from '../../src/features/exam/ink/inkBroadcast.ts';
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
  const server = { questionId: 'q', number: 1, imageUrl: '/q.png', updatedAt: 'server', ink: canonical, answeredCount: 3 };
  const optimistic = { ...server, questionId: 'next', number: 2, imageUrl: '', ink: { ...canonical, strokes: hinted }, answeredCount: 2 };
  assert.deepEqual(reconcileLiveView(server, optimistic, false), { ...optimistic, answeredCount: 3 }, 'metadata polls preserve unsaved hints and question switches');
  assert.deepEqual(reconcileLiveView(server, optimistic, true), server, 'full/delta ink RPC replaces hints completely');
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
