// Pixel World Phase 2A — Plaza-scoped movement model. Deliberately NOT pixel-room/model.ts: that
// file's planWalk/isCellFree/findSpawn are tightly coupled to RoomState (furniture, save/load, a
// fixed 10x8 room) and carry an existing 12-test contract we must not risk touching. The plaza is
// a different shape of problem — no furniture, no persistence, a 16x12 grid, and multiple
// simultaneous players who are allowed to stand on the same tile ("플레이어끼리 겹쳐도 허용 —
// 충돌 판정은 만들지 않는다" per the brief) — so the only obstacle here is the grid boundary
// itself. We keep the same *algorithmic* approach as model.ts's planWalk (BFS shortest path, no
// diagonals) so the walk still feels identical to the room's, just reimplemented against this
// simpler, boundary-only grid.

import type { PlazaDirection } from './types';
import { PLAZA_HEIGHT, PLAZA_WIDTH } from './types';

export type Cell = { x: number; y: number };
export type PlazaWalkStep = { cell: Cell; direction: PlazaDirection };

const DELTAS: Record<PlazaDirection, Cell> = {
  Front: { x: 0, y: 1 },
  Back: { x: 0, y: -1 },
  Left: { x: -1, y: 0 },
  Right: { x: 1, y: 0 },
};
// Same neighbor scan order as model.ts's planWalk (+x, -x, +y, -y) so equally-short paths come
// out shaped the same way (a minor but deliberate feel-consistency detail, not a correctness one).
const NEIGHBOR_STEPS: Cell[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

export function isInsidePlaza(cell: Cell): boolean {
  return Number.isInteger(cell.x) && Number.isInteger(cell.y)
    && cell.x >= 0 && cell.y >= 0 && cell.x < PLAZA_WIDTH && cell.y < PLAZA_HEIGHT;
}

// Pixel World Phase 2A rework — the plaza's one door back to the room. Bottom row, center-ish
// (mirrors the room's own door convention in PixelRoom.tsx: a fixed cell on the near edge, not a
// button). Walking onto this cell is the ONLY way back to the room now.
export const PLAZA_ENTRANCE: Cell = { x: Math.floor(PLAZA_WIDTH / 2), y: PLAZA_HEIGHT - 1 };

export function stepDirection(from: Cell, to: Cell): PlazaDirection {
  if (to.x > from.x) return 'Right';
  if (to.x < from.x) return 'Left';
  return to.y > from.y ? 'Front' : 'Back';
}

export function moveOneStep(cell: Cell, direction: PlazaDirection): Cell {
  const delta = DELTAS[direction];
  return { x: cell.x + delta.x, y: cell.y + delta.y };
}

/** Deterministic spawn for arriving FROM the room — one cell in front of (above) PLAZA_ENTRANCE,
 * mirroring the room's own "one cell in front of the door" spawn convention (no random
 * persistence, no obstacles to avoid here). The plaza has exactly one door, so this is the only
 * spawn case; a future second entrance would just add its own spawn constant next to this one. */
export function findSpawn(): Cell {
  return { x: PLAZA_ENTRANCE.x, y: PLAZA_ENTRANCE.y - 1 };
}

/** Shortest-path BFS over the 16x12 plaza grid, boundary-only (no furniture/dynamic obstacles —
 * other players never block the route). Unlike model.ts's planWalk (which returns bare Cell[] and
 * leaves the caller to derive facing direction via a separate stepDirection pass), this returns
 * the direction alongside each landing cell so Plaza.tsx's tick loop can consume it exactly like
 * PixelRoom.tsx's WalkStep queue, with no extra derivation step. Same-cell, out-of-bounds or
 * unreachable targets all -> []; a reachable target always returns the real shortest route. */
export function planWalk(from: Cell, to: Cell): PlazaWalkStep[] {
  if (!isInsidePlaza(to) || (from.x === to.x && from.y === to.y)) return [];
  const key = (cell: Cell) => cell.y * PLAZA_WIDTH + cell.x;
  const cameFrom = new Map<number, Cell>();
  const visited = new Set<number>([key(from)]);
  const queue: Cell[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current.x === to.x && current.y === to.y) {
      const path: Cell[] = [];
      for (let cell: Cell | undefined = current; cell && !(cell.x === from.x && cell.y === from.y); cell = cameFrom.get(key(cell))) path.unshift(cell);
      const steps: PlazaWalkStep[] = [];
      let prev = from;
      for (const cell of path) { steps.push({ cell, direction: stepDirection(prev, cell) }); prev = cell; }
      return steps;
    }
    for (const step of NEIGHBOR_STEPS) {
      const next = { x: current.x + step.x, y: current.y + step.y };
      if (visited.has(key(next)) || !isInsidePlaza(next)) continue;
      visited.add(key(next));
      cameFrom.set(key(next), current);
      queue.push(next);
    }
  }
  return [];
}
