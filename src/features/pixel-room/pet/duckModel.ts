import { dogFits, dogRoute, spawnDog } from './dogModel';
import type { DogState, DogWorld, PetCell } from './dogModel';
export type DuckAction = 'idle' | 'walk' | 'tilt' | 'peck' | 'hop';
export type DuckState = Omit<DogState, 'action'> & { action: DuckAction };
export function spawnDuck(world: DogWorld, now: number): DuckState | null {
  const state = spawnDog(world, now);
  return state ? { ...state, action: 'idle' } : null;
}
export function duckStepMs(world: DogWorld): number { return world.outdoors ? 250 : 340; }
export function advanceDuck(state: DuckState | null, world: DogWorld, now: number, paused: boolean, random = Math.random): DuckState | null {
  if (!state || !dogFits(world, state.cell) || !dogFits(world, state.from)) return spawnDuck(world, now);
  if (paused) return { ...state, from: state.cell, route: [], action: 'idle', entered: now, due: now + 1800 };
  if (now < state.due) return state;
  if (state.action !== 'walk') {
    // Reuse proven collision-aware paths, but take shorter outings than the dog.
    const route = dogRoute(world, state.cell, random).slice(0, world.outdoors ? 3 : 2);
    if (route.length) return { ...state, route, from: state.cell, action: 'walk', entered: now, due: now };
  } else if (state.route.length && dogFits(world, state.route[0])) {
    const cell = state.route[0];
    return { ...state, from: state.cell, cell, route: state.route.slice(1), right: cell.x === state.cell.x ? state.right : cell.x > state.cell.x, entered: now, due: now + duckStepMs(world) };
  }
  const roll = random();
  const action: DuckAction = roll < .35 ? 'peck' : roll < .65 ? 'tilt' : roll < .8 ? 'hop' : 'idle';
  const duration = action === 'hop' ? 900 : action === 'peck' ? 1400 : (world.outdoors ? 1100 : 2100) + random() * 1500;
  return { ...state, from: state.cell, route: [], action, entered: now, due: now + duration };
}
export function duckPosition(state: DuckState, world: DogWorld, now: number): PetCell {
  const t = state.action === 'walk' ? Math.min(1, Math.max(0, (now - state.entered) / duckStepMs(world))) : 1;
  return { x: state.from.x + (state.cell.x - state.from.x) * t, y: state.from.y + (state.cell.y - state.from.y) * t };
}
