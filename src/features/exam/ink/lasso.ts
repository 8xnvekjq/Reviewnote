// 올가미 선택·변환(순수 함수). 좌표는 필기와 같은 정규화 단위(이미지 너비 = 1).
//
// 선택 기준: 획을 이루는 점(도형은 둘레를 고르게 나눈 점) 가운데 절반 이상(LASSO_MIN_INSIDE)이 올가미 안에 있으면 선택.
//   - 글씨를 대충 둘러도 획 끝이 조금 삐져나온 것은 잡히고, 옆 글자를 살짝 스친 것은 잡히지 않는다.
//   - 점 하나짜리 획(콕 찍은 점)은 그 점이 안에 있으면 선택.
// 변환은 닮음 변환(균일 확대·축소 + 회전 + 평행이동)만 쓴다 — 타원은 타원 그대로, 굵기도 같은 비율로 바뀐다.
import type { InkShape, InkStroke } from '../contract.ts';
import { strokePolyline, strokeWidth } from './inkModel.ts';
import type { Pt } from './shapeSnap.ts';

export const LASSO_MIN_INSIDE = 0.5;
/** 서버 검증(private.validate_exam_replay_strokes)이 받는 좌표 범위 |x|,|y| ≤ 100. */
export const INK_COORD_LIMIT = 100;
/** 회전 스냅: 전체 기울기가 0°·90°·180°·270°에서 이 각도(도) 안이면 딱 맞춘다. */
export const ROTATE_SNAP_DEGREES = 5;
const MAX_SCALE = 8;
const MIN_SIZE = 0.3;
const MAX_SIZE = 50;

/** 선택 영역: 회전할 수 있는 직사각형(중심, 반너비, 반높이, 기울기 rad). */
export interface LassoFrame { cx: number; cy: number; hw: number; hh: number; angle: number }
/** 닮음 변환 p' = k·R(angle)·p + (tx, ty). */
export interface Similarity { k: number; angle: number; tx: number; ty: number }

export const IDENTITY: Similarity = { k: 1, angle: 0, tx: 0, ty: 0 };

export function applyPt(m: Similarity, p: Pt): Pt {
  const cos = Math.cos(m.angle) * m.k, sin = Math.sin(m.angle) * m.k;
  return { x: p.x * cos - p.y * sin + m.tx, y: p.x * sin + p.y * cos + m.ty };
}
/** 먼저 first, 그다음 second. */
export function compose(second: Similarity, first: Similarity): Similarity {
  const t = applyPt(second, { x: first.tx, y: first.ty });
  return { k: second.k * first.k, angle: second.angle + first.angle, tx: t.x, ty: t.y };
}
export const translate = (dx: number, dy: number): Similarity => ({ k: 1, angle: 0, tx: dx, ty: dy });
/** 점 c를 고정하고 k배, angle만큼 돌린다. */
export function about(c: Pt, k: number, angle: number): Similarity {
  const moved = applyPt({ k, angle, tx: 0, ty: 0 }, c);
  return { k, angle, tx: c.x - moved.x, ty: c.y - moved.y };
}
export const isIdentity = (m: Similarity) => m.k === 1 && m.angle === 0 && m.tx === 0 && m.ty === 0;

/** 점이 다각형(닫힌 올가미) 안에 있는지(짝홀 규칙). */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** 폴리라인을 길이 기준으로 고르게 n+1개 점으로(직선 도형은 끝점 2개뿐이라 그대로 세면 판정이 거칠다). */
function resample(points: Pt[], n: number): Pt[] {
  if (points.length < 2) return points;
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const total = lengths[lengths.length - 1];
  if (!total) return [points[0]];
  const out: Pt[] = [];
  let seg = 1;
  for (let s = 0; s <= n; s++) {
    const d = (s / n) * total;
    while (seg < points.length - 1 && lengths[seg] < d) seg++;
    const span = lengths[seg] - lengths[seg - 1] || 1;
    const t = Math.min(1, Math.max(0, (d - lengths[seg - 1]) / span));
    out.push({ x: points[seg - 1].x + (points[seg].x - points[seg - 1].x) * t, y: points[seg - 1].y + (points[seg].y - points[seg - 1].y) * t });
  }
  return out;
}

function samplePoints(stroke: InkStroke): Pt[] {
  return stroke.shape ? resample(strokePolyline(stroke), 32) : stroke.points;
}

/** 올가미 경로(path, 자동으로 닫힌다)에 절반 이상 들어간 획 id들(획 순서 그대로). */
export function lassoSelect(strokes: InkStroke[], path: Pt[]): string[] {
  if (path.length < 3) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of path) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const ids: string[] = [];
  for (const stroke of strokes) {
    const pts = samplePoints(stroke);
    if (!pts.length) continue;
    let inside = 0;
    for (const p of pts) if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY && pointInPolygon(p, path)) inside++;
    if (inside > 0 && inside / pts.length >= LASSO_MIN_INSIDE) ids.push(stroke.id);
  }
  return ids;
}

/** 선택한 획들을 감싸는 수평 직사각형(획 굵기 절반 + pad 여유). */
export function frameOf(strokes: InkStroke[], pad: number): LassoFrame | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const stroke of strokes) {
    const half = strokeWidth(stroke) / 2;
    for (const p of strokePolyline(stroke)) {
      minX = Math.min(minX, p.x - half); maxX = Math.max(maxX, p.x + half);
      minY = Math.min(minY, p.y - half); maxY = Math.max(maxY, p.y + half);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, hw: (maxX - minX) / 2 + pad, hh: (maxY - minY) / 2 + pad, angle: 0 };
}

export function transformFrame(frame: LassoFrame, m: Similarity): LassoFrame {
  const c = applyPt(m, { x: frame.cx, y: frame.cy });
  return { cx: c.x, cy: c.y, hw: frame.hw * m.k, hh: frame.hh * m.k, angle: frame.angle + m.angle };
}

/** 네 모서리: 왼위·오른위·오른아래·왼아래(기울기 적용). */
export function frameCorners(frame: LassoFrame): Pt[] {
  const cos = Math.cos(frame.angle), sin = Math.sin(frame.angle);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const u = sx * frame.hw, v = sy * frame.hh;
    return { x: frame.cx + u * cos - v * sin, y: frame.cy + u * sin + v * cos };
  });
}

/** 오른쪽 변 가운데에서 바깥으로 offset 떨어진 회전 손잡이 위치. */
export function rotateHandle(frame: LassoFrame, offset: number): Pt {
  const d = frame.hw + offset;
  return { x: frame.cx + d * Math.cos(frame.angle), y: frame.cy + d * Math.sin(frame.angle) };
}

export type FrameHit = { kind: 'rotate' } | { kind: 'corner'; index: number } | { kind: 'move' };

/** 누른 곳이 회전 손잡이·모서리 손잡이·선택 영역 안(inset 여유 포함)인지. 단위는 모두 정규화 좌표. */
export function hitFrame(frame: LassoFrame, p: Pt, handleRadius: number, rotateOffset: number, inset = 0): FrameHit | null {
  const r = rotateHandle(frame, rotateOffset);
  if (Math.hypot(p.x - r.x, p.y - r.y) <= handleRadius) return { kind: 'rotate' };
  const corners = frameCorners(frame);
  let best = -1, bestDist = handleRadius;
  corners.forEach((c, i) => {
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d <= bestDist) { bestDist = d; best = i; }
  });
  if (best >= 0) return { kind: 'corner', index: best };
  const cos = Math.cos(-frame.angle), sin = Math.sin(-frame.angle);
  const dx = p.x - frame.cx, dy = p.y - frame.cy;
  const u = dx * cos - dy * sin, v = dx * sin + dy * cos;
  if (Math.abs(u) <= frame.hw + inset && Math.abs(v) <= frame.hh + inset) return { kind: 'move' };
  return null;
}

/** 평행이동. 선택 영역 중심이 [0, maxX]×[0, maxY] 밖으로 나가지 않게 막는다(오른쪽·아래 여백까지는 갈 수 있다). */
export function moveTransform(frame: LassoFrame, dx: number, dy: number, maxX: number, maxY: number): Similarity {
  const x = Math.min(Math.max(frame.cx + dx, 0), Math.max(0, maxX));
  const y = Math.min(Math.max(frame.cy + dy, 0), Math.max(0, maxY));
  return translate(x - frame.cx, y - frame.cy);
}

/** 모서리 손잡이로 확대·축소(비율 유지): 맞은편 모서리를 고정하고, 대각선 방향으로 끈 만큼. minHalf: 줄였을 때 최소 반변. */
export function scaleTransform(frame: LassoFrame, corner: number, pointer: Pt, minHalf: number): Similarity {
  const corners = frameCorners(frame);
  const anchor = corners[(corner + 2) % 4];
  const from = corners[corner];
  const dx = from.x - anchor.x, dy = from.y - anchor.y;
  const len2 = dx * dx + dy * dy || 1;
  let k = ((pointer.x - anchor.x) * dx + (pointer.y - anchor.y) * dy) / len2;
  const minK = minHalf / Math.max(frame.hw, frame.hh, 1e-9);
  k = Math.min(MAX_SCALE, Math.max(minK, k));
  return about(anchor, k, 0);
}

/** 회전: 선택 직사각형 무게중심을 축으로 start→pointer 각도만큼. 전체 기울기가 직각 근처면 스냅. */
export function rotateTransform(frame: LassoFrame, start: Pt, pointer: Pt, snapDegrees = ROTATE_SNAP_DEGREES): Similarity {
  const c = { x: frame.cx, y: frame.cy };
  let delta = Math.atan2(pointer.y - c.y, pointer.x - c.x) - Math.atan2(start.y - c.y, start.x - c.x);
  if (snapDegrees > 0) {
    const total = frame.angle + delta;
    const quarter = Math.PI / 2;
    const nearest = Math.round(total / quarter) * quarter;
    if (Math.abs(total - nearest) <= (snapDegrees * Math.PI) / 180) delta = nearest - frame.angle;
  }
  return about(c, 1, delta);
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;
const coord = (v: number) => round4(Math.min(INK_COORD_LIMIT, Math.max(-INK_COORD_LIMIT, v)));
const tuple = (m: Similarity, [x, y]: [number, number]): [number, number] => {
  const p = applyPt(m, { x, y });
  return [coord(p.x), coord(p.y)];
};

/** 타원 기울기를 (-π/2, π/2]로(타원은 π마다 같은 모양). */
function normalizeRotation(r: number): number {
  let out = r % Math.PI;
  if (out > Math.PI / 2) out -= Math.PI;
  if (out <= -Math.PI / 2) out += Math.PI;
  return Math.round(out * 1e6) / 1e6;
}

export function transformShape(shape: InkShape, m: Similarity): InkShape {
  if (shape.kind === 'line') return { kind: 'line', from: tuple(m, shape.from), to: tuple(m, shape.to) };
  if (shape.kind === 'ellipse') {
    const c = applyPt(m, { x: shape.cx, y: shape.cy });
    const r = (v: number) => Math.min(INK_COORD_LIMIT, round4(v * m.k));
    return { kind: 'ellipse', cx: coord(c.x), cy: coord(c.y), rx: r(shape.rx), ry: r(shape.ry), rotation: normalizeRotation(shape.rotation + m.angle) };
  }
  return { kind: shape.kind, points: shape.points.map(p => tuple(m, p)) };
}

/** 획 하나를 변환한 새 획(새 id). 필압·시각은 그대로, 굵기는 같은 비율로. 서버 검증 필드만 쓴다. */
export function transformStroke(stroke: InkStroke, m: Similarity, id: string): InkStroke {
  const size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(stroke.size * m.k * 100) / 100));
  const points = stroke.points.map(p => {
    const q = applyPt(m, p);
    return { x: coord(q.x), y: coord(q.y), pressure: p.pressure, t: p.t };
  });
  const out: InkStroke = { id, tool: stroke.tool, color: stroke.color, size, points };
  if (stroke.shape) out.shape = transformShape(stroke.shape, m);
  return out;
}

/** 선택한 획만 제자리(같은 순서)에서 새 id의 변환된 획으로 바꾼다 — 저장 이벤트는 "옛 id 제거 + 새 획 추가". */
export function transformSelection(strokes: InkStroke[], ids: string[], m: Similarity, newId: () => string): { strokes: InkStroke[]; ids: string[] } {
  const selected = new Set(ids);
  const nextIds: string[] = [];
  const next = strokes.map(stroke => {
    if (!selected.has(stroke.id)) return stroke;
    const moved = transformStroke(stroke, m, newId());
    nextIds.push(moved.id);
    return moved;
  });
  return { strokes: next, ids: nextIds };
}
