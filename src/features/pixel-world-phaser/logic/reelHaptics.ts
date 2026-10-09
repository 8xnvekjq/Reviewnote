import type { ReelGame } from './reelGame';
export const HAPTICS_ENABLED = true;
export const HAPTIC_INTERVAL_MS = 180;
export const HAPTIC_PULSE_MS = 15;
export interface HapticState { inZone: boolean; active: boolean; lastPulse: number }
export const idleHaptics = (): HapticState => ({ inZone: false, active: false, lastPulse: -Infinity });
export const reelInZone = (game: ReelGame) => Math.hypot(game.zoneX - game.fishX, game.zone - game.fish) <= game.zoneSize;
export function decideHaptics(state: HapticState, now: number, active: boolean, inZone: boolean): { state: HapticState; command: number | null } {
  const inside = active && inZone;
  const pulse = inside && now - state.lastPulse >= HAPTIC_INTERVAL_MS;
  const stop = (state.inZone && !inside) || (state.active && !active);
  return { state: { active, inZone: inside, lastPulse: pulse ? now : state.lastPulse }, command: stop ? 0 : pulse ? HAPTIC_PULSE_MS : null };
}
export function vibrate(command: number | null) {
  if (HAPTICS_ENABLED && command !== null && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(command);
}
