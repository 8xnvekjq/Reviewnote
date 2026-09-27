import { useEffect, useRef, useState } from 'react';
import sheet from './assets/pigeon.png';
import { dogFits } from './dogModel';
import type { DogWorld } from './dogModel';
import { PIGEON_LAND_MS, PIGEON_TAKEOFF_MS, advancePigeon, pigeonAirborne, pigeonLift, pigeonPosition, spawnPigeon } from './pigeonModel';
import type { PigeonAction, PigeonState } from './pigeonModel';
import './pigeon.css';

// 128×192 sheet of 32×32 cells (see assets/PIGEON.md): idle, walk, peck, rest, takeoff/land, fly.
function pigeonFrame(action: PigeonAction, elapsed: number): [row: number, frame: number] {
  switch (action) {
    case 'walk': return [1, Math.floor(elapsed / 75) % 4];
    case 'bob': return [0, Math.floor(elapsed / 250) % 2];
    case 'peck': return [2, [0, 1, 2, 1, 2, 3][Math.min(5, Math.floor(elapsed / 220))]];
    case 'rest': { if (elapsed < 300) return [3, 0]; const t = (elapsed - 300) % 3200; return [3, t > 3000 ? 2 : t < 1600 ? 1 : 3]; }
    case 'takeoff': return [4, elapsed < PIGEON_TAKEOFF_MS * .4 ? 0 : 1];
    case 'fly': return [5, Math.floor(elapsed / 90) % 4];
    case 'land': return [4, elapsed < PIGEON_LAND_MS * .5 ? 2 : 3];
    default: return [0, elapsed % 3400 > 3250 ? 3 : 0];
  }
}
export function PigeonSprite({ action = 'idle', elapsed = 0, right = false, lift = 0 }: { action?: PigeonAction; elapsed?: number; right?: boolean; lift?: number }) {
  const [row, frame] = pigeonFrame(action, elapsed);
  // Ground shadow stays put and shrinks as the bird rises; the body is lifted above it.
  const shadow = Math.max(4, 12 - lift);
  return <svg viewBox="0 -16 32 48" className="pr-pigeon-sprite" aria-hidden="true" style={{ transform: right ? 'scaleX(-1)' : undefined }}>
    <path d={`M${16 - shadow / 2} 30h${shadow}v2h${-shadow}z`} fill="#453d29" opacity={lift ? .1 : .15} />
    <svg y={-lift} width="32" height="32" viewBox={`${frame * 32} ${row * 32} 32 32`} overflow="hidden"><image href={sheet} width="128" height="192" /></svg>
  </svg>;
}
export function Pigeon({ world, paused = false }: { world: DogWorld; paused?: boolean }) {
  const worldRef = useRef(world); worldRef.current = world;
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const [snapshot, setSnapshot] = useState<{ state: PigeonState | null; now: number }>(() => { const now = performance.now(); return { state: spawnPigeon(world, now), now }; });
  useEffect(() => {
    let frame = 0, last = 0;
    const animate = (now: number) => {
      if (now - last >= 40) { last = now; setSnapshot(previous => ({ state: advancePigeon(previous.state, worldRef.current, now, pausedRef.current || document.hidden), now })); }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);
  const { state, now } = snapshot;
  // Grounded: yield at once when the player or furniture takes our cells (like the dog/duck).
  // Airborne: only the landing cell matters; the model re-targets it if it gets taken.
  if (!state || !dogFits(world, state.cell) || (state.action !== 'fly' && !dogFits(world, state.from))) return null;
  const position = paused ? state.cell : pigeonPosition(state, world, now);
  const walking = state.action === 'walk' && (state.cell.x !== state.from.x || state.cell.y !== state.from.y);
  const action = paused ? 'rest' : walking ? 'walk' : state.action === 'walk' ? 'idle' : state.action;
  const airborne = !paused && pigeonAirborne(state);
  return <div className="pr-pigeon" aria-hidden="true" data-action={action} data-airborne={airborne} data-x={state.cell.x} data-y={state.cell.y} data-from-x={state.from.x} data-from-y={state.from.y}
    // A 2×3-cell box: the extra top cell is headroom for flight. Airborne birds draw above furniture.
    style={{ left: `${position.x / world.width * 100}%`, bottom: `${(world.height - position.y - 1) / world.height * 100}%`, width: `${200 / world.width}%`, height: `${300 / world.height}%`, zIndex: airborne ? world.height + 2 : Math.floor(position.y) + 1 }}>
    <PigeonSprite action={action} elapsed={paused ? 0 : now - state.entered} right={state.right} lift={paused ? 0 : pigeonLift(state, world, now)} />
  </div>;
}
