import { MAX_LEVEL, nonnegativeInteger, parseXpGain } from '../logic/levels';
import type { PlayerLevel, XpGain } from '../logic/levels';
export type { PlayerLevel, XpGain } from '../logic/levels';
// 낚시(강가의 하루) 서버 연결의 고정 계약. 모양은 docs/pixel-world/FISHING_SPEC.md를 따른다.
// 실제 Supabase 구현(createFishingAdapter)은 서버 작업에서 이 파일에 채운다.
import { worldClockAt } from '../logic/worldClock';
import { minReelMs } from '../logic/reelGame';
export type FishPhase = 'morning' | 'day' | 'evening' | 'night';
export type FishWeather = 'clear' | 'cloudy' | 'rain';
export type FishRarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type FishShadow = 'S' | 'M' | 'L';
export type BitePattern = 'quick' | 'double' | 'long';
export interface FishAlbumEntry { speciesId: string; count: number; bestCm: number; firstAt: string }
export type FishingRodId = 'rod_bamboo' | 'rod_steel' | 'rod_lucky' | 'rod_gold';
/** 장착한 낚싯대. id가 null이면 무료 기본 낚싯대(tier 0). */
export interface FishingRod { id: FishingRodId | null; tier: number }
export interface FishingRodSpec { id: FishingRodId; name: string; price: number; tier: number; difficultyDown: number; rareBonus: number; speed: number }
/** 상점 낚싯대 — supabase_pixel_fishing_v4.sql의 fish_rods·카탈로그와 같은 숫자(단위 테스트가 대조). rareBonus는 %p. */
export const FISHING_RODS: readonly FishingRodSpec[] = [
  { id: 'rod_bamboo', name: '대나무 낚싯대', price: 80, tier: 1, difficultyDown: 0.3, rareBonus: 0, speed: 1.0 },
  { id: 'rod_steel', name: '강철 낚싯대', price: 200, tier: 2, difficultyDown: 0.5, rareBonus: 0, speed: 1.15 },
  { id: 'rod_lucky', name: '행운의 낚싯대', price: 400, tier: 3, difficultyDown: 0.5, rareBonus: 5, speed: 1.25 },
  { id: 'rod_gold', name: '황금 낚싯대', price: 700, tier: 4, difficultyDown: 0.8, rareBonus: 8, speed: 1.35 },
];
/** 낚싯대를 장착하지 않았을 때(팔지 않음). */
export const BASIC_ROD = { name: '기본 낚싯대', tier: 0, difficultyDown: 0, rareBonus: 0, speed: 1 } as const;
export const NO_ROD: FishingRod = { id: null, tier: 0 };
export const rodSpec = (id: string | null | undefined): FishingRodSpec | undefined => FISHING_RODS.find(r => r.id === id);
/** 어려운 물고기 기본 확률(%). 낚싯대의 rareBonus(%p)를 더한다. */
export const HARD_FISH_PERCENT = 15;
/** 입질 대기 = round(기본 / speed). */
export const rodBiteDelayMs = (baseMs: number, speed: number): number => Math.round(baseMs / Math.max(1, speed));
/** 서버의 최소 끌어올리기 시간 = (1500 + (난이도-1)*375) / speed. */
export const rodMinReelMs = (difficulty: number, speed: number): number => minReelMs(difficulty) / Math.max(1, speed);
/** 최종 난이도 = max(1, min(5, 기본 + 대물 1.5) - 낚싯대 낮춤), 소수 둘째 자리. */
export const rodDifficulty = (base: number, difficultyDown: number, trophy = false): number =>
  Math.round(Math.max(1, Math.min(5, base + (trophy ? 1.5 : 0)) - difficultyDown) * 100) / 100;

export interface FishingState { kstDate: string; phase: FishPhase; weather: FishWeather; remaining: number; sparkleShadow: number | null; pigeonHint: string | null; album: FishAlbumEntry[]; rod: FishingRod; level?: PlayerLevel; bait?: { charges: number } }
/** rod·speed·trophy는 v4 서버부터 온다. 없으면 기본 낚싯대·속도 1·대물 아님으로 본다. */
export type CastStart = { ok: true; castId: string; shadow: FishShadow; biteDelayMs: number; difficulty?: number; big?: boolean; pattern: BitePattern; hint: 'sparkle' | null; rod?: FishingRod; speed?: number; trophy?: boolean; bait?: { used: boolean; charges: number } } | { ok: false; reason: 'budget' | 'pending' | 'error' };
export type EquipRodResult = { ok: true; rod: FishingRod } | { ok: false; reason: 'not_found' | 'not_owned' | 'error' };
export type CastFinish = { ok: true; landed: true; speciesId: string; lengthCm: number; rarity: FishRarity; isNew: boolean; isBig: boolean; isPersonalBest: boolean; remaining: number; xpGain?: XpGain } | { ok: true; landed: false } | { ok: false };
export interface ClassFishBoard { rows: { speciesId: string; lengthCm: number; animal: string; caughtAt: string; teacher?: boolean }[]; classSpecies: number }
export type BuyBaitResult = { ok: true; newBalance: number; charges: number } | { ok: false; reason: 'insufficient_balance' | 'error'; message?: string };
export interface FishingAdapter { buyBait?(): Promise<BuyBaitResult>; getLevel?(): Promise<PlayerLevel | null>; state(): Promise<FishingState>; start(pet: string | null): Promise<CastStart>; finish(castId: string, landed: boolean): Promise<CastFinish>; board(): Promise<ClassFishBoard>; /** 낚싯대 장착(null = 해제). 서버 RPC equip_pixel_rod. */ equipRod?(itemId: FishingRodId | null): Promise<EquipRodResult> }
/** 관리자 시험용 시계·날씨 덮어쓰기(관리자만 서버가 받아 준다). */
export interface FishingOverride { clock?: string; weather?: FishWeather }

// ── 실제 Supabase 구현 ──────────────────────────────────────────────────────────
// 서버 JSON은 믿지 않고 하나하나 확인한다. 오류·이상한 응답이면 절대 throw하지 않고 안전한 값({ok:false}, 남은 횟수 0)을 돌려준다.

/** supabase-js 클라이언트에서 쓰는 부분만(테스트에서 가짜로 바꾸기 쉽게). */
export interface FishingRpcClient { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }

const RPC_TIMEOUT_MS = 12_000;
const PHASES: readonly FishPhase[] = ['morning', 'day', 'evening', 'night'];
const WEATHERS: readonly FishWeather[] = ['clear', 'cloudy', 'rain'];
const RARITIES: readonly FishRarity[] = ['common', 'uncommon', 'rare', 'legendary'];
const SHADOWS: readonly FishShadow[] = ['S', 'M', 'L'];
const PATTERNS: readonly BitePattern[] = ['quick', 'double', 'long'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => typeof v === 'string' && v !== '' ? v : null;

export function fallbackFishingState(now: number = Date.now(), override?: FishingOverride | null): FishingState {
  const c = worldClockAt(now, override);
  return { kstDate: c.kstDate, phase: c.phase, weather: c.weather, remaining: 0, sparkleShadow: null, pigeonHint: null, album: [], rod: NO_ROD };
}

/** 낚싯대 {id, tier}. 모르는 id는 기본 낚싯대로, tier는 카탈로그 값을 믿는다. */
export function parseFishingRod(raw: unknown): FishingRod {
  if (!isObj(raw)) return NO_ROD;
  const spec = rodSpec(typeof raw.id === 'string' ? raw.id : null);
  return spec ? { id: spec.id, tier: spec.tier } : NO_ROD;
}

export function parsePlayerLevel(raw: unknown): PlayerLevel | undefined {
  if (!isObj(raw)) return undefined;
  const xp = nonnegativeInteger(raw.xp), level = nonnegativeInteger(raw.level), xpIntoLevel = nonnegativeInteger(raw.xpIntoLevel);
  const xpForNext = nonnegativeInteger(raw.xpForNext), maxLevel = nonnegativeInteger(raw.maxLevel);
  return xp !== undefined && level !== undefined && level >= 1 && maxLevel === MAX_LEVEL && level <= maxLevel && xpIntoLevel !== undefined && xpForNext !== undefined
    ? { xp, level, xpIntoLevel, xpForNext, maxLevel } : undefined;
}
export function parseBait(raw: unknown): { charges: number } | undefined {
  if (!isObj(raw)) return undefined;
  const charges = nonnegativeInteger(raw.charges);
  return charges !== undefined ? { charges } : undefined;
}
export function parseBuyBait(raw: unknown): BuyBaitResult {
  if (!isObj(raw)) return { ok: false, reason: 'error' };
  if (raw.ok !== true) return { ok: false, reason: raw.reason === 'insufficient_balance' ? raw.reason : 'error', ...(str(raw.message) ? { message: str(raw.message)! } : {}) };
  const newBalance = nonnegativeInteger(raw.newBalance), bait = parseBait(raw);
  return newBalance !== undefined && bait ? { ok: true, newBalance, charges: bait.charges } : { ok: false, reason: 'error' };
}

export function parseFishingState(raw: unknown, fallback: FishingState = fallbackFishingState()): FishingState {
  if (!isObj(raw)) return fallback;
  const remaining = num(raw.remaining);
  const spark = num(raw.sparkleShadow);
  const level = parsePlayerLevel(raw.level), bait = parseBait(raw.bait);
  const album = Array.isArray(raw.album) ? raw.album.flatMap((e): FishAlbumEntry[] => {
    if (!isObj(e)) return [];
    const speciesId = str(e.speciesId), count = num(e.count), bestCm = num(e.bestCm), firstAt = str(e.firstAt);
    return speciesId && count != null && count > 0 && bestCm != null ? [{ speciesId, count: Math.floor(count), bestCm, firstAt: firstAt ?? '' }] : [];
  }) : [];
  return {
    kstDate: typeof raw.kstDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.kstDate) ? raw.kstDate : fallback.kstDate,
    phase: oneOf(PHASES, raw.phase) ? raw.phase : fallback.phase,
    weather: oneOf(WEATHERS, raw.weather) ? raw.weather : fallback.weather,
    remaining: remaining == null ? 0 : Math.max(-1, Math.floor(remaining)),
    sparkleShadow: spark != null && [0, 1, 2].includes(spark) ? spark : null,
    pigeonHint: str(raw.pigeonHint),
    album,
    rod: parseFishingRod(raw.rod),
    ...(level ? { level } : {}),
    ...(bait ? { bait } : {}),
  };
}

export function parseCastStart(raw: unknown): CastStart {
  if (!isObj(raw)) return { ok: false, reason: 'error' };
  if (raw.ok !== true) return { ok: false, reason: raw.reason === 'budget' || raw.reason === 'pending' ? raw.reason : 'error' };
  const castId = str(raw.castId), biteDelayMs = num(raw.biteDelayMs);
  if (!castId || !oneOf(SHADOWS, raw.shadow) || biteDelayMs == null || biteDelayMs < 0) return { ok: false, reason: 'error' };
  const speed = num(raw.speed);
  const bait = parseBait(raw.bait);
  return { ok: true, castId, shadow: raw.shadow, biteDelayMs, difficulty: Math.max(1, Math.min(5, num(raw.difficulty) ?? 1)), ...(typeof raw.big === 'boolean' ? { big: raw.big } : {}), pattern: oneOf(PATTERNS, raw.pattern) ? raw.pattern : 'quick', hint: raw.hint === 'sparkle' ? 'sparkle' : null,
    ...(raw.rod !== undefined ? { rod: parseFishingRod(raw.rod) } : {}),
    // 속도는 1~1.35(황금 낚싯대)지만, 이상한 값이 와도 미니게임이 깨지지 않게 1~2로 묶는다.
    ...(speed != null ? { speed: Math.max(1, Math.min(2, speed)) } : {}),
    ...(isObj(raw.bait) && typeof raw.bait.used === 'boolean' && bait ? { bait: { used: raw.bait.used, charges: bait.charges } } : {}),
    ...(typeof raw.trophy === 'boolean' ? { trophy: raw.trophy } : {}) };
}

export function parseEquipRod(raw: unknown): EquipRodResult {
  if (!isObj(raw)) return { ok: false, reason: 'error' };
  if (raw.ok !== true) return { ok: false, reason: raw.reason === 'not_found' || raw.reason === 'not_owned' ? raw.reason : 'error' };
  return { ok: true, rod: parseFishingRod(raw.rod) };
}

export function parseCastFinish(raw: unknown): CastFinish {
  if (!isObj(raw) || raw.ok !== true) return { ok: false };
  if (raw.landed !== true) return { ok: true, landed: false };
  const speciesId = str(raw.speciesId), lengthCm = num(raw.lengthCm), remaining = num(raw.remaining);
  if (!speciesId || lengthCm == null || !oneOf(RARITIES, raw.rarity)) return { ok: false };
  const xpGain = parseXpGain(raw.xpGain);
  return {
    ok: true, landed: true, speciesId, lengthCm, rarity: raw.rarity,
    ...(xpGain ? { xpGain } : {}),
    isNew: raw.isNew === true, isBig: raw.isBig === true, isPersonalBest: raw.isPersonalBest === true,
    remaining: remaining == null ? 0 : Math.max(-1, Math.floor(remaining)),
  };
}

export function parseClassFishBoard(raw: unknown): ClassFishBoard {
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.rows) ? raw.rows : [];
  const rows = list.flatMap((r): ClassFishBoard['rows'] => {
    if (!isObj(r)) return [];
    const speciesId = str(r.speciesId), lengthCm = num(r.lengthCm);
    return speciesId && lengthCm != null ? [{ speciesId, lengthCm, animal: str(r.animal) ?? '🐾', caughtAt: str(r.caughtAt) ?? '', ...(r.teacher === true ? { teacher: true } : {}) }] : [];
  }).slice(0, 10);
  const classSpecies = isObj(raw) ? num(raw.classSpecies) : null;
  return { rows, classSpecies: classSpecies == null ? new Set(rows.map(r => r.speciesId)).size : Math.max(0, Math.floor(classSpecies)) };
}

async function callRpc(client: FishingRpcClient, fn: string, args?: Record<string, unknown>): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), RPC_TIMEOUT_MS); });
    const { data, error } = await Promise.race([Promise.resolve(client.rpc(fn, args)), timeout]);
    if (error) throw error;
    return data;
  } finally { if (timer) clearTimeout(timer); }
}

/** 실서버 어댑터. override는 관리자 화면에서만 넘긴다(서버도 관리자가 아니면 무시). */
export function createFishingAdapter(supabase: FishingRpcClient, override?: FishingOverride | null): FishingAdapter {
  const overrideArgs: Record<string, unknown> = {};
  if (override?.clock) overrideArgs.p_override_clock = override.clock;
  if (override?.weather) overrideArgs.p_override_weather = override.weather;
  return {
    async state() {
      const fallback = fallbackFishingState(Date.now(), override);
      try { return parseFishingState(await callRpc(supabase, 'get_pixel_fishing_state', overrideArgs), fallback); }
      catch { return fallback; }
    },
    async start(pet) {
      try { return parseCastStart(await callRpc(supabase, 'start_pixel_cast', { p_pet: pet ?? null, ...overrideArgs })); }
      catch { return { ok: false, reason: 'error' }; }
    },
    async finish(castId, landed) {
      try { return parseCastFinish(await callRpc(supabase, 'finish_pixel_cast', { p_cast_id: castId, p_landed: landed === true })); }
      catch { return { ok: false }; }
    },
    async board() {
      try { return parseClassFishBoard(await callRpc(supabase, 'get_class_fish_board')); }
      catch { return { rows: [], classSpecies: 0 }; }
    },
    async buyBait() {
      try { return parseBuyBait(await callRpc(supabase, 'buy_pixel_bait')); }
      catch { return { ok: false, reason: 'error' }; }
    },
    async getLevel() {
      try { return parsePlayerLevel(await callRpc(supabase, 'get_pixel_level')) ?? null; }
      catch { return null; }
    },
    async equipRod(itemId) {
      try { return parseEquipRod(await callRpc(supabase, 'equip_pixel_rod', { p_item_id: itemId ?? null })); }
      catch { return { ok: false, reason: 'error' }; }
    },
  };
}
