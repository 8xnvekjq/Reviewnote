import { dogFits, dogRoute, holdPet, spawnDog, stepHold } from './dogModel';
import type { DogState, DogWorld, PetCell } from './dogModel';
// Mostly a ground bird (strut, head bob, peck, rest) that now and then hops into a short, low
// flight to another free cell: takeoff -> fly -> land. Flight passes over furniture but only ever
// lands on a cell the dog/duck could stand on, so doors, carpet, beds and the player stay clear.
export type PigeonAction = 'idle' | 'walk' | 'bob' | 'peck' | 'rest' | 'takeoff' | 'fly' | 'land';
// While flying, `from` is the takeoff cell and `cell` the landing cell; `to` holds the landing
// cell during takeoff so the bird can lift off in place first.
export type PigeonState = Omit<DogState, 'action'> & { action: PigeonAction; to?: PetCell };
export const PIGEON_TAKEOFF_MS = 320;
export const PIGEON_LAND_MS = 340;
export function pigeonStepMs(world: DogWorld): number { return world.outdoors ? 210 : 300; }
export function pigeonFlightMs(from: PetCell, to: PetCell): number { return 260 + Math.hypot(to.x - from.x, to.y - from.y) * 170; }
export const pigeonAirborne = (state: PigeonState) => state.action === 'takeoff' || state.action === 'fly' || state.action === 'land';
export function spawnPigeon(world: DogWorld, now: number): PigeonState | null {
  const state = spawnDog(world, now);
  return state ? { ...state, action: 'idle' } : null;
}
// Landing spots a short hop away (never the current cell), within this scene's safe pet area.
export function pigeonFlightTarget(world: DogWorld, start: PetCell, random: () => number): PetCell | null {
  const reach = world.outdoors ? 5 : 3, spots: PetCell[] = [];
  for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
    const distance = Math.abs(x - start.x) + Math.abs(y - start.y);
    if (distance >= 2 && distance <= reach && dogFits(world, { x, y })) spots.push({ x, y });
  }
  return spots.length ? spots[Math.min(spots.length - 1, Math.floor(random() * spots.length))] : null;
}
function nearestFit(world: DogWorld, target: PetCell): PetCell | null {
  let best: PetCell | null = null, bestDistance = Infinity;
  for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
    const distance = Math.hypot(x - target.x, y - target.y);
    if (distance < bestDistance && dogFits(world, { x, y })) { best = { x, y }; bestDistance = distance; }
  }
  return best;
}
export function advancePigeon(state: PigeonState | null, world: DogWorld, now: number, paused: boolean, random = Math.random): PigeonState | null {
  if (state?.action === 'fly' && !dogFits(world, state.cell)) {
    // Someone took the landing spot mid-air: glide on to the closest free spot instead of vanishing.
    const cell = nearestFit(world, state.cell);
    if (!cell) return null;
    state = { ...state, cell, right: cell.x === state.from.x ? state.right : cell.x > state.from.x, due: Math.max(state.due, state.entered + pigeonFlightMs(state.from, cell)) };
  }
  // The takeoff cell may be walked on once airborne; only grounded poses need both cells free.
  if (!state || !dogFits(world, state.cell) || (state.action !== 'fly' && !dogFits(world, state.from))) return spawnPigeon(world, now);
  const hold = stepHold(state, now, paused);
  if (hold.frozen) return state;
  state = hold.state;
  if (paused) return state.action === 'rest' && !state.route.length ? state : { ...state, from: state.cell, route: [], to: undefined, action: 'rest', entered: now, due: now + 1800 };
  if (now < state.due) return state;
  if (state.action === 'takeoff' && state.to) {
    const to = dogFits(world, state.to) ? state.to : nearestFit(world, state.to);
    if (to) return { ...state, from: state.cell, cell: to, to: undefined, route: [], action: 'fly', right: to.x === state.cell.x ? state.right : to.x > state.cell.x, entered: now, due: now + pigeonFlightMs(state.cell, to) };
  }
  if (state.action === 'fly') return { ...state, from: state.cell, action: 'land', entered: now, due: now + PIGEON_LAND_MS };
  if (state.action === 'walk' && state.route.length && dogFits(world, state.route[0])) {
    const cell = state.route[0];
    return { ...state, from: state.cell, cell, route: state.route.slice(1), right: cell.x === state.cell.x ? state.right : cell.x > state.cell.x, entered: now, due: now + pigeonStepMs(world) };
  }
  if (state.action !== 'walk') {
    // Calm indoors (short struts, rare flights), livelier in the yard.
    const flight = random() < (world.outdoors ? .2 : .07) && state.action !== 'land' ? pigeonFlightTarget(world, state.cell, random) : null;
    if (flight) return { ...state, from: state.cell, route: [], to: flight, action: 'takeoff', entered: now, due: now + PIGEON_TAKEOFF_MS };
    const route = dogRoute(world, state.cell, random).slice(0, world.outdoors ? 4 : 3);
    if (route.length) return { ...state, route, from: state.cell, to: undefined, action: 'walk', entered: now, due: now };
  }
  const roll = random();
  const action: PigeonAction = world.outdoors
    ? roll < .32 ? 'peck' : roll < .54 ? 'bob' : roll < .64 ? 'rest' : 'idle'
    : roll < .26 ? 'peck' : roll < .5 ? 'bob' : roll < .72 ? 'rest' : 'idle';
  const duration = action === 'peck' ? 1300 : action === 'bob' ? 1000 : action === 'rest' ? (world.outdoors ? 2200 : 3600) + random() * 2000 : (world.outdoors ? 900 : 1800) + random() * 1400;
  return { ...state, from: state.cell, route: [], to: undefined, action, entered: now, due: now + duration };
}
// A bird in the air settles straight onto its landing cell to eat; it resumes grounded.
export const holdPigeon = (state: PigeonState, player: PetCell, now: number, until: number) => holdPet({ ...state, to: undefined }, player, now, until, state.action === 'rest' ? 'rest' : 'idle');
export function pigeonPosition(state: PigeonState, world: DogWorld, now: number): PetCell {
  const span = state.action === 'walk' ? pigeonStepMs(world) : state.action === 'fly' ? pigeonFlightMs(state.from, state.cell) : 0;
  const t = span ? Math.min(1, Math.max(0, (now - state.entered) / span)) : 1;
  return { x: state.from.x + (state.cell.x - state.from.x) * t, y: state.from.y + (state.cell.y - state.from.y) * t };
}
// Height above the ground in logical sprite pixels (a 32px cell): rise, low arc, settle.
export function pigeonLift(state: PigeonState, world: DogWorld, now: number): number {
  const elapsed = now - state.entered;
  if (state.action === 'takeoff') return 7 * Math.min(1, elapsed / PIGEON_TAKEOFF_MS);
  if (state.action === 'land') return 7 * Math.max(0, 1 - elapsed / PIGEON_LAND_MS);
  if (state.action !== 'fly') return 0;
  const t = Math.min(1, Math.max(0, elapsed / pigeonFlightMs(state.from, state.cell)));
  return 7 + (world.outdoors ? 5 : 3) * Math.sin(Math.PI * t);
}
