// Phaser 앞마당의 월드 데이터. 기존 마당(yard/yardModel.ts, FrontYard.tsx)의 16×12 칸 배치를 그대로
// 쓰고, 카메라가 맵 끝에서 검은 화면을 보이지 않도록 둘레에 숲(통과 불가) 여백을 두른다. 순수 모듈.
import { yardWalkable, YARD_DOOR, YARD_GATE, YARD_HEIGHT, YARD_WIDTH } from '../../pixel-room/yard/yardModel';
import { FARM_BEDS, SCARECROW_CELL } from '../../pixel-room/farm/farmModel';
import type { Facing, Point } from './joystick';

export const TILE = 16;
/** 마당 둘레 숲 여백(칸). 폰 세로 화면(카메라 약 130×280 월드 px)에서도 맵 밖이 안 보일 만큼. */
export const MARGIN = 5;
export const WORLD_COLS = YARD_WIDTH + MARGIN * 2;
export const WORLD_ROWS = YARD_HEIGHT + MARGIN * 2;
export const WORLD_WIDTH = WORLD_COLS * TILE;
export const WORLD_HEIGHT = WORLD_ROWS * TILE;

/** 마당 칸(0..15, 0..11) → 월드 칸. */
export const toWorldCell = (cell: Point): Point => ({ x: cell.x + MARGIN, y: cell.y + MARGIN });
export const cellCenter = (cell: Point): Point => ({ x: cell.x * TILE + TILE / 2, y: cell.y * TILE + TILE / 2 });
export const cellOf = (point: Point): Point => ({ x: Math.floor(point.x / TILE), y: Math.floor(point.y / TILE) });

/** 월드 칸이 막혀 있는가. 마당 밖(숲)은 전부 막힘. 문은 집의 일부라 막고(말 걸기 대상), 광장 길목은
 *  아직 베타에서 갈 수 없으니 그 칸만 걸을 수 있게 남겨 두고 그 아래는 숲으로 막는다. */
export function worldSolid(cell: Point): boolean {
  const x = cell.x - MARGIN, y = cell.y - MARGIN;
  if (x < 0 || y < 0 || x >= YARD_WIDTH || y >= YARD_HEIGHT) return true;
  if (x === YARD_DOOR.x && y === YARD_DOOR.y) return true;
  return !yardWalkable({ x, y });
}

export type InteractableId = 'scarecrow' | 'door' | 'gate';
export interface Interactable { id: InteractableId; cell: Point; label: string }
export const INTERACTABLES: readonly Interactable[] = [
  { id: 'scarecrow', cell: toWorldCell(SCARECROW_CELL), label: '허수아비' },
  { id: 'door', cell: toWorldCell(YARD_DOOR), label: '우리 집 문' },
  { id: 'gate', cell: toWorldCell(YARD_GATE), label: '광장 가는 길' },
];
export const BED_CELLS: readonly Point[] = FARM_BEDS.map(toWorldCell);
/** 처음 서 있는 곳 — 기존 마당의 "방에서 나왔을 때" 자리(문 바로 앞). */
export const SPAWN: Point = cellCenter(toWorldCell({ x: 6, y: 7 }));

const FACING_DELTA: Record<Facing, Point> = { Front: { x: 0, y: 1 }, Back: { x: 0, y: -1 }, Left: { x: -1, y: 0 }, Right: { x: 1, y: 0 } };
export const facingDelta = (facing: Facing): Point => FACING_DELTA[facing];

/** 발 위치에서 바라보는 방향으로 한 뼘 앞 지점이 닿는 상호작용 대상. 바로 옆 칸 + 약간의 여유. */
export function facedInteractable(feet: Point, facing: Facing, list: readonly Interactable[] = INTERACTABLES): Interactable | null {
  const d = FACING_DELTA[facing];
  const probe = { x: feet.x + d.x * 11, y: feet.y + d.y * 11 };
  let best: Interactable | null = null, bestDistance = Infinity;
  for (const item of list) {
    const left = item.cell.x * TILE - 4, top = item.cell.y * TILE - 4;
    if (probe.x < left || probe.x > left + TILE + 8 || probe.y < top || probe.y > top + TILE + 8) continue;
    const c = cellCenter(item.cell);
    const distance = Math.hypot(c.x - feet.x, c.y - feet.y);
    if (distance < bestDistance) { best = item; bestDistance = distance; }
  }
  return best;
}

// ── 충돌 ─────────────────────────────────────────────────────────────────────
/** 발 밑 충돌 상자(가로 10, 세로 6). 캐릭터 전체가 아니라 발만 막혀야 집/나무 앞뒤로 자연스럽게 겹친다. */
export const FEET = { halfWidth: 5, up: 4, down: 2 } as const;
export type SolidFn = (cell: Point) => boolean;

export function feetBlocked(p: Point, solid: SolidFn = worldSolid): boolean {
  const left = Math.floor((p.x - FEET.halfWidth) / TILE), right = Math.floor((p.x + FEET.halfWidth - 0.001) / TILE);
  const top = Math.floor((p.y - FEET.up) / TILE), bottom = Math.floor((p.y + FEET.down - 0.001) / TILE);
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) if (solid({ x, y })) return true;
  return false;
}

/** 축을 나눠 1px 이하로 쪼개 움직인다 → 벽을 따라 미끄러지고, 모서리에 살짝 걸리면 옆으로 밀어 준다. */
export function moveFeet(from: Point, dx: number, dy: number, solid: SolidFn = worldSolid): Point {
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
/** 칸 BFS 최단 경로(시작 칸 제외, 도착 칸 포함). 목표가 막혀 있거나(집/나무/허수아비) 닿을 수 없으면
 *  갈 수 있는 칸 중 목표에 가장 가까운 칸(같으면 더 짧은 길)으로 간다 — 펜으로 집을 콕 찍어도 집 앞까지 걸어간다. */
export function planPath(from: Point, to: Point, solid: SolidFn = worldSolid): Point[] {
  if (solid(from)) return [];
  const key = (c: Point) => c.y * WORLD_COLS + c.x;
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
      if (next.x < 0 || next.y < 0 || next.x >= WORLD_COLS || next.y >= WORLD_ROWS) continue;
      if (solid(next) || previous.has(key(next))) continue;
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

// ── 장식 배치(그리기 전용) ───────────────────────────────────────────────────
/** 기존 마당과 같은 바닥 타일 선택식(잔디 3종 + 가운데 흙길). id는 Kenney Tiny Town 아틀라스 번호. */
export function groundTile(worldX: number, worldY: number): number {
  const x = worldX - MARGIN, y = worldY - MARGIN;
  if (x >= 5 && x <= 7 && y >= 5 && y < YARD_HEIGHT) return x === 5 ? 24 : x === 7 ? 26 : 25;
  // 광장 쪽으로 이어지는 길을 숲 여백 아래로도 조금 그린다(갈 수는 없음).
  if (x >= 5 && x <= 7 && y >= YARD_HEIGHT) return x === 5 ? 24 : x === 7 ? 26 : 25;
  const gx = ((worldX % 16) + 16) % 16, gy = ((worldY % 12) + 12) % 12;
  return (gx + gy * 3) % 17 === 0 ? 2 : (gx * 7 + gy) % 5 === 0 ? 1 : 0;
}
/** 숲 여백의 나무(16×32, 발끝 칸 기준). 길 자리와 마당 안은 비운다. 결정적 배치. */
export function borderTrees(): Point[] {
  const trees: Point[] = [];
  for (let y = 1; y < WORLD_ROWS + 1; y++) for (let x = 0; x < WORLD_COLS; x++) {
    const yardX = x - MARGIN, yardY = y - MARGIN;
    const inYard = yardX >= 0 && yardX < YARD_WIDTH && yardY >= 0 && yardY < YARD_HEIGHT;
    if (inYard) continue;
    if (yardX >= 4 && yardX <= 8 && yardY >= YARD_HEIGHT) continue;
    // 바로 붙은 줄은 촘촘하게, 바깥은 엇갈리게 — 울타리처럼 보이지 않도록.
    const ring = Math.min(Math.abs(yardX < 0 ? yardX : yardX - (YARD_WIDTH - 1)), Math.abs(yardY < 0 ? yardY : yardY - (YARD_HEIGHT - 1)));
    if (ring <= 1 ? (x + y) % 2 === 0 : (x * 3 + y * 5) % 4 === 0) trees.push({ x, y });
  }
  return trees;
}
/** 기존 마당의 큰 나무 3그루(2배 크기), 울타리 2줄 — 마당 칸 좌표. */
export const BIG_TREES: readonly Point[] = [{ x: 0, y: 1 }, { x: 0, y: 7 }, { x: 14, y: 0 }];
export const FENCE_ROWS: readonly number[] = [2, 10];
