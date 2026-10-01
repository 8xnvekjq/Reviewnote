// 꾹 눌러 도형 변환 — 판정 기하(순수 함수). 단위는 아무거나 상관없다(가로·세로 같은 단위면 됨).
// 컴포넌트는 화면 px로 바꿔 넣고, 결과를 다시 정규화 좌표로 돌려 저장한다.

export interface Pt { x: number; y: number }

export type SnapShape =
  | { kind: 'line'; from: [number, number]; to: [number, number] }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rotation: number };

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

function bboxDiagonal(points: Pt[]): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return Math.hypot(maxX - minX, maxY - minY);
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

/** 직선 → 원/타원 순서로 판정. 둘 다 아니면 null(원래 획 유지). */
export function recognizeShape(points: Pt[], options: RecognizeOptions = {}): SnapShape | null {
  return recognizeLine(points, options) ?? recognizeEllipse(points, options);
}

/** 판정 뒤 펜을 떼기 전까지 움직이면 크기 조절: 직선은 끝점이 따라가고, 원은 중심에서의 거리 비율만큼 커진다. */
export function resizeShape(base: SnapShape, anchor: Pt, pointer: Pt, axisSnapDegrees = DEFAULT_AXIS_SNAP): SnapShape {
  if (base.kind === 'line') {
    const from = { x: base.from[0], y: base.from[1] };
    const end = snapLineToAxis(from, pointer, axisSnapDegrees);
    return { kind: 'line', from: base.from, to: [end.x, end.y] };
  }
  const center = { x: base.cx, y: base.cy };
  const start = dist(anchor, center);
  const k = start > 1e-9 ? Math.max(0.05, dist(pointer, center) / start) : 1;
  return { ...base, rx: base.rx * k, ry: base.ry * k };
}

/** 도형을 점 목록으로(지우개 판정·저장용 points). */
export function shapeToPoints(shape: SnapShape, segments = 48): Pt[] {
  if (shape.kind === 'line') return [{ x: shape.from[0], y: shape.from[1] }, { x: shape.to[0], y: shape.to[1] }];
  const cos = Math.cos(shape.rotation), sin = Math.sin(shape.rotation);
  const out: Pt[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const u = shape.rx * Math.cos(a), v = shape.ry * Math.sin(a);
    out.push({ x: shape.cx + u * cos - v * sin, y: shape.cy + u * sin + v * cos });
  }
  return out;
}

/** 점(지우개 중심)이 폴리라인에서 radius 이내인지. */
export function polylineHits(points: Pt[], p: Pt, radius: number): boolean {
  if (points.length === 1) return dist(points[0], p) <= radius;
  for (let i = 1; i < points.length; i++) if (distanceToSegment(p, points[i - 1], points[i]) <= radius) return true;
  return false;
}
