export const DOG_ITEM_ID = 'pet_dog';
export type PetCell = { x: number; y: number };
export type DogAction = 'idle' | 'walk' | 'sit' | 'bark';
export interface DogWorld { width: number; height: number; outdoors: boolean; free: (cell: PetCell) => boolean }
export interface DogState { cell: PetCell; from: PetCell; route: PetCell[]; action: DogAction; right: boolean; entered: number; due: number; held?: PetHold }
const same = (a: PetCell, b: PetCell) => a.x === b.x && a.y === b.y;
// `span` is the footprint width in cells: 2 for the dog/duck, 3 for the big bear.
export function dogFits(world: DogWorld, cell: PetCell, span = 2): boolean {
  if (cell.x < 0 || cell.y < 0 || cell.x + span > world.width || cell.y >= world.height) return false;
  for (let dx = 0; dx < span; dx++) if (!world.free({ x: cell.x + dx, y: cell.y })) return false;
  return true;
}
export function spawnDog(world: DogWorld, now: number, span = 2): DogState | null {
  // Prefer the middle of a safe floor patch, not a door or the top screen edge.
  const candidates: PetCell[] = [];
  for (let y = 1; y < world.height; y++) for (let x = 0; x + span <= world.width; x++) if (dogFits(world, { x, y }, span)) candidates.push({ x, y });
  candidates.sort((a, b) => Math.abs(a.y - world.height / 2) - Math.abs(b.y - world.height / 2));
  const cell = candidates[0];
  return cell ? { cell, from: cell, route: [], action: 'idle', right: true, entered: now, due: now + 1600 } : null;
}
export function dogRoute(world: DogWorld, start: PetCell, random: () => number, span = 2): PetCell[] {
  const queue = [{ cell: start, path: [] as PetCell[] }];
  const seen = new Set([`${start.x},${start.y}`]);
  const choices: PetCell[][] = [];
  const radius = world.outdoors ? 5 : 3;
  for (const { cell, path } of queue) {
    if (path.length) choices.push(path);
    if (path.length >= radius) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: cell.x + dx, y: cell.y + dy }; const key = `${next.x},${next.y}`;
      if (!seen.has(key) && dogFits(world, next, span)) { seen.add(key); queue.push({ cell: next, path: [...path, next] }); }
    }
  }
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))] ?? [];
}
export function dogStepMs(world: DogWorld): number { return world.outdoors ? 260 : 480; }
export function advanceDog(state: DogState | null, world: DogWorld, now: number, paused: boolean, random = Math.random): DogState | null {
  if (!state || !dogFits(world, state.cell) || !dogFits(world, state.from)) return spawnDog(world, now);
  const hold = stepHold(state, now, paused);
  if (hold.frozen) return state;
  state = hold.state;
  if (paused) return { ...state, from: state.cell, action: 'sit', route: [], entered: now - 600, due: now + 1400 };
  if (now < state.due) return state;
  if (state.action !== 'walk') {
    const route = dogRoute(world, state.cell, random);
    if (route.length) return { ...state, route, action: 'walk', entered: now, due: now };
  } else if (state.route.length && dogFits(world, state.route[0])) {
    const cell = state.route[0];
    return { ...state, from: state.cell, cell, route: state.route.slice(1), right: cell.x === state.cell.x ? state.right : cell.x > state.cell.x, entered: now, due: now + dogStepMs(world) };
  }
  const roll = random();
  const action: DogAction = roll < .12 ? 'bark' : roll < .55 ? 'sit' : 'idle';
  return { ...state, from: state.cell, route: [], action, entered: now, due: now + (action === 'bark' ? 900 : (world.outdoors ? 1300 : 2800) + random() * 2000) };
}
export function dogPosition(state: DogState, world: DogWorld, now: number): PetCell {
  const t = state.action === 'walk' ? Math.min(1, Math.max(0, (now - state.entered) / dogStepMs(world))) : 1;
  return { x: state.from.x + (state.cell.x - state.from.x) * t, y: state.from.y + (state.cell.y - state.from.y) * t };
}
export function dogMoving(state: DogState): boolean { return state.action === 'walk' && !same(state.cell, state.from); }

// Pet interaction (tap to feed): a short "hold" that parks any pet in place, facing the player,
// then hands it back to its own wandering state machine. Shared by every *Model's advance step.
// `action` is the pose the pet resumes with once released.
export interface PetHold { start: number; until: number; action: string }
type Holdable = Omit<DogState, 'action'> & { action: string };
const footprintGap = (player: PetCell, cell: PetCell, span: number) => ({
  x: player.x < cell.x ? cell.x - player.x : player.x > cell.x + span - 1 ? player.x - (cell.x + span - 1) : 0,
  y: Math.abs(player.y - cell.y),
});
/** Chebyshev distance ≤ 1 between the player and any cell of the pet's 1-row footprint. */
export function petNear(player: PetCell, cell: PetCell, span = 2): boolean {
  const gap = footprintGap(player, cell, span);
  return Math.max(gap.x, gap.y) <= 1;
}
/** The ring of cells around a footprint, sides first (feeding from beside reads best), then front, then back. */
export function petApproachCells(cell: PetCell, span = 2): PetCell[] {
  const sides = [{ x: cell.x - 1, y: cell.y }, { x: cell.x + span, y: cell.y }];
  const row = (y: number) => Array.from({ length: span + 2 }, (_, i) => ({ x: cell.x - 1 + i, y }));
  return [...sides, ...row(cell.y + 1), ...row(cell.y - 1)];
}
/** Cheapest route to a ring cell (from petApproachCells); the two side cells get a two-step head start. */
export function pickApproach<C extends PetCell>(targets: PetCell[], plan: (target: PetCell) => C[]): C[] {
  let best: C[] = [], bestCost = Infinity;
  targets.forEach((target, index) => {
    const path = plan(target);
    const cost = path.length + (index < 2 ? 0 : 2);
    if (path.length && cost < bestCost) { best = path; bestCost = cost; }
  });
  return best;
}
/** Park the pet on its current cell, facing the player, until `until`; afterwards it resumes as `resume`. */
export function holdPet<S extends Holdable>(state: S, player: PetCell, now: number, until: number, resume: S['action'], span = 2): S {
  const center = state.cell.x + (span - 1) / 2;
  const right = player.x === center ? state.right : player.x > center;
  const action = state.held ? state.held.action : resume;
  return { ...state, from: state.cell, route: [], right, entered: now, due: until, held: { start: now, until, action } };
}
/** Hand the pet back to its own behavior: the pose it had before, with a short beat before it moves on. */
export function releasePet<S extends Holdable>(state: S, now: number): S {
  if (!state.held) return state;
  return { ...state, held: undefined, action: state.held.action as S['action'], from: state.cell, route: [], entered: now, due: now + 700 };
}
/** Advance-step guard: while held the state is frozen; once the hold expires (or editing pauses) it is released. */
export function stepHold<S extends Holdable>(state: S, now: number, paused: boolean): { state: S; frozen: boolean } {
  if (!state.held) return { state, frozen: false };
  if (!paused && now < state.held.until) return { state, frozen: true };
  return { state: releasePet(state, now), frozen: false };
}
export const holdDog = (state: DogState, player: PetCell, now: number, until: number) => holdPet(state, player, now, until, state.action === 'sit' ? 'sit' : 'idle');
