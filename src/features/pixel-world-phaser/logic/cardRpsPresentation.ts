import type { RpsHand, RpsRoundResult } from './cardRps';

export interface RevealStep {
  clash: number;
  a: RpsHand;
  b: RpsHand;
  result: 'a' | 'b' | 'draw';
  surviving: 'a' | 'b' | null;
}

export function addQueuedCard(queue: readonly RpsHand[], hand: RpsHand, available: number): RpsHand[] {
  if (queue.filter(card => card === hand).length >= available) return [...queue];
  return [...queue, hand];
}

export function moveQueuedCard(queue: readonly RpsHand[], from: number, to: number): RpsHand[] {
  if (from < 0 || from >= queue.length || to < 0 || to >= queue.length || from === to) return [...queue];
  const next = [...queue];
  const [card] = next.splice(from, 1);
  next.splice(to, 0, card);
  return next;
}

export function removeQueuedCard(queue: readonly RpsHand[], index: number): RpsHand[] {
  return queue.filter((_, i) => i !== index);
}

export function revealSteps(round: RpsRoundResult): RevealStep[] {
  return round.clashes.map((clash, index) => ({
    clash: index,
    a: clash.a,
    b: clash.b,
    result: clash.result,
    surviving: clash.result === 'draw' ? null : clash.result,
  }));
}

export const nextRevealIndex = (current: number, total: number) => Math.min(total, current + 1);

