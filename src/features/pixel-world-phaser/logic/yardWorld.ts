// Phaser 앞마당의 월드 데이터. 기존 마당(yard/yardModel.ts, FrontYard.tsx)의 16×12 칸 배치를 그대로
// 쓰고, 둘레 잔디도 걸을 수 있게 한다. 지도 끝의 나무 줄만 경계로 막는다. 순수 모듈.
// 충돌/길찾기 계산 자체는 world.ts(모든 장면 공통)에 있고, 여기 함수들은 마당 격자를 기본값으로 채운 얇은 포장이다.
import { yardWalkable, YARD_DOOR, YARD_HEIGHT, YARD_SPAWNS, YARD_WIDTH } from '../../pixel-room/yard/yardModel';
import { FARM_BEDS, SCARECROW_CELL } from '../../pixel-room/farm/farmModel';
import type { Facing, Point } from './joystick';
import * as world from './world';
import type { Interactable, SolidFn } from './world';
import type { SceneSpec } from './scenes';

export { TILE, FEET, cellCenter, cellOf, facingDelta, facingToward } from './world';
export type { SolidFn } from './world';
const { TILE, cellCenter } = world;

/** 마당 둘레 잔디 여백(칸). 폰 세로 화면에서도 맵 밖이 안 보일 만큼. */
export const MARGIN = 5;
export const WORLD_COLS = YARD_WIDTH + MARGIN * 2;
export const WORLD_ROWS = YARD_HEIGHT + MARGIN * 2;
export const WORLD_WIDTH = WORLD_COLS * TILE;
export const WORLD_HEIGHT = WORLD_ROWS * TILE;

/** 마당 칸(0..15, 0..11) → 월드 칸. */
export const toWorldCell = (cell: Point): Point => ({ x: cell.x + MARGIN, y: cell.y + MARGIN });

// 출구는 나무 줄 안쪽의 세 칸을 차지한다.
export const GATE: Point = { x: 11, y: WORLD_ROWS - 2 };
export const GATE_CELLS: readonly Point[] = [-1, 0, 1].map(dx => ({ x: GATE.x + dx, y: GATE.y }));
export const RIVER_EXIT: Point = { x: WORLD_COLS - 2, y: 14 };
export const RIVER_EXIT_CELLS: readonly Point[] = [-1, 0, 1].map(dy => ({ x: RIVER_EXIT.x, y: RIVER_EXIT.y + dy }));
export const RIVER_SIGN: Point = { x: RIVER_EXIT.x - 2, y: RIVER_EXIT.y - 2 };
export const yardBorderGap = (x: number, y: number) =>
  (y === WORLD_ROWS - 1 && GATE_CELLS.some(c => c.x === x))
  || (x === WORLD_COLS - 1 && RIVER_EXIT_CELLS.some(c => c.y === y));

/** 빈 잔디 여백은 열고 실제 장애물과 맨 바깥 나무 줄만 막는다. */
export function worldSolid(cell: Point): boolean {
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)
    || cell.x <= 0 || cell.y <= 0 || cell.x >= WORLD_COLS - 1 || cell.y >= WORLD_ROWS - 1) return true;
  if (cell.x === RIVER_SIGN.x && cell.y === RIVER_SIGN.y) return true;
  const x = cell.x - MARGIN, y = cell.y - MARGIN;
  if (x < 0 || y < 0 || x >= YARD_WIDTH || y >= YARD_HEIGHT) return false;
  return !yardWalkable({ x, y });
}

export type InteractableId = 'scarecrow' | 'door' | 'gate' | 'river-sign' | `farm:${number}`;
const DOOR = toWorldCell(YARD_DOOR);
const SCARECROW = toWorldCell(SCARECROW_CELL);
export const INTERACTABLES: readonly (Interactable & { id: InteractableId })[] = [
  { id: 'river-sign', cell: RIVER_SIGN, label: '강가 (낚시터)', verb: '읽기', action: { kind: 'talk' },
    bang: { x: (RIVER_SIGN.x + .5) * TILE, y: RIVER_SIGN.y * TILE - 4 } },
  ...FARM_BEDS.map((bed, index): Interactable & { id: InteractableId } => {
    const cell = toWorldCell(bed);
    return { id: `farm:${index}`, cell, cells: [cell, { x: cell.x + 1, y: cell.y }, { x: cell.x, y: cell.y + 1 }, { x: cell.x + 1, y: cell.y + 1 }],
      label: '토마토 밭', verb: '돌보기', action: { kind: 'panel', panel: `farm:${index}` }, bang: { x: (cell.x + 1) * TILE, y: cell.y * TILE } };
  }),
  { id: 'scarecrow', cell: SCARECROW, label: '허수아비', verb: '말 걸기', action: { kind: 'talk' }, bang: { x: SCARECROW.x * TILE + TILE / 2, y: (SCARECROW.y + 1) * TILE - 32 } },
  { id: 'door', cell: DOOR, label: '우리 집 문', verb: '들어가기', action: { kind: 'exit', exit: 'door' }, bang: { x: DOOR.x * TILE + TILE / 2, y: DOOR.y * TILE - 2 } },
  // 광장 길목을 밟거나 A를 누르면 광장으로 넘어간다.
  { id: 'gate', cell: GATE, cells: GATE_CELLS, label: '광장 가는 길', verb: '광장 가기', action: { kind: 'exit', exit: 'gate' }, bang: { x: GATE.x * TILE + TILE / 2, y: GATE.y * TILE + 2 } },
];
export const BED_CELLS: readonly Point[] = FARM_BEDS.map(toWorldCell);
/** 처음 서 있는 곳 — 기존 마당의 "방에서 나왔을 때" 자리(문 바로 앞). */
export const SPAWN: Point = cellCenter(toWorldCell(YARD_SPAWNS.room));

/** 앞마당 장면 정의: 집 문 = 방으로 가는 출구, 방에서 나오면 문 앞에서 아래를 보고 선다. */
export function yardScene(): SceneSpec {
  return {
    id: 'yard', title: '앞마당', cols: WORLD_COLS, rows: WORLD_ROWS, solid: worldSolid,
    interactables: INTERACTABLES,
    exits: [{ id: 'door', cells: [DOOR], to: { scene: 'room', entry: 'door' } },
      { id: 'gate', cells: GATE_CELLS, to: { scene: 'plaza', entry: 'yard' } },
      { id: 'yard→river', cells: RIVER_EXIT_CELLS, to: { scene: 'river', entry: 'fromYard' } }],
    entries: {
      fromRiver: { cell: { x: RIVER_EXIT.x - 1, y: RIVER_EXIT.y }, facing: 'Left' },
      door: { cell: toWorldCell(YARD_SPAWNS.room), facing: 'Front' as Facing },
      // 광장에서 돌아올 때 설 자리(광장 장면이 생기면 그쪽 출구가 이 이름을 가리킨다).
      plaza: { cell: { x: GATE.x, y: GATE.y - 1 }, facing: 'Back' as Facing },
    },
    defaultEntry: 'door',
  };
}

const GRID = { cols: WORLD_COLS, rows: WORLD_ROWS, solid: worldSolid };
// 마당 격자를 기본값으로 둔 포장(기존 호출부/테스트 호환).
export const feetBlocked = (p: Point, solid: SolidFn = worldSolid) => world.feetBlocked(p, solid);
export const moveFeet = (from: Point, dx: number, dy: number, solid: SolidFn = worldSolid) => world.moveFeet(from, dx, dy, solid);
export const planPath = (from: Point, to: Point, solid: SolidFn = worldSolid) => world.planPath(from, to, { ...GRID, solid }, [DOOR, ...GATE_CELLS, ...RIVER_EXIT_CELLS]);
export const facedInteractable = (feet: Point, facing: Facing, list: readonly Interactable[] = INTERACTABLES) => world.facedInteractable(feet, facing, list);

// ── 장식 배치(그리기 전용) ───────────────────────────────────────────────────
/** 기존 마당과 같은 바닥 타일 선택식(잔디 3종 + 가운데 흙길). id는 Kenney Tiny Town 아틀라스 번호. */
export function groundTile(worldX: number, worldY: number): number {
  const x = worldX - MARGIN, y = worldY - MARGIN;
  // 밭을 피해 아래로 돌아간 뒤 오른쪽 강가 출구로 이어지는 흙길.
  if ((y === 9 && x >= 7 && x <= 14) || (x === 14 && y >= 7 && y <= 9) || (worldX >= 19 && worldY >= 12 && worldY <= 15)) return 25;
  if (x >= 5 && x <= 7 && y >= 5 && y < YARD_HEIGHT) return x === 5 ? 24 : x === 7 ? 26 : 25;
  // 광장 쪽으로 이어지는 길도 바깥 나무 줄 전까지 걸을 수 있다.
  if (x >= 5 && x <= 7 && y >= YARD_HEIGHT) return x === 5 ? 24 : x === 7 ? 26 : 25;
  const gx = ((worldX % 16) + 16) % 16, gy = ((worldY % 12) + 12) % 12;
  return (gx + gy * 3) % 17 === 0 ? 2 : (gx * 7 + gy) % 5 === 0 ? 1 : 0;
}
/** 나무 밑동이 경계 칸 안에 놓이도록 발끝을 칸의 아래 끝에 맞춘다. */
export function borderTrees(): Point[] {
  const trees: Point[] = [];
  for (let y = 0; y < WORLD_ROWS; y++) for (let x = 0; x < WORLD_COLS; x++) {
    if (x === 0 || y === 0 || x === WORLD_COLS - 1 || y === WORLD_ROWS - 1) {
      if (!yardBorderGap(x, y)) trees.push({ x, y: y + 1 });
    }
  }
  return trees;
}
/** 기존 마당의 큰 나무 3그루(2배 크기), 울타리 2줄 — 마당 칸 좌표. */
export const BIG_TREES: readonly Point[] = [{ x: 0, y: 1 }, { x: 0, y: 7 }, { x: 14, y: 0 }];
export const FENCE_ROWS: readonly number[] = [2, 10];
