export const FARM_BEDS = [{ x: 11, y: 4 }, { x: 11, y: 7 }] as const;
export function isFarmCell({ x, y }: { x: number; y: number }): boolean {
  return FARM_BEDS.some(bed => x >= bed.x && x < bed.x + 2 && y >= bed.y && y < bed.y + 2);
}
export interface FarmCrop { id: string; plantedAt: string; readyAt: string; careCount: number; lastWateredOn: string | null }
export interface FarmPlot { index: number; revision: number; crop: FarmCrop | null }
export interface FarmSnapshot { serverNow: string; today: string; harvestCount: number; bestSize: number | null; lastHarvestSize: number | null; plots: FarmPlot[] }
export type FarmAction = 'plant' | 'water' | 'harvest';
export type FarmStage = 'empty' | 'sprout' | 'leaf' | 'fruit' | 'ripe';
export function farmStage(crop: FarmCrop | null, now: number): FarmStage {
  if (!crop) return 'empty';
  const planted = Date.parse(crop.plantedAt), ready = Date.parse(crop.readyAt);
  if (now >= ready) return 'ripe';
  const progress = (now - planted) / (ready - planted);
  return progress < .25 ? 'sprout' : progress < .75 ? 'leaf' : 'fruit';
}
export function farmDay(now: number): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function growthLabel(crop: FarmCrop, now: number): string {
  const minutes = Math.max(0, Math.ceil((Date.parse(crop.readyAt) - now) / 60000));
  if (minutes === 0) return '빨갛게 익었어요!';
  if (minutes < 60) return `수확까지 약 ${minutes}분`;
  if (minutes < 1440) return `수확까지 약 ${Math.ceil(minutes / 60)}시간`;
  return `수확까지 약 ${Math.ceil(minutes / 1440)}일`;
}

// --- Crop size (see supabase/migrations/20260918090000_pixel_farm_crop_size.sql — server mirrors
// this exact formula; keep both in sync). Care-record-driven but never deterministic: diligent
// watering raises the AVERAGE size without guaranteeing the biggest tomato, and missing a day
// never fails/kills the crop. version 1; a future formula gets its own exported function and
// version number rather than changing this one, so already-harvested crops keep their original
// size_calc_version and are never reinterpreted under a newer formula.
export const CROP_SIZE_CALC_VERSION = 1;
// Growth takes this many days (see the '+ interval 4 days' in pixel_private.farm_action's plant
// branch) — care ratio's denominator is capped here so it reads as "X of 4 days watered", not a
// calendar-boundary-sliver-dependent number. A crop still planted under an older, shorter growth
// duration (e.g. a legacy 24h crop already in flight when this shipped) keeps its own true,
// smaller denominator via the min() below — it is never judged against a duration it never had.
export const FARM_GROWTH_DAYS = 4;
// How many distinct Korea-time calendar days the crop's planted..ready window touches — the true
// upper bound on how many times it could have been watered (once/day, only while still growing),
// capped at FARM_GROWTH_DAYS.
export function maxCareDaysFor(plantedAt: string, readyAt: string): number {
  const startDay = Date.parse(`${farmDay(Date.parse(plantedAt))}T00:00:00Z`);
  const endDay = Date.parse(`${farmDay(Date.parse(readyAt))}T00:00:00Z`);
  return Math.min(FARM_GROWTH_DAYS, Math.max(1, Math.round((endDay - startDay) / 86400000) + 1));
}
export function cropCareRatio({ careCount, maxCareDays }: { careCount: number; maxCareDays: number }): number {
  return Math.min(1, careCount / Math.max(1, maxCareDays));
}
// luckRoll: pass rollLuck() (or the server's equivalent (random()+random()+random())/3) — a
// bell-shaped value centered on .5, not a flat 0..1 draw, so most harvests land near the "typical"
// outcome for their care ratio and only occasionally swing far from it.
export function rollLuck(random: () => number = Math.random): number {
  return (random() + random() + random()) / 3;
}
export function computeCropSize({ careCount, maxCareDays, luckRoll }: { careCount: number; maxCareDays: number; luckRoll: number }): number {
  const careRatio = cropCareRatio({ careCount, maxCareDays });
  const raw = 40 + careRatio * 30 + (luckRoll - 0.5) * 40;
  return Math.max(10, Math.min(100, Math.round(raw)));
}
export function sizeLabel(score: number): string {
  return score >= 90 ? '아주 큰 토마토' : score >= 70 ? '큰 토마토' : score >= 50 ? '보통 크기 토마토' : score >= 30 ? '작은 토마토' : '아주 작은 토마토';
}

// --- v2: watering stays the primary, easy-to-read driver (unchanged formula above); review
// activity only nudges the CHANCE of a small separate bonus, never added to size directly (see
// pixel_farm_4day_review_bonus migration for the full rationale and the exact server mirror).
// reviewGained is a snapshot-diff of profiles.bonus_points over the crop's own growth window — the
// only review signal in this schema that is exclusively server-written by real review activity
// (increment_bonus_points, called only from review combo/streak/daily-quest code), never by
// shop/gacha/admin credits (those use point_adjustment). No login-count or session-time signal is
// used, per instruction.
export const CROP_SIZE_CALC_VERSION_2 = 2;
export const REVIEW_RATIO_CAP = 50; // bonus_points gained over one 4-day window for reviewRatio=1
export const BONUS_CHANCE_BASE = 0.12;
export const BONUS_CHANCE_SPREAD = 0.28; // chance ranges 12% (no review activity) .. 40%
export function reviewRatioFor(reviewGained: number): number {
  return Math.min(1, Math.max(0, reviewGained) / REVIEW_RATIO_CAP);
}
export function bonusChanceFor(reviewRatio: number): number {
  return BONUS_CHANCE_BASE + reviewRatio * BONUS_CHANCE_SPREAD;
}
// bonusAmountRoll: pass rollLuck()-style input, i.e. (random()+random())/2 — bell-shaped 0..1.
export function computeBonusAmount(bonusAmountRoll: number): number {
  return Math.round(6 + bonusAmountRoll * 12); // 6..18, mean ~12
}
export function computeCropSizeV2({ careCount, maxCareDays, luckRoll, reviewGained, bonusRoll, bonusAmountRoll }:
  { careCount: number; maxCareDays: number; luckRoll: number; reviewGained: number; bonusRoll: number; bonusAmountRoll: number }): { size: number; bonusApplied: boolean } {
  const baseSize = computeCropSize({ careCount, maxCareDays, luckRoll });
  const chance = bonusChanceFor(reviewRatioFor(reviewGained));
  const bonusApplied = bonusRoll < chance;
  const bonusAmount = bonusApplied ? computeBonusAmount(bonusAmountRoll) : 0;
  return { size: Math.max(10, Math.min(100, baseSize + bonusAmount)), bonusApplied };
}
