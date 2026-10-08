// 메모리 안에서만 도는 낚시 어댑터 — 브라우저 하네스와 단위 테스트용. 서버(supabase_pixel_fishing.sql)와 같은 규칙:
// 무제한, 시작 간격 2초, 대기 캐스트 1개·90초, 최근 5마리에 새 친구가 없으면 안 잡아 본 물고기 보장,
// 강아지 반짝임, 비둘기 힌트, 곰 +8%. 같은 seed·같은 시계면 언제나 같은 결과가 나온다.
import { FISH_CATALOG, RARITY_WEIGHT, fishById } from '../logic/fishCatalog';
import type { FishSpecies } from '../logic/fishCatalog';
import { minReelMs } from '../logic/reelGame';
import { fnv1a32, worldClockAt } from '../logic/worldClock';
import type { BitePattern, CastFinish, CastStart, ClassFishBoard, FishAlbumEntry, FishingAdapter, FishingOverride, FishingState, FishPhase, FishWeather } from './fishingAdapter';

export interface MockCatch { id: string; speciesId: string; lengthCm: number; caughtAt: string; kstDate: string }
export interface MockFishingOptions {
  seed?: number;
  /** 시계(ms). 기본값은 Date.now. */
  now?: () => number;
  override?: FishingOverride | null;
  /** 정말로 데리고 있는 펫. undefined면 start(pet)으로 받은 값을 그대로 믿는다(하네스 편의). */
  activePet?: string | null;
  /** 이미 잡아 둔 물고기(도감 미리 채우기). */
  catches?: MockCatch[];
  /** 반 게시판에 같이 보일 친구들 기록. */
  classmates?: ClassFishBoard['rows'];
  /** 응답 지연(ms). 0이면 바로. */
  latencyMs?: number;
}
export interface MockFishingAdapter extends FishingAdapter {
  /** 테스트용: 대기 중인 캐스트가 정해 둔 물고기. */
  peek(): { castId: string; speciesId: string; lengthCm: number } | null;
  readonly catches: readonly MockCatch[];
}

const PHASE_WORD: Record<FishPhase, string> = { morning: '아침', day: '낮', evening: '저녁', night: '밤' };
export const CAST_TTL_MS = 90_000;
export const MOCK_USER = 'mock-user';

export function fishValidNow(fish: FishSpecies, phase: FishPhase, weather: FishWeather): boolean {
  return (fish.phases === 'any' || fish.phases.includes(phase)) && (fish.weather === 'any' || fish.weather.includes(weather));
}

/** "밤에 맑으면 달빛 피라미 친구가 나온대요!" — SQL의 pixel_private.fish_hint_text와 같은 문장. */
export function fishHintText(fish: FishSpecies): string {
  const when = fish.phases === 'any' ? '' : fish.phases.map(p => PHASE_WORD[p]).join('·') + '에 ';
  const w = fish.weather;
  const sky = w === 'any' ? '' : w.length === 1 ? { clear: '맑으면 ', cloudy: '흐리면 ', rain: '비가 오면 ' }[w[0]] : w.includes('rain') ? '' : '비가 안 오면 ';
  return (when + sky || '언제든 ') + fish.name + ' 친구가 나온대요!';
}

export function isBigCatch(fish: FishSpecies, lengthCm: number): boolean {
  return lengthCm >= fish.minCm + 0.8 * (fish.maxCm - fish.minCm);
}

/** 마지막 5마리가 모두 이미 아는 물고기였는지(최소 5마리). catches는 오래된 순. */
export function pityDue(catches: readonly { speciesId: string }[]): boolean {
  if (catches.length < 5) return false;
  const firstIndex = new Map<string, number>();
  catches.forEach((c, i) => { if (!firstIndex.has(c.speciesId)) firstIndex.set(c.speciesId, i); });
  for (let i = catches.length - 5; i < catches.length; i++) if (firstIndex.get(catches[i].speciesId) === i) return false;
  return true;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick(pool: readonly FishSpecies[], roll: number): FishSpecies {
  const total = pool.reduce((sum, f) => sum + RARITY_WEIGHT[f.rarity], 0);
  let left = roll * total;
  for (const fish of pool) { left -= RARITY_WEIGHT[fish.rarity]; if (left < 0) return fish; }
  return pool[pool.length - 1];
}

const DEFAULT_CLASSMATES: ClassFishBoard['rows'] = [
  { speciesId: 'carp', lengthCm: 52.3, animal: '🐻', caughtAt: '2026-10-06T08:12:00.000Z' },
  { speciesId: 'buri', lengthCm: 21.7, animal: '🐰', caughtAt: '2026-10-07T03:40:00.000Z' },
];

export function createMockFishingAdapter(opts: MockFishingOptions = {}): MockFishingAdapter {
  const rand = mulberry32(opts.seed ?? 20261008);
  const now = opts.now ?? (() => Date.now());
  const catches: MockCatch[] = (opts.catches ?? []).map(c => ({ ...c }));
  const classmates = opts.classmates ?? DEFAULT_CLASSMATES;
  let pending: { castId: string; fish: FishSpecies; lengthCm: number; kstDate: string; expiresAt: number; startedAt: number; biteDelayMs: number; difficulty: number } | null = null;
  let castSeq = 0;
  let lastStart = -Infinity;
  const delay = <T>(value: T): Promise<T> => opts.latencyMs ? new Promise(resolve => setTimeout(() => resolve(value), opts.latencyMs)) : Promise.resolve(value);
  const clock = () => worldClockAt(now(), opts.override ?? null);
  const usedOn = (kstDate: string) => catches.filter(c => c.kstDate === kstDate).length;
  const caughtIds = () => new Set(catches.map(c => c.speciesId));
  const pet = (asked: string | null) => opts.activePet === undefined ? asked : asked != null && asked === opts.activePet ? asked : null;

  function album(): FishAlbumEntry[] {
    return FISH_CATALOG.flatMap(fish => {
      const mine = catches.filter(c => c.speciesId === fish.id);
      if (!mine.length) return [];
      return [{ speciesId: fish.id, count: mine.length, bestCm: Math.max(...mine.map(c => c.lengthCm)), firstAt: mine.map(c => c.caughtAt).sort()[0] }];
    });
  }

  return {
    get catches() { return catches; },
    peek: () => pending && pending.expiresAt > now() ? { castId: pending.castId, speciesId: pending.fish.id, lengthCm: pending.lengthCm } : null,
    async state(): Promise<FishingState> {
      const c = clock();
      const used = usedOn(c.kstDate);
      const remaining = -1;
      const active = opts.activePet ?? null;
      const sparkleShadow = active === 'pet_dog' ? fnv1a32(`sparkle:${MOCK_USER}:${c.kstDate}:${used}`) % 3 : null;
      const known = caughtIds();
      const uncaught = FISH_CATALOG.filter(f => !known.has(f.id));
      const pigeonHint = active === 'pet_pigeon' && uncaught.length ? fishHintText(uncaught[fnv1a32(`pigeon:${MOCK_USER}:${c.kstDate}`) % uncaught.length]) : null;
      return delay({ kstDate: c.kstDate, phase: c.phase, weather: c.weather, remaining, sparkleShadow, pigeonHint, album: album() });
    },
    async start(askedPet: string | null): Promise<CastStart> {
      const c = clock();
      if (pending && pending.expiresAt <= now()) pending = null;
      if (pending) return delay({ ok: false, reason: 'pending' });
      if (now() - lastStart < 2000) return delay({ ok: false, reason: 'pending' });
      const valid = FISH_CATALOG.filter(f => fishValidNow(f, c.phase, c.weather));
      const known = caughtIds();
      const fresh = valid.filter(f => !known.has(f.id));
      const fish = weightedPick(pityDue(catches) && fresh.length ? fresh : valid, rand());
      const myPet = pet(askedPet);
      let lengthCm = fish.minCm + rand() * (fish.maxCm - fish.minCm);
      if (myPet === 'pet_bear') lengthCm = Math.min(lengthCm * 1.08, fish.maxCm * 1.08);
      lengthCm = Math.round(lengthCm * 10) / 10;
      const patternRoll = rand();
      const pattern: BitePattern = patternRoll < 0.4 ? 'quick' : patternRoll < 0.75 ? 'double' : 'long';
      const [lo, hi] = pattern === 'quick' ? [1200, 2500] : pattern === 'double' ? [2200, 3600] : [3200, 5000];
      const biteDelayMs = Math.round(lo + rand() * (hi - lo));
      const castId = `mock-cast-${++castSeq}`;
      const difficulty = Math.min(5, ({ common: 1, uncommon: 2, rare: 3.5, legendary: 5 }[fish.rarity]) + ((FISH_CATALOG.indexOf(fish) + 1) % 3) * .08);
      lastStart = now();
      pending = { castId, fish, lengthCm, kstDate: c.kstDate, expiresAt: now() + CAST_TTL_MS, startedAt: now(), biteDelayMs, difficulty };
      const hint = myPet === 'pet_dog' && (fish.rarity === 'rare' || fish.rarity === 'legendary') ? 'sparkle' : null;
      return delay({ ok: true, castId, shadow: fish.shadow, biteDelayMs, difficulty, pattern, hint });
    },
    async finish(castId: string, landed: boolean): Promise<CastFinish> {
      const cast = pending;
      if (!cast || cast.castId !== castId || cast.expiresAt <= now()) return delay({ ok: false });
      pending = null;
      if (!landed || now() < cast.startedAt + cast.biteDelayMs + minReelMs(cast.difficulty)) return delay({ ok: true, landed: false });
      const before = catches.filter(c => c.speciesId === cast.fish.id);
      const isNew = before.length === 0;
      const isPersonalBest = !isNew && cast.lengthCm > Math.max(...before.map(c => c.lengthCm));
      catches.push({ id: `mock-catch-${catches.length + 1}`, speciesId: cast.fish.id, lengthCm: cast.lengthCm, caughtAt: new Date(now()).toISOString(), kstDate: cast.kstDate });
      return delay({
        ok: true, landed: true, speciesId: cast.fish.id, lengthCm: cast.lengthCm, rarity: cast.fish.rarity,
        isNew, isBig: isBigCatch(cast.fish, cast.lengthCm), isPersonalBest, remaining: -1,
      });
    },
    async board(): Promise<ClassFishBoard> {
      const mine = catches.map(c => ({ speciesId: c.speciesId, lengthCm: c.lengthCm, animal: '🐶', caughtAt: c.caughtAt }));
      const best = new Map<string, ClassFishBoard['rows'][number]>();
      for (const row of [...classmates, ...mine]) {
        const prev = best.get(row.speciesId);
        if (!prev || row.lengthCm > prev.lengthCm) best.set(row.speciesId, row);
      }
      const rows = [...best.values()].filter(r => fishById(r.speciesId)).sort((a, b) => b.lengthCm - a.lengthCm).slice(0, 10);
      return delay({ rows, classSpecies: new Set([...classmates, ...mine].map(r => r.speciesId)).size });
    },
  };
}
