import { useEffect, useRef, useState } from 'react';
import sheet from './assets/dog.png';
import { advanceDog, dogFits, dogMoving, dogPosition, spawnDog } from './dogModel';
import type { DogAction, DogState, DogWorld } from './dogModel';
import './dog.css';

export function DogSprite({ action = 'idle', elapsed = 0, outdoors = false, right = false }: { action?: DogAction; elapsed?: number; outdoors?: boolean; right?: boolean }) {
  const row = action === 'bark' ? 0 : action === 'walk' ? outdoors ? 2 : 1 : action === 'sit' ? elapsed < 450 ? 3 : 4 : 5;
  const count = [4, 6, 6, 3, 4, 4][row];
  const frame = Math.floor(elapsed / (action === 'walk' ? 90 : 150)) % count;
  return <svg viewBox={`${frame * 32} ${row * 32} 32 32`} className="pr-dog-sprite" style={{ transform: right ? 'scaleX(-1)' : undefined }} aria-hidden="true"><image href={sheet} width="192" height="192" /></svg>;
}
export function Dog({ world, paused = false }: { world: DogWorld; paused?: boolean }) {
  const worldRef = useRef(world); worldRef.current = world;
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const [snapshot, setSnapshot] = useState<{ state: DogState | null; now: number }>(() => { const now = performance.now(); return { state: spawnDog(world, now), now }; });
  useEffect(() => {
    let frame = 0;
    let last = 0;
    const animate = (now: number) => {
      if (now - last >= 50) {
        last = now;
        setSnapshot(previous => ({ state: advanceDog(previous.state, worldRef.current, now, pausedRef.current || document.hidden), now }));
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);
  const { state, now } = snapshot;
  // Yield immediately when the player steps into our footprint; never block their movement.
  if (!state || !dogFits(world, state.cell) || !dogFits(world, state.from)) return null;
  const position = paused ? state.cell : dogPosition(state, world, now);
  const action = paused ? 'sit' : dogMoving(state) ? 'walk' : state.action === 'walk' ? 'idle' : state.action;
  return <div className="pr-dog" data-action={action} data-x={state.cell.x} data-y={state.cell.y} data-from-x={state.from.x} data-from-y={state.from.y} style={{ left: `${position.x / world.width * 100}%`, bottom: `${(world.height - position.y - 1) / world.height * 100}%`, width: `${200 / world.width}%`, height: `${200 / world.height}%`, zIndex: Math.floor(position.y) + 1 }} aria-hidden="true">
    <DogSprite action={action} elapsed={paused ? 600 : action === 'walk' ? now : now - state.entered} outdoors={world.outdoors} right={state.right} />
    {action === 'bark' && <span className="pr-dog-bark">멍!</span>}
  </div>;
}
