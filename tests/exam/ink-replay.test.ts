import test from 'node:test';
import assert from 'node:assert/strict';
import { applyInkEvent, buildInkTimeline, inkDelta } from '../../src/features/exam/ink/inkReplay.ts';
import type { InkStroke } from '../../src/features/exam/contract.ts';
const stroke = (id: string): InkStroke => ({ id, tool: 'pen', color: '#123456', size: 4, points: [{ x: .1, y: .2, pressure: .5, t: 0 }] });

test('replay retains draw, erasure, undo, redo and clear, and seeks both directions', () => {
  const a = stroke('a'), b = stroke('b');
  const snapshots = [[], [a], [a, b], [b], [a, b], [b], []];
  const kinds = ['draw','draw','erase','undo','redo','clear'] as const;
  const events = kinds.map((kind, i) => inkDelta(snapshots[i], snapshots[i + 1], kind, 1000 * i));
  const timeline = buildInkTimeline({ batches: [{ id: 'batch', revision: 1, baseRevision: 0, baseline: [], events }], strokes: [], revision: 1 });
  assert.equal(timeline.approximate, false);
  for (const i of [0, 3, 6, 2, 5, 1, 4]) assert.deepEqual(timeline.at(i), snapshots[i]);
  assert.equal(timeline.steps[3].label, '실행 취소');
});

test('restored strokes retain their original drawing order including a middle stroke', () => {
  const a = stroke('a'), b = stroke('b'), c = stroke('c');
  assert.deepEqual(applyInkEvent([a, c], inkDelta([a, c], [a, b, c], 'undo')), [a, b, c]);
  const changed = { ...a, color: '#000000' };
  assert.deepEqual(applyInkEvent([a, b], inkDelta([a, b], [changed, b], 'draw')), [changed, b]);
});

test('old ink is labelled approximate and gaps made by old clients become explicit snapshots', () => {
  const a = stroke('a');
  const legacy = buildInkTimeline({ batches: [], strokes: [a], revision: 2 });
  assert.equal(legacy.approximate, true); assert.deepEqual(legacy.at(0), []); assert.deepEqual(legacy.at(1), [a]);
  const mixed = buildInkTimeline({ batches: [{ id: 'batch', revision: 1, baseRevision: 0, baseline: [], events: [inkDelta([], [a], 'draw')] }], strokes: [], revision: 2 });
  assert.equal(mixed.approximate, true); assert.deepEqual(mixed.at(1), [a]); assert.deepEqual(mixed.at(2), []);
});

test('checkpoint seeking equals sequential replay across a long stream', () => {
  let previous: InkStroke[] = [];
  const snapshots: InkStroke[][] = [[]];
  const events = [];
  for (let i = 0; i < 210; i++) {
    const next = i % 3 === 0 ? previous.slice(1) : [...previous, stroke(String(i))];
    events.push(inkDelta(previous, next, i % 3 === 0 ? 'erase' : 'draw', i));
    snapshots.push(next); previous = next;
  }
  const timeline = buildInkTimeline({ batches: [{ id: 'batch', baseRevision: 0, revision: 1, baseline: [], events }], strokes: previous, revision: 1 });
  for (let i = 210; i >= 0; i--) assert.deepEqual(timeline.at(i), snapshots[i]);
});
