import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { petApproachCells, petNear } from './dogModel';
import type { PetCell } from './dogModel';
import { PET_INTERACTIONS } from './petInteraction';
import type { PetInteraction } from './petInteraction';
import type { PetId } from './petKinds';

/** Where the pet stands right now; written by the pet component every tick, read on tap/arrival. */
export type PetLink = { current: { cell: PetCell; span: number } | null };

/**
 * Tap-to-feed flow shared by the room and the yard. Near (Chebyshev ≤ 1 to the footprint): feed
 * at once. Far: `approach` walks the player to one of the ring cells; on arrival we feed only if
 * the pet is still next to us. Taps during an interaction, or while `disabled`, are ignored.
 */
export function usePetInteraction({ pet, actor, walking, disabled, approach, say }: {
  pet: PetId | null; actor: PetCell; walking: boolean; disabled: boolean;
  approach: (targets: PetCell[]) => boolean; say: (message: string) => void;
}) {
  const link = useRef<PetLink['current']>(null);
  const [interaction, setInteraction] = useState<PetInteraction | null>(null);
  const pending = useRef<PetId | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const nextId = useRef(0);
  const sayRef = useRef(say); sayRef.current = say;

  function start(kind: PetId) {
    const script = PET_INTERACTIONS[kind];
    const now = performance.now();
    setInteraction({ id: ++nextId.current, pet: kind, player: actor, start: now, until: now + script.ms });
    sayRef.current(script.start);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setInteraction(null); sayRef.current(script.result); }, script.ms);
  }
  function tap() {
    if (!pet || disabled || interaction) return;
    const at = link.current;
    if (!at) return;
    if (petNear(actor, at.cell, at.span)) { pending.current = null; start(pet); return; }
    if (!approach(petApproachCells(at.cell, at.span))) { pending.current = null; say(PET_INTERACTIONS[pet].blocked); return; }
    pending.current = pet;
    say(PET_INTERACTIONS[pet].approach);
  }
  // Arrival: the walk queue has drained. The pet may have wandered off in the meantime.
  useEffect(() => {
    const kind = pending.current;
    if (!kind || walking) return;
    pending.current = null;
    if (disabled) return; // editing or leaving interrupted the approach; not the pet's doing
    const at = link.current;
    if (kind === pet && at && petNear(actor, at.cell, at.span)) start(kind);
    else sayRef.current(PET_INTERACTIONS[kind].away);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walking, actor.x, actor.y]);
  // Editing mode (or losing the pet) ends a feed early; the pet model releases itself on pause too.
  useEffect(() => {
    if (!disabled && pet) return;
    pending.current = null;
    window.clearTimeout(timer.current);
    setInteraction(null);
  }, [disabled, pet]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { link, interaction, tap, cancelApproach: () => { pending.current = null; } };
}

/** Keeps the parent's PetLink pointed at the pet's current footprint (null while hidden). */
export function usePetLink(link: PetLink | undefined, cell: PetCell | null, span: number) {
  const x = cell?.x, y = cell?.y;
  useEffect(() => {
    if (!link) return;
    link.current = x === undefined || y === undefined ? null : { cell: { x, y }, span };
    return () => { link.current = null; };
  }, [link, x, y, span]);
}

/** Button semantics for a tappable pet (the wrapper stays pointer-transparent; only .pr-pet-hit takes taps). */
export function petTapProps(pet: PetId, onTap: (() => void) | undefined) {
  if (!onTap) return { 'aria-hidden': true } as const;
  return {
    role: 'button', tabIndex: 0, 'aria-label': PET_INTERACTIONS[pet].label, 'data-tappable': true,
    onClick: (event: { stopPropagation: () => void }) => { event.stopPropagation(); onTap(); },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) onTap();
    },
  } as const;
}
