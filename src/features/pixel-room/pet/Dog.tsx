import { useEffect, useRef, useState } from 'react';
import sheet from './assets/dog.png';
import { advanceDog, dogFits, dogMoving, dogPosition, holdDog, spawnDog } from './dogModel';
import type { DogAction, DogState } from './dogModel';
import { PetInteractionFx } from './PetInteractionFx';
import { petTapProps, usePetLink } from './usePetInteraction';
import { interactionBeat } from './petInteraction';
import type { PetProps } from './petInteraction';
import './dog.css';

// 192×192 sheet of 32×32 cells (see assets/DOG.md): bark, walk, run, sit transition, idle sit, idle stand.
function dogFrame(action: DogAction, outdoors: boolean, elapsed: number): [row: number, frame: number] {
  if (action === 'bark') return [0, Math.floor(elapsed / 150) % 4];
  if (action === 'walk') return [outdoors ? 2 : 1, Math.floor(elapsed / 90) % 6];
  if (action === 'sit') {
    if (elapsed < 450) return [3, Math.floor(elapsed / 150) % 3];
    // Seated c0, slow inhale c1, back to c2 (= c0), then a short c3 blink.
    const t = (elapsed - 450) % 3800;
    return [4, t < 1200 ? 0 : t < 2400 ? 1 : t < 3600 ? 2 : 3];
  }
  // Neutral c0 (shop preview at elapsed 0), exhale c1, tail sway c2, then a short c3 blink.
  const t = elapsed % 3600;
  return [5, t < 1200 ? 0 : t < 2400 ? 1 : t < 3400 ? 2 : 3];
}
export function DogSprite({ action = 'idle', elapsed = 0, outdoors = false, right = false }: { action?: DogAction; elapsed?: number; outdoors?: boolean; right?: boolean }) {
  const [row, frame] = dogFrame(action, outdoors, elapsed);
  return <svg viewBox={`${frame * 32} ${row * 32} 32 32`} className="pr-dog-sprite" style={{ transform: right ? 'scaleX(-1)' : undefined }} aria-hidden="true"><image href={sheet} width="192" height="192" /></svg>;
}
export function Dog({ world, paused = false, interaction = null, onTap, link }: PetProps) {
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
  useEffect(() => {
    if (!interaction) return;
    setSnapshot(previous => previous.state ? { ...previous, state: holdDog(previous.state, interaction.player, interaction.start, interaction.until) } : previous);
  }, [interaction]);
  const { state, now } = snapshot;
  // Yield immediately when the player steps into our footprint; never block their movement.
  const visible = !!state && dogFits(world, state.cell) && dogFits(world, state.from);
  usePetLink(link, visible ? state.cell : null, 2);
  if (!state || !visible) return null;
  const beat = !paused && state.held && now < state.held.until ? interactionBeat('pet_dog', now - state.held.start) : null;
  const position = paused ? state.cell : dogPosition(state, world, now);
  const action = (paused ? 'sit' : beat ? beat.action : dogMoving(state) ? 'walk' : state.action === 'walk' ? 'idle' : state.action) as DogAction;
  const elapsed = paused ? 600 : beat ? beat.elapsed : action === 'walk' ? now : now - state.entered;
  return <div className="pr-dog" data-action={action} data-interaction={beat?.stage} data-x={state.cell.x} data-y={state.cell.y} data-from-x={state.from.x} data-from-y={state.from.y} style={{ left: `${position.x / world.width * 100}%`, bottom: `${(world.height - position.y - 1) / world.height * 100}%`, width: `${200 / world.width}%`, height: `${200 / world.height}%`, zIndex: Math.floor(position.y) + 1 }} {...petTapProps('pet_dog', paused ? undefined : onTap)}>
    <DogSprite action={action} elapsed={elapsed} outdoors={world.outdoors} right={state.right} />
    {action === 'bark' && <span className="pr-dog-bark">멍!</span>}
    {beat && <PetInteractionFx pet="pet_dog" stage={beat.stage} heart={beat.heart} right={state.right} />}
    {onTap && !paused && <span className="pr-pet-hit" />}
  </div>;
}
