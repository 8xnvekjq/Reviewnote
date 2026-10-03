// 꾹 눌러 도형 변환 — 판정 기하(순수 함수). 단위는 아무거나 상관없다(가로·세로 같은 단위면 됨).
// 컴포넌트는 화면 px로 바꿔 넣고, 결과를 다시 정규화 좌표로 돌려 저장한다.

import type { InkShape } from '../contract.ts';

export interface Pt { x: number; y: number }

export type SnapShape = InkShape;

export interface RecognizeOptions {
  /** 이보다 작은 획(외접 사각형 대각선)은 점·짧은 획으로 보고 판정하지 않는다. */
  minSize?: number;
  /** 가로/세로에서 이 각도(도) 이내면 수평·수직으로 스냅. 0이면 스냅 안 함. */
  axisSnapDegrees?: number;
}

const DEFAULT_MIN_SIZE = 20;
const DEFAULT_AXIS_SNAP = 6;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function pathLength(points: Pt[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

function bbox(points: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function bboxDiagonal(points: Pt[]): number {
  const b = bbox(points);
  return Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
}

/** 연속 중복점(꾹 누르는 동안 쌓인 점)을 걷어 낸다. */
function dedupe(points: Pt[], epsilon: number): Pt[] {
  const out: Pt[] = [];
  for (const p of points) if (!out.length || dist(out[out.length - 1], p) > epsilon) out.push(p);
  return out;
}

/** 점에서 선분까지 거리. */
export function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 가로/세로에 가까운 직선이면 끝점을 축에 맞춘다(시작점 고정). */
export function snapLineToAxis(from: Pt, to: Pt, degrees = DEFAULT_AXIS_SNAP): Pt {
  if (degrees <= 0) return to;
  const angle = Math.abs(Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI);
  const offHorizontal = Math.min(angle, 180 - angle);
  const offVertical = Math.abs(90 - angle);
  if (offHorizontal <= degrees) return { x: to.x, y: from.y };
  if (offVertical <= degrees) return { x: from.x, y: to.y };
  return to;
}

export function recognizeLine(raw: Pt[], options: RecognizeOptions = {}): SnapShape | null {
  const minSize = options.minSize ?? DEFAULT_MIN_SIZE;
  const points = dedupe(raw, minSize * 0.02);
  if (points.length < 2) return null;
  const from = points[0];
  const to = points[points.length - 1];
  const chord = dist(from, to);
  if (chord < minSize) return null;
  if (pathLength(points) / chord > 1.12) return null;
  let maxDeviation = 0;
  for (const p of points) maxDeviation = Math.max(maxDeviation, distanceToSegment(p, from, to));
  if (maxDeviation / chord > 0.07) return null;
  const end = snapLineToAxis(from, to, options.axisSnapDegrees ?? DEFAULT_AXIS_SNAP);
  return { kind: 'line', from: [from.x, from.y], to: [end.x, end.y] };
}

/** 5×5 정규방정식을 가우스 소거로 푼다. 특이하면 null. */
function solve(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      for (let c = col; c <= n; c++) a[r][c] -= f * a[col][c];
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}

/** 최소제곱 원뿔곡선 적합(Ax²+Bxy+Cy²+Dx+Ey=1, 중심·크기 정규화 좌표) → 타원이면 중심/반지름/회전. */
export function fitEllipse(points: Pt[]): { cx: number; cy: number; rx: number; ry: number; rotation: number } | null {
  if (points.length < 6) return null;
  let mx = 0, my = 0;
  for (const p of points) { mx += p.x; my += p.y; }
  mx /= points.length; my /= points.length;
  let scale = 0;
  for (const p of points) scale = Math.max(scale, Math.abs(p.x - mx), Math.abs(p.y - my));
  if (!scale) return null;
  const ata = Array.from({ length: 5 }, () => [0, 0, 0, 0, 0]);
  const atb = [0, 0, 0, 0, 0];
  for (const p of points) {
    const x = (p.x - mx) / scale, y = (p.y - my) / scale;
    const row = [x * x, x * y, y * y, x, y];
    for (let i = 0; i < 5; i++) {
      atb[i] += row[i];
      for (let j = 0; j < 5; j++) ata[i][j] += row[i] * row[j];
    }
  }
  const coef = solve(ata, atb);
  if (!coef) return null;
  const [A, B, C, D, E] = coef;
  const F = -1;
  const det = 4 * A * C - B * B;
  if (det <= 0) return null; // 타원이 아님(쌍곡선·포물선)
  const x0 = (B * E - 2 * C * D) / det;
  const y0 = (B * D - 2 * A * E) / det;
  const centerValue = A * x0 * x0 + B * x0 * y0 + C * y0 * y0 + D * x0 + E * y0 + F;
  const theta = 0.5 * Math.atan2(B, A - C);
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const lambdaMajorDir = A * cos * cos + B * cos * sin + C * sin * sin;
  const lambdaMinorDir = A * sin * sin - B * sin * cos + C * cos * cos;
  const ra2 = -centerValue / lambdaMajorDir;
  const rb2 = -centerValue / lambdaMinorDir;
  if (!(ra2 > 0) || !(rb2 > 0)) return null;
  return { cx: mx + x0 * scale, cy: my + y0 * scale, rx: Math.sqrt(ra2) * scale, ry: Math.sqrt(rb2) * scale, rotation: theta };
}

/** -π/2 < rotation ≤ π/2 로 정규화하고, rx ≥ ry 가 되게 축을 맞춘다. */
function normalizeEllipse(e: { cx: number; cy: number; rx: number; ry: number; rotation: number }) {
  let { rx, ry, rotation } = e;
  if (ry > rx) { [rx, ry] = [ry, rx]; rotation += Math.PI / 2; }
  while (rotation > Math.PI / 2) rotation -= Math.PI;
  while (rotation <= -Math.PI / 2) rotation += Math.PI;
  return { ...e, rx, ry, rotation };
}

export function recognizeEllipse(raw: Pt[], options: RecognizeOptions = {}): SnapShape | null {
  const minSize = options.minSize ?? DEFAULT_MIN_SIZE;
  const points = dedupe(raw, minSize * 0.02);
  if (points.length < 8) return null;
  const diagonal = bboxDiagonal(points);
  if (diagonal < minSize) return null;
  const length = pathLength(points);
  const gap = dist(points[0], points[points.length - 1]);
  const fitted = fitEllipse(points);
  if (!fitted) return null;
  const e = normalizeEllipse(fitted);
  if (e.ry / e.rx < 0.2) return null; // 너무 납작하면 직선/글씨
  // 한 바퀴를 거의 다 돌았는지: 중심 기준 각도를 12칸으로 나눠 채워진 칸 수.
  const bins = new Set<number>();
  let error = 0, maxError = 0;
  const cos = Math.cos(-e.rotation), sin = Math.sin(-e.rotation);
  for (const p of points) {
    const dx = p.x - e.cx, dy = p.y - e.cy;
    const u = dx * cos - dy * sin, v = dx * sin + dy * cos;
    const r = Math.hypot(u / e.rx, v / e.ry);
    error += Math.abs(r - 1);
    maxError = Math.max(maxError, Math.abs(r - 1));
    bins.add(Math.floor(((Math.atan2(v / e.ry, u / e.rx) + Math.PI) / (2 * Math.PI)) * 12) % 12);
  }
  error /= points.length;
  const perimeter = Math.PI * (3 * (e.rx + e.ry) - Math.sqrt((3 * e.rx + e.ry) * (e.rx + 3 * e.ry)));
  const closed = gap <= Math.max(0.25 * e.rx * 2, minSize * 0.5) || length >= perimeter * 0.95;
  if (!closed || bins.size < 11) return null;
  if (error > 0.09 || maxError > 0.3) return null;
  if (length > perimeter * 1.6) return null; // 여러 바퀴 낙서는 원이 아님
  if ((e.rx - e.ry) / e.rx <= 0.12) {
    const r = (e.rx + e.ry) / 2;
    return { kind: 'ellipse', cx: e.cx, cy: e.cy, rx: r, ry: r, rotation: 0 };
  }
  const snapRad = ((options.axisSnapDegrees ?? DEFAULT_AXIS_SNAP) * Math.PI) / 180;
  let rotation = e.rotation;
  if (Math.abs(rotation) <= snapRad) rotation = 0;
  else if (Math.PI / 2 - Math.abs(rotation) <= snapRad) rotation = Math.PI / 2;
  return { kind: 'ellipse', cx: e.cx, cy: e.cy, rx: e.rx, ry: e.ry, rotation };
}

/** Ramer–Douglas–Peucker 단순화(양 끝점 유지). */
export function simplify(points: Pt[], epsilon: number): Pt[] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1; keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1, index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distanceToSegment(points[i], points[a], points[b]);
      if (d > worst) { worst = d; index = i; }
    }
    if (index >= 0 && worst > epsilon) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** a→b→c에서 꺾인 각(방향 변화, 0~π). */
function turnAngle(a: Pt, b: Pt, c: Pt): number {
  let d = Math.abs(Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x));
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}

/** 두 직선(점 p + 방향 d)의 교점. 거의 평행이면 null. */
function intersect(p1: Pt, d1: Pt, p2: Pt, d2: Pt): Pt | null {
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-9 * Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y)) return null;
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / cross;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}

/** 점에서 닫힌 다각형 둘레까지 거리. */
function distanceToPolygon(p: Pt, vertices: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < vertices.length; i++) best = Math.min(best, distanceToSegment(p, vertices[i], vertices[(i + 1) % vertices.length]));
  return best;
}

/** 각 변에 가까운 점들로 직선을 맞추고(주성분) 이웃 직선의 교점을 꼭짓점으로 — 둥글게 그린 모서리도 뾰족하게 잡힌다. */
function refineCorners(points: Pt[], vertices: Pt[], diagonal: number): Pt[] {
  const n = vertices.length;
  const lines = vertices.map((a, i) => {
    const b = vertices[(i + 1) % n];
    const margin = dist(a, b) * 0.2;
    const own = points.filter(p => dist(p, a) >= margin && dist(p, b) >= margin
      && distanceToSegment(p, a, b) <= distanceToPolygon(p, vertices) + 1e-9);
    if (own.length < 3) return null;
    let mx = 0, my = 0;
    for (const p of own) { mx += p.x; my += p.y; }
    mx /= own.length; my /= own.length;
    let sxx = 0, sxy = 0, syy = 0;
    for (const p of own) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    return { p: { x: mx, y: my }, d: { x: Math.cos(theta), y: Math.sin(theta) } };
  });
  return vertices.map((v, i) => {
    const before = lines[(i - 1 + n) % n], after = lines[i];
    if (!before || !after) return v;
    const corner = intersect(before.p, before.d, after.p, after.d);
    return corner && dist(corner, v) <= diagonal * 0.15 ? corner : v;
  });
}

/** 네 각이 거의 직각이면 직사각형으로 반듯하게(축에 가까우면 수평·수직으로). */
function squareUp(vertices: Pt[], axisSnapDegrees: number): Pt[] {
  const tolerance = (14 * Math.PI) / 180;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(turnAngle(vertices[(i + 3) % 4], vertices[i], vertices[(i + 1) % 4]) - Math.PI / 2) > tolerance) return vertices;
  }
  // 변 방향 평균(90° 주기라 4배 각도로 평균, 긴 변에 가중)
  let sx = 0, sy = 0;
  for (let i = 0; i < 4; i++) {
    const a = vertices[i], b = vertices[(i + 1) % 4];
    const angle = Math.atan2(b.y - a.y, b.x - a.x) * 4;
    sx += Math.cos(angle) * dist(a, b); sy += Math.sin(angle) * dist(a, b);
  }
  let theta = Math.atan2(sy, sx) / 4; // -π/4 ~ π/4
  if (axisSnapDegrees > 0 && Math.abs(theta) <= (axisSnapDegrees * 2 * Math.PI) / 180) theta = 0;
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const us = vertices.map(v => v.x * cos + v.y * sin).sort((a, b) => a - b);
  const vs = vertices.map(v => -v.x * sin + v.y * cos).sort((a, b) => a - b);
  const u0 = (us[0] + us[1]) / 2, u1 = (us[2] + us[3]) / 2;
  const v0 = (vs[0] + vs[1]) / 2, v1 = (vs[2] + vs[3]) / 2;
  const corner = (u: number, v: number): Pt => ({ x: u * cos - v * sin, y: u * sin + v * cos });
  return [corner(u0, v0), corner(u1, v0), corner(u1, v1), corner(u0, v1)];
}

const tuple = (p: Pt): [number, number] => [p.x, p.y];

/** 닫힌 획에서 꼭짓점 3개 → 삼각형, 4개 → 사각형. 원처럼 고르게 도는 획은 꼭짓점이 많이 남아 걸러진다. */
export function recognizePolygon(raw: Pt[], options: RecognizeOptions = {}): SnapShape | null {
  const minSize = options.minSize ?? DEFAULT_MIN_SIZE;
  const points = dedupe(raw, minSize * 0.02);
  if (points.length < 8) return null;
  const diagonal = bboxDiagonal(points);
  if (diagonal < minSize) return null;
  const gap = dist(points[0], points[points.length - 1]);
  if (gap > Math.max(diagonal * 0.2, minSize * 0.5)) return null; // 닫혀 있어야
  if (pathLength(points) > diagonal * 3.6) return null; // 여러 바퀴 낙서
  const loop = gap > minSize * 0.02 ? [...points, points[0]] : points;
  let vertices = simplify(loop, diagonal * 0.045).slice(0, -1);
  // 꼭짓점 정리: 거의 펴진 꼭짓점(시작점 등)은 빼고, 둥근 모서리가 남긴 짧은 변은 이웃 변의 교점 하나로 합친다.
  for (let changed = true; changed && vertices.length >= 3;) {
    changed = false;
    const n = vertices.length;
    let flattest = -1, flatTurn = Math.PI;
    for (let i = 0; i < n; i++) {
      const turn = turnAngle(vertices[(i - 1 + n) % n], vertices[i], vertices[(i + 1) % n]);
      if (turn < flatTurn) { flatTurn = turn; flattest = i; }
    }
    if (flatTurn < (32 * Math.PI) / 180) {
      vertices = vertices.filter((_, i) => i !== flattest);
      changed = true;
      continue;
    }
    if (n <= 3) break;
    let shortest = -1, shortLen = Infinity;
    for (let i = 0; i < n; i++) {
      const len = dist(vertices[i], vertices[(i + 1) % n]);
      if (len < shortLen) { shortLen = len; shortest = i; }
    }
    if (shortLen < diagonal * 0.16) {
      const a = vertices[(shortest - 1 + n) % n], b = vertices[shortest], c = vertices[(shortest + 1) % n], d = vertices[(shortest + 2) % n];
      const corner = intersect(a, { x: b.x - a.x, y: b.y - a.y }, d, { x: c.x - d.x, y: c.y - d.y });
      const merged = corner && dist(corner, b) < diagonal * 0.25 ? corner : { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
      const drop = (shortest + 1) % n;
      vertices = vertices.flatMap((v, i) => (i === shortest ? [merged] : i === drop ? [] : [v]));
      changed = true;
    }
  }
  if (vertices.length !== 3 && vertices.length !== 4) return null;
  vertices = refineCorners(points, vertices, diagonal);
  for (let i = 0; i < vertices.length; i++) if (dist(vertices[i], vertices[(i + 1) % vertices.length]) < diagonal * 0.15) return null;
  // 같은 자리를 왔다 갔다 한 납작한 획은 다각형이 아님(넓이로 거른다)
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    area += a.x * b.y - b.x * a.y;
  }
  if (Math.abs(area) / 2 < diagonal * diagonal * 0.06) return null;
  // 원래 획이 다각형 둘레에 바짝 붙어야 한다(원을 사각형으로 오인하지 않게).
  let error = 0, maxError = 0;
  for (const p of points) {
    const d = distanceToPolygon(p, vertices);
    error += d; maxError = Math.max(maxError, d);
  }
  error /= points.length;
  if (error > diagonal * 0.025 || maxError > diagonal * 0.07) return null;
  if (vertices.length === 4) vertices = squareUp(vertices, options.axisSnapDegrees ?? DEFAULT_AXIS_SNAP);
  return { kind: 'polygon', points: vertices.map(tuple) };
}

/** 같은 간격으로 다시 찍는다(속도에 따라 들쭉날쭉한 점 간격을 고르게). */
function resample(points: Pt[], step: number): Pt[] {
  const out: Pt[] = [points[0]];
  let need = step;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const len = dist(a, b);
    let at = need;
    while (at <= len) {
      out.push({ x: a.x + ((b.x - a.x) * at) / len, y: a.y + ((b.y - a.y) * at) / len });
      at += step;
    }
    need = at - len;
  }
  const last = points[points.length - 1];
  if (dist(out[out.length - 1], last) > step * 0.3) out.push(last);
  else out[out.length - 1] = last;
  return out;
}

function minDistance(p: Pt, polyline: Pt[]): number {
  let best = Infinity;
  for (let i = 1; i < polyline.length; i++) best = Math.min(best, distanceToSegment(p, polyline[i - 1], polyline[i]));
  return best;
}

/** 열린 획의 손떨림을 걷어 낸 매끈한 곡선. 꺾인 글씨(2·3·ㄱ)나 여러 번 휘는 획(S·낙서), 글자 크기 획은 그대로 둔다. */
export function recognizeCurve(raw: Pt[], options: RecognizeOptions = {}): SnapShape | null {
  const minSize = options.minSize ?? DEFAULT_MIN_SIZE;
  const points = dedupe(raw, minSize * 0.02);
  if (points.length < 4) return null;
  const diagonal = bboxDiagonal(points);
  if (diagonal < minSize * 2) return null;
  if (dist(points[0], points[points.length - 1]) < diagonal * 0.25) return null; // 닫힌 획(원·다각형 실패)은 곡선이 아님
  // 고르게 다시 찍고 이동 평균으로 손떨림을 걷어 낸 뒤 단순화
  const even = resample(points, diagonal / 80);
  const smooth = even.map((p, i) => {
    if (i === 0 || i === even.length - 1) return p;
    const r = Math.min(3, i, even.length - 1 - i);
    let x = 0, y = 0;
    for (let k = i - r; k <= i + r; k++) { x += even[k].x; y += even[k].y; }
    return { x: x / (2 * r + 1), y: y / (2 * r + 1) };
  });
  const simple = simplify(smooth, Math.max(diagonal * 0.02, minSize * 0.03));
  if (simple.length < 3 || simple.length > 16) return null;
  let total = 0;
  for (let i = 1; i < simple.length - 1; i++) {
    const turn = turnAngle(simple[i - 1], simple[i], simple[i + 1]);
    if (turn > (75 * Math.PI) / 180) return null; // 뾰족하게 꺾임 → 글씨
    total += turn;
  }
  if (total > Math.PI * 1.5) return null;
  const shape: SnapShape = { kind: 'curve', points: simple.map(tuple) };
  // 다듬은 곡선이 원래 획에서 멀어지면 안 된다
  const sampled = shapeToPoints(shape);
  for (const p of points) if (minDistance(p, sampled) > diagonal * 0.06) return null;
  return shape;
}

/** Catmull-Rom 곡선을 3차 베지어 조각([시작, 제어1, 제어2, 끝])으로. 접선 길이를 변 길이에 맞춰 넘침을 막는다. */
export function curveSegments(points: Array<[number, number]>): Array<[Pt, Pt, Pt, Pt]> {
  const p = points.map(([x, y]) => ({ x, y }));
  const n = p.length;
  const tangent = (i: number): Pt => {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
    const len = dist(a, b) || 1;
    return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  };
  const out: Array<[Pt, Pt, Pt, Pt]> = [];
  for (let i = 0; i < n - 1; i++) {
    const a = p[i], b = p[i + 1];
    const k = dist(a, b) / 3;
    const ta = tangent(i), tb = tangent(i + 1);
    out.push([a, { x: a.x + ta.x * k, y: a.y + ta.y * k }, { x: b.x - tb.x * k, y: b.y - tb.y * k }, b]);
  }
  return out;
}

/**
 * 직선 → 다각형 → 원/타원 → 곡선 순서로 판정. 모두 아니면 null(원래 획 유지).
 * 다각형을 원보다 먼저 본다: 둥근 사각형은 사각형으로 잡히고, 원은 꼭짓점이 많이 남아 다각형에서 걸러진다.
 */
export function recognizeShape(points: Pt[], options: RecognizeOptions = {}): SnapShape | null {
  return recognizeLine(points, options) ?? recognizePolygon(points, options) ?? recognizeEllipse(points, options) ?? recognizeCurve(points, options);
}

/** 도형 중심(외접 사각형 가운데, 타원은 중심). 크기 조절·변환 애니메이션 기준. */
export function shapeCenter(shape: SnapShape): Pt {
  if (shape.kind === 'ellipse') return { x: shape.cx, y: shape.cy };
  const b = bbox((shape.kind === 'line' ? [shape.from, shape.to] : shape.points).map(([x, y]) => ({ x, y })));
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/** 판정 뒤 펜을 떼기 전까지 움직이면 크기 조절: 직선은 끝점이 따라가고, 원·다각형·곡선은 중심에서의 거리 비율만큼 커진다. */
export function resizeShape(base: SnapShape, anchor: Pt, pointer: Pt, axisSnapDegrees = DEFAULT_AXIS_SNAP): SnapShape {
  if (base.kind === 'line') {
    const from = { x: base.from[0], y: base.from[1] };
    const end = snapLineToAxis(from, pointer, axisSnapDegrees);
    return { kind: 'line', from: base.from, to: [end.x, end.y] };
  }
  const center = shapeCenter(base);
  const start = dist(anchor, center);
  const k = start > 1e-9 ? Math.max(0.05, dist(pointer, center) / start) : 1;
  if (base.kind === 'ellipse') return { ...base, rx: base.rx * k, ry: base.ry * k };
  return { kind: base.kind, points: base.points.map(([x, y]) => [center.x + (x - center.x) * k, center.y + (y - center.y) * k]) };
}

/** 도형을 점 목록으로(지우개 판정·저장용 points). */
export function shapeToPoints(shape: SnapShape, segments = 48): Pt[] {
  if (shape.kind === 'line') return [{ x: shape.from[0], y: shape.from[1] }, { x: shape.to[0], y: shape.to[1] }];
  if (shape.kind === 'polygon') return [...shape.points, shape.points[0]].map(([x, y]) => ({ x, y }));
  if (shape.kind === 'curve') {
    const parts = curveSegments(shape.points);
    if (!parts.length) return shape.points.map(([x, y]) => ({ x, y }));
    const out: Pt[] = [parts[0][0]];
    const steps = 8;
    for (const [a, c1, c2, b] of parts) {
      for (let s = 1; s <= steps; s++) {
        const t = s / steps, u = 1 - t;
        out.push({
          x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
          y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
        });
      }
    }
    return out;
  }
  const cos = Math.cos(shape.rotation), sin = Math.sin(shape.rotation);
  const out: Pt[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const u = shape.rx * Math.cos(a), v = shape.ry * Math.sin(a);
    out.push({ x: shape.cx + u * cos - v * sin, y: shape.cy + u * sin + v * cos });
  }
  return out;
}

/**
 * 꾹 누름 판정: 최근 holdMs 동안의 점(+ 그 직전 점 = 창이 시작될 때 펜 위치)이 중심에서 slop 안에 모여 있으면
 * 멈춘 것으로 본다. 멈춘 덩어리가 시작된 위치(stillStart)를 돌려준다. 아직 아니면 -1.
 * points/arrivals는 같은 길이, slop은 points와 같은 단위.
 */
export function holdStillStart(points: Pt[], arrivals: number[], now: number, holdMs: number, slop: number): number {
  const n = points.length;
  if (!n || now - arrivals[0] < holdMs) return -1;
  // 창 안 첫 점 s → 그 직전 점부터(창이 시작될 때 펜은 거기 있었다). 창 안에 점이 없으면 마지막 점에 줄곧 멈춰 있던 것.
  let s = n;
  while (s > 0 && arrivals[s - 1] >= now - holdMs) s--;
  s = s === n ? n - 1 : Math.max(0, s - 1);
  let cx = 0, cy = 0;
  for (let i = s; i < n; i++) { cx += points[i].x; cy += points[i].y; }
  cx /= n - s; cy /= n - s;
  for (let i = s; i < n; i++) if (Math.hypot(points[i].x - cx, points[i].y - cy) > slop) return -1;
  while (s > 0 && Math.hypot(points[s - 1].x - cx, points[s - 1].y - cy) <= slop) s--;
  return s;
}

/** 점(지우개 중심)이 폴리라인에서 radius 이내인지. */
export function polylineHits(points: Pt[], p: Pt, radius: number): boolean {
  if (points.length === 1) return dist(points[0], p) <= radius;
  for (let i = 1; i < points.length; i++) if (distanceToSegment(p, points[i - 1], points[i]) <= radius) return true;
  return false;
}
