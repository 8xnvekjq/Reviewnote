// 모든 장면(앞마당·방·앞으로 올 광장/밭)이 함께 쓰는 칸 격자 계산. 장면마다 다른 것은 "어느 칸이
// 막혔나(solid)"와 격자 크기뿐이라, 충돌·미끄러지기·길찾기·A 대상 찾기를 여기 한 벌만 둔다. 순수 모듈.
import type { Facing, Point } from './joystick';

export const TILE = 16;
export type SolidFn = (cell: Point) => boolean;
/** 장면의 칸 격자: 크기 + 막힌 칸. */
export interface Grid { cols: number; rows: number; solid: SolidFn }

export const cellCenter = (cell: Point): Point => ({ x: cell.x * TILE + TILE / 2, y: cell.y * TILE + TILE / 2 });
export const cellOf = (point: Point): Point => ({ x: Math.floor(point.x / TILE), y: Math.floor(point.y / TILE) });
export const sameCell = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

const FACING_DELTA: Record<Facing, Point> = { Front: { x: 0, y: 1 }, Back: { x: 0, y: -1 }, Left: { x: -1, y: 0 }, Right: { x: 1, y: 0 } };
export const facingDelta = (facing: Facing): Point => FACING_DELTA[facing];

// ── 상호작용 대상 ────────────────────────────────────────────────────────────
/** A를 눌렀을 때 일어나는 일. 'panel'은 상점/옷장 같은 게임 안 창을 여는 자리(셸이 처리). */
export type InteractAction =
  | { kind: 'talk' }
  | { kind: 'exit'; exit: string }
  | { kind: 'panel'; panel: string };
export interface Interactable {
  id: string;
  /** 대표 칸(탭 대상, 화면 위치 계산용). */
  cell: Point;
  /** 차지하는 칸 전부(가구처럼 여러 칸). 없으면 cell 한 칸. */
  cells?: readonly Point[];
  label: string;
  /** A 버튼에 붙는 말("말 걸기", "살펴보기", "들어가기"). */
  verb: string;
  action: InteractAction;
  /** "!" 말풍선 아래 끝(월드 px). */
  bang: Point;
}
export const interactableCells = (item: Interactable): readonly Point[] => item.cells ?? [item.cell];
export const coversCell = (item: Interactable, cell: Point): boolean => interactableCells(item).some(c => sameCell(c, cell));

/** 발 위치에서 바라보는 방향으로 한 뼘 앞 지점이 닿는 상호작용 대상. 바로 옆 칸 + 약간의 여유. */
export function facedInteractable(feet: Point, facing: Facing, list: readonly Interactable[]): Interactable | null {
  const d = FACING_DELTA[facing];
  const probe = { x: feet.x + d.x * 11, y: feet.y + d.y * 11 };
  let best: Interactable | null = null, bestDistance = Infinity;
  for (const item of list) {
    for (const cell of interactableCells(item)) {
      const left = cell.x * TILE - 4, top = cell.y * TILE - 4;
      if (probe.x < left || probe.x > left + TILE + 8 || probe.y < top || probe.y > top + TILE + 8) continue;
      const c = cellCenter(cell);
      const distance = Math.hypot(c.x - feet.x, c.y - feet.y);
      if (distance < bestDistance) { best = item; bestDistance = distance; }
    }
  }
  return best;
}
/** 여러 칸 대상 중 발에서 가장 가까운 칸의 가운데(도착했을 때 그쪽을 바라보게). */
export function nearestCellCenter(item: Interactable, feet: Point): Point {
  let best = cellCenter(item.cell), bestDistance = Infinity;
  for (const cell of interactableCells(item)) {
    const c = cellCenter(cell);
    const distance = Math.hypot(c.x - feet.x, c.y - feet.y);
    if (distance < bestDistance) { best = c; bestDistance = distance; }
  }
  return best;
}

// ── 충돌 ─────────────────────────────────────────────────────────────────────
/** 발 밑 충돌 상자(가로 10, 세로 6). 캐릭터 전체가 아니라 발만 막혀야 집/나무/가구 앞뒤로 자연스럽게 겹친다. */
export const FEET = { halfWidth: 5, up: 4, down: 2 } as const;

export function feetBlocked(p: Point, solid: SolidFn): boolean {
  const left = Math.floor((p.x - FEET.halfWidth) / TILE), right = Math.floor((p.x + FEET.halfWidth - 0.001) / TILE);
  const top = Math.floor((p.y - FEET.up) / TILE), bottom = Math.floor((p.y + FEET.down - 0.001) / TILE);
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) if (solid({ x, y })) return true;
  return false;
}

/** 축을 나눠 1px 이하로 쪼개 움직인다 → 벽을 따라 미끄러지고, 모서리에 살짝 걸리면 옆으로 밀어 준다. */
export function moveFeet(from: Point, dx: number, dy: number, solid: SolidFn): Point {
  let x = from.x, y = from.y;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (sx) {
      if (!feetBlocked({ x: x + sx, y }, solid)) x += sx;
      else if (!sy) y = nudge({ x, y }, { x: x + sx, y }, 'y', solid) ?? y;
    }
    if (sy) {
      if (!feetBlocked({ x, y: y + sy }, solid)) y += sy;
      else if (!sx) x = nudge({ x, y }, { x, y: y + sy }, 'x', solid) ?? x;
    }
  }
  return { x, y };
}
/** 모서리 보정: 막힌 방향 그대로 직각으로 최대 6px 비켜서면 지나갈 수 있으면 1px 그쪽으로 민다. */
function nudge(at: Point, wanted: Point, axis: 'x' | 'y', solid: SolidFn): number | null {
  for (let offset = 1; offset <= 6; offset++) {
    for (const sign of [-1, 1]) {
      const probe = { ...wanted, [axis]: wanted[axis] + sign * offset };
      const stand = { ...at, [axis]: at[axis] + sign * offset };
      if (!feetBlocked(probe, solid) && !feetBlocked(stand, solid)) return at[axis] + sign;
    }
  }
  return null;
}

// ── 탭해서 걷기(펜/손가락) ───────────────────────────────────────────────────
/** 칸 BFS 최단 경로(시작 칸 제외, 도착 칸 포함). 목표가 막혀 있거나 닿을 수 없으면 갈 수 있는 칸 중 목표에
 *  가장 가까운 칸(같으면 더 짧은 길)으로 간다 — 펜으로 집/가구를 콕 찍어도 그 앞까지 걸어간다.
 *  avoid 칸(문·매트 같은 출구)은 목표일 때만 들어간다 — 다른 데로 가다가 실수로 장면을 나가지 않게. */
export function planPath(from: Point, to: Point, grid: Grid, avoid: readonly Point[] = []): Point[] {
  const { cols, rows, solid } = grid;
  if (solid(from)) return [];
  const key = (c: Point) => c.y * cols + c.x;
  const avoided = new Set(avoid.filter(cell => !sameCell(cell, to)).map(key));
  const previous = new Map<number, Point | null>([[key(from), null]]);
  const queue: Point[] = [from];
  let best = from, bestDistance = Math.hypot(to.x - from.x, to.y - from.y);
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    const distance = Math.hypot(to.x - cell.x, to.y - cell.y);
    if (distance < bestDistance) { best = cell; bestDistance = distance; }
    if (distance === 0) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: cell.x + dx, y: cell.y + dy };
      if (next.x < 0 || next.y < 0 || next.x >= cols || next.y >= rows) continue;
      if (solid(next) || avoided.has(key(next)) || previous.has(key(next))) continue;
      previous.set(key(next), cell); queue.push(next);
    }
  }
  const path: Point[] = [];
  for (let c: Point | null = best; c && key(c) !== key(from); c = previous.get(key(c)) ?? null) path.unshift(c);
  return path;
}
/** 경로 끝에서 대상을 바라볼 방향. */
export function facingToward(from: Point, target: Point): Facing {
  const dx = target.x - from.x, dy = target.y - from.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'Left' : 'Right') : (dy < 0 ? 'Back' : 'Front');
}

/** 원하는 칸이 막혀 있으면(가구가 들어섰다든지) 가장 가까운 열린 칸. 다 막혔으면 null. */
export function nearestOpenCell(want: Point, grid: Grid, avoid: readonly Point[] = []): Point | null {
  const ok = (c: Point) => c.x >= 0 && c.y >= 0 && c.x < grid.cols && c.y < grid.rows && !grid.solid(c) && !avoid.some(a => sameCell(a, c));
  if (ok(want)) return want;
  let best: Point | null = null, bestDistance = Infinity;
  for (let y = 0; y < grid.rows; y++) for (let x = 0; x < grid.cols; x++) {
    const c = { x, y };
    if (!ok(c)) continue;
    // 같은 거리면 아래(문 쪽) → 왼쪽 순으로 결정적으로 고른다.
    const distance = Math.abs(x - want.x) + Math.abs(y - want.y) - y * 1e-3 + x * 1e-6;
    if (distance < bestDistance) { best = c; bestDistance = distance; }
  }
  return best;
}
