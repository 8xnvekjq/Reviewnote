// 낚시(강가의 하루) 서버 연결의 고정 계약. 모양은 docs/pixel-world/FISHING_SPEC.md를 따른다.
// 실제 Supabase 구현(createFishingAdapter)은 서버 작업에서 이 파일에 채운다.
import type { RodEquipment } from '../../pixel-room/shop/rods';
import { worldClockAt } from '../logic/worldClock';
export type FishPhase = 'morning' | 'day' | 'evening' | 'night';
export type FishWeather = 'clear' | 'cloudy' | 'rain';
export type FishRarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type FishShadow = 'S' | 'M' | 'L';
export type BitePattern = 'quick' | 'double' | 'long';
export interface FishAlbumEntry { speciesId: string; count: number; bestCm: number; firstAt: string }
export interface FishingState { rod?: { id: string | null; tier: number }; kstDate: string; phase: FishPhase; weather: FishWeather; remaining: number; sparkleShadow: number | null; pigeonHint: string | null; album: FishAlbumEntry[] }
export type CastStart = { ok: true; castId: string; shadow: FishShadow; biteDelayMs: number; difficulty?: number; big?: boolean; rod?: { id: string | null; tier: number }; speed?: number; trophy?: boolean; pattern: BitePattern; hint: 'sparkle' | null } | { ok: false; reason: 'budget' | 'pending' | 'error' };
export type CastFinish = { ok: true; landed: true; speciesId: string; lengthCm: number; rarity: FishRarity; isNew: boolean; isBig: boolean; isPersonalBest: boolean; remaining: number } | { ok: true; landed: false } | { ok: false };
export interface ClassFishBoard { rows: { speciesId: string; lengthCm: number; animal: string; caughtAt: string }[]; classSpecies: number }
export interface FishingAdapter { state(): Promise<FishingState>; start(pet: string | null): Promise<CastStart>; finish(castId: string, landed: boolean): Promise<CastFinish>; board(): Promise<ClassFishBoard> }
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

export function parseRod(raw: unknown): RodEquipment {
  if (!isObj(raw) || !(raw.id === null || typeof raw.id === 'string')) return { id: null, tier: 0 };
  const tier = num(raw.tier);
  return tier != null && Number.isInteger(tier) && tier >= 0 && tier <= 4 ? { id: raw.id, tier } : { id: null, tier: 0 };
}
export function fallbackFishingState(now: number = Date.now(), override?: FishingOverride | null): FishingState {
  const c = worldClockAt(now, override);
  return { rod: { id: null, tier: 0 }, kstDate: c.kstDate, phase: c.phase, weather: c.weather, remaining: 0, sparkleShadow: null, pigeonHint: null, album: [] };
}

export function parseFishingState(raw: unknown, fallback: FishingState = fallbackFishingState()): FishingState {
  if (!isObj(raw)) return fallback;
  const remaining = num(raw.remaining);
  const spark = num(raw.sparkleShadow);
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
    rod: parseRod(raw.rod),
  };
}

export function parseCastStart(raw: unknown): CastStart {
  if (!isObj(raw)) return { ok: false, reason: 'error' };
  if (raw.ok !== true) return { ok: false, reason: raw.reason === 'budget' || raw.reason === 'pending' ? raw.reason : 'error' };
  const castId = str(raw.castId), biteDelayMs = num(raw.biteDelayMs);
  if (!castId || !oneOf(SHADOWS, raw.shadow) || biteDelayMs == null || biteDelayMs < 0) return { ok: false, reason: 'error' };
  return { ok: true, rod: parseRod(raw.rod), speed: (num(raw.speed) ?? 1) > 0 ? num(raw.speed) ?? 1 : 1, trophy: raw.trophy === true, castId, shadow: raw.shadow, biteDelayMs, difficulty: Math.max(1, Math.min(5, num(raw.difficulty) ?? 1)), ...(typeof raw.big === 'boolean' ? { big: raw.big } : {}), pattern: oneOf(PATTERNS, raw.pattern) ? raw.pattern : 'quick', hint: raw.hint === 'sparkle' ? 'sparkle' : null };
}

export function parseCastFinish(raw: unknown): CastFinish {
  if (!isObj(raw) || raw.ok !== true) return { ok: false };
  if (raw.landed !== true) return { ok: true, landed: false };
  const speciesId = str(raw.speciesId), lengthCm = num(raw.lengthCm), remaining = num(raw.remaining);
  if (!speciesId || lengthCm == null || !oneOf(RARITIES, raw.rarity)) return { ok: false };
  return {
    ok: true, landed: true, speciesId, lengthCm, rarity: raw.rarity,
    isNew: raw.isNew === true, isBig: raw.isBig === true, isPersonalBest: raw.isPersonalBest === true,
    remaining: remaining == null ? 0 : Math.max(-1, Math.floor(remaining)),
  };
}

export function parseClassFishBoard(raw: unknown): ClassFishBoard {
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.rows) ? raw.rows : [];
  const rows = list.flatMap((r): ClassFishBoard['rows'] => {
    if (!isObj(r)) return [];
    const speciesId = str(r.speciesId), lengthCm = num(r.lengthCm);
    return speciesId && lengthCm != null ? [{ speciesId, lengthCm, animal: str(r.animal) ?? '🐾', caughtAt: str(r.caughtAt) ?? '' }] : [];
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
  };
}
