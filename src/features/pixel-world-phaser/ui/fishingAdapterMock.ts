import type { WorldOverride } from '../logic/worldClock';
import { BAIT_CHARGES, BAIT_PRICE, FISH_XP, TROPHY_XP, MAX_LEVEL, levelForXp, levelBaitDifficulty, hardFishChance, nonnegativeInteger } from '../logic/levels';
import type { PlayerLevel } from '../logic/levels';
// 메모리 안에서만 도는 낚시 어댑터 — 브라우저 하네스와 단위 테스트용. 서버(supabase_pixel_fishing.sql)와 같은 규칙:
// 무제한, 시작 간격 2초, 대기 캐스트 1개·90초, 어려운 물고기 15%+낚싯대 보너스(없으면 대물),
// 피티(최근 5마리에 새 친구가 없으면 35%로 안 잡아 본 물고기, 놓친 피티 바로 다음은 쉼),
// 낚싯대(난이도↓·희귀↑·속도), 강아지 반짝임, 비둘기 힌트, 곰 +8%. 같은 seed·같은 시계면 언제나 같은 결과가 나온다.
import { FISH_CATALOG, RARITY_WEIGHT, fishById } from '../logic/fishCatalog';
import type { FishSpecies } from '../logic/fishCatalog';
import { fishDifficulty } from '../logic/reelGame';
import { applyPersonalClock, applyWorldOverride, fnv1a32, kstParts, worldClockAt } from '../logic/worldClock';
import { BASIC_ROD, FISHING_RODS, NO_ROD, rodBiteDelayMs, rodDifficulty, rodMinReelMs, rodSpec } from './fishingAdapter';
import type { BitePattern, CastFinish, CastStart, ClassFishBoard, EquipRodResult, FishAlbumEntry, FishingAdapter, FishingOverride, FishingRod, FishingRodId, FishingState, FishPhase, FishWeather } from './fishingAdapter';

export interface MockCatch { id: string; speciesId: string; lengthCm: number; caughtAt: string; kstDate: string }
export interface MockFishingOptions {
  isAdmin?: boolean;
  worldStore?: { override: WorldOverride | null };
  seed?: number;
  xp?: number;
  baitCharges?: number;
  balance?: number;
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
  /** 처음 장착한 낚싯대(가지고 있다고 본다). 기본은 null = 기본 낚싯대. */
  rod?: FishingRodId | null;
  /** 가지고 있는 낚싯대. 기본은 4개 모두(하네스 편의). */
  ownedRods?: readonly FishingRodId[];
}
export interface MockFishingAdapter extends FishingAdapter {
  /** 테스트용: 대기 중인 캐스트가 정해 둔 물고기. */
  peek(): { castId: string; speciesId: string; lengthCm: number; difficulty: number; speed: number; pity: boolean; trophy: boolean; hard: boolean } | null;
  equipRod(itemId: FishingRodId | null): Promise<EquipRodResult>;
  buyBait(): Promise<import('./fishingAdapter').BuyBaitResult>;
  getLevel(): Promise<PlayerLevel>;
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

/** 피티는 발동 대상이어도 캐스트마다 이 확률로만 쓴다. */
export const PITY_CHANCE = 0.35;
/** 대물: 길이 상위 15%, 난이도 +1.5. */
export const TROPHY_TOP = 0.15;

export interface CastRollInput {
  /** 지금 시간대·날씨에 나올 수 있는 물고기. */
  valid: readonly FishSpecies[];
  /** 이미 잡아 본 종. */
  caught: ReadonlySet<string>;
  /** 최근 5마리에 새 친구가 없음(pityDue). */
  pityDue: boolean;
  /** 바로 전 피티 캐스트를 놓쳤으면 이번에는 피티를 쉰다. */
  skipPity: boolean;
  /** 낚싯대 희귀 보너스(%p). */
  rareBonus: number;
  bait?: boolean;
  rand: () => number;
}
export interface CastRoll { fish: FishSpecies; pity: boolean; hard: boolean; trophy: boolean }

/** SQL start_pixel_cast와 같은 순서의 물고기 고르기: 피티(35%) → 어려운 물고기(15%+보너스) → 보통 굴림. */
export function rollCastFish({ valid, caught, pityDue: due, skipPity, rareBonus, bait = false, rand }: CastRollInput): CastRoll | null {
  if (due && !skipPity && rand() < PITY_CHANCE) {
    const fresh = valid.filter(f => !caught.has(f.id));
    if (fresh.length) return { fish: weightedPick(fresh, rand()), pity: true, hard: false, trophy: false };
  }
  if (rand() * 100 < hardFishChance(rareBonus, bait)) {
    const hard = valid.filter(f => f.rarity === 'rare' || f.rarity === 'legendary');
    if (hard.length) {
      const total = hard.reduce((a, f) => a + (f.rarity === 'rare' ? 5 : 1), 0);
      let left = rand() * total;
      const fish = hard.find(f => (left -= f.rarity === 'rare' ? 5 : 1) < 0) ?? hard[hard.length - 1];
      return { fish, pity: false, hard: true, trophy: false };
    }
    const uncommon = valid.filter(f => f.rarity === 'uncommon');
    const pool = uncommon.length ? uncommon : valid.filter(f => f.rarity === 'common');
    if (pool.length) return { fish: pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))], pity: false, hard: true, trophy: true };
  }
  return valid.length ? { fish: weightedPick(valid, rand()), pity: false, hard: false, trophy: false } : null;
}

const DEFAULT_CLASSMATES: ClassFishBoard['rows'] = [
  { speciesId: 'carp', lengthCm: 52.3, animal: '🐻', caughtAt: '2026-10-06T08:12:00.000Z' },
  { speciesId: 'buri', lengthCm: 21.7, animal: '🐰', caughtAt: '2026-10-07T03:40:00.000Z' },
];

export function createMockFishingAdapter(opts: MockFishingOptions = {}): MockFishingAdapter {
  let xp = nonnegativeInteger(opts.xp) ?? 0;
  let charges = nonnegativeInteger(opts.baitCharges) ?? 0;
  let balance = nonnegativeInteger(opts.balance) ?? 1000;
  const playerLevel = (): PlayerLevel => { const l = levelForXp(xp); return { xp, level: l.level, xpIntoLevel: l.xpIntoLevel, xpForNext: l.xpForNext, maxLevel: MAX_LEVEL }; };
  const rand = mulberry32(opts.seed ?? 20261008);
  const now = opts.now ?? (() => Date.now());
  const catches: MockCatch[] = (opts.catches ?? []).map(c => ({ ...c }));
  const classmates = opts.classmates ?? DEFAULT_CLASSMATES;
  let pending: { castId: string; fish: FishSpecies; lengthCm: number; kstDate: string; expiresAt: number; startedAt: number; biteDelayMs: number; difficulty: number; speed: number; pity: boolean; trophy: boolean; hard: boolean } | null = null;
  const ownedRods = new Set<string>(opts.ownedRods ?? FISHING_RODS.map(r => r.id));
  if (opts.rod) ownedRods.add(opts.rod);
  let equippedRod: FishingRodId | null = opts.rod ?? null;
  let skipPity = false;
  const currentRod = (): FishingRod => { const spec = rodSpec(equippedRod); return spec && ownedRods.has(spec.id) ? { id: spec.id, tier: spec.tier } : NO_ROD; };
  // 대기 캐스트를 지울 때: 피티 캐스트였으면 다음 피티를 쉰다(낚으면 finish에서 다시 지운다).
  const dropPending = () => { if (pending?.pity) skipPity = true; pending = null; };
  let castSeq = 0;
  let lastStart = -Infinity;
  const delay = <T>(value: T): Promise<T> => opts.latencyMs ? new Promise(resolve => setTimeout(() => resolve(value), opts.latencyMs)) : Promise.resolve(value);
  const store = opts.worldStore ?? { override: null };
  const globalClock = () => applyWorldOverride(worldClockAt(now()), store.override, now());
  const clock = () => applyPersonalClock(globalClock(), opts.override);
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
    async getWorldClock() { return { ...globalClock(), override: store.override && Date.parse(store.override.expiresAt)>now()?store.override:null, serverNow:new Date(now()).toISOString() }; },
    async adminSetWorldOverride(weather, phase, hours) {
      if (!opts.isAdmin) return false;
      const midnight=Date.parse(kstParts(now()).kstDate+'T00:00:00+09:00')+86400000;
      store.override=weather||phase?{weather,phase,expiresAt:new Date(hours===0?midnight:now()+Math.max(1,Math.min(24,hours))*3600000).toISOString()}:null;
      return true;
    },
    async getLevel() { return delay(playerLevel()); },
    async buyBait() {
      if (balance < BAIT_PRICE) return delay({ ok: false, reason: 'insufficient_balance', message: '포인트가 부족해요.' });
      balance -= BAIT_PRICE; charges += BAIT_CHARGES;
      return delay({ ok: true, newBalance: balance, charges });
    },
    get catches() { return catches; },
    peek: () => pending && pending.expiresAt > now() ? { castId: pending.castId, speciesId: pending.fish.id, lengthCm: pending.lengthCm, difficulty: pending.difficulty, speed: pending.speed, pity: pending.pity, trophy: pending.trophy, hard: pending.hard } : null,
    async equipRod(itemId: FishingRodId | null): Promise<EquipRodResult> {
      if (itemId !== null && !rodSpec(itemId)) return delay({ ok: false, reason: 'not_found' });
      if (itemId !== null && !ownedRods.has(itemId)) return delay({ ok: false, reason: 'not_owned' });
      equippedRod = itemId;
      return delay({ ok: true, rod: currentRod() });
    },
    async state(): Promise<FishingState> {
      const c = clock();
      const used = usedOn(c.kstDate);
      const remaining = -1;
      const active = opts.activePet ?? null;
      const sparkleShadow = active === 'pet_dog' ? fnv1a32(`sparkle:${MOCK_USER}:${c.kstDate}:${used}`) % 3 : null;
      const known = caughtIds();
      const uncaught = FISH_CATALOG.filter(f => !known.has(f.id));
      const pigeonHint = active === 'pet_pigeon' && uncaught.length ? fishHintText(uncaught[fnv1a32(`pigeon:${MOCK_USER}:${c.kstDate}`) % uncaught.length]) : null;
      return delay({ kstDate: c.kstDate, phase: c.phase, weather: c.weather, remaining, sparkleShadow, pigeonHint, album: album(), rod: currentRod(), level: playerLevel(), bait: { charges } });
    },
    async start(askedPet: string | null): Promise<CastStart> {
      const c = clock();
      if (pending && pending.expiresAt <= now()) dropPending();
      if (pending) return delay({ ok: false, reason: 'pending' });
      if (now() - lastStart < 2000) return delay({ ok: false, reason: 'pending' });
      const rod = currentRod();
      const spec = rodSpec(rod.id) ?? BASIC_ROD;
      const valid = FISH_CATALOG.filter(f => fishValidNow(f, c.phase, c.weather));
      const baitUsed = charges > 0;
      const roll = rollCastFish({ valid, caught: caughtIds(), pityDue: pityDue(catches), skipPity, rareBonus: spec.rareBonus, bait: baitUsed, rand });
      skipPity = false;
      if (!roll) return delay({ ok: false, reason: 'error' });
      const { fish, trophy } = roll;
      const myPet = pet(askedPet);
      let lengthCm = fish.minCm + (trophy ? 1 - TROPHY_TOP + rand() * TROPHY_TOP : rand()) * (fish.maxCm - fish.minCm);
      if (myPet === 'pet_bear') lengthCm = Math.min(lengthCm * 1.08, fish.maxCm * 1.08);
      lengthCm = Math.round(lengthCm * 10) / 10;
      const patternRoll = rand();
      const pattern: BitePattern = patternRoll < 0.4 ? 'quick' : patternRoll < 0.75 ? 'double' : 'long';
      const [lo, hi] = pattern === 'quick' ? [1200, 2500] : pattern === 'double' ? [2200, 3600] : [3200, 5000];
      const biteDelayMs = rodBiteDelayMs(Math.round(lo + rand() * (hi - lo)), spec.speed);
      const castId = `mock-cast-${++castSeq}`;
      const difficulty = levelBaitDifficulty(rodDifficulty(fishDifficulty(fish, lengthCm), spec.difficultyDown, trophy), levelForXp(xp).level, fish.rarity === 'legendary', baitUsed);
      if (baitUsed) charges--;
      lastStart = now();
      pending = { castId, fish, lengthCm, kstDate: c.kstDate, expiresAt: now() + CAST_TTL_MS, startedAt: now(), biteDelayMs, difficulty, speed: spec.speed, pity: roll.pity, trophy, hard: roll.hard };
      const hint = myPet === 'pet_dog' && (fish.rarity === 'rare' || fish.rarity === 'legendary') ? 'sparkle' : null;
      return delay({ ok: true, castId, shadow: fish.shadow, biteDelayMs, difficulty, big: isBigCatch(fish, lengthCm), pattern, hint, rod, speed: spec.speed, trophy, bait: { used: baitUsed, charges } });
    },
    async finish(castId: string, landed: boolean): Promise<CastFinish> {
      const cast = pending;
      if (!cast || cast.castId !== castId) return delay({ ok: false });
      dropPending();
      if (cast.expiresAt <= now()) return delay({ ok: false });
      if (!landed || now() < cast.startedAt + cast.biteDelayMs + rodMinReelMs(cast.difficulty, cast.speed)) return delay({ ok: true, landed: false });
      skipPity = false;
      const before = catches.filter(c => c.speciesId === cast.fish.id);
      const isNew = before.length === 0;
      const isPersonalBest = !isNew && cast.lengthCm > Math.max(...before.map(c => c.lengthCm));
      catches.push({ id: `mock-catch-${catches.length + 1}`, speciesId: cast.fish.id, lengthCm: cast.lengthCm, caughtAt: new Date(now()).toISOString(), kstDate: cast.kstDate });
      const oldLevel = levelForXp(xp).level;
      const gained = FISH_XP[cast.fish.rarity] + (cast.trophy ? TROPHY_XP : 0);
      xp += gained;
      const xpGain = { gained, xp, level: levelForXp(xp).level, leveledUp: levelForXp(xp).level > oldLevel };
      return delay({
        ok: true, landed: true, speciesId: cast.fish.id, lengthCm: cast.lengthCm, rarity: cast.fish.rarity,
        isNew, isBig: isBigCatch(cast.fish, cast.lengthCm), isPersonalBest, remaining: -1, xpGain,
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
