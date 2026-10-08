/** 서버의 누적 경험치 곡선과 같은 계산. 최대 레벨 뒤에도 경험치는 쌓인다. */
export const MAX_LEVEL = 100;
export const FISH_XP = { common: 5, uncommon: 10, rare: 25, legendary: 60 } as const;
export const TROPHY_XP = 15;
export const HARVEST_XP = 40;
export const BAIT_PRICE = 50;
export const BAIT_CHARGES = 100;
export interface PlayerLevel { xp: number; level: number; xpIntoLevel: number; xpForNext: number; maxLevel: number }
export interface XpGain { gained: number; xp: number; level: number; leveledUp: boolean }

export function nonnegativeInteger(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
}
export function parseXpGain(raw: unknown): XpGain | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const gained = nonnegativeInteger(r.gained), xp = nonnegativeInteger(r.xp), level = nonnegativeInteger(r.level);
  return gained !== undefined && xp !== undefined && level !== undefined && level >= 1 && level <= MAX_LEVEL && typeof r.leveledUp === 'boolean'
    ? { gained, xp, level, leveledUp: r.leveledUp } : undefined;
}

export function levelForXp(xp: number) {
  let remaining = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let level = 1;
  while (level < MAX_LEVEL && remaining >= 50 + 10 * (level - 1)) {
    remaining -= 50 + 10 * (level - 1);
    level++;
  }
  return { level, xpIntoLevel: remaining, xpForNext: level === MAX_LEVEL ? 0 : 50 + 10 * (level - 1), isMax: level === MAX_LEVEL };
}

/** 낚싯대 적용 뒤 레벨과 미끼를 반영한다. 전설은 항상 난이도 4 이상. */
export function levelBaitDifficulty(afterRod: number, level: number, legendary: boolean, bait = false): number {
  const reduction = Math.min(Math.max(0, level - 1), legendary ? 15 : 50) / 100;
  return Math.round(Math.max(legendary ? 4 : 1, afterRod * (1 - reduction) - (bait ? 0.3 : 0)) * 100) / 100;
}
export const hardFishChance = (rareBonus: number, bait = false): number => bait ? Math.min(60, (15 + rareBonus) * 2) : 15 + rareBonus;
