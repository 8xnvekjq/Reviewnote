import { dogFits, dogRoute, spawnDog } from './dogModel';
import type { DogState, DogWorld, PetCell } from './dogModel';
// The bear is the big one: a 3-cell footprint (dog/duck use 2) so its wider body never overlaps
// furniture, slower steps and longer sits so it reads heavy but calm.
export const BEAR_SPAN = 3;
export type BearAction = 'idle' | 'walk' | 'sit' | 'wave';
export type BearState = Omit<DogState, 'action'> & { action: BearAction };
export const bearFits = (world: DogWorld, cell: PetCell) => dogFits(world, cell, BEAR_SPAN);
export function spawnBear(world: DogWorld, now: number): BearState | null {
  const state = spawnDog(world, now, BEAR_SPAN);
  return state ? { ...state, action: 'idle' } : null;
}
export function bearStepMs(world: DogWorld): number { return world.outdoors ? 420 : 600; }
export const BEAR_WAVE_MS = 1300;
export function advanceBear(state: BearState | null, world: DogWorld, now: number, paused: boolean, random = Math.random): BearState | null {
  if (!state || !bearFits(world, state.cell) || !bearFits(world, state.from)) return spawnBear(world, now);
  if (paused) return state.action === 'sit' && !state.route.length ? { ...state, from: state.cell, due: now + 1800 } : { ...state, from: state.cell, route: [], action: 'sit', entered: now, due: now + 1800 };
  if (now < state.due) return state;
  if (state.action !== 'walk') {
    const route = dogRoute(world, state.cell, random, BEAR_SPAN).slice(0, world.outdoors ? 4 : 2);
    if (route.length) return { ...state, route, from: state.cell, action: 'walk', entered: now, due: now };
  } else if (state.route.length && bearFits(world, state.route[0])) {
    const cell = state.route[0];
    return { ...state, from: state.cell, cell, route: state.route.slice(1), right: cell.x === state.cell.x ? state.right : cell.x > state.cell.x, entered: now, due: now + bearStepMs(world) };
  }
  const roll = random();
  const action: BearAction = roll < .45 ? 'sit' : roll < .6 ? 'wave' : 'idle';
  const duration = action === 'wave' ? BEAR_WAVE_MS : action === 'sit' ? (world.outdoors ? 2600 : 4200) + random() * 2500 : (world.outdoors ? 1500 : 2600) + random() * 1800;
  return { ...state, from: state.cell, route: [], action, entered: now, due: now + duration };
}
export function bearPosition(state: BearState, world: DogWorld, now: number): PetCell {
  const t = state.action === 'walk' ? Math.min(1, Math.max(0, (now - state.entered) / bearStepMs(world))) : 1;
  return { x: state.from.x + (state.cell.x - state.from.x) * t, y: state.from.y + (state.cell.y - state.from.y) * t };
}
