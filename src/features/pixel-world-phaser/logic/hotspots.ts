// 알비온식 자유 낚시(2026-10-11 선생님 결정)의 공통 약속.
// - 물가·부두 어디서든 바라보는 쪽 물로 찌를 던진다. 누르고 있는 동안 힘이 차고, 떼면 그 세기만큼 멀리 날아간다.
// - 물고기 그림자 대신 '물고기 떼' 포인트(원)가 있다. 원 안에 찌가 떨어지면 희귀 물고기·대물 확률이 오른다.
// - 한 포인트에서 3마리를 낚으면(원 안 물고기 그림자가 하나씩 줄어든다) 그 포인트는 잠깐 사라졌다가(효과도 꺼짐) 몇 분 뒤 같은 자리에 다시 생긴다.
//   남은 마리 수·다시 생기는 시각은 서버가 학생마다 따로 정한다(get_pixel_fishing_state의 spots).
import type { Point } from './joystick';

/** 포인트 위치(타일 좌표, 원 중심 = 타일 중심). id는 서버와 같은 0부터의 번호. */
export const HOTSPOTS: readonly { id: number; cell: Point }[] = [
  { id: 0, cell: { x: 15, y: 5 } },
  { id: 1, cell: { x: 21, y: 10 } },
  { id: 2, cell: { x: 20, y: 17 } },
  { id: 3, cell: { x: 12, y: 15 } },
];
/** 원 반지름(px). 찌가 이 안에 떨어지면 포인트 효과. */
export const HOTSPOT_RADIUS = 22;
/** 던지기: 힘 0..1 → 거리(px). 최소 1.5칸, 최대 7칸. 바라보는 방향(상하좌우)으로 날아간다. */
export const CAST_MIN_PX = 24;
export const CAST_MAX_PX = 112;
/** 힘은 누르고 있는 동안 0→1→0으로 오르내린다(한 번 왕복 1.6초) — 알맞은 순간에 떼야 한다. */
export const CAST_CHARGE_PERIOD_MS = 1600;
export const castPower = (heldMs: number) => {
  const t = (Math.max(0, heldMs) % CAST_CHARGE_PERIOD_MS) / CAST_CHARGE_PERIOD_MS;
  return t < .5 ? t * 2 : 2 - t * 2;
};
export const castDistance = (power: number) => CAST_MIN_PX + Math.max(0, Math.min(1, power)) * (CAST_MAX_PX - CAST_MIN_PX);
/** 찌가 떨어진 점이 어느 포인트 원 안인지(없으면 null). 활성 여부는 따로 본다. */
export function hotspotAt(point: Point, tile = 16): number | null {
  for (const spot of HOTSPOTS) {
    const cx = spot.cell.x * tile + tile / 2, cy = spot.cell.y * tile + tile / 2;
    if (Math.hypot(point.x - cx, point.y - cy) <= HOTSPOT_RADIUS) return spot.id;
  }
  return null;
}


import { SECRET_SPOT_IDS } from './petRide';
import type { SecretSpotId } from './petRide';
import type { FishPhase, FishWeather } from '../ui/fishingAdapter';
export const SECRET_SPOT_RADIUS = 18;
export const SECRET_SPOTS: readonly { id: SecretSpotId; cell: Point; speciesId: string; hint: string }[] = [
  { id: SECRET_SPOT_IDS[0], cell: { x: 28, y: 5 }, speciesId: 'eddy_dragon', hint: '깊은 소용돌이 아래 거대한 그림자가 돌아요.' },
  { id: SECRET_SPOT_IDS[1], cell: { x: 29, y: 11 }, speciesId: 'bridge_moon_eel', hint: '밤에 오래된 다리 그늘에서 무언가 움직여요.' },
  { id: SECRET_SPOT_IDS[2], cell: { x: 28, y: 17 }, speciesId: 'rain_reed_koi', hint: '비가 오면 외딴 갈대 곁에서 은빛 물결이 일어요.' },
];
export function secretSpotAt(point: Point): SecretSpotId | null {
  return SECRET_SPOTS.find(s => Math.hypot(point.x - (s.cell.x * 16 + 8), point.y - (s.cell.y * 16 + 8)) <= SECRET_SPOT_RADIUS)?.id ?? null;
}
export function secretSpotAvailable(id: string | null | undefined, phase: FishPhase, weather: FishWeather): boolean {
  return id === 'secret_whirlpool' || (id === 'secret_bridge_shade' && phase === 'night') || (id === 'secret_reed_isle' && weather === 'rain');
}
const seenKey = 'pixelWorld:seenSecretSpots';
export function rememberSecretSpot(id: SecretSpotId): void {
  try { const seen = seenSecretSpots(); if (!seen.includes(id)) localStorage.setItem(seenKey, JSON.stringify([...seen, id])); } catch { /* Storage may be disabled. */ }
}
export function seenSecretSpots(): SecretSpotId[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(seenKey) ?? '[]'); return Array.isArray(value) ? SECRET_SPOT_IDS.filter(id => value.includes(id)) : []; } catch { return []; }
}
