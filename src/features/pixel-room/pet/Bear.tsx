import { useEffect, useRef, useState } from 'react';
import sheet from './assets/bear.png';
import { BEAR_SPAN, BEAR_WAVE_MS, advanceBear, bearFits, bearPosition, holdBear, spawnBear } from './bearModel';
import { PetInteractionFx } from './PetInteractionFx';
import { petTapProps, usePetLink } from './usePetInteraction';
import { interactionBeat } from './petInteraction';
import type { PetProps } from './petInteraction';
import type { BearAction, BearState } from './bearModel';
import './bear.css';

// 192×192 sheet of 48×48 cells (see assets/BEAR.md): rows idle / walk / sit / wave, 4 frames each.
function bearFrame(action: BearAction, elapsed: number): [row: number, frame: number] {
  if (action === 'walk') return [1, Math.floor(elapsed / 150) % 4];
  if (action === 'wave') return [3, Math.min(3, Math.floor(elapsed / (BEAR_WAVE_MS / 4)))];
  if (action === 'sit') { if (elapsed < 300) return [2, 0]; const t = (elapsed - 300) % 4200; return [2, t > 3950 ? 2 : t < 2100 ? 1 : 3]; }
  // Slow breath (c0 exhale, c1 inhale), then a short blink (c2); c3 is identical to c0.
  const t = elapsed % 4000;
  return [0, t < 1500 ? 0 : t < 3000 ? 1 : t < 3800 ? 3 : 2];
}
export function BearSprite({ action = 'idle', elapsed = 0, right = false }: { action?: BearAction; elapsed?: number; right?: boolean }) {
  const [row, frame] = bearFrame(action, elapsed);
  return <svg viewBox="0 0 48 48" className="pr-bear-sprite" aria-hidden="true" style={{ transform: right ? 'scaleX(-1)' : undefined }}>
    <path d="M9 45h30v2H9z" fill="#453d29" opacity=".16" />
    <svg width="48" height="48" viewBox={`${frame * 48} ${row * 48} 48 48`} overflow="hidden"><image href={sheet} width="192" height="192" /></svg>
  </svg>;
}
export function Bear({ world, paused = false, interaction = null, onTap, link }: PetProps) {
  const worldRef = useRef(world); worldRef.current = world;
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const [snapshot, setSnapshot] = useState<{ state: BearState | null; now: number }>(() => { const now = performance.now(); return { state: spawnBear(world, now), now }; });
  useEffect(() => {
    let frame = 0, last = 0;
    const animate = (now: number) => {
      if (now - last >= 50) { last = now; setSnapshot(previous => ({ state: advanceBear(previous.state, worldRef.current, now, pausedRef.current || document.hidden), now })); }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!interaction) return;
    setSnapshot(previous => previous.state ? { ...previous, state: holdBear(previous.state, interaction.player, interaction.start, interaction.until) } : previous);
  }, [interaction]);
  const { state, now } = snapshot;
  // Like the dog: yield at once when the player or new furniture takes part of our footprint.
  const visible = !!state && bearFits(world, state.cell) && bearFits(world, state.from);
  usePetLink(link, visible ? state.cell : null, BEAR_SPAN);
  if (!state || !visible) return null;
  const beat = !paused && state.held && now < state.held.until ? interactionBeat('pet_bear', now - state.held.start) : null;
  const position = paused ? state.cell : bearPosition(state, world, now);
  const walking = state.action === 'walk' && (state.cell.x !== state.from.x || state.cell.y !== state.from.y);
  const action = (paused ? 'sit' : beat ? beat.action : walking ? 'walk' : state.action === 'walk' ? 'idle' : state.action) as BearAction;
  return <div className="pr-bear" data-action={action} data-interaction={beat?.stage} data-x={state.cell.x} data-y={state.cell.y} data-from-x={state.from.x} data-from-y={state.from.y}
    style={{ left: `${position.x / world.width * 100}%`, bottom: `${(world.height - position.y - 1) / world.height * 100}%`, width: `${BEAR_SPAN * 100 / world.width}%`, height: `${BEAR_SPAN * 100 / world.height}%`, zIndex: Math.floor(position.y) + 1 }} {...petTapProps('pet_bear', paused ? undefined : onTap)}>
    <BearSprite action={action} elapsed={beat ? beat.elapsed : now - state.entered} right={state.right} />
    {beat && <PetInteractionFx pet="pet_bear" stage={beat.stage} heart={beat.heart} right={state.right} />}
    {onTap && !paused && <span className="pr-pet-hit" />}
  </div>;
}
