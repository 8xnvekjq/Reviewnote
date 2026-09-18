export const FARM_BEDS = [{ x: 11, y: 4 }, { x: 11, y: 7 }] as const;
export function isFarmCell({ x, y }: { x: number; y: number }): boolean {
  return FARM_BEDS.some(bed => x >= bed.x && x < bed.x + 2 && y >= bed.y && y < bed.y + 2);
}
// The scarecrow guide stands just above the first plot — a fixed, solid decoration (same "treat
// as a wall" treatment as the beds themselves), not a walkable/passable tile.
// - y=3 is deliberately OUTSIDE the dog's yard roaming box (yardDogWorld restricts it to y 4-9):
//   an earlier attempt placed the scarecrow inside that box, in the gap between the two beds
//   (y=6), which combined with the beds' own 2x2 cutouts narrowed the dog's remaining paths enough
//   to fail "dog retains two-cell-wide routes..." for a player standing at either approach cell.
//   Standing above the roaming box entirely sidesteps that whole class of bottleneck.
// - x=11 keeps the speech bubble's box (~150px wide, see Scarecrow.tsx/farm.css) clear of both
//   board edges even on a 320px-wide mobile viewport; what actually fixed "hidden behind the crop"
//   for the bubble itself is its z-index escaping the scarecrow's row-based stacking context (see
//   Scarecrow.tsx) — the exact x/y here is about board-edge clearance and dog mobility, not that.
export const SCARECROW_CELL = { x: 11, y: 3 } as const;
export interface FarmCrop {
  id: string; plantedAt: string; readyAt: string; careCount: number; lastWateredOn: string | null;
  // Live, forward-looking estimate — a snapshot-diff of profiles.bonus_points computed by the
  // server on every fetch (see get_pixel_farm()), not a stored column. It can only ever move up
  // while the crop is still growing (bonus_points itself only decreases if a review is reverted),
  // and the number actually LOCKED IN at harvest is computed fresh at that moment regardless of
  // what this live estimate said a moment earlier — this field is purely an in-progress hint.
  reviewGained: number;
}
export interface FarmPlot { index: number; revision: number; crop: FarmCrop | null }
export type FarmCropStatus = 'stored' | 'submitted';
// One collection entry — a harvested pixel_farm_crops row, read directly (existing SELECT grant +
// RLS, see 20260920090000_pixel_farm_crop_collection.sql). id doubles as the link back to that
// row's own size_inputs/size_calc_version for later audit, even though this view doesn't show them.
export interface HarvestedCrop {
  id: string; cropType: string; sizeScore: number; harvestedAt: string; careCount: number;
  status: FarmCropStatus; submittedAt: string | null; rewardPoints: number | null;
}
// The plaza exhibit/leaderboard — this KST week's (Mon 00:00 - next Mon 00:00) best submitted size
// per student, ranked. Resolved entirely server-side (get_weekly_crop_contest) with only a safe
// display label per entry (same COALESCE(nickname, display_name) the weekly review leaderboard
// already shows cross-student) — never a raw user id/email, never another student's review/mistake
// data. Ties share the same rank (RANK(), not ROW_NUMBER()) rather than being split by submission
// order — see weeklyRankLabel below for how that's surfaced as "공동 N위".
export interface WeeklyCropRankEntry { rank: number; sizeScore: number; submitterLabel: string }
export interface WeeklyCropContest {
  weekStart: string;
  top: WeeklyCropRankEntry[];
  // null sizeScore/rank means "haven't submitted anything this week yet" — participantCount still
  // reflects everyone else's turnout, so "0 submissions this week" and "you're just not in it yet"
  // read differently instead of collapsing to the same blank state.
  mine: { sizeScore: number | null; rank: number | null; participantCount: number };
}
// "2위" normally, "공동 2위" when another entry shares the same rank — computed client-side from the
// already-fetched list (the server just emits RANK()'s raw integer; ties are a display concern).
export function weeklyRankLabel(rank: number, allRanks: number[]): string {
  const tied = allRanks.filter(r => r === rank).length > 1;
  return `${tied ? '공동 ' : ''}${rank}위`;
}
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
function farmDaysBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86400000);
}
// Soil moisture — a pure display/judgment-call layer, not a new scoring axis: it never changes how
// size is computed (careCount/careRatio, unchanged, still drives that). Derived entirely from data
// already on the crop (lastWateredOn, plantedAt) — no new server storage. Day-granularity on
// purpose (matches the existing once/day watering cadence) rather than an hour-by-hour countdown a
// player would have to learn: freshly planted or watered TODAY reads as moist; one day without
// water is still fine ("normal"); two or more days makes the soil visibly dry — a nudge to go
// water, never a threat (a dry crop still grows and can still be harvested normally).
export type FarmMoisture = 'dry' | 'normal' | 'moist';
export function farmMoisture(crop: FarmCrop | null, now: number): FarmMoisture {
  if (!crop) return 'normal';
  const today = farmDay(now);
  const anchor = crop.lastWateredOn ?? farmDay(Date.parse(crop.plantedAt));
  const daysSince = farmDaysBetween(anchor, today);
  return daysSince <= 0 ? 'moist' : daysSince === 1 ? 'normal' : 'dry';
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
// Korea-time calendar date for display in the crop collection — independent of device timezone,
// same convention as farmDay().
export function formatHarvestDate(harvestedAt: string): string {
  const [, month, day] = farmDay(Date.parse(harvestedAt)).split('-');
  return `${Number(month)}월 ${Number(day)}일`;
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

// --- Submission (see supabase/migrations/20260921100000_pixel_farm_crop_submission.sql — server
// mirrors this exact formula; keep both in sync). A flat base plus a size-proportional top-up, so a
// bigger tomato is worth visibly more without turning farming into the main point source: at the
// shop's own price scale (25P cheapest top/planter .. 120P hair/furniture .. 200P dog/bed), one
// harvest is worth a fraction of the cheapest item, not a free expensive one.
export const FARM_SUBMIT_BASE_POINTS = 10;
export const FARM_SUBMIT_SIZE_MULTIPLIER = 0.4; // size 10..100 -> +4..+40
export function computeSubmitReward(sizeScore: number): number {
  return FARM_SUBMIT_BASE_POINTS + Math.round(sizeScore * FARM_SUBMIT_SIZE_MULTIPLIER);
}
