import { useEffect, useRef, useState } from 'react';
import type { Cell } from './model';

export type Puff = { id: number; x: number; y: number };

/**
 * Counts real one-cell steps (teleports such as a scene spawn don't count) and remembers the last
 * few cells stepped off, for the actor's hop (`step` parity restarts the CSS animation) and dust.
 */
export function useStepTrail(cell: Cell) {
  const [trail, setTrail] = useState<{ step: number; puffs: Puff[] }>({ step: 0, puffs: [] });
  const previous = useRef(cell);
  useEffect(() => {
    const from = previous.current;
    previous.current = cell;
    if (Math.abs(from.x - cell.x) + Math.abs(from.y - cell.y) !== 1) return;
    setTrail(value => ({ step: value.step + 1, puffs: [...value.puffs.slice(-2), { id: value.step + 1, x: from.x, y: from.y }] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell.x, cell.y]);
  return trail;
}

/** Actor attributes that replay the per-step hop: two identical keyframes alternate by parity. */
export const hopProps = (step: number) => (step ? { 'data-step': step % 2 } : {});
