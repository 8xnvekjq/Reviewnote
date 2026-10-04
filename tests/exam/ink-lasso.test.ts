import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IDENTITY, INK_COORD_LIMIT, about, applyPt, compose, frameCorners, frameOf, hitFrame, isIdentity, lassoSelect, moveTransform, pointInPolygon,
  rotateHandle, rotateTransform, scaleTransform, transformFrame, transformSelection, transformStroke,
} from '../../src/features/exam/ink/lasso.ts';
import { emptyHistory, recordChange, strokePolyline, undoHistory } from '../../src/features/exam/ink/inkModel.ts';
import { applyInkEvent, inkDelta } from '../../src/features/exam/ink/inkReplay.ts';
import type { InkStroke } from '../../src/features/exam/contract.ts';

const pen = (id: string, points: Array<[number, number]>, extra: Partial<InkStroke> = {}): InkStroke =>
  ({ id, tool: 'pen', color: '#111827', size: 3, points: points.map(([x, y], i) => ({ x, y, pressure: 0.6, t: i * 10 })), ...extra });
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
const square = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
let counter = 0;
const nextId = () => `new-${++counter}`;

test('point in polygon (even-odd)', () => {
  const poly = square(0, 0, 1, 1);
  assert.ok(pointInPolygon({ x: 0.5, y: 0.5 }, poly));
  assert.ok(!pointInPolygon({ x: 1.5, y: 0.5 }, poly));
  const concave = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 0.3 }, { x: 0, y: 1 }];
  assert.ok(!pointInPolygon({ x: 0.5, y: 0.8 }, concave), 'the notch of a concave lasso is outside');
});

test('lasso selects a whole stroke when any part of it is inside', () => {
  const strokes = [
    pen('all', [[0.2, 0.2], [0.3, 0.25], [0.4, 0.2]]),
    pen('most', [[0.3, 0.3], [0.4, 0.3], [0.45, 0.3], [0.6, 0.3]]), // 3/4 inside
    pen('few', [[0.45, 0.4], [0.6, 0.4], [0.7, 0.4], [0.8, 0.4]]), // 1/4 inside
    pen('out', [[0.8, 0.8], [0.9, 0.9]]),
    pen('near', [[0.55, 0.1], [0.55, 0.5], [0.7, 0.5]]), // 바로 옆을 지나가지만 닿지 않음
    pen('dot', [[0.25, 0.4]]),
    pen('dotOut', [[0.6, 0.6]]),
  ];
  assert.deepEqual(lassoSelect(strokes, square(0.1, 0.1, 0.5, 0.5)), ['all', 'most', 'few', 'dot']);
  assert.deepEqual(lassoSelect(strokes, [{ x: 0, y: 0 }, { x: 1, y: 1 }]), [], 'needs a closed area (3+ points)');
});

test('lasso catches sparse strokes whose segments cross it with no point inside', () => {
  const sparse = pen('sparse', [[0.0, 0.5], [1.0, 0.5]]); // 두 점 모두 올가미 밖
  assert.deepEqual(lassoSelect([sparse], square(0.4, 0.4, 0.6, 0.6)), ['sparse'], 'a straight stroke through the lasso');
  const crossesClosing = pen('closing', [[0.5, 0.3], [0.5, 0.7]]);
  // 열린 ㄷ자 올가미: 그리지 않은 마지막 변(자동으로 닫힘)만 가로지른다
  const open = [{ x: 0.4, y: 0.4 }, { x: 0.4, y: 0.6 }, { x: 0.6, y: 0.6 }, { x: 0.6, y: 0.4 }];
  assert.deepEqual(lassoSelect([crossesClosing], open), ['closing']);
  const outside = pen('outside', [[0.0, 0.9], [1.0, 0.9]]);
  assert.deepEqual(lassoSelect([outside], square(0.4, 0.4, 0.6, 0.6)), [], 'a long stroke that passes by is not picked');
});

test('lasso judges shapes by their outline: partially covered shapes are selected', () => {
  const line = pen('line', [[0.1, 0.5], [0.9, 0.5]], { shape: { kind: 'line', from: [0.1, 0.5], to: [0.9, 0.5] } });
  assert.deepEqual(lassoSelect([line], square(0, 0.4, 0.2, 0.6)), ['line'], 'only one end inside');
  assert.deepEqual(lassoSelect([line], square(0.4, 0.4, 0.6, 0.6)), ['line'], 'lasso in the middle of the line, both ends outside');
  assert.deepEqual(lassoSelect([line], square(0.4, 0.6, 0.6, 0.8)), [], 'below the line');
  const ring = pen('ring', [[0.5, 0.5]], { shape: { kind: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1, rotation: 0 } });
  assert.deepEqual(lassoSelect([ring], square(0.35, 0.35, 0.65, 0.65)), ['ring']);
  assert.deepEqual(lassoSelect([ring], square(0.55, 0.45, 0.7, 0.55)), ['ring'], 'only the right edge of the circle');
  assert.deepEqual(lassoSelect([ring], square(0.45, 0.45, 0.55, 0.55)), [], 'inside the empty middle of the ring touches nothing');
  const tri = pen('tri', [[0.2, 0.2]], { shape: { kind: 'polygon', points: [[0.2, 0.2], [0.8, 0.2], [0.5, 0.8]] } });
  assert.deepEqual(lassoSelect([tri], square(0.45, 0.1, 0.55, 0.3)), ['tri'], 'crosses one side of the triangle (no vertex inside)');
  assert.deepEqual(lassoSelect([tri], square(0.75, 0.15, 0.9, 0.25)), ['tri'], 'one vertex inside');
  assert.deepEqual(lassoSelect([tri], square(0.85, 0.7, 0.95, 0.9)), []);
});

test('similarity helpers: compose, about keeps the pivot fixed', () => {
  const m = about({ x: 2, y: 3 }, 1.5, Math.PI / 3);
  const p = applyPt(m, { x: 2, y: 3 });
  near(p.x, 2); near(p.y, 3);
  const both = compose(m, { k: 1, angle: 0, tx: 1, ty: 0 });
  const q1 = applyPt(both, { x: 0.3, y: 0.4 });
  const q2 = applyPt(m, { x: 1.3, y: 0.4 });
  near(q1.x, q2.x); near(q1.y, q2.y);
  assert.ok(isIdentity(IDENTITY));
});

test('frame wraps the strokes (with stroke width and pad) and handles hit-test', () => {
  const frame = frameOf([pen('a', [[0.2, 0.3], [0.6, 0.5]])], 0.01)!;
  near(frame.cx, 0.4); near(frame.cy, 0.4);
  assert.ok(frame.hw > 0.2 && frame.hh > 0.1);
  const corners = frameCorners(frame);
  assert.deepEqual(hitFrame(frame, corners[2], 0.02, 0.02), { kind: 'corner', index: 2 });
  assert.deepEqual(hitFrame(frame, rotateHandle(frame, 0.02), 0.02, 0.02), { kind: 'rotate' });
  assert.deepEqual(hitFrame(frame, { x: 0.4, y: 0.4 }, 0.02, 0.02), { kind: 'move' });
  assert.equal(hitFrame(frame, { x: 0.9, y: 0.9 }, 0.02, 0.02), null);
  // 기울어진 테두리도 손잡이 위치를 따라간다
  const tilted = { ...frame, angle: Math.PI / 2 };
  const r = rotateHandle(tilted, 0.02);
  near(r.x, 0.4); near(r.y, 0.4 + frame.hw + 0.02);
  assert.deepEqual(hitFrame(tilted, r, 0.02, 0.02), { kind: 'rotate' });
});

test('move clamps the selection centre inside the canvas but allows the margins beyond the image', () => {
  const frame = { cx: 0.5, cy: 0.5, hw: 0.1, hh: 0.1, angle: 0 };
  const m = moveTransform(frame, 0.6, 0.2, 1.3, 2.5);
  near(m.tx, 0.6); near(m.ty, 0.2); // 이미지 오른쪽(1.1) 여백으로 갈 수 있다
  const far = moveTransform(frame, 5, -5, 1.3, 2.5);
  near(far.tx, 0.8); near(far.ty, -0.5);
});

test('corner scale keeps the opposite corner fixed and the aspect ratio', () => {
  const frame = { cx: 0.5, cy: 0.5, hw: 0.2, hh: 0.1, angle: 0 };
  const [tl, , br] = frameCorners(frame);
  const m = scaleTransform(frame, 2, { x: br.x + 0.4, y: br.y + 0.2 }, 0.01);
  near(m.k, 2);
  const fixed = applyPt(m, tl);
  near(fixed.x, tl.x); near(fixed.y, tl.y);
  const shrunk = scaleTransform(frame, 2, tl, 0.05);
  near(shrunk.k, 0.25, 1e-9); // 최소 반변 0.05 / 0.2
});

test('rotation pivots on the frame centre and snaps to right angles', () => {
  const frame = { cx: 0.5, cy: 0.5, hw: 0.2, hh: 0.1, angle: 0 };
  const start = { x: 0.8, y: 0.5 };
  const m = rotateTransform(frame, start, { x: 0.5 + Math.cos(0.5) * 0.3, y: 0.5 + Math.sin(0.5) * 0.3 });
  near(m.angle, 0.5);
  const c = applyPt(m, { x: 0.5, y: 0.5 });
  near(c.x, 0.5); near(c.y, 0.5);
  const snapped = rotateTransform(frame, start, { x: 0.5 + Math.cos(Math.PI / 2 - 0.05) * 0.3, y: 0.5 + Math.sin(Math.PI / 2 - 0.05) * 0.3 });
  near(snapped.angle, Math.PI / 2);
  const free = rotateTransform(frame, start, { x: 0.5 + Math.cos(Math.PI / 2 - 0.05) * 0.3, y: 0.5 + Math.sin(Math.PI / 2 - 0.05) * 0.3 }, 0);
  near(free.angle, Math.PI / 2 - 0.05);
});

test('transformStroke maps points and every shape kind (ellipse rotation and radii too)', () => {
  const m = about({ x: 0.5, y: 0.5 }, 2, Math.PI / 2);
  const p = transformStroke(pen('p', [[0.6, 0.5]]), m, 'x');
  near(p.points[0].x, 0.5); near(p.points[0].y, 0.7);
  assert.equal(p.points[0].pressure, 0.6, 'pressure is kept');
  assert.equal(p.points[0].t, 0, 'time is kept');
  assert.equal(p.size, 6, 'width scales with the selection');
  assert.equal(p.id, 'x');

  const line = transformStroke(pen('l', [[0.6, 0.5], [0.7, 0.5]], { shape: { kind: 'line', from: [0.6, 0.5], to: [0.7, 0.5] } }), m, 'l2');
  assert.deepEqual(line.shape, { kind: 'line', from: [0.5, 0.7], to: [0.5, 0.9] });
  const poly = transformStroke(pen('g', [[0.6, 0.5]], { shape: { kind: 'polygon', points: [[0.6, 0.5], [0.7, 0.5], [0.6, 0.6]] } }), m, 'g2');
  assert.deepEqual(poly.shape, { kind: 'polygon', points: [[0.5, 0.7], [0.5, 0.9], [0.3, 0.7]] });
  const ellipse = transformStroke(pen('e', [[0.5, 0.5]], { shape: { kind: 'ellipse', cx: 0.6, cy: 0.5, rx: 0.1, ry: 0.05, rotation: 0.3 } }), m, 'e2');
  assert.equal(ellipse.shape?.kind, 'ellipse');
  if (ellipse.shape?.kind !== 'ellipse') return;
  near(ellipse.shape.cx, 0.5); near(ellipse.shape.cy, 0.7);
  near(ellipse.shape.rx, 0.2); near(ellipse.shape.ry, 0.1);
  near(ellipse.shape.rotation, 0.3 + Math.PI / 2 - Math.PI, 1e-5); // (-π/2, π/2]로 정규화(타원은 π마다 같은 모양)
  // 렌더용 둘레 점도 회전된 타원 위에 있다
  const outline = strokePolyline(ellipse);
  const d = Math.hypot(outline[0].x - 0.5, outline[0].y - 0.7);
  near(d, 0.2, 1e-4);
});

test('transformed strokes stay within the server coordinate limits and keep only validated fields', () => {
  const huge = transformStroke(pen('h', [[50, 50]], { shape: { kind: 'ellipse', cx: 50, cy: 50, rx: 40, ry: 1, rotation: 0 } }), { k: 3, angle: 0, tx: 0, ty: 0 }, 'h2');
  for (const p of huge.points) assert.ok(Math.abs(p.x) <= INK_COORD_LIMIT && Math.abs(p.y) <= INK_COORD_LIMIT);
  if (huge.shape?.kind === 'ellipse') {
    for (const v of [huge.shape.cx, huge.shape.cy, huge.shape.rx, huge.shape.ry, huge.shape.rotation]) assert.ok(Math.abs(v) <= INK_COORD_LIMIT);
  }
  assert.ok(huge.size <= 50 && huge.size > 0);
  assert.deepEqual(Object.keys(huge).sort(), ['color', 'id', 'points', 'shape', 'size', 'tool']);
  assert.deepEqual(Object.keys(huge.points[0]).sort(), ['pressure', 't', 'x', 'y']);
  const plain = transformStroke(pen('q', [[0.1, 0.1]]), IDENTITY, 'q2');
  assert.ok(!('shape' in plain), 'no shape field on freehand strokes');
  const neg = transformStroke(pen('n', [[0.1, 0.1]]), { k: 1, angle: 0, tx: -500, ty: 0 }, 'n2');
  assert.equal(neg.points[0].x, -INK_COORD_LIMIT);
});

test('transformSelection replaces the selected strokes in place with new ids; save event = remove old + add new', () => {
  const before = [pen('a', [[0.1, 0.1], [0.2, 0.2]]), { ...pen('b', [[0.3, 0.3], [0.4, 0.4]]), tool: 'highlighter' as const }, pen('c', [[0.5, 0.5], [0.6, 0.6]])];
  const { strokes: after, ids } = transformSelection(before, ['b', 'a'], { k: 1, angle: 0, tx: 0.5, ty: 0 }, nextId);
  assert.equal(after.length, 3);
  assert.deepEqual(after.map(s => s.id), [ids[0], ids[1], 'c'], 'same order (layering), new ids');
  assert.ok(!ids.includes('a') && !ids.includes('b'));
  assert.equal(after[1].tool, 'highlighter', 'highlighter stays on the highlighter layer');
  near(after[0].points[0].x, 0.6);
  assert.equal(after[2], before[2], 'unselected strokes are untouched');

  const event = inkDelta(before, after, 'draw');
  assert.equal(event.kind, 'draw');
  assert.deepEqual(event.removed.sort(), ['a', 'b']);
  assert.deepEqual(event.added.map(a => a.index), [0, 1]);
  assert.deepEqual(applyInkEvent(before, event), after, 'replay/Live reproduce the moved strokes');
});

test('one lasso edit is one undo step', () => {
  const before = [pen('a', [[0.1, 0.1], [0.2, 0.2]])];
  const { strokes: after } = transformSelection(before, ['a'], about({ x: 0.15, y: 0.15 }, 1, 1), nextId);
  const history = recordChange(emptyHistory(), before);
  const undone = undoHistory(history, after);
  assert.equal(undone?.strokes, before);
  assert.equal(undone?.history.past.length, 0);
  assert.deepEqual(undone?.history.future, [after]);
});

test('transformFrame follows the transform', () => {
  const frame = { cx: 0.5, cy: 0.5, hw: 0.2, hh: 0.1, angle: 0 };
  const m = compose(about({ x: 0.5, y: 0.5 }, 1, 0.4), about({ x: 0.3, y: 0.4 }, 2, 0));
  const next = transformFrame(frame, m);
  const corners = frameCorners(frame).map(c => applyPt(m, c));
  frameCorners(next).forEach((c, i) => { near(c.x, corners[i].x); near(c.y, corners[i].y); });
});
