import type { FishingOverride, FishPhase, FishWeather } from '../ui/fishingAdapter';
import { worldClockAt } from './worldClock';
export type { FishPhase, FishWeather } from '../ui/fishingAdapter';
export interface TintParameters { color: number; alpha: number; lightRadius: number; rainDrops: number; shadowColor: number }
export function worldTint(phase: FishPhase, weather: FishWeather): TintParameters {
  const base = {
    morning: { color: 0xffdf9c, alpha: 0.06, lightRadius: 0, shadowColor: 0x244e59 },
    day: { color: 0xffffff, alpha: 0, lightRadius: 0, shadowColor: 0x193d49 },
    evening: { color: 0xe88b52, alpha: 0.18, lightRadius: 0, shadowColor: 0x463c50 },
    night: { color: 0x101e50, alpha: 0.55, lightRadius: 48, shadowColor: 0x0a1935 },
  }[phase];
  return { ...base, color: phase === 'day' && weather !== 'clear' ? 0x728aa3 : base.color, alpha: Math.min(0.68, base.alpha + (weather === 'clear' ? 0 : weather === 'rain' ? 0.13 : 0.08)), rainDrops: weather === 'rain' ? 36 : 0 };
}
// 서버 응답(get_pixel_fishing_state)이 오기 전이나 오래됐을 때 쓰는 화면 시계 — SQL과 같은 규칙(logic/worldClock.ts).
// 관리자 시험용 덮어쓰기(?pwClock/?pwWeather)도 같은 방식으로 반영한다.
export function fallbackWorldTime(now: number | Date = Date.now(), override?: FishingOverride | null): { phase: FishPhase; weather: FishWeather } {
  const { phase, weather } = worldClockAt(now, override);
  return { phase, weather };
}
/** 서버가 알려 준 시각은 이만큼만 믿고, 그 뒤로는 같은 규칙의 클라이언트 시계로 넘어간다(오래 켜 둔 화면에서 밤이 안 오는 일 방지). */
export const SERVER_TIME_TRUST_MS = 5 * 60 * 1000;
