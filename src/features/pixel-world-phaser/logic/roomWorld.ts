// Phaser "내 방" 월드 데이터. 기존 Pixel Room(model.ts, PixelRoom.tsx)과 같은 10×8 칸 방, 같은 가구
// 크기·배치 규칙, 같은 문(아래 줄 가운데 매트) 자리를 쓴다. 방 둘레에 벽(위 2줄, 옆·아래 1줄)을 둘러
// 월드는 12×11칸. 가구 배치는 서버 값을 읽기만 한다(꾸미기는 다음 PR의 창에서). 순수 모듈.
import { FURNITURE, ROOM_HEIGHT, ROOM_WIDTH } from '../../pixel-room/model';
import type { FurnitureType, Placement } from '../../pixel-room/model';
import type { Point } from './joystick';
import { TILE, sameCell } from './world';
import type { Interactable } from './world';
import type { SceneSpec } from './scenes';
import { FURNITURE_NAMES } from './roomLines';

export const ROOM_SIDE = 1;
export const ROOM_WALL = 2;
export const ROOM_COLS = ROOM_WIDTH + ROOM_SIDE * 2;
export const ROOM_ROWS = ROOM_HEIGHT + ROOM_WALL + 1;
export const ROOM_WORLD_WIDTH = ROOM_COLS * TILE;
export const ROOM_WORLD_HEIGHT = ROOM_ROWS * TILE;

/** 방 칸(0..9, 0..7) → 월드 칸. */
export const roomToWorld = (cell: Point): Point => ({ x: cell.x + ROOM_SIDE, y: cell.y + ROOM_WALL });
/** PixelRoom.tsx와 같은 문(매트) 칸과 그 바로 위 "들어와서 서는" 칸 — 방 좌표. */
export const ROOM_DOOR: Point = { x: 4, y: 7 };
export const ROOM_LANDING: Point = { x: 4, y: 6 };
const DOOR = roomToWorld(ROOM_DOOR);
const LANDING = roomToWorld(ROOM_LANDING);

/** 가구 그림 크기(px) — pixel-room/assets.ts의 furnitureArt와 같은 값. 그림은 가구 칸 너비에 맞춰
 *  비율 그대로 늘리고 칸 아래 끝에 붙인다(기존 방 CSS와 같은 배치) → 키 큰 가구는 위 칸으로 솟는다. */
export const FURNITURE_ART_SIZE: Record<FurnitureType, { width: number; height: number }> = {
  roundtable: { width: 48, height: 32 }, television: { width: 32, height: 32 }, aquarium: { width: 47, height: 32 },
  globe: { width: 16, height: 32 }, tallplant: { width: 16, height: 48 }, floorlamp: { width: 16, height: 32 },
  bed: { width: 32, height: 48 }, desk: { width: 48, height: 32 }, chair: { width: 16, height: 32 },
  bookshelf: { width: 16, height: 48 }, plant: { width: 16, height: 32 }, decoration: { width: 32, height: 32 },
};

/** 가구 한 개가 그려질 자리(월드 px): 왼쪽 위/크기. 아래 끝 = 가구 칸 아래 끝. */
export function furnitureSprite(item: Placement): { x: number; bottom: number; width: number; height: number } {
  const size = FURNITURE[item.type], art = FURNITURE_ART_SIZE[item.type];
  const cell = roomToWorld(item);
  const width = size.width * TILE;
  return { x: cell.x * TILE, bottom: (cell.y + size.height) * TILE, width, height: Math.round(art.height * width / art.width) };
}
/** 가구가 차지하는 월드 칸. */
export function furnitureCells(item: Placement): Point[] {
  const size = FURNITURE[item.type], origin = roomToWorld(item);
  const cells: Point[] = [];
  for (let y = 0; y < size.height; y++) for (let x = 0; x < size.width; x++) cells.push({ x: origin.x + x, y: origin.y + y });
  return cells;
}

/** 서버 배치를 그대로 믿지 않고 한 번 거른다: 모르는 종류·방 밖·중복·겹침은 뺀다(앞의 것이 남는다). */
export function sanitizeFurniture(list: readonly Placement[]): Placement[] {
  const kept: Placement[] = [];
  const taken = new Set<string>();
  for (const item of list) {
    if (!item || !Object.hasOwn(FURNITURE, item.type) || !Number.isInteger(item.x) || !Number.isInteger(item.y)) continue;
    const size = FURNITURE[item.type];
    if (item.x < 0 || item.y < 0 || item.x + size.width > ROOM_WIDTH || item.y + size.height > ROOM_HEIGHT) continue;
    if (kept.some(other => other.type === item.type)) continue;
    const cells = furnitureCells(item).map(c => `${c.x},${c.y}`);
    if (cells.some(key => taken.has(key))) continue;
    cells.forEach(key => taken.add(key));
    kept.push({ type: item.type, x: item.x, y: item.y });
  }
  return kept;
}

/** 방 바깥(벽)과 가구 칸은 막힘. 문과 문 앞 칸은 무엇이 있어도 항상 열어 둔다 — 방에 갇히지 않게. */
export function roomSolid(furniture: readonly Placement[]): (cell: Point) => boolean {
  const blocked = new Set(furniture.flatMap(furnitureCells).map(c => `${c.x},${c.y}`));
  return cell => {
    if (sameCell(cell, DOOR) || sameCell(cell, LANDING)) return false;
    const x = cell.x - ROOM_SIDE, y = cell.y - ROOM_WALL;
    if (x < 0 || y < 0 || x >= ROOM_WIDTH || y >= ROOM_HEIGHT) return true;
    return blocked.has(`${cell.x},${cell.y}`);
  };
}

export const furnitureId = (type: FurnitureType) => `furniture:${type}`;

/** 내 방 장면 정의: 가구마다 A로 살펴보기, 매트를 밟으면 앞마당(문 앞)으로. */
export function roomScene(furniture: readonly Placement[]): SceneSpec {
  const placed = sanitizeFurniture(furniture);
  const interactables: Interactable[] = placed.map(item => {
    const sprite = furnitureSprite(item);
    return {
      id: furnitureId(item.type), cell: roomToWorld(item), cells: furnitureCells(item), label: FURNITURE_NAMES[item.type],
      verb: '살펴보기', action: { kind: 'talk' }, bang: { x: sprite.x + sprite.width / 2, y: sprite.bottom - sprite.height - 1 },
    };
  });
  return {
    id: 'room', title: '내 방', cols: ROOM_COLS, rows: ROOM_ROWS, solid: roomSolid(placed), interactables,
    exits: [{ id: 'door', cells: [DOOR], to: { scene: 'yard', entry: 'door' } }],
    // 마당에서 들어오면 매트 바로 위 칸에서 방 안쪽(위)을 보고 선다 — 기존 방과 같다.
    entries: { door: { cell: LANDING, facing: 'Back' } },
    defaultEntry: 'door',
  };
}
