import test from 'node:test';
import assert from 'node:assert/strict';
import { INK_REFERENCE_WIDTH, emptyHistory, inkExtraBelow, recordChange, redoHistory, strokeWidth, strokesHitAlong, strokesHitBy, undoHistory, usesSimulatedPressure } from '../../src/features/exam/ink/inkModel.ts';
import type { InkStroke } from '../../src/features/exam/contract.ts';

const pt = (x: number, y: number, pressure = 0.5) => ({ x, y, pressure, t: 0 });
const pen = (id: string, points: Array<[number, number]>): InkStroke => ({ id, tool: 'pen', color: '#000', size: 3, points: points.map(([x, y]) => pt(x, y)) });

test('stroke width is normalized to the image width and highlighters are wider', () => {
  assert.equal(strokeWidth({ tool: 'pen', size: 7 }), 7 / INK_REFERENCE_WIDTH);
  assert.ok(strokeWidth({ tool: 'highlighter', size: 7 }) > strokeWidth({ tool: 'pen', size: 7 }));
});

test('writing room below the image is 60% of its height but never too small', () => {
  assert.equal(inkExtraBelow(1.1), 1.1 * 0.6);
  assert.equal(inkExtraBelow(0.25), 0.5, 'flat question 1 still gets half a width of room');
  assert.equal(inkExtraBelow(0), 0, 'nothing until the image has loaded');
});

test('pressure simulation is used only when every point has the placeholder pressure', () => {
  assert.ok(usesSimulatedPressure([pt(0, 0), pt(1, 1)]));
  assert.ok(!usesSimulatedPressure([pt(0, 0, 0.31), pt(1, 1)]));
});

test('the eraser removes whole strokes it touches and skips ones it does not', () => {
  const strokes = [
    pen('a', [[0.1, 0.1], [0.3, 0.1]]),
    pen('b', [[0.1, 0.5], [0.3, 0.5]]),
    { ...pen('c', [[0.5, 0.5]]), shape: { kind: 'ellipse' as const, cx: 0.6, cy: 0.6, rx: 0.1, ry: 0.1, rotation: 0 } },
  ];
  assert.deepEqual(strokesHitBy(strokes, { x: 0.2, y: 0.105 }, 0.01), ['a']);
  assert.deepEqual(strokesHitBy(strokes, { x: 0.6, y: 0.6 }, 0.01), [], 'inside an empty circle');
  assert.deepEqual(strokesHitBy(strokes, { x: 0.7, y: 0.6 }, 0.01), ['c'], 'shapes are hit on their outline, not their raw points');
  assert.deepEqual(strokesHitAlong(strokes, { x: 0.2, y: 0 }, { x: 0.2, y: 0.6 }, 0.01).sort(), ['a', 'b'], 'a fast swipe catches everything in between');
});

test('undo/redo walk snapshots and a new change clears redo', () => {
  const s0: InkStroke[] = [];
  const s1 = [pen('a', [[0, 0]])];
  const s2 = [...s1, pen('b', [[1, 1]])];
  let h = recordChange(emptyHistory(), s0);
  h = recordChange(h, s1);
  const u1 = undoHistory(h, s2);
  assert.ok(u1); assert.equal(u1.strokes, s1);
  const u2 = undoHistory(u1.history, u1.strokes);
  assert.ok(u2); assert.equal(u2.strokes, s0);
  assert.equal(undoHistory(u2.history, u2.strokes), null);
  const r1 = redoHistory(u2.history, u2.strokes);
  assert.ok(r1); assert.equal(r1.strokes, s1);
  const branched = recordChange(r1.history, r1.strokes);
  assert.equal(branched.future.length, 0);
  assert.equal(redoHistory(branched, []), null);
});
