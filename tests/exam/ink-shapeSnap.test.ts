import test from 'node:test';
import assert from 'node:assert/strict';
import { fitEllipse, holdStillStart, polylineHits, recognizeCurve, recognizeEllipse, recognizeLine, recognizePolygon, recognizeShape, resizeShape, shapeCenter, shapeToPoints } from '../../src/features/exam/ink/shapeSnap.ts';
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
  // 글자 크기의 C는 그대로(큰 호는 아래 곡선 테스트에서 매끈한 곡선이 된다)
  const arc = ellipseOf(30, 30, 12, 12, 0, 0.6, 0.7 * Math.PI);
  assert.equal(recognizeShape(hold(arc)), null, 'C');
  const ell = [...lineOf({ x: 0, y: 0 }, { x: 120, y: 0 }), ...lineOf({ x: 120, y: 0 }, { x: 120, y: 120 })];
  assert.equal(recognizeShape(hold(ell)), null, 'ㄱ (a sharp corner is handwriting, not a curve)');
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

// ── 다각형·곡선 ──
/** 꼭짓점을 차례로 잇는 닫힌 획(start: 첫 변 중간에서 시작하는 비율). */
const polygonOf = (vertices: Pt[], { start = 0, overshoot = 0.04, n = 30 } = {}) => {
  const k = vertices.length;
  const edges = vertices.map((v, i) => lineOf(v, vertices[(i + 1) % k], n).slice(1));
  const all = [vertices[0], ...edges.flat()];
  const offset = Math.round(start * n);
  const rotated = [...all.slice(offset), ...all.slice(1, offset + 1)];
  const extra = Math.round(overshoot * all.length);
  return extra >= 0 ? [...rotated, ...rotated.slice(1, extra)] : rotated.slice(0, extra); // 음수면 덜 닫힘
};
const asPolygon = (shape: SnapShape | null, count: number) => {
  assert.ok(shape && shape.kind === 'polygon', `expected polygon, got ${JSON.stringify(shape)}`);
  assert.equal(shape.points.length, count, JSON.stringify(shape.points));
  return shape.points.map(([x, y]) => ({ x, y }));
};
/** 기대 꼭짓점마다 tolerance 안에 결과 꼭짓점이 하나씩 있는지. */
const hasCorners = (actual: Pt[], expected: Pt[], tolerance: number) => {
  for (const e of expected) assert.ok(actual.some(a => Math.hypot(a.x - e.x, a.y - e.y) <= tolerance), `corner ${JSON.stringify(e)} in ${JSON.stringify(actual)}`);
};

test('a hand-drawn triangle becomes a triangle with sharp corners', () => {
  const corners = [{ x: 100, y: 20 }, { x: 220, y: 200 }, { x: 10, y: 190 }];
  hasCorners(asPolygon(recognizeShape(hold(jitter(polygonOf(corners), 3))), 3), corners, 8);
  // 변 중간에서 시작해도, 끝이 조금 덜 닫혀도
  hasCorners(asPolygon(recognizeShape(jitter(polygonOf(corners, { start: 0.5, overshoot: -0.03 }), 3)), 3), corners, 8);
});

test('a near-axis quadrilateral snaps to an upright rectangle', () => {
  const corners = [{ x: 40, y: 50 }, { x: 260, y: 56 }, { x: 255, y: 190 }, { x: 44, y: 184 }];
  const rect = asPolygon(recognizeShape(hold(jitter(polygonOf(corners, { start: 0.3 }), 3))), 4);
  const xs = new Set(rect.map(p => Math.round(p.x * 1e6))), ys = new Set(rect.map(p => Math.round(p.y * 1e6)));
  assert.equal(xs.size, 2, 'two distinct x values (vertical sides)');
  assert.equal(ys.size, 2, 'two distinct y values (horizontal sides)');
  hasCorners(rect, [{ x: 42, y: 53 }, { x: 257, y: 53 }, { x: 257, y: 187 }, { x: 42, y: 187 }], 8);
});

test('a tilted rectangle stays tilted but square-cornered; a skewed quadrilateral keeps its corners', () => {
  const a = Math.PI / 6, c = Math.cos(a), s = Math.sin(a);
  const tilted = [[0, 0], [200, 0], [200, 100], [0, 100]].map(([x, y]) => ({ x: 150 + x * c - y * s, y: 50 + x * s + y * c }));
  const rect = asPolygon(recognizeShape(jitter(polygonOf(tilted), 2)), 4);
  hasCorners(rect, tilted, 8);
  for (let i = 0; i < 4; i++) {
    const p = rect[(i + 3) % 4], q = rect[i], r = rect[(i + 1) % 4];
    near((q.x - p.x) * (r.x - q.x) + (q.y - p.y) * (r.y - q.y), 0, 1e-6, 'right angle');
  }
  const kite = [{ x: 100, y: 0 }, { x: 200, y: 80 }, { x: 100, y: 240 }, { x: 0, y: 80 }];
  hasCorners(asPolygon(recognizeShape(jitter(polygonOf(kite), 2)), 4), kite, 8);
});

test('a rounded square is a rectangle, not a circle; a circle is never a polygon', () => {
  // 모서리를 둥글게(반지름 = 변의 15%) 그린 정사각형
  const side = 200, radius = 30;
  const rounded: Pt[] = [];
  const corners = [[side - radius, radius, -Math.PI / 2], [side - radius, side - radius, 0], [radius, side - radius, Math.PI / 2], [radius, radius, Math.PI]] as const;
  corners.forEach(([cx, cy, from], i) => {
    for (let k = 0; k <= 8; k++) { const t = from + (k / 8) * (Math.PI / 2); rounded.push({ x: cx + radius * Math.cos(t), y: cy + radius * Math.sin(t) }); }
    const next = corners[(i + 1) % 4];
    const end = { x: next[0] + radius * Math.cos(next[2]), y: next[1] + radius * Math.sin(next[2]) };
    rounded.push(...lineOf(rounded[rounded.length - 1], end, 20).slice(1, -1));
  });
  rounded.push(rounded[0], rounded[1], rounded[2]);
  asPolygon(recognizeShape(jitter(rounded, 2)), 4);
  for (const turns of [0.97, 1.03, 1.08]) {
    assert.equal(recognizePolygon(jitter(ellipseOf(200, 180, 80, 80, 0, turns, 0.4), 4)), null, `circle ${turns}`);
    assert.equal(recognizePolygon(jitter(ellipseOf(200, 180, 120, 60, 0.3, turns, 1.1), 3)), null, `ellipse ${turns}`);
  }
  asEllipse(recognizeShape(hold(jitter(ellipseOf(200, 180, 80, 80, 0, 1.03, 0.4), 4))));
});

test('an open curve is smoothed into a gentle curve through the stroke', () => {
  // 손떨림 섞인 포물선(함수 그래프처럼)
  const parabola = Array.from({ length: 120 }, (_, i) => { const x = i * 2.5; return { x, y: 250 - ((x - 150) ** 2) / 100 }; });
  const shaky = jitter(parabola, 5);
  const shape = recognizeShape(hold(shaky));
  assert.ok(shape && shape.kind === 'curve', `expected curve, got ${JSON.stringify(shape)}`);
  assert.ok(shape.points.length >= 3 && shape.points.length <= 16, `control points: ${shape.points.length}`);
  near(shape.points[0][0], shaky[0].x, 1e-9, 'starts where the stroke starts');
  const sampled = shapeToPoints(shape);
  for (const p of parabola) assert.ok(polylineHits(sampled, p, 6), `close to the true curve at ${p.x}`);
  // 큰 C자 호도 곡선으로(원을 덜 그린 것은 원이 아님)
  const arc = recognizeCurve(jitter(ellipseOf(100, 100, 80, 80, 0, 0.55, 0.8 * Math.PI), 3));
  assert.ok(arc && arc.kind === 'curve');
  // 직선은 직선으로(곡선보다 먼저)
  assert.equal(recognizeShape(jitter(lineOf({ x: 0, y: 0 }, { x: 200, y: 90 }), 2))?.kind, 'line');
});

test('polygons and curves resize around their center and keep eraser hit testing', () => {
  const tri: SnapShape = { kind: 'polygon', points: [[0, 0], [100, 0], [50, 80]] };
  const center = shapeCenter(tri);
  assert.deepEqual(center, { x: 50, y: 40 });
  const big = resizeShape(tri, { x: 100, y: 40 }, { x: 150, y: 40 });
  assert.ok(big.kind === 'polygon');
  assert.deepEqual(big.points, [[-50, -40], [150, -40], [50, 120]]);
  const outline = shapeToPoints(tri);
  assert.equal(outline.length, 4, 'closed outline');
  assert.ok(polylineHits(outline, { x: 25, y: 41 }, 2), 'on the left side');
  assert.ok(!polylineHits(outline, { x: 50, y: 30 }, 2), 'the middle is empty');
  const curve: SnapShape = { kind: 'curve', points: [[0, 0], [50, 40], [100, 0]] };
  const half = resizeShape(curve, { x: 100, y: 0 }, { x: 75, y: 10 });
  assert.ok(half.kind === 'curve');
  near(half.points[2][0] - half.points[0][0], 50, 1e-9, 'width halves');
  const path = shapeToPoints(curve);
  assert.deepEqual(path[0], { x: 0, y: 0 });
  assert.deepEqual(path.at(-1), { x: 100, y: 0 });
  assert.ok(polylineHits(path, { x: 50, y: 40 }, 1), 'passes through its control points');
});

// ── 꾹 누름 판정(시간 창) ──
/** 240Hz로 들어오는 점: 직선을 그리다(drawMs) 끝에서 ±amp px로 떨며 holdMs 동안 누른다. */
const pencil = (drawMs: number, holdMs: number, amp: number) => {
  const points: Pt[] = [], arrivals: number[] = [];
  for (let t = 0; t <= drawMs + holdMs; t += 1000 / 240) {
    const k = Math.min(1, t / drawMs);
    const shake = t > drawMs ? amp : 0;
    points.push({ x: 40 + 200 * k + rand() * 2 * shake, y: 80 + 60 * k + rand() * 2 * shake });
    arrivals.push(t);
  }
  return { points, arrivals, now: drawMs + holdMs };
};

test('a hold is detected through Apple Pencil jitter (±4px at 240Hz) and excludes the jitter points', () => {
  const { points, arrivals, now } = pencil(500, 700, 4);
  const still = holdStillStart(points, arrivals, now, 650, 6);
  assert.ok(still > 0, 'hold detected despite jitter');
  const end = points[still];
  assert.ok(Math.hypot(end.x - 240, end.y - 140) < 6, `stroke ends at the hold point: ${JSON.stringify(end)}`);
  assert.ok(arrivals[still] >= 480, 'the stroke before the hold is kept whole');
  // 예전 방식(마지막 기준점에서 3px을 넘으면 타이머 재시작)은 이 떨림에서 650ms를 채우지 못했다
  let anchor = points[0], since = 0, fired = false;
  for (let i = 1; i < points.length; i++) {
    if (Math.hypot(points[i].x - anchor.x, points[i].y - anchor.y) > 3) { anchor = points[i]; since = arrivals[i]; }
    if (arrivals[i] - since >= 650) fired = true;
  }
  assert.equal(fired, false, 'the old anchor/timer rule keeps resetting under this jitter');
});

test('no hold while the pen is still moving, before the hold time, or when it shakes a lot', () => {
  const moving = pencil(1500, 0, 0);
  assert.equal(holdStillStart(moving.points, moving.arrivals, 1500, 650, 6), -1, 'moving');
  const early = pencil(500, 400, 3);
  assert.equal(holdStillStart(early.points, early.arrivals, early.now, 650, 6), -1, 'only 400ms');
  const wobbly = pencil(500, 900, 14);
  assert.equal(holdStillStart(wobbly.points, wobbly.arrivals, wobbly.now, 650, 6), -1, 'large wobble is movement');
  // 아주 천천히 그리는 중(650ms에 20px)도 멈춤이 아니다
  const slow = Array.from({ length: 200 }, (_, i) => ({ x: i * 0.13, y: 0 }));
  assert.equal(holdStillStart(slow, slow.map((_, i) => i * 5), 1000, 650, 6), -1, 'slow drawing');
});

test('a perfectly still pen (no more pointermove events) still counts as a hold', () => {
  const points = lineOf({ x: 0, y: 0 }, { x: 200, y: 0 }, 10); // 빠르게 그어 점 간격이 20px
  const arrivals = points.map((_, i) => i * 30); // 마지막 점 이후로는 이벤트 없음
  assert.equal(holdStillStart(points, arrivals, 300 + 300, 650, 6), -1, 'not long enough yet');
  const still = holdStillStart(points, arrivals, 300 + 700, 650, 6);
  assert.equal(still, points.length - 1, 'the whole stroke is used, even with a large last step');
});
