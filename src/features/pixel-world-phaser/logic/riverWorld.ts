import type { Point } from './joystick';
import type { SceneSpec } from './scenes';
import { cellCenter } from './world';

export const RIVER_COLS = 26;
export const RIVER_ROWS = 22;
export const WATER_X = 15;
export const DOCK = { left: 13, right: 17, top: 10, bottom: 12 };
export const TURTLE: Point = { x: 11, y: 8 };
export const FISHBOARD: Point = { x: 8, y: 12 };
export const inDock = ({ x, y }: Point) => x >= DOCK.left && x <= DOCK.right && y >= DOCK.top && y <= DOCK.bottom;
export const riverWater = (cell: Point) => cell.x >= WATER_X && !inDock(cell);
export function riverSolid(cell: Point): boolean {
  return !Number.isInteger(cell.x) || !Number.isInteger(cell.y) || cell.x < 2 || cell.y < 3 || cell.x >= RIVER_COLS - 2 || cell.y >= RIVER_ROWS - 3
    || riverWater(cell) || (cell.x === TURTLE.x && cell.y === TURTLE.y) || (cell.x === FISHBOARD.x && cell.y === FISHBOARD.y);
}
export function riverScene(): SceneSpec {
  return { id: 'river', title: '강가', cols: RIVER_COLS, rows: RIVER_ROWS, solid: riverSolid,
    entries: { fromYard: { cell: { x: 3, y: 11 }, facing: 'Right' } }, defaultEntry: 'fromYard',
    exits: [{ id: 'river→yard', cells: [{ x: 2, y: 11 }], to: { scene: 'yard', entry: 'fromRiver' } }],
    interactables: [
      { id: 'turtle', cell: TURTLE, label: '거북 도감지기', verb: '도감 보기', action: { kind: 'panel', panel: 'turtle' }, bang: { ...cellCenter(TURTLE), y: TURTLE.y * 16 - 18 } },
      { id: 'fishboard', cell: FISHBOARD, label: '물고기 게시판', verb: '기록 보기', action: { kind: 'panel', panel: 'fishboard' }, bang: { ...cellCenter(FISHBOARD), y: FISHBOARD.y * 16 - 12 } },
    ] };
}
