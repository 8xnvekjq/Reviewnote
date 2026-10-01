// 필기 데이터 모델(순수 함수): 좌표계, 굵기, 지우개 판정, 실행 취소 기록.
import type { InkPoint, InkStroke } from '../contract.ts';
import { polylineHits, shapeToPoints } from './shapeSnap.ts';
import type { Pt } from './shapeSnap.ts';

/**
 * 좌표계: x는 이미지 너비 기준 0~1, y도 같은 단위(이미지 너비 = 1)로 잰다.
 * 그래서 이미지 높이는 naturalHeight/naturalWidth, 캔버스 전체 높이는 그 + inkExtraBelow(그).
 */
export const INK_EXTRA_BELOW = 0.6;
/** 1번처럼 납작한 문항도 풀이 공간이 모자라지 않게 아래 여백은 최소 이미지 너비의 절반. */
export const INK_MIN_EXTRA = 0.5;

/** 문항 이미지 아래 여백 높이(이미지 너비 = 1 단위). aspect = naturalHeight / naturalWidth. */
export function inkExtraBelow(aspect: number): number {
  return aspect > 0 ? Math.max(aspect * INK_EXTRA_BELOW, INK_MIN_EXTRA) : 0;
}
/**
 * `size`(펜 굵기)는 "이미지가 화면에 이 너비(px)로 보일 때의 px"로 해석한다.
 * 화면이 커지거나 작아지면 글씨와 함께 같은 비율로 커지고 작아진다.
 */
export const INK_REFERENCE_WIDTH = 700;
/** 형광펜은 같은 size라도 펜보다 굵게 그린다. */
export const HIGHLIGHTER_WIDTH_SCALE = 3.5;
/** 형광펜 레이어 불투명도(글씨 뒤에 깔리고 이미지 글자가 비친다). */
export const HIGHLIGHTER_OPACITY = 0.38;

/** 렌더용 굵기(정규화 단위, 이미지 너비 = 1). */
export function strokeWidth(stroke: Pick<InkStroke, 'tool' | 'size'>): number {
  return (stroke.size * (stroke.tool === 'highlighter' ? HIGHLIGHTER_WIDTH_SCALE : 1)) / INK_REFERENCE_WIDTH;
}

/** 압력 센서가 없는 입력(마우스·손가락)은 0.5로 고정해 저장하고, 렌더 때 속도로 압력을 흉내 낸다. */
export const SIMULATED_PRESSURE = 0.5;
export function usesSimulatedPressure(points: InkPoint[]): boolean {
  return points.every(p => p.pressure === SIMULATED_PRESSURE);
}

export function strokePolyline(stroke: InkStroke): Pt[] {
  return stroke.shape ? shapeToPoints(stroke.shape) : stroke.points;
}

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
const boundsCache = new WeakMap<InkStroke, Bounds>();
export function strokeBounds(stroke: InkStroke): Bounds {
  const cached = boundsCache.get(stroke);
  if (cached) return cached;
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of strokePolyline(stroke)) {
    if (p.x < b.minX) b.minX = p.x; if (p.x > b.maxX) b.maxX = p.x;
    if (p.y < b.minY) b.minY = p.y; if (p.y > b.maxY) b.maxY = p.y;
  }
  boundsCache.set(stroke, b);
  return b;
}

/** 지우개(중심 p, 반지름 radius — 정규화 단위)가 스친 획들의 id. 획 단위로 통째로 지운다. */
export function strokesHitBy(strokes: InkStroke[], p: Pt, radius: number): string[] {
  const hits: string[] = [];
  for (const stroke of strokes) {
    const reach = radius + strokeWidth(stroke) / 2;
    const b = strokeBounds(stroke);
    if (p.x < b.minX - reach || p.x > b.maxX + reach || p.y < b.minY - reach || p.y > b.maxY + reach) continue;
    if (polylineHits(strokePolyline(stroke), p, reach)) hits.push(stroke.id);
  }
  return hits;
}

/** 지우개가 지난 선분(a→b) 위를 촘촘히 훑는다(빠르게 문질러도 사이 획을 놓치지 않게). */
export function strokesHitAlong(strokes: InkStroke[], a: Pt, b: Pt, radius: number): string[] {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(radius * 0.5, 1e-6)));
  const found = new Set<string>();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    for (const id of strokesHitBy(strokes, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, radius)) found.add(id);
  }
  return [...found];
}

/** 실행 취소 기록: 획 배열 스냅숏 스택(마운트 단위). 현재 값은 언제나 부모 props. */
export interface InkHistory { past: InkStroke[][]; future: InkStroke[][] }
export const HISTORY_LIMIT = 100;
export const emptyHistory = (): InkHistory => ({ past: [], future: [] });

/** current → next 로 바뀔 때 기록. */
export function recordChange(history: InkHistory, current: InkStroke[]): InkHistory {
  const past = [...history.past, current];
  return { past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past, future: [] };
}
export function undoHistory(history: InkHistory, current: InkStroke[]): { history: InkHistory; strokes: InkStroke[] } | null {
  if (!history.past.length) return null;
  const strokes = history.past[history.past.length - 1];
  return { strokes, history: { past: history.past.slice(0, -1), future: [current, ...history.future] } };
}
export function redoHistory(history: InkHistory, current: InkStroke[]): { history: InkHistory; strokes: InkStroke[] } | null {
  if (!history.future.length) return null;
  const [strokes, ...future] = history.future;
  return { strokes, history: { past: [...history.past, current], future } };
}

export function newStrokeId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
