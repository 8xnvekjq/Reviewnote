// 서버 계약의 경험치 표시 계산.
export const MAX_LEVEL = 100;
export function levelForXp(value: number) {
  let xpIntoLevel = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  let level = 1;
  while (level < MAX_LEVEL && xpIntoLevel >= 50 + 10 * (level - 1)) {
    xpIntoLevel -= 50 + 10 * (level - 1); level++;
  }
  return { level, xpIntoLevel, xpForNext: level === MAX_LEVEL ? 0 : 50 + 10 * (level - 1), isMax: level === MAX_LEVEL };
}
export const fishingPerkText = (level: number) => `낚시 난이도 −${Math.min(Math.max(level - 1, 0), 50)}%`;
export const fishXpDisplay = (rarity: 'common' | 'uncommon' | 'rare' | 'legendary', trophy = false) =>
  ({ common: 5, uncommon: 10, rare: 25, legendary: 60 }[rarity]) + (trophy ? 15 : 0);
export const harvestXpDisplay = () => 40;
