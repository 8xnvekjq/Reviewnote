export type YardCell = { x: number; y: number };
export type YardDestination = 'room' | 'plaza';
export const YARD_WIDTH = 16;
export const YARD_HEIGHT = 12;
export const YARD_DOOR = { x: 6, y: 6 };
export const YARD_GATE = { x: 6, y: 11 };
export const YARD_SPAWNS = { room: { x: 6, y: 7 }, plaza: { x: 6, y: 10 } };
export function yardExit(cell: YardCell): YardDestination | null {
  if (cell.x === YARD_DOOR.x && cell.y === YARD_DOOR.y) return 'room';
  if (cell.x === YARD_GATE.x && cell.y === YARD_GATE.y) return 'plaza';
  return null;
}
export function yardWalkable({ x, y }: YardCell): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= YARD_WIDTH || y >= YARD_HEIGHT) return false;
  if (x >= 3 && x <= 8 && y >= 1 && y <= 6) return x === 6 && y === 6;
  if ((x <= 1 && (y === 4 || y === 10)) || (x >= 14 && y === 3)) return false;
  if ((y === 2 && x >= 10 && x <= 13) || (y === 10 && x >= 10 && x <= 13)) return false;
  return true;
}
export function yardPath(from: YardCell, to: YardCell): YardCell[] {
  if (!yardWalkable(to)) return [];
  const key = (p: YardCell) => p.y * YARD_WIDTH + p.x;
  const queue = [from];
  const previous = new Map<number, YardCell | null>([[key(from), null]]);
  for (const cell of queue) {
    if (key(cell) === key(to)) {
      const result: YardCell[] = [];
      for (let p: YardCell | null = cell; p && key(p) !== key(from); p = previous.get(key(p)) ?? null) result.unshift(p);
      return result;
    }
    // Exit cells are terminal: a walk to another destination cannot cross a doorway.
    if (key(cell) !== key(from) && yardExit(cell)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: cell.x + dx, y: cell.y + dy };
      if (yardWalkable(next) && !previous.has(key(next))) { previous.set(key(next), cell); queue.push(next); }
    }
  }
  return [];
}
