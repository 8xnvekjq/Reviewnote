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
/** 진동이 없는 태블릿용: 물고기가 원 안에 있는 동안 릴 "따르르륵" 소리. 게이지가 찰수록 빨라진다(120ms → 55ms). */
export const reelClickInterval = (progress: number) => Math.round(120 - 65 * Math.max(0, Math.min(1, progress)));
export function decideReelClick(lastClick: number, now: number, active: boolean, inZone: boolean, progress: number): { lastClick: number; click: boolean } {
  if (!active || !inZone) return { lastClick: -Infinity, click: false };
  const click = now - lastClick >= reelClickInterval(progress);
  return { lastClick: click ? now : lastClick, click };
}
export function vibrate(command: number | null) {
  if (HAPTICS_ENABLED && command !== null && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(command);
}
