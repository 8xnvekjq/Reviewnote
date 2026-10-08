// 물고기 12종 — 서버 시드(supabase/migrations/supabase_pixel_fishing.sql)와 똑같아야 한다(단위 테스트가 대조).
// 화면 표시용. 실제로 무엇이 잡힐지는 서버가 정한다.
import type { FishPhase, FishRarity, FishShadow, FishWeather } from '../ui/fishingAdapter';
export interface FishSpecies { id: string; name: string; rarity: FishRarity; phases: readonly FishPhase[] | 'any'; weather: readonly FishWeather[] | 'any'; minCm: number; maxCm: number; shadow: FishShadow }
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
];
export const RARITY_WEIGHT: Readonly<Record<FishRarity, number>> = { common: 60, uncommon: 28, rare: 10, legendary: 2 };
export const RARITY_STARS: Readonly<Record<FishRarity, number>> = { common: 1, uncommon: 2, rare: 3, legendary: 4 };
export const DAILY_CATCHES = 6;
export const fishById = (id: string): FishSpecies | undefined => FISH_CATALOG.find(f => f.id === id);
