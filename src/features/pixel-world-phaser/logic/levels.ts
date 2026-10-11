/** 서버의 누적 경험치 곡선과 같은 계산(supabase/migrations/20261012100000_pixel_level_tracks.sql). 최대 레벨 뒤에도 경험치는 쌓인다. */
export const MAX_LEVEL = 100;
export const FISH_XP = { common: 5, uncommon: 10, rare: 25, legendary: 60, mythic: 120 } as const;
export const TROPHY_XP = 15;
export const HARVEST_XP = 40;
export const BAIT_PRICE = 50;
export const BAIT_CHARGES = 100;
/** 레벨은 활동마다 따로 쌓인다: 물고기·잡동사니 → 낚시, 수확 → 농사, 곤충 → 채집. */
export type LevelTrack = 'fishing' | 'farming' | 'gathering';
export const LEVEL_TRACKS: readonly LevelTrack[] = ['fishing', 'farming', 'gathering'];
export const TRACK_INFO: Record<LevelTrack, { label: string; icon: string }> = {
  fishing: { label: '낚시', icon: '🎣' }, farming: { label: '농사', icon: '🌱' }, gathering: { label: '채집', icon: '🦋' },
};
export interface TrackLevel { xp: number; level: number; xpIntoLevel: number; xpForNext: number }
/** 맨 위 값은 낚시 레벨(낚시 화면이 그대로 쓴다). tracks에 세 활동이 모두 있다. */
export interface PlayerLevel extends TrackLevel { maxLevel: number; tracks: Record<LevelTrack, TrackLevel> }
export interface XpGain { gained: number; xp: number; level: number; leveledUp: boolean; track: LevelTrack }

export function nonnegativeInteger(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
}
export function parseXpGain(raw: unknown): XpGain | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const gained = nonnegativeInteger(r.gained), xp = nonnegativeInteger(r.xp), level = nonnegativeInteger(r.level);
  // 예전 서버 응답(track 없음)은 낚시로 본다.
  const track = r.track === undefined ? 'fishing' : LEVEL_TRACKS.find(t => t === r.track);
  return gained !== undefined && xp !== undefined && level !== undefined && level >= 1 && level <= MAX_LEVEL && typeof r.leveledUp === 'boolean' && track
    ? { gained, xp, level, leveledUp: r.leveledUp, track } : undefined;
}

/** Lv1→2는 50 XP, 그 뒤로 레벨마다 12%씩 늘어난다(정수 내림 — 서버와 소수 오차 없이 같다). */
export function levelForXp(xp: number) {
  let remaining = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let level = 1, need = 50;
  while (level < MAX_LEVEL && remaining >= need) {
    remaining -= need;
    level++;
    need = Math.floor(need * 112 / 100);
  }
  return { level, xpIntoLevel: remaining, xpForNext: level === MAX_LEVEL ? 0 : need, isMax: level === MAX_LEVEL };
}
export function trackLevel(xp: number): TrackLevel {
  const l = levelForXp(xp);
  return { xp: Math.max(0, Math.floor(xp)), level: l.level, xpIntoLevel: l.xpIntoLevel, xpForNext: l.xpForNext };
}
export function playerLevelFromXp(xp: Partial<Record<LevelTrack, number>> = {}): PlayerLevel {
  const tracks = Object.fromEntries(LEVEL_TRACKS.map(t => [t, trackLevel(xp[t] ?? 0)])) as Record<LevelTrack, TrackLevel>;
  return { ...tracks.fishing, maxLevel: MAX_LEVEL, tracks };
}
/** 지급 결과를 그 활동에만 반영한다(맨 위 값은 낚시). */
export function applyXpGain(value: PlayerLevel, gain: XpGain): PlayerLevel {
  const tracks = { ...value.tracks, [gain.track]: trackLevel(gain.xp) };
  return { ...tracks.fishing, maxLevel: value.maxLevel, tracks };
}

/** 낚싯대 적용 뒤 레벨과 미끼를 반영한다. 전설은 항상 난이도 4 이상. */
export function levelBaitDifficulty(afterRod: number, level: number, legendary: boolean, bait = false): number {
  const reduction = Math.min(Math.max(0, level - 1), legendary ? 15 : 50) / 100;
  return Math.round(Math.max(legendary ? 4 : 1, afterRod * (1 - reduction) - (bait ? 0.3 : 0)) * 100) / 100;
}
export const hardFishChance = (rareBonus: number, bait = false): number => bait ? Math.min(60, (15 + rareBonus) * 2) : 15 + rareBonus;

export const fishingPerkText = (level: number) => `낚시 난이도 −${Math.min(Math.max(level - 1, 0), 50)}%`;
/** 레벨 효과 — 지금은 낚시만 있다. 농사·채집 효과는 다음 단계에서. */
export const trackPerkText = (track: LevelTrack, level: number) => track === 'fishing' ? fishingPerkText(level) : `${TRACK_INFO[track].label} 레벨 효과는 곧 추가돼요`;
export const fishXpDisplay = (rarity: 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythic', trophy = false) =>
  FISH_XP[rarity] + (trophy ? TROPHY_XP : 0);
export const harvestXpDisplay = () => HARVEST_XP;
