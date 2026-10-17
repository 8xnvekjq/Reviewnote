import type { Point } from './joystick';
import type { SceneSpec } from './scenes';
import { cellCenter } from './world';

export const RIVER_COLS = 34;
export const RIVER_ROWS = 22;
export const WATER_X = 8;
export const DOCK = { left: 7, right: 17, top: 10, bottom: 12 };
export const TURTLE: Point = { x: 5, y: 8 };
// 랭킹 푯말은 거북이 바로 왼쪽 — 강가에 들어오면 함께 눈에 띈다.
export const FISHBOARD: Point = { x: 3, y: 8 };
// 위쪽 판자 길을 늘려 가운데 물고기가 헤엄치는 물길을 남긴다.
export const inDock = ({ x, y }: Point) => x >= DOCK.left && x <= DOCK.right && y >= DOCK.top && y <= DOCK.bottom;
// 위아래의 넓은 쉼터와 가운데의 열린 물가를 연결한다.
export const bankEdge = (y: number) => y < 7 || y > 15 ? WATER_X + 2 : WATER_X;
export const riverWater = (cell: Point) => cell.x >= bankEdge(cell.y) && cell.x < RIVER_COLS && cell.y >= 0 && cell.y < RIVER_ROWS && !inDock(cell);
export type RiverDecoration = { kind: 'tree' | 'bush' | 'flowers' | 'reeds' | 'rock' | 'fence' | 'bench' | 'lamp' | 'crate' | 'bucket' | 'lily' | 'lily-flower' | 'sandbar'; cell: Point; width?: number; blocking: boolean };
export const RIVER_DECORATIONS: readonly RiverDecoration[] = [
  { kind: 'tree', cell: { x: 2, y: 5 }, blocking: true },
  { kind: 'tree', cell: { x: 6, y: 4 }, blocking: true },
  { kind: 'tree', cell: { x: 3, y: 17 }, blocking: true },
  { kind: 'tree', cell: { x: 7, y: 18 }, blocking: true },
  { kind: 'bush', cell: { x: 3, y: 6 }, blocking: true },
  { kind: 'bush', cell: { x: 5, y: 17 }, blocking: true },
  { kind: 'flowers', cell: { x: 7, y: 5 }, blocking: false },
  { kind: 'flowers', cell: { x: 4, y: 16 }, blocking: false },
  { kind: 'flowers', cell: { x: 2, y: 9 }, blocking: false },
  { kind: 'reeds', cell: { x: 9, y: 4 }, blocking: true },
  { kind: 'reeds', cell: { x: 7, y: 7 }, blocking: true },
  { kind: 'reeds', cell: { x: 9, y: 18 }, blocking: true },
  { kind: 'rock', cell: { x: 8, y: 17 }, blocking: true },
  { kind: 'fence', cell: { x: 3, y: 4 }, width: 2, blocking: true },
  { kind: 'bench', cell: { x: 4, y: 5 }, width: 2, blocking: true },
  { kind: 'lamp', cell: { x: 6, y: 13 }, blocking: true },
  { kind: 'crate', cell: { x: 6, y: 9 }, blocking: true },
  { kind: 'bucket', cell: { x: 6, y: 12 }, blocking: true },
  { kind: 'lily', cell: { x: 12, y: 6 }, blocking: true },
  { kind: 'lily-flower', cell: { x: 14, y: 7 }, blocking: true },
  { kind: 'lily', cell: { x: 12, y: 16 }, blocking: true },
  { kind: 'rock', cell: { x: 17, y: 15 }, blocking: true },
  { kind: 'sandbar', cell: { x: 19, y: 5 }, width: 3, blocking: true },
];
export const decorationCells = (d: RiverDecoration): Point[] => Array.from({ length: d.width ?? 1 }, (_, i) => ({ x: d.cell.x + i, y: d.cell.y }));
const blockedDecorations = new Set(RIVER_DECORATIONS.filter(d => d.blocking).flatMap(decorationCells).map(c => `${c.x},${c.y}`));
export function riverSolid(cell: Point): boolean {
  return !Number.isInteger(cell.x) || !Number.isInteger(cell.y) || cell.x < 2 || cell.y < 3 || cell.x >= RIVER_COLS - 2 || cell.y >= RIVER_ROWS - 3
    || riverWater(cell) || blockedDecorations.has(`${cell.x},${cell.y}`) || (cell.x === TURTLE.x && cell.y === TURTLE.y) || (cell.x === FISHBOARD.x && cell.y === FISHBOARD.y);
}
// 낚시 범위는 지정된 도착점이 아니라 실제 물가에서 잰다.
export function riverScene(): SceneSpec {
  return { id: 'river', title: '강가', cols: RIVER_COLS, rows: RIVER_ROWS, solid: riverSolid,
    entries: { fromYard: { cell: { x: 5, y: 11 }, facing: 'Right' } }, defaultEntry: 'fromYard',
    exits: [{ id: 'river→yard', cells: [{ x: 2, y: 11 }], to: { scene: 'yard', entry: 'fromRiver' } }],
    interactables: [
      { id: 'turtle', cell: TURTLE, label: '거북 도감지기', verb: '도감·상점', action: { kind: 'panel', panel: 'turtle' }, bang: { ...cellCenter(TURTLE), y: TURTLE.y * 16 - 18 } },
      { id: 'fishboard', cell: FISHBOARD, label: '이번 주 물고기 랭킹', verb: '랭킹 보기', action: { kind: 'panel', panel: 'fishboard' }, bang: { ...cellCenter(FISHBOARD), y: FISHBOARD.y * 16 - 30 } },
    ] };
}
