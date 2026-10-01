import test from 'node:test';
import assert from 'node:assert/strict';
import { fitEllipse, polylineHits, recognizeEllipse, recognizeLine, recognizeShape, resizeShape, shapeToPoints } from '../../src/features/exam/ink/shapeSnap.ts';
import type { Pt, SnapShape } from '../../src/features/exam/ink/shapeSnap.ts';

// 결정적인 흔들림(손떨림 흉내)
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
const jitter = (points: Pt[], amount: number) => points.map(p => ({ x: p.x + rand() * amount, y: p.y + rand() * amount }));
/** 끝점에서 꾹 누르는 동안 쌓이는 미세한 점들. */
const hold = (points: Pt[], count = 30) => [...points, ...Array.from({ length: count }, () => ({ x: points[points.length - 1].x + rand() * 1.2, y: points[points.length - 1].y + rand() * 1.2 }))];
const lineOf = (a: Pt, b: Pt, n = 60) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }));
const ellipseOf = (cx: number, cy: number, rx: number, ry: number, rot: number, turns = 1, start = 0, n = 120) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = start + (i / n) * Math.PI * 2 * turns;
    const u = rx * Math.cos(a), v = ry * Math.sin(a);
    return { x: cx + u * Math.cos(rot) - v * Math.sin(rot), y: cy + u * Math.sin(rot) + v * Math.cos(rot) };
  });
const near = (actual: number, expected: number, tolerance: number, label: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const asEllipse = (shape: SnapShape | null) => {
  assert.ok(shape && shape.kind === 'ellipse', `expected ellipse, got ${JSON.stringify(shape)}`);
  return shape;
};

test('a shaky diagonal stroke held at the end becomes a straight line between its endpoints', () => {
  const shape = recognizeShape(hold(jitter(lineOf({ x: 40, y: 50 }, { x: 260, y: 190 }), 3)));
  assert.ok(shape && shape.kind === 'line');
  near(shape.from[0], 40, 3, 'from x'); near(shape.from[1], 50, 3, 'from y');
  near(shape.to[0], 260, 3, 'to x'); near(shape.to[1], 190, 3, 'to y');
});

test('nearly horizontal and vertical lines snap to the axis', () => {
  const horizontal = recognizeLine(jitter(lineOf({ x: 10, y: 100 }, { x: 300, y: 112 }), 2));
  assert.ok(horizontal && horizontal.kind === 'line');
  assert.equal(horizontal.to[1], horizontal.from[1]);
  const vertical = recognizeLine(jitter(lineOf({ x: 100, y: 10 }, { x: 108, y: 260 }), 2));
  assert.ok(vertical && vertical.kind === 'line');
  assert.equal(vertical.to[0], vertical.from[0]);
  const diagonal = recognizeLine(lineOf({ x: 0, y: 0 }, { x: 200, y: 120 }));
  assert.ok(diagonal && diagonal.kind === 'line');
  assert.deepEqual(diagonal.to, [200, 120]);
});

test('a hand-drawn circle becomes a circle with the right center and radius', () => {
  const e = asEllipse(recognizeShape(hold(jitter(ellipseOf(200, 180, 80, 80, 0, 1.03, 0.4), 4))));
  near(e.cx, 200, 4, 'cx'); near(e.cy, 180, 4, 'cy');
  near(e.rx, 80, 5, 'r'); assert.equal(e.rx, e.ry);
  assert.equal(e.rotation, 0);
});

test('a circle drawn slightly short of a full turn still counts (start and end close)', () => {
  const e = asEllipse(recognizeShape(jitter(ellipseOf(150, 150, 60, 60, 0, 0.93, 1.2), 2)));
  near(e.rx, 60, 5, 'r');
});

test('a tilted ellipse keeps its axes and rotation', () => {
  const e = asEllipse(recognizeShape(jitter(ellipseOf(300, 200, 140, 60, Math.PI / 6, 1.02), 3)));
  near(e.cx, 300, 4, 'cx'); near(e.cy, 200, 4, 'cy');
  near(e.rx, 140, 6, 'rx'); near(e.ry, 60, 5, 'ry');
  near(e.rotation, Math.PI / 6, 0.06, 'rotation');
});

test('an almost axis-aligned ellipse snaps its rotation', () => {
  const wide = asEllipse(recognizeEllipse(ellipseOf(0, 0, 120, 50, 0.05)));
  assert.equal(wide.rotation, 0);
  const tall = asEllipse(recognizeEllipse(ellipseOf(0, 0, 50, 120, 0.04)));
  assert.equal(tall.rotation, Math.PI / 2);
  near(tall.rx, 120, 2, 'major'); near(tall.ry, 50, 2, 'minor');
});

test('least-squares fit recovers an exact ellipse', () => {
  const fit = fitEllipse(ellipseOf(10, -20, 90, 40, -0.7));
  assert.ok(fit);
  near(fit.cx, 10, 1e-6, 'cx'); near(fit.cy, -20, 1e-6, 'cy');
  near(Math.max(fit.rx, fit.ry), 90, 1e-6, 'major'); near(Math.min(fit.rx, fit.ry), 40, 1e-6, 'minor');
});

test('zigzags are neither lines nor circles', () => {
  const zigzag = Array.from({ length: 9 }, (_, i) => ({ x: i * 30, y: i % 2 ? 40 : 0 }));
  const dense = zigzag.slice(1).flatMap((p, i) => lineOf(zigzag[i], p, 10));
  assert.equal(recognizeShape(hold(dense)), null);
  const tight = Array.from({ length: 40 }, (_, i) => ({ x: i * 6, y: i % 2 ? 8 : 0 }));
  assert.equal(recognizeShape(tight), null);
});

test('ordinary handwriting (2, S, 3, a C-shaped arc) is left alone', () => {
  const two = [...ellipseOf(50, 40, 30, 30, 0, 0.55, Math.PI, 40), ...lineOf({ x: 80, y: 40 }, { x: 20, y: 110 }, 20), ...lineOf({ x: 20, y: 110 }, { x: 90, y: 110 }, 20)];
  assert.equal(recognizeShape(hold(two)), null, '2');
  const s = [...ellipseOf(50, 30, 30, 25, 0, 0.75, -0.2 * Math.PI, 40).reverse(), ...ellipseOf(50, 80, 30, 25, 0, 0.75, -Math.PI / 2, 40)];
  assert.equal(recognizeShape(hold(s)), null, 'S');
  const three = [...ellipseOf(40, 30, 30, 25, 0, 0.7, -0.75 * Math.PI, 40), ...ellipseOf(40, 80, 32, 25, 0, 0.7, -0.45 * Math.PI, 40)];
  assert.equal(recognizeShape(hold(three)), null, '3');
  const arc = ellipseOf(100, 100, 60, 60, 0, 0.6, 0.7 * Math.PI);
  assert.equal(recognizeShape(hold(arc)), null, 'C');
  const scribble = ellipseOf(100, 100, 60, 50, 0, 3.2);
  assert.equal(recognizeShape(scribble), null, 'scribbled loops');
});

test('short dots and tiny ticks are never converted', () => {
  assert.equal(recognizeShape([{ x: 5, y: 5 }]), null);
  assert.equal(recognizeShape(hold([{ x: 5, y: 5 }, { x: 6, y: 6 }])), null);
  assert.equal(recognizeShape(lineOf({ x: 0, y: 0 }, { x: 12, y: 3 })), null);
  assert.equal(recognizeShape(ellipseOf(0, 0, 6, 6, 0)), null);
  // 단위가 정규화 좌표일 때는 minSize로 맞춘다
  assert.ok(recognizeShape(lineOf({ x: 0, y: 0 }, { x: 0.3, y: 0.1 }), { minSize: 0.03 }));
});

test('after snapping, moving the pen resizes the shape', () => {
  const line: SnapShape = { kind: 'line', from: [0, 0], to: [100, 50] };
  assert.deepEqual(resizeShape(line, { x: 100, y: 50 }, { x: 180, y: 70 }), { kind: 'line', from: [0, 0], to: [180, 70] });
  assert.deepEqual(resizeShape(line, { x: 100, y: 50 }, { x: 180, y: 4 }), { kind: 'line', from: [0, 0], to: [180, 0] }, 'axis snap while resizing');
  const circle: SnapShape = { kind: 'ellipse', cx: 0, cy: 0, rx: 50, ry: 30, rotation: 0.3 };
  const bigger = resizeShape(circle, { x: 50, y: 0 }, { x: 0, y: 100 });
  assert.ok(bigger.kind === 'ellipse');
  near(bigger.rx, 100, 1e-9, 'rx'); near(bigger.ry, 60, 1e-9, 'ry'); assert.equal(bigger.rotation, 0.3);
});

test('shape polylines and hit testing (for the stroke eraser)', () => {
  const circle = shapeToPoints({ kind: 'ellipse', cx: 0, cy: 0, rx: 10, ry: 10, rotation: 0 });
  assert.ok(polylineHits(circle, { x: 10.5, y: 0 }, 1));
  assert.ok(!polylineHits(circle, { x: 0, y: 0 }, 1), 'the middle of a circle is empty');
  const line = shapeToPoints({ kind: 'line', from: [0, 0], to: [10, 0] });
  assert.ok(polylineHits(line, { x: 5, y: 0.8 }, 1));
  assert.ok(!polylineHits(line, { x: 12, y: 0 }, 1));
  assert.ok(polylineHits([{ x: 3, y: 3 }], { x: 3.5, y: 3 }, 1));
});
