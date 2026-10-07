// Phaser 앞마당의 월드 데이터. 기존 마당(yard/yardModel.ts, FrontYard.tsx)의 16×12 칸 배치를 그대로
// 쓰고, 카메라가 맵 끝에서 검은 화면을 보이지 않도록 둘레에 숲(통과 불가) 여백을 두른다. 순수 모듈.
// 충돌/길찾기 계산 자체는 world.ts(모든 장면 공통)에 있고, 여기 함수들은 마당 격자를 기본값으로 채운 얇은 포장이다.
import { yardWalkable, YARD_DOOR, YARD_GATE, YARD_HEIGHT, YARD_SPAWNS, YARD_WIDTH } from '../../pixel-room/yard/yardModel';
import { FARM_BEDS, SCARECROW_CELL } from '../../pixel-room/farm/farmModel';
import type { Facing, Point } from './joystick';
import * as world from './world';
import type { Interactable, SolidFn } from './world';
import type { SceneSpec } from './scenes';

export { TILE, FEET, cellCenter, cellOf, facingDelta, facingToward } from './world';
export type { SolidFn } from './world';
const { TILE, cellCenter } = world;

/** 마당 둘레 숲 여백(칸). 폰 세로 화면(카메라 약 130×280 월드 px)에서도 맵 밖이 안 보일 만큼. */
export const MARGIN = 5;
export const WORLD_COLS = YARD_WIDTH + MARGIN * 2;
export const WORLD_ROWS = YARD_HEIGHT + MARGIN * 2;
export const WORLD_WIDTH = WORLD_COLS * TILE;
export const WORLD_HEIGHT = WORLD_ROWS * TILE;

/** 마당 칸(0..15, 0..11) → 월드 칸. */
export const toWorldCell = (cell: Point): Point => ({ x: cell.x + MARGIN, y: cell.y + MARGIN });

/** 월드 칸이 막혀 있는가. 마당 밖(숲)은 전부 막힘. 집 문 칸은 기존 마당처럼 밟을 수 있고(밟으면 방으로),
 *  광장 길목은 아직 베타에서 갈 수 없으니 그 칸만 걸을 수 있게 남겨 두고 그 아래는 숲으로 막는다. */
export function worldSolid(cell: Point): boolean {
  const x = cell.x - MARGIN, y = cell.y - MARGIN;
  if (x < 0 || y < 0 || x >= YARD_WIDTH || y >= YARD_HEIGHT) return true;
  return !yardWalkable({ x, y });
}

export type InteractableId = 'scarecrow' | 'door' | 'gate' | `farm:${number}`;
const DOOR = toWorldCell(YARD_DOOR);
const GATE = toWorldCell(YARD_GATE);
const SCARECROW = toWorldCell(SCARECROW_CELL);
export const INTERACTABLES: readonly (Interactable & { id: InteractableId })[] = [
  ...FARM_BEDS.map((bed, index): Interactable & { id: InteractableId } => {
    const cell = toWorldCell(bed);
    return { id: `farm:${index}`, cell, cells: [cell, { x: cell.x + 1, y: cell.y }, { x: cell.x, y: cell.y + 1 }, { x: cell.x + 1, y: cell.y + 1 }],
      label: '토마토 밭', verb: '돌보기', action: { kind: 'panel', panel: `farm:${index}` }, bang: { x: (cell.x + 1) * TILE, y: cell.y * TILE } };
  }),
  { id: 'scarecrow', cell: SCARECROW, label: '허수아비', verb: '말 걸기', action: { kind: 'talk' }, bang: { x: SCARECROW.x * TILE + TILE / 2, y: (SCARECROW.y + 1) * TILE - 32 } },
  { id: 'door', cell: DOOR, label: '우리 집 문', verb: '들어가기', action: { kind: 'exit', exit: 'door' }, bang: { x: DOOR.x * TILE + TILE / 2, y: DOOR.y * TILE - 2 } },
  // 광장 길목: 아직 막혀 있어서 A를 누르면 안내만 한다. 광장 장면이 생기면 action을 exit로 바꾸면 된다.
  { id: 'gate', cell: GATE, label: '광장 가는 길', verb: '살펴보기', action: { kind: 'talk' }, bang: { x: GATE.x * TILE + TILE / 2, y: GATE.y * TILE + 2 } },
];
export const BED_CELLS: readonly Point[] = FARM_BEDS.map(toWorldCell);
/** 처음 서 있는 곳 — 기존 마당의 "방에서 나왔을 때" 자리(문 바로 앞). */
export const SPAWN: Point = cellCenter(toWorldCell(YARD_SPAWNS.room));

/** 앞마당 장면 정의: 집 문 = 방으로 가는 출구, 방에서 나오면 문 앞에서 아래를 보고 선다. */
export function yardScene(): SceneSpec {
  return {
    id: 'yard', title: '앞마당', cols: WORLD_COLS, rows: WORLD_ROWS, solid: worldSolid,
    interactables: INTERACTABLES,
    exits: [{ id: 'door', cells: [DOOR], to: { scene: 'room', entry: 'door' } }],
    entries: {
      door: { cell: toWorldCell(YARD_SPAWNS.room), facing: 'Front' as Facing },
      // 광장에서 돌아올 때 설 자리(광장 장면이 생기면 그쪽 출구가 이 이름을 가리킨다).
      plaza: { cell: toWorldCell(YARD_SPAWNS.plaza), facing: 'Back' as Facing },
    },
    defaultEntry: 'door',
  };
}

const GRID = { cols: WORLD_COLS, rows: WORLD_ROWS, solid: worldSolid };
// 마당 격자를 기본값으로 둔 포장(기존 호출부/테스트 호환).
export const feetBlocked = (p: Point, solid: SolidFn = worldSolid) => world.feetBlocked(p, solid);
export const moveFeet = (from: Point, dx: number, dy: number, solid: SolidFn = worldSolid) => world.moveFeet(from, dx, dy, solid);
export const planPath = (from: Point, to: Point, solid: SolidFn = worldSolid) => world.planPath(from, to, { ...GRID, solid }, [DOOR]);
export const facedInteractable = (feet: Point, facing: Facing, list: readonly Interactable[] = INTERACTABLES) => world.facedInteractable(feet, facing, list);

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
