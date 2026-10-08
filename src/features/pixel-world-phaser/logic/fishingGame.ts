import type { CastStart } from '../ui/fishingAdapter';

export type FishingPhase = 'idle' | 'casting' | 'waiting' | 'bite' | 'reeling' | 'landed' | 'tooEarly' | 'missed' | 'cancelled';
export interface FishingGame {
  phase: FishingPhase;
  cast: Extract<CastStart, { ok: true }> | null;
  startedAt: number;
  biteAt: number;
  deadline: number;
  castDurationMs: number;
  nibbles: readonly number[];
  nibble: number;
}
export const idleFishingGame = (): FishingGame => ({ phase: 'idle', cast: null, startedAt: 0, biteAt: 0, deadline: 0, castDurationMs: 0, nibbles: [], nibble: -1 });
export const fishingActive = (game: FishingGame) => ['casting', 'waiting', 'bite', 'reeling'].includes(game.phase);

// 실제 시각으로 판정하므로 렌더링 속도와 무관하다. 빌린 오리는 보너스가 없다.
export function startFishingGame(cast: CastStart, _pet: string | null, now: number, firstEver = false): FishingGame {
  if (!cast.ok) return idleFishingGame();
  const delay = Math.max(0, cast.biteDelayMs);
  const castDurationMs = Math.min(450, delay * 0.2);
  const span = delay - castDurationMs;
  const nibbles = cast.pattern === 'quick' ? [] : cast.pattern === 'double'
    ? [castDurationMs + span * 0.25, castDurationMs + span * 0.25 + Math.min(500, span * 0.35)]
    : [castDurationMs + span * 0.25];
  const windowMs = 900 * (firstEver ? 2 : 1);
  return { phase: 'casting', cast, startedAt: now, biteAt: now + delay, deadline: now + delay + windowMs, castDurationMs, nibbles, nibble: -1 };
}
export function tickFishingGame(game: FishingGame, now: number): FishingGame {
  if (!fishingActive(game) || game.phase === 'reeling') return game;
  if (now > game.deadline) return { ...game, phase: 'missed', nibble: -1 };
  if (now >= game.biteAt) return { ...game, phase: 'bite', nibble: -1 };
  const elapsed = now - game.startedAt;
  const nibble = game.nibbles.findIndex(at => elapsed >= at && elapsed < at + 160);
  return { ...game, phase: elapsed < game.castDurationMs ? 'casting' : 'waiting', nibble };
}
export function reelFishingGame(game: FishingGame, now: number): FishingGame {
  if (!fishingActive(game) || game.phase === 'reeling') return game;
  const next = tickFishingGame(game, now);
  return { ...next, phase: now < game.biteAt ? 'tooEarly' : now <= game.deadline ? 'reeling' : 'missed', nibble: -1 };
}
export function cancelFishingGame(game: FishingGame): FishingGame {
  return fishingActive(game) ? { ...game, phase: 'cancelled', nibble: -1 } : game;
}
