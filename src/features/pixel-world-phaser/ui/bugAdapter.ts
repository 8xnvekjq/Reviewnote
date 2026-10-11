// 잠자리 서버 계약(2026-10-11). 실제 Supabase 구현·모의 어댑터는 서버 워커가 이 파일에 채운다.
import type { BugId } from '../logic/bugCatalog';
import type { GamePointsResult } from '../logic/gamePoints';
import type { XpGain } from './fishingAdapter';

export interface BugAlbumEntry { bugId: BugId; count: number; firstAt: string }
/** 잠자리 업적(supabase/migrations/20261012150000_pixel_hand_slot.sql). 별5는 새 규칙(2026-10-12) 이후 잡은 것만 센다. */
export type BugAchievementId = 'bug_doctor' | 'bug_master';
export const BUG_ACHIEVEMENTS: readonly { id: BugAchievementId; name: string; goal: string; reward: string; capacity: number }[] = [
  { id: 'bug_doctor', name: '잠자리 박사', goal: '도감 5종 완성 + 별5 잠자리 1마리', reward: '가방 30kg', capacity: 30 },
  { id: 'bug_master', name: '잠자리 명인', goal: '별5 잠자리 10마리', reward: '가방 60kg', capacity: 60 },
];
export interface BugAchievementState { star5: number; species: number; speciesTotal: number; earned: BugAchievementId[] }
export interface BugState { netOwned: boolean; album: BugAlbumEntry[]; achievements?: BugAchievementState }
export type BugStart = { ok: true; catchId: string; bugId: BugId; difficulty: number } | { ok: false; reason: 'no_net' | 'net_not_equipped' | 'pending' | 'error' };
export type BugFinish = { ok: true; caught: true; bugId: BugId; isNew: boolean; xpGain?: XpGain; points?: GamePointsResult; achievements?: BugAchievementId[] } | { ok: true; caught: false } | { ok: false };
export interface BugAdapter {
  state(): Promise<BugState>;
  /** scene: 'yard' | 'plaza' | 'river' — 어디서 잡았는지 기록용. */
  start(scene: string): Promise<BugStart>;
  finish(catchId: string, caught: boolean): Promise<BugFinish>;
}

import { BUG_CATALOG, bugById } from '../logic/bugCatalog';
import { GAME_POINT_DAILY_CAP, awardGamePoints } from '../logic/gamePoints';
import { levelForXp, parseXpGain } from '../logic/levels';
import type { FishingRpcClient } from './fishingAdapter';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const sceneValid = (scene: unknown) => scene === 'yard' || scene === 'plaza' || scene === 'river';
const validBug = (value: unknown): value is BugId => typeof value === 'string' && !!bugById(value);
const achievementIds = (value: unknown): BugAchievementId[] => Array.isArray(value)
  ? BUG_ACHIEVEMENTS.map(a => a.id).filter(id => value.includes(id)) : [];

export function parseBugState(raw: unknown): BugState {
  if (!object(raw)) return { netOwned: false, album: [] };
  const seen = new Set<BugId>();
  const album: BugAlbumEntry[] = [];
  if (Array.isArray(raw.album)) for (const entry of raw.album) {
    if (!object(entry) || !validBug(entry.bugId) || seen.has(entry.bugId) || !integer(entry.count) || entry.count < 1
      || typeof entry.firstAt !== 'string' || !Number.isFinite(Date.parse(entry.firstAt))) continue;
    seen.add(entry.bugId);
    album.push({ bugId: entry.bugId, count: entry.count, firstAt: entry.firstAt });
  }
  const a = raw.achievements;
  const achievements = object(a) && integer(a.star5) && integer(a.species) && integer(a.speciesTotal)
    ? { star5: a.star5, species: a.species, speciesTotal: a.speciesTotal, earned: achievementIds(a.earned) } : undefined;
  return { netOwned: raw.netOwned === true, album, ...(achievements ? { achievements } : {}) };
}

export function parseBugStart(raw: unknown): BugStart {
  if (!object(raw)) return { ok: false, reason: 'error' };
  if (raw.ok === false) return { ok: false, reason: raw.reason === 'no_net' || raw.reason === 'net_not_equipped' || raw.reason === 'pending' ? raw.reason : 'error' };
  if (raw.ok !== true || typeof raw.catchId !== 'string' || !raw.catchId.trim() || !validBug(raw.bugId)
    || raw.difficulty !== bugById(raw.bugId)!.stars) return { ok: false, reason: 'error' };
  return { ok: true, catchId: raw.catchId, bugId: raw.bugId, difficulty: raw.difficulty as number };
}

export function parseBugFinish(raw: unknown): BugFinish {
  if (!object(raw) || raw.ok !== true) return { ok: false };
  if (raw.caught === false) return { ok: true, caught: false };
  if (raw.caught !== true || !validBug(raw.bugId) || typeof raw.isNew !== 'boolean') return { ok: false };
  const xpGain = parseXpGain(raw.xpGain);
  const p = raw.points;
  const points: GamePointsResult | undefined = object(p) && integer(p.awarded) && integer(p.todayEarned)
    && p.awarded <= p.todayEarned && p.cap === GAME_POINT_DAILY_CAP && typeof p.capped === 'boolean'
    && p.capped === (p.todayEarned >= p.cap)
    ? { awarded: p.awarded, todayEarned: p.todayEarned, cap: p.cap, capped: p.capped } : undefined;
  const achievements = achievementIds(raw.achievements);
  return { ok: true, caught: true, bugId: raw.bugId, isNew: raw.isNew, ...(xpGain ? { xpGain } : {}), ...(points ? { points } : {}), ...(achievements.length ? { achievements } : {}) };
}

/** 네트워크 오류와 잘못된 응답은 안전한 실패로 돌려준다. */
export function createBugAdapter(supabase: FishingRpcClient): BugAdapter {
  async function rpc(name: string, args?: Record<string, unknown>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 8000); });
      const result = await Promise.race([Promise.resolve(supabase.rpc(name, args)), timeout]);
      return result.error ? null : result.data;
    } finally { if (timer) clearTimeout(timer); }
  }
  return {
    async state() { try { return parseBugState(await rpc('get_bug_state')); } catch { return { netOwned: false, album: [] }; } },
    async start(scene) {
      try {
        if (!sceneValid(scene)) return { ok: false, reason: 'error' };
        return parseBugStart(await rpc('start_bug_catch', { p_scene: scene }));
      } catch { return { ok: false, reason: 'error' }; }
    },
    async finish(catchId, caught) {
      try {
        if (typeof catchId !== 'string' || !catchId.trim() || typeof caught !== 'boolean') return { ok: false };
        return parseBugFinish(await rpc('finish_bug_catch', { p_catch_id: catchId, p_caught: caught }));
      } catch { return { ok: false }; }
    },
  };
}

export interface MockBugOptions {
  netOwned?: boolean;
  now?: () => number;
  seed?: number;
  random?: () => number;
  xp?: number;
  todayEarned?: number;
  carry?: number;
}

/** 모의 환경에서도 소유·시간·하루 포인트 규칙은 서버와 같다. */
export function createMockBugAdapter(options: MockBugOptions = {}): BugAdapter {
  const now = options.now ?? Date.now;
  let seed = (options.seed ?? 42) >>> 0;
  const random = options.random ?? (() => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; });
  let xp = integer(options.xp) ? options.xp : 0;
  let earned = integer(options.todayEarned) ? options.todayEarned : 0;
  let carry = integer(options.carry) && options.carry > 0 && options.carry < 10 ? options.carry : 0;
  const dayAt = (time: number) => new Date(time + 9 * 3600000).toISOString().slice(0, 10);
  let day: string | undefined;
  try { day = dayAt(now()); } catch { /* 잘못된 모의 시계는 RPC에서 안전하게 실패한다. */ }
  let lastStart = -Infinity, sequence = 0;
  let pending: { id: string; bugId: BugId; startedAt: number } | undefined;
  const album = new Map<BugId, BugAlbumEntry>();
  return {
    async state() {
      return { netOwned: options.netOwned === true, album: BUG_CATALOG.flatMap(b => { const entry = album.get(b.id); return entry ? [{ ...entry }] : []; }) };
    },
    async start(scene) {
      try {
        if (options.netOwned !== true) return { ok: false, reason: 'no_net' };
        if (!sceneValid(scene)) return { ok: false, reason: 'error' };
        const time = now();
        if (!Number.isFinite(time)) return { ok: false, reason: 'error' };
        if (pending && time > pending.startedAt + 15000) pending = undefined;
        if (pending || time - lastStart < 2000) return { ok: false, reason: 'pending' };
        const roll = random();
        if (!Number.isFinite(roll) || roll < 0 || roll >= 1) return { ok: false, reason: 'error' };
        let threshold = roll * BUG_CATALOG.reduce((n, b) => n + b.weight, 0);
        const bug = BUG_CATALOG.find(b => (threshold -= b.weight) < 0)!;
        const id = `mock-bug-${++sequence}`;
        pending = { id, bugId: bug.id, startedAt: time }; lastStart = time;
        return { ok: true, catchId: id, bugId: bug.id, difficulty: bug.stars };
      } catch { return { ok: false, reason: 'error' }; }
    },
    async finish(catchId, caught) {
      try {
        if (typeof caught !== 'boolean' || !pending || pending.id !== catchId) return { ok: false };
        const attempt = pending; pending = undefined;
        const time = now(), elapsed = time - attempt.startedAt;
        if (!Number.isFinite(elapsed) || elapsed > 15000) return { ok: false };
        if (!caught || elapsed < 600) return { ok: true, caught: false };
        const firstAt = new Date(time).toISOString(), today = dayAt(time);
        if (day !== undefined && today !== day) { earned = 0; carry = 0; }
        day = today;
        const bug = bugById(attempt.bugId)!;
        const previous = album.get(bug.id);
        album.set(bug.id, { bugId: bug.id, count: (previous?.count ?? 0) + 1, firstAt: previous?.firstAt ?? firstAt });
        const oldLevel = levelForXp(xp).level; xp += bug.xp;
        let awarded: number;
        ({ awarded, carry } = awardGamePoints(bug.points, bug.stars >= 4 ? 'full' : 'normal', earned, carry));
        earned += awarded;
        return { ok: true, caught: true, bugId: bug.id, isNew: !previous,
          xpGain: { gained: bug.xp, xp, level: levelForXp(xp).level, leveledUp: levelForXp(xp).level > oldLevel, track: 'gathering' as const },
          points: { awarded, todayEarned: earned, cap: GAME_POINT_DAILY_CAP, capped: earned >= GAME_POINT_DAILY_CAP } };
      } catch { return { ok: false }; }
    },
  };
}
