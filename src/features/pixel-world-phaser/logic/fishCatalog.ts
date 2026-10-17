// 물고기 14종(2026-10-11 상어·고래 추가) — 서버 시드(supabase/migrations/supabase_pixel_fishing.sql)와 똑같아야 한다(단위 테스트가 대조).
// 화면 표시용. 실제로 무엇이 잡힐지는 서버가 정한다.
import type { SecretSpotId } from './petRide';
import type { FishPhase, FishRarity, FishShadow, FishWeather, JunkId } from '../ui/fishingAdapter';
export interface FishSpecies { id: string; name: string; rarity: FishRarity; phases: readonly FishPhase[] | 'any'; weather: readonly FishWeather[] | 'any'; minCm: number; maxCm: number; shadow: FishShadow; secretSpot?: SecretSpotId }
export const FISH_CATALOG: readonly FishSpecies[] = [
  { id: 'pirami', name: '피라미', rarity: 'common', phases: 'any', weather: 'any', minCm: 6, maxCm: 12, shadow: 'S' },
  { id: 'buri', name: '붕어', rarity: 'common', phases: 'any', weather: 'any', minCm: 10, maxCm: 25, shadow: 'M' },
  { id: 'minnow', name: '송사리', rarity: 'common', phases: ['morning', 'day'], weather: 'any', minCm: 2, maxCm: 4, shadow: 'S' },
  { id: 'catfish_small', name: '동자개', rarity: 'uncommon', phases: ['evening', 'night'], weather: 'any', minCm: 12, maxCm: 25, shadow: 'M' },
  { id: 'carp', name: '잉어', rarity: 'uncommon', phases: 'any', weather: 'any', minCm: 30, maxCm: 70, shadow: 'L' },
  { id: 'mandarin', name: '쏘가리', rarity: 'uncommon', phases: ['day', 'evening'], weather: ['clear', 'cloudy'], minCm: 20, maxCm: 45, shadow: 'M' },
  { id: 'eel', name: '뱀장어', rarity: 'rare', phases: ['night'], weather: 'any', minCm: 40, maxCm: 90, shadow: 'L' },
  { id: 'catfish', name: '메기', rarity: 'rare', phases: ['evening', 'night'], weather: ['rain'], minCm: 30, maxCm: 80, shadow: 'L' },
  { id: 'goby', name: '꺽지', rarity: 'uncommon', phases: ['morning', 'day'], weather: 'any', minCm: 10, maxCm: 20, shadow: 'S' },
  { id: 'trout', name: '산천어', rarity: 'rare', phases: ['morning'], weather: ['clear'], minCm: 20, maxCm: 35, shadow: 'M' },
  { id: 'moonfish', name: '달빛 피라미', rarity: 'legendary', phases: ['night'], weather: ['clear'], minCm: 8, maxCm: 14, shadow: 'S' },
  { id: 'rainbow_koi', name: '무지개 잉어', rarity: 'legendary', phases: 'any', weather: ['rain'], minCm: 40, maxCm: 80, shadow: 'L' },
  // 별 5개(mythic): 실제 크기, 릴에서 힘이 세다(위아래로 크게). 아이콘 시트 13·14번째 칸.
  { id: 'shark', name: '상어', rarity: 'mythic', phases: ['evening', 'night'], weather: 'any', minCm: 120, maxCm: 400, shadow: 'L' },
  { id: 'whale', name: '고래', rarity: 'mythic', phases: ['morning', 'day'], weather: ['clear', 'cloudy'], minCm: 500, maxCm: 1500, shadow: 'L' },
  { id: 'eddy_dragon', name: '소용돌이 용어', rarity: 'mythic', phases: 'any', weather: 'any', minCm: 180, maxCm: 600, shadow: 'L', secretSpot: 'secret_whirlpool' },
  { id: 'bridge_moon_eel', name: '그늘 달장어', rarity: 'legendary', phases: ['night'], weather: 'any', minCm: 60, maxCm: 140, shadow: 'L', secretSpot: 'secret_bridge_shade' },
  { id: 'rain_reed_koi', name: '빗방울 갈대잉어', rarity: 'legendary', phases: 'any', weather: ['rain'], minCm: 35, maxCm: 85, shadow: 'M', secretSpot: 'secret_reed_isle' },
];
/** 잡동사니 — 물고기 대신 가끔 걸린다(던지기의 약 6%). 아이콘은 assets/fishing/junk-icons.png 순서. */
export const JUNK_CATALOG: readonly { id: JunkId; name: string }[] = [
  { id: 'junk_shoe', name: '헌 신발' },
  { id: 'junk_can', name: '빈 깡통' },
  { id: 'junk_coin', name: '녹슨 동전' },
];
export const RARITY_WEIGHT: Readonly<Record<FishRarity, number>> = { common: 60, uncommon: 28, rare: 10, legendary: 2, mythic: 0.5 };
export const RARITY_STARS: Readonly<Record<FishRarity, number>> = { common: 1, uncommon: 2, rare: 3, legendary: 4, mythic: 5 };
export const DAILY_CATCHES = 6;
export const fishById = (id: string): FishSpecies | undefined => FISH_CATALOG.find(f => f.id === id);
