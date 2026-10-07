// 세계 시계(KST)와 하루 날씨 — supabase/migrations/supabase_pixel_fishing.sql의 pixel_private.fish_clock과 같은 규칙.
// 서버가 기준이다. 이 파일은 첫 응답이 오기 전 화면 색감과 목(mock) 어댑터에만 쓴다.
import type { FishingOverride, FishPhase, FishWeather } from '../ui/fishingAdapter';

export interface WorldClock { kstDate: string; phase: FishPhase; weather: FishWeather; minutes: number }

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const CLOCK_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const WEATHERS: readonly FishWeather[] = ['clear', 'cloudy', 'rain'];

/** FNV-1a 32비트(UTF-8 바이트 기준). SQL의 pixel_private.fish_fnv1a와 같은 값. */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  return h >>> 0;
}

/** 날짜 문자열(YYYY-MM-DD) 하나에 날씨 하나: 해시 % 100 이 0–24 비, 25–49 흐림, 나머지 맑음. */
export function weatherForDate(kstDate: string): FishWeather {
  const roll = fnv1a32(kstDate) % 100;
  return roll < 25 ? 'rain' : roll < 50 ? 'cloudy' : 'clear';
}

/** 아침 06–11, 낮 11–17, 저녁 17–20, 밤 20–06 (KST 시각, 하루 중 분 단위). */
export function phaseForMinutes(minutes: number): FishPhase {
  const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  if (m >= 360 && m < 660) return 'morning';
  if (m >= 660 && m < 1020) return 'day';
  if (m >= 1020 && m < 1200) return 'evening';
  return 'night';
}

export function kstParts(now: number | Date): { kstDate: string; minutes: number } {
  const shifted = new Date((typeof now === 'number' ? now : now.getTime()) + KST_OFFSET_MS);
  return { kstDate: shifted.toISOString().slice(0, 10), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

export function parseClock(text: string | null | undefined): number | null {
  const m = typeof text === 'string' ? CLOCK_RE.exec(text) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export const isFishWeather = (value: unknown): value is FishWeather => WEATHERS.includes(value as FishWeather);

/** 지금 시각의 세계 시계. 덮어쓰기는 관리자 시험용이며, 날짜(하루 낚시 횟수)는 덮어쓰지 않는다. */
export function worldClockAt(now: number | Date, override?: FishingOverride | null): WorldClock {
  const parts = kstParts(now);
  const minutes = parseClock(override?.clock) ?? parts.minutes;
  const weather = isFishWeather(override?.weather) ? override.weather : weatherForDate(parts.kstDate);
  return { kstDate: parts.kstDate, minutes, phase: phaseForMinutes(minutes), weather };
}

/** `?pwClock=21:30&pwWeather=rain` 읽기. 관리자일 때만 호출하는 쪽에서 쓴다(서버도 관리자만 받아 준다). */
export function parseClockOverride(search: string | URLSearchParams | null | undefined): FishingOverride | null {
  let params: URLSearchParams;
  try { params = typeof search === 'string' || search == null ? new URLSearchParams(search ?? '') : search; }
  catch { return null; }
  const clock = params.get('pwClock');
  const weather = params.get('pwWeather');
  const out: FishingOverride = {};
  if (parseClock(clock) != null) out.clock = clock!;
  if (isFishWeather(weather)) out.weather = weather;
  return out.clock || out.weather ? out : null;
}
