export const DOG_ITEM_ID = 'pet_dog';
export type PetCell = { x: number; y: number };
export type DogAction = 'idle' | 'walk' | 'sit' | 'bark';
export interface DogWorld { width: number; height: number; outdoors: boolean; free: (cell: PetCell) => boolean }
export interface DogState { cell: PetCell; from: PetCell; route: PetCell[]; action: DogAction; right: boolean; entered: number; due: number }
const same = (a: PetCell, b: PetCell) => a.x === b.x && a.y === b.y;
export function dogFits(world: DogWorld, cell: PetCell): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x + 1 < world.width && cell.y < world.height
    && world.free(cell) && world.free({ x: cell.x + 1, y: cell.y });
}
export function spawnDog(world: DogWorld, now: number): DogState | null {
  // Prefer the middle of a safe floor patch, not a door or the top screen edge.
  const candidates: PetCell[] = [];
  for (let y = 1; y < world.height; y++) for (let x = 0; x < world.width - 1; x++) if (dogFits(world, { x, y })) candidates.push({ x, y });
  candidates.sort((a, b) => Math.abs(a.y - world.height / 2) - Math.abs(b.y - world.height / 2));
  const cell = candidates[0];
  return cell ? { cell, from: cell, route: [], action: 'idle', right: true, entered: now, due: now + 1600 } : null;
}
export function dogRoute(world: DogWorld, start: PetCell, random: () => number): PetCell[] {
  const queue = [{ cell: start, path: [] as PetCell[] }];
  const seen = new Set([`${start.x},${start.y}`]);
  const choices: PetCell[][] = [];
  const radius = world.outdoors ? 5 : 3;
  for (const { cell, path } of queue) {
    if (path.length) choices.push(path);
    if (path.length >= radius) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: cell.x + dx, y: cell.y + dy }; const key = `${next.x},${next.y}`;
      if (!seen.has(key) && dogFits(world, next)) { seen.add(key); queue.push({ cell: next, path: [...path, next] }); }
    }
  }
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))] ?? [];
}
export function dogStepMs(world: DogWorld): number { return world.outdoors ? 260 : 480; }
export function advanceDog(state: DogState | null, world: DogWorld, now: number, paused: boolean, random = Math.random): DogState | null {
  if (!state || !dogFits(world, state.cell) || !dogFits(world, state.from)) return spawnDog(world, now);
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
