import type { PixelItem } from './types';
export interface RodEquipment { id: string | null; tier: number }
// 효과는 설명용이며 실제 판정에는 서버가 돌려준 난이도와 속도만 사용한다.
export const RODS = [
  { itemId: 'rod_bamboo', displayName: '대나무 낚싯대', price: 80, tier: 1, difficultyDown: .3, rareBonus: 0, speed: 1, color: 0x8cab62 },
  { itemId: 'rod_steel', displayName: '강철 낚싯대', price: 200, tier: 2, difficultyDown: .5, rareBonus: 0, speed: 1.15, color: 0x9ca6ad },
  { itemId: 'rod_lucky', displayName: '행운의 낚싯대', price: 400, tier: 3, difficultyDown: .5, rareBonus: 5, speed: 1.25, color: 0x557c4c },
  { itemId: 'rod_gold', displayName: '황금 낚싯대', price: 700, tier: 4, difficultyDown: .8, rareBonus: 8, speed: 1.35, color: 0xedcd75 },
] as const;
export const ROD_CATALOG: readonly PixelItem[] = RODS.map(rod => ({ itemId: rod.itemId, displayName: rod.displayName, price: rod.price, tier: rod.tier, category: 'rod', slot: 'rod', assetKey: rod.itemId, stackable: false }));
export function rodDisplay(rod?: RodEquipment | null) {
  return RODS.find(entry => entry.itemId === rod?.id) ?? { itemId: 'rod_basic', displayName: '기본 낚싯대', tier: 0, color: 0xd3a46b };
}
export function rodEffectText(id: string) {
  const rod = RODS.find(entry => entry.itemId === id);
  return rod ? `난이도 −${rod.difficultyDown.toFixed(1)} · 희귀 물고기 +${rod.rareBonus}% · 낚시 속도 +${Math.round((rod.speed - 1) * 100)}%` : '';
}
