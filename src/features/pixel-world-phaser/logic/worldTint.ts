import type { FishPhase, FishWeather } from '../ui/fishingAdapter';
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
// 서버 시계가 합쳐지기 전 사용하는 KST 시각 대체값.
export function fallbackWorldTime(now = new Date()): { phase: FishPhase; weather: FishWeather } {
  const kst = new Date(now.getTime() + 9 * 3600000);
  const hour = kst.getUTCHours();
  const date = kst.toISOString().slice(0, 10);
  let hash = 0; for (const c of date) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) | 0;
  const bucket = (hash >>> 0) % 100;
  return { phase: hour >= 20 || hour < 6 ? 'night' : hour >= 17 ? 'evening' : hour >= 11 ? 'day' : 'morning', weather: bucket < 25 ? 'rain' : bucket < 50 ? 'cloudy' : 'clear' };
}
