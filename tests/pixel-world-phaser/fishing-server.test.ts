import { fishDifficulty } from '../../src/features/pixel-world-phaser/logic/reelGame.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAILY_CATCHES, FISH_CATALOG, fishById } from '../../src/features/pixel-world-phaser/logic/fishCatalog.ts';
import { fnv1a32, kstParts, parseClockOverride, phaseForMinutes, weatherForDate, worldClockAt } from '../../src/features/pixel-world-phaser/logic/worldClock.ts';
import { createMockFishingAdapter, fishHintText, fishValidNow, PITY_CHANCE, pityDue, rollCastFish } from '../../src/features/pixel-world-phaser/ui/fishingAdapterMock.ts';
import type { MockCatch } from '../../src/features/pixel-world-phaser/ui/fishingAdapterMock.ts';
import { createFishingAdapter, FISHING_RODS, HARD_FISH_PERCENT, parseCastFinish, parseCastStart, parseClassFishBoard, parseEquipRod, parseFishingState, rodBiteDelayMs, rodDifficulty, rodMinReelMs } from '../../src/features/pixel-world-phaser/ui/fishingAdapter.ts';
import type { FishingRodId } from '../../src/features/pixel-world-phaser/ui/fishingAdapter.ts';
import { minReelMs } from '../../src/features/pixel-world-phaser/logic/reelGame.ts';
import type { FishingRpcClient } from '../../src/features/pixel-world-phaser/ui/fishingAdapter.ts';

const SQL = readFileSync(new URL('../../supabase/migrations/supabase_pixel_fishing.sql', import.meta.url), 'utf8');

test('SQL seed matches fishCatalog.ts exactly', () => {
  const block = /insert into public\.pixel_fish_species[^]*?values([^]*?)on conflict/.exec(SQL);
  assert.ok(block, 'seed insert not found');
  const row = /\('([a-z_]+)', '([^']+)', '([a-z]+)', (null|array\[[^\]]*\]), (null|array\[[^\]]*\]), ([\d.]+), ([\d.]+), '([SML])', (\d+)\)/g;
  const list = (v: string) => v === 'null' ? 'any' : [...v.matchAll(/'([a-z]+)'/g)].map(m => m[1]);
  const seed = [...block[1].matchAll(row)].map(m => ({ order: Number(m[9]), fish: {
    id: m[1], name: m[2], rarity: m[3], phases: list(m[4]), weather: list(m[5]), minCm: Number(m[6]), maxCm: Number(m[7]), shadow: m[8],
  } }));
  assert.equal(seed.length, 12);
  assert.deepEqual(seed.map(s => s.order), seed.map((_, i) => i + 1), 'sort_order follows catalog order');
  assert.deepEqual(seed.map(s => s.fish), FISH_CATALOG.map(f => ({ ...f, phases: f.phases === 'any' ? 'any' : [...f.phases], weather: f.weather === 'any' ? 'any' : [...f.weather] })));
  // 하루 6마리·희귀도 가중치도 SQL과 같은 숫자.
  assert.equal((SQL.match(/>= 6/g) ?? []).length >= 2 && DAILY_CATCHES === 6, true);
  assert.match(SQL, /'common' then 60 when 'uncommon' then 28 when 'rare' then 10 else 2/);
});

test('weather twin matches the SQL FNV-1a formula on known dates', () => {
  // 기준값은 이 마이그레이션의 pixel_private.fish_fnv1a/fish_weather_for를 PGlite(Postgres)로 실행해 얻었다.
  assert.equal(fnv1a32('a'), 3826002220); // FNV-1a 32 표준 테스트 벡터(SQL verify 블록과 같음)
  assert.equal(fnv1a32(''), 2166136261);
  const fixtures: [string, number, string][] = [
    ['2026-01-01', 2049302883, 'clear'], ['2026-10-08', 1551704402, 'rain'], ['2026-10-09', 1568482021, 'rain'],
    ['2026-12-25', 1294219629, 'cloudy'], ['2027-03-01', 4211158162, 'clear'],
  ];
  for (const [date, hash, weather] of fixtures) {
    assert.equal(fnv1a32(date), hash, date);
    assert.equal(weatherForDate(date), weather, date);
  }
  assert.match(SQL, /h := \(\(h # get_byte\(b, i\)\) \* 16777619\) % 4294967296/);
  assert.match(SQL, /when r < 25 then 'rain' when r < 50 then 'cloudy' else 'clear'/);
  // 1년치 분포가 대략 25/25/50.
  const counts = { rain: 0, cloudy: 0, clear: 0 };
  for (let d = 0; d < 365; d++) counts[weatherForDate(new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10))]++;
  assert.ok(counts.rain > 50 && counts.cloudy > 50 && counts.clear > 130, JSON.stringify(counts));
});

test('KST phase boundaries', () => {
  const at = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return phaseForMinutes(h * 60 + m); };
  assert.equal(at('05:59'), 'night'); assert.equal(at('06:00'), 'morning'); assert.equal(at('10:59'), 'morning');
  assert.equal(at('11:00'), 'day'); assert.equal(at('16:59'), 'day'); assert.equal(at('17:00'), 'evening');
  assert.equal(at('19:59'), 'evening'); assert.equal(at('20:00'), 'night'); assert.equal(at('00:00'), 'night');
  // UTC 20:59 = KST 다음날 05:59, UTC 21:00 = KST 06:00.
  assert.deepEqual(kstParts(Date.parse('2026-10-07T20:59:00Z')), { kstDate: '2026-10-08', minutes: 359 });
  assert.equal(worldClockAt(Date.parse('2026-10-07T21:00:00Z')).phase, 'morning');
  assert.equal(worldClockAt(Date.parse('2026-10-07T14:59:00Z')).kstDate, '2026-10-07');
  assert.equal(worldClockAt(Date.parse('2026-10-07T15:00:00Z')).kstDate, '2026-10-08');
  // 덮어쓰기: 시간대·날씨만 바꾸고 날짜는 그대로.
  const o = worldClockAt(Date.parse('2026-10-08T03:00:00Z'), { clock: '21:30', weather: 'clear' });
  assert.deepEqual([o.kstDate, o.phase, o.weather], ['2026-10-08', 'night', 'clear']);
  assert.match(SQL, /m >= 360 and m < 660 then 'morning' when m >= 660 and m < 1020 then 'day'\s+when m >= 1020 and m < 1200 then 'evening' else 'night'/);
});

test('admin override params parse strictly', () => {
  assert.deepEqual(parseClockOverride('?pwClock=21:30&pwWeather=rain'), { clock: '21:30', weather: 'rain' });
  assert.deepEqual(parseClockOverride('pwWeather=cloudy'), { weather: 'cloudy' });
  assert.equal(parseClockOverride('?pwClock=24:00&pwWeather=snow'), null);
  assert.equal(parseClockOverride('?pwClock=9:30'), null);
  assert.equal(parseClockOverride(''), null);
  assert.equal(parseClockOverride(null), null);
});

const noonKst = Date.parse('2026-10-08T03:00:00Z'); // KST 12:00, 낮
const day = (fixedNow: number, extra: Parameters<typeof createMockFishingAdapter>[0] = {}) => { let now = fixedNow; return createMockFishingAdapter({ now: () => { now += 10_000; return now; }, override: { weather: 'clear' }, ...extra }); };

test('mock: unlimited catches, throttle, expiry and minimum reel time', async () => {
  let now = noonKst;
  const mock = createMockFishingAdapter({ now: () => now, seed: 7, activePet: 'pet_dog' });
  assert.equal((await mock.state()).remaining, -1);
  const first = await mock.start(null); assert.ok(first.ok);
  assert.deepEqual(await mock.start(null), { ok: false, reason: 'pending' });
  assert.deepEqual(await mock.finish(first.castId, true), { ok: true, landed: false });
  assert.deepEqual(await mock.finish(first.castId, true), { ok: false });
  assert.deepEqual(await mock.start(null), { ok: false, reason: 'pending' });
  now += 2000;
  const stale = await mock.start(null); assert.ok(stale.ok);
  now += 90_000;
  assert.deepEqual(await mock.finish(stale.castId, true), { ok: false });
  for (let i = 0; i < 12; i++) {
    const cast = await mock.start(null); assert.ok(cast.ok);
    assert.ok(cast.difficulty >= 1 && cast.difficulty <= 5);
    now += 10_000;
    const result = await mock.finish(cast.castId, true); assert.ok(result.ok && result.landed);
    assert.equal(result.remaining, -1);
  }
  assert.equal((await mock.state()).remaining, -1);
  assert.notEqual((await mock.state()).sparkleShadow, null);
});

test('mock: catch facts follow the catalog, phase and weather', async () => {
  const mock = day(Date.parse('2026-10-08T13:00:00Z'), { seed: 3 }); // KST 22:00 밤
  const seen: string[] = [];
  for (let i = 0; i < 6; i++) {
    const s = await mock.start(null);
    assert.ok(s.ok);
    const fish = fishById(mock.peek()!.speciesId)!;
    assert.equal(s.shadow, fish.shadow);
    const f = await mock.finish(s.castId, true);
    assert.ok(f.ok && f.landed);
    assert.ok(fishValidNow(fish, 'night', 'clear'), fish.id);
    assert.ok(f.lengthCm >= fish.minCm && f.lengthCm <= fish.maxCm);
    assert.equal(Math.round(f.lengthCm * 10) / 10, f.lengthCm);
    assert.equal(f.isNew, !seen.includes(fish.id)); seen.push(fish.id);
    assert.equal(f.isBig, f.lengthCm >= fish.minCm + 0.8 * (fish.maxCm - fish.minCm));
  }
  const state = await mock.state();
  assert.equal(state.album.reduce((a, e) => a + e.count, 0), 6);
});

test('mock: pity offers an uncaught valid species after 5 known catches (35% per cast)', async () => {
  const old = (i: number, speciesId: string): MockCatch => ({ id: 'c' + i, speciesId, lengthCm: 8, caughtAt: `2026-09-0${i + 1}T00:00:00.000Z`, kstDate: `2026-09-0${i + 1}` });
  const catches = [old(0, 'pirami'), old(1, 'pirami'), old(2, 'pirami'), old(3, 'pirami'), old(4, 'pirami'), old(5, 'pirami')];
  assert.equal(pityDue(catches), true);
  assert.equal(pityDue(catches.slice(0, 5)), false, 'the first pirami was new');
  assert.equal(pityDue([...catches, { speciesId: 'buri' }]), false);
  let forced = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const mock = day(noonKst, { seed, catches });
    const s = await mock.start(null); assert.ok(s.ok);
    const p = mock.peek()!;
    assert.ok(fishValidNow(fishById(p.speciesId)!, 'day', 'clear'));
    if (p.pity) { forced++; assert.notEqual(p.speciesId, 'pirami', 'seed ' + seed); }
  }
  assert.ok(forced > 400 * 0.28 && forced < 400 * 0.42, `pity share ${forced}/400`);
});

test('mock: pet perks — dog sparkle, pigeon hint, bear length, unowned pet ignored', async () => {
  const dog = day(Date.parse('2026-10-08T13:00:00Z'), { activePet: 'pet_dog', seed: 11 });
  const st = await dog.state();
  assert.ok(st.sparkleShadow !== null && st.sparkleShadow >= 0 && st.sparkleShadow <= 2);
  for (let i = 0; i < 6; i++) {
    const s = await dog.start('pet_dog'); assert.ok(s.ok);
    const rarity = fishById(dog.peek()!.speciesId)!.rarity;
    assert.equal(s.hint, rarity === 'rare' || rarity === 'legendary' ? 'sparkle' : null);
    await dog.finish(s.castId, true);
  }
  assert.notEqual((await dog.state()).sparkleShadow, null);

  const pigeon = day(noonKst, { activePet: 'pet_pigeon' });
  assert.match((await pigeon.state()).pigeonHint ?? '', /친구가 나온대요!$/);
  assert.equal((await day(noonKst).state()).pigeonHint, null);

  const bear = day(noonKst, { activePet: 'pet_bear', seed: 5 });
  const plain = day(noonKst, { activePet: null, seed: 5 });
  const b = await bear.start('pet_bear'), p = await plain.start('pet_bear'); // plain은 곰을 데리고 있지 않다 → 혜택 없음
  assert.ok(b.ok && p.ok);
  assert.equal(bear.peek()!.speciesId, plain.peek()!.speciesId);
  const fish = fishById(bear.peek()!.speciesId)!;
  assert.ok(bear.peek()!.lengthCm <= Math.round(fish.maxCm * 1.08 * 10) / 10);
  assert.ok(Math.abs(bear.peek()!.lengthCm - Math.round(plain.peek()!.lengthCm * 1.08 * 10) / 10) <= 0.11);
});

test('hint text matches the SQL wording rules', () => {
  assert.equal(fishHintText(fishById('moonfish')!), '밤에 맑으면 달빛 피라미 친구가 나온대요!');
  assert.equal(fishHintText(fishById('mandarin')!), '낮·저녁에 비가 안 오면 쏘가리 친구가 나온대요!');
  assert.equal(fishHintText(fishById('rainbow_koi')!), '비가 오면 무지개 잉어 친구가 나온대요!');
  assert.equal(fishHintText(fishById('pirami')!), '언제든 피라미 친구가 나온대요!');
  assert.match(SQL, /'비가 안 오면 '/); assert.match(SQL, /'언제든 '/); assert.match(SQL, /' 친구가 나온대요!'/);
});

test('mock is deterministic for a seed', async () => {
  const run = async () => { const m = day(noonKst, { seed: 42 }); const out = []; for (let i = 0; i < 6; i++) { const s = await m.start(null); if (s.ok) out.push(s, await m.finish(s.castId, true)); } return out; };
  assert.deepEqual(await run(), await run());
});

test('adapter parsing is defensive', () => {
  assert.equal(parseFishingState({ remaining: -1 }).remaining, -1);
  const easy = parseCastStart({ ok: true, castId: 'easy', shadow: 'S', biteDelayMs: 1200, difficulty: -20 });
  assert.ok(easy.ok && easy.difficulty === 1);
  const hard = parseCastStart({ ok: true, castId: 'hard', shadow: 'S', biteDelayMs: 1200, difficulty: 99 });
  assert.ok(hard.ok && hard.difficulty === 5);
  const fb = parseFishingState(null);
  assert.equal(fb.remaining, 0); assert.deepEqual(fb.album, []);
  const s = parseFishingState({ kstDate: '2026-10-08', phase: 'dusk', weather: 'rain', remaining: '3', sparkleShadow: 7, pigeonHint: 5,
    album: [{ speciesId: 'carp', count: 2, bestCm: '41.5', firstAt: '2026-10-08T00:00:00Z' }, { speciesId: 'x' }, null] });
  assert.equal(s.phase, fb.phase); assert.equal(s.weather, 'rain'); assert.equal(s.remaining, 3);
  assert.equal(s.sparkleShadow, null); assert.equal(s.pigeonHint, null);
  assert.deepEqual(s.album, [{ speciesId: 'carp', count: 2, bestCm: 41.5, firstAt: '2026-10-08T00:00:00Z' }]);

  assert.deepEqual(parseCastStart(undefined), { ok: false, reason: 'error' });
  assert.deepEqual(parseCastStart({ ok: false, reason: 'budget' }), { ok: false, reason: 'budget' });
  assert.deepEqual(parseCastStart({ ok: false, reason: 'weird' }), { ok: false, reason: 'error' });
  assert.deepEqual(parseCastStart({ ok: true, castId: 'c', shadow: 'XL', biteDelayMs: 1000 }), { ok: false, reason: 'error' });
  assert.deepEqual(parseCastStart({ ok: true, castId: 'c', shadow: 'M', biteDelayMs: 1500, pattern: 'zigzag', hint: 'x', speciesId: 'eel' }),
    { ok: true, castId: 'c', shadow: 'M', biteDelayMs: 1500, difficulty: 1, pattern: 'quick', hint: null });

  assert.deepEqual(parseCastFinish('nope'), { ok: false });
  assert.deepEqual(parseCastFinish({ ok: true, landed: false }), { ok: true, landed: false });
  assert.deepEqual(parseCastFinish({ ok: true, landed: true, speciesId: 'eel', lengthCm: 50, rarity: 'mythic' }), { ok: false });
  assert.deepEqual(parseCastFinish({ ok: true, landed: true, speciesId: 'eel', lengthCm: '50.5', rarity: 'rare', isNew: 1, isBig: true, remaining: 2 }),
    { ok: true, landed: true, speciesId: 'eel', lengthCm: 50.5, rarity: 'rare', isNew: false, isBig: true, isPersonalBest: false, remaining: 2 });

  assert.deepEqual(parseClassFishBoard(null), { rows: [], classSpecies: 0 });
  const board = parseClassFishBoard({ rows: [{ speciesId: 'carp', lengthCm: 60, animal: '🐻', caughtAt: 't', user_id: 'secret', name: '홍길동' }, { lengthCm: 3 }], classSpecies: 4 });
  assert.deepEqual(board, { rows: [{ speciesId: 'carp', lengthCm: 60, animal: '🐻', caughtAt: 't' }], classSpecies: 4 });
});

test('adapter never throws and sends override args only when given', async () => {
  const calls: [string, Record<string, unknown> | undefined][] = [];
  const failing: FishingRpcClient = { rpc(fn, args) { calls.push([fn, args]); return Promise.reject(new Error('network')); } };
  const a = createFishingAdapter(failing);
  assert.equal((await a.state()).remaining, 0);
  assert.deepEqual(await a.start('pet_dog'), { ok: false, reason: 'error' });
  assert.deepEqual(await a.finish('c', true), { ok: false });
  assert.deepEqual(await a.board(), { rows: [], classSpecies: 0 });
  assert.deepEqual(calls[0], ['get_pixel_fishing_state', {}]);
  assert.deepEqual(calls[1], ['start_pixel_cast', { p_pet: 'pet_dog' }]);
  assert.deepEqual(calls[2], ['finish_pixel_cast', { p_cast_id: 'c', p_landed: true }]);

  const errored: FishingRpcClient = { rpc: () => Promise.resolve({ data: null, error: { message: 'boom' } }) };
  assert.deepEqual(await createFishingAdapter(errored).start(null), { ok: false, reason: 'error' });

  const seen: Record<string, unknown>[] = [];
  const ok: FishingRpcClient = { rpc(_fn, args) { seen.push(args ?? {}); return Promise.resolve({ data: { ok: true, castId: 'k', shadow: 'L', biteDelayMs: 2000, pattern: 'long', hint: 'sparkle' }, error: null }); } };
  const admin = createFishingAdapter(ok, { clock: '21:30', weather: 'rain' });
  assert.deepEqual(await admin.start(null), { ok: true, castId: 'k', shadow: 'L', biteDelayMs: 2000, difficulty: 1, pattern: 'long', hint: 'sparkle' });
  assert.deepEqual(seen[0], { p_pet: null, p_override_clock: '21:30', p_override_weather: 'rain' });
});

test('migration keeps points untouched and never exposes user ids or names on the board', () => {
  const code = SQL.replace(/--.*$/gm, '');
  assert.doesNotMatch(code, /point_adjustment|bonus_points|public\.profiles\s+set|update public\.profiles/);
  const board = SQL.slice(SQL.indexOf('create or replace function pixel_private.get_class_fish_board'), SQL.indexOf('-- 9)'));
  assert.doesNotMatch(board, /'userId'|'user_id'|nickname|display_name/);
  assert.match(board, /md5\('exam-peer-face:' \|\| b\.user_id::text\)/);
  // 시험 친구 풀이와 같은 33개 동물 목록.
  const faces = (src: string) => /v_faces constant text\[\] := array\[([^\]]+)\]/.exec(src)?.[1].replace(/\s+/g, '');
  const peer = readFileSync(new URL('../../supabase/migrations/20261005000000_exam_peer_solution_animal_faces.sql', import.meta.url), 'utf8');
  assert.equal(faces(board), faces(peer));
});

test('v2 migration retains security, unlimited compatibility and timing checks', () => {
  const v2 = readFileSync(new URL('../../supabase/migrations/supabase_pixel_fishing_v2.sql', import.meta.url), 'utf8');
  assert.equal((v2.match(/security definer set search_path = ''/g) ?? []).length, 3);
  assert.equal((v2.match(/'remaining', -1/g) ?? []).length, 3);
  assert.doesNotMatch(v2, /reason', 'budget'|>= 6|v_used < 6/);
  assert.match(v2, /interval '2 seconds'/);
  assert.match(v2, /interval '90 seconds'/);
  assert.match(v2, /k.bite_delay_ms \+ 1500 \+ \(v_difficulty - 1\) \* 375/);
  assert.match(v2, /fish_start_throttle enable row level security/);
  assert.equal((v2.match(/if u is null then/g) ?? []).length, 3);
  assert.match(v2, /where id = p_cast_id and user_id = u/);
  assert.match(v2, /pg_advisory_xact_lock/);
  assert.equal((v2.match(/v_difficulty := least\(5/g) ?? []).length, 2);
  assert.match(v2, /select \* into s from public.pixel_fish_species where id = k.species_id/);
});

test('v3 희귀도와 길이 공식이 SQL, 타입스크립트와 모의 서버에서 일치한다', async () => {
  const v3 = readFileSync(new URL('../../supabase/migrations/supabase_pixel_fishing_v3.sql', import.meta.url), 'utf8');
  const helper = v3.slice(0, v3.indexOf('create or replace function pixel_private.start_pixel_cast'));
  const cases = [...helper.matchAll(/case s\.rarity when 'common' then ([\d.]+) when 'uncommon' then ([\d.]+) when 'rare' then ([\d.]+) else ([\d.]+) end/g)].map(m => m.slice(1).map(Number));
  assert.deepEqual(cases, [[1, 1.8, 2.8, 3.8], [1, 1.2, 1.4, 1.2]]);
  assert.match(helper, /round\(least\(5,/);
  assert.match(helper, /greatest\(0, least\(1, \(p_length - s.min_cm\) \/ nullif\(s.max_cm - s.min_cm, 0\)\)\)/);
  assert.match(helper, /\), 2\) from public.pixel_fish_species s where s.id = p_species/);
  assert.match(helper, /revoke execute on function pixel_private.fish_difficulty\(text, numeric\) from public, anon, authenticated/);
  const sqlTwin = (fish: typeof FISH_CATALOG[number], length: number) => {
    const index = ['common', 'uncommon', 'rare', 'legendary'].indexOf(fish.rarity);
    const ratio = Math.max(0, Math.min(1, (length - fish.minCm) / (fish.maxCm - fish.minCm)));
    return Math.round(Math.min(5, cases[0][index] + cases[1][index] * ratio) * 100) / 100;
  };
  for (const fish of FISH_CATALOG) for (const ratio of [-.1, 0, .125, .5, .8, 1, 1.08]) {
    const length = fish.minCm + ratio * (fish.maxCm - fish.minCm);
    assert.equal(fishDifficulty(fish, length), sqlTwin(fish, length), `${fish.id} ${ratio}`);
  }
  for (let seed = 0; seed < 100; seed++) {
    const mock = createMockFishingAdapter({ seed, now: () => noonKst, activePet: 'pet_bear' });
    const start = await mock.start('pet_bear'); assert.ok(start.ok);
    const pending = mock.peek()!, fish = fishById(pending.speciesId)!;
    // v4: 대물은 +1.5(최대 5). 낚싯대 없음 = 낮춤 0.
    assert.equal(start.difficulty, rodDifficulty(sqlTwin(fish, pending.lengthCm), 0, pending.trophy));
    assert.equal(start.big, pending.lengthCm >= fish.minCm + .8 * (fish.maxCm - fish.minCm));
  }
  const old = parseCastStart({ ok: true, castId: 'c', shadow: 'S', biteDelayMs: 1200 }); assert.ok(old.ok && old.big === undefined);
  const big = parseCastStart({ ok: true, castId: 'c', shadow: 'S', biteDelayMs: 1200, big: true }); assert.ok(big.ok && big.big === true);
  const invalid = parseCastStart({ ok: true, castId: 'c', shadow: 'S', biteDelayMs: 1200, big: 'true' }); assert.ok(invalid.ok && invalid.big === undefined);
});
test('v3는 난이도와 큰 물고기 안내 외에 v2 함수 본문을 유지한다', () => {
  const v2 = readFileSync(new URL('../../supabase/migrations/supabase_pixel_fishing_v2.sql', import.meta.url), 'utf8');
  const v3 = readFileSync(new URL('../../supabase/migrations/supabase_pixel_fishing_v3.sql', import.meta.url), 'utf8');
  for (const name of ['start_pixel_cast', 'finish_pixel_cast']) {
    const body = (sql: string) => new RegExp(`create or replace function pixel_private.${name}[^]*?end \\$\\$;`).exec(sql)![0];
    const normalize = (sql: string) => body(sql).replace(/v_difficulty := [^;]+;/, 'v_difficulty := FORMULA;').replace(", 'big', v_len >= v_fish.min_cm + 0.8 * (v_fish.max_cm - v_fish.min_cm)", '');
    assert.equal(normalize(v3), normalize(v2), name);
  }
  assert.match(v3, /fish_difficulty\(v_fish.id, v_len\)/);
  assert.match(v3, /fish_difficulty\(k.species_id, k.length_cm\)/);
  assert.match(v3, /k.bite_delay_ms \+ 1500 \+ \(v_difficulty - 1\) \* 375/);
  assert.match(v3, /to authenticated/);
});

// ── v4: 낚싯대·어려운 물고기 15%·피티 35% ─────────────────────────────────────────
const V4 = readFileSync(new URL('../../supabase/migrations/supabase_pixel_fishing_v4.sql', import.meta.url), 'utf8');
const v4Fn = (name: string) => new RegExp(`create or replace function pixel_private.${name}\\([^]*?(end \\$\\$;|\\$\\$;)`).exec(V4)![0];
const PHASE_CLOCK: Record<string, string> = { morning: '08:00', day: '13:00', evening: '18:00', night: '22:00' };
const pityCatches = (): MockCatch[] => [0, 1, 2, 3, 4, 5].map(i => ({ id: 'c' + i, speciesId: 'pirami', lengthCm: 8, caughtAt: `2026-09-0${i + 1}T00:00:00.000Z`, kstDate: `2026-09-0${i + 1}` }));

test('v4 낚싯대 표가 계약(FISHING_RODS)과 같다 — 효과표와 상점 카탈로그 모두', () => {
  const effects = /insert into pixel_private\.fish_rods[^]*?values([^]*?)on conflict/.exec(V4)![1];
  const rows = [...effects.matchAll(/\('(rod_[a-z]+)', (\d), ([\d.]+), ([\d.]+), ([\d.]+)\)/g)]
    .map(m => ({ id: m[1], tier: +m[2], difficultyDown: +m[3], rareBonus: +m[4], speed: +m[5] }));
  assert.deepEqual(rows, FISHING_RODS.map(({ id, tier, difficultyDown, rareBonus, speed }) => ({ id, tier, difficultyDown, rareBonus, speed })));
  const catalog = /insert into public\.pixel_item_catalog[^]*?values([^]*?)on conflict/.exec(V4)![1];
  const items = [...catalog.matchAll(/\('(rod_[a-z]+)','rod','rod',(\d+),'[a-z]+','([^']+)',(\d),false\)/g)]
    .map(m => ({ id: m[1], price: +m[2], name: m[3], tier: +m[4] }));
  assert.deepEqual(items, FISHING_RODS.map(({ id, price, name, tier }) => ({ id, price, name, tier })));
  assert.deepEqual(FISHING_RODS.map(r => [r.id, r.name, r.price, r.tier, r.difficultyDown, r.rareBonus, r.speed]), [
    ['rod_bamboo', '대나무 낚싯대', 80, 1, 0.3, 0, 1.0], ['rod_steel', '강철 낚싯대', 200, 2, 0.5, 0, 1.15],
    ['rod_lucky', '행운의 낚싯대', 400, 3, 0.5, 5, 1.25], ['rod_gold', '황금 낚싯대', 700, 4, 0.8, 8, 1.35],
  ]);
  assert.match(V4, /category in \('avatar','furniture','pet','rod'\)/);
  assert.match(V4, /slot in \('top','bottom','shoes','hair','eyes','furniture','pet','rod'\)/);
  // 포인트는 마이그레이션이 직접 건드리지 않는다(차감은 기존 purchase_pixel_item만).
  assert.doesNotMatch(V4.replace(/--.*$/gm, ''), /point_adjustment|bonus_points|update public\.profiles/);
});

test('v4 보안: definer·search_path·잠금·시작 간격·소유 확인·권한을 유지한다', () => {
  for (const name of ['get_pixel_fishing_state', 'start_pixel_cast', 'finish_pixel_cast', 'equip_pixel_rod']) {
    assert.match(v4Fn(name), /security definer set search_path = ''/, name);
    assert.match(v4Fn(name), /if u is null then raise exception 'Authentication required'/, name);
  }
  for (const name of ['start_pixel_cast', 'finish_pixel_cast']) assert.match(v4Fn(name), /pg_advisory_xact_lock\(hashtextextended\('pixel_fish:' \|\| u::text, 0\)\)/, name);
  const start = v4Fn('start_pixel_cast');
  assert.match(start, /interval '2 seconds'/);
  assert.match(start, /interval '90 seconds'/);
  assert.match(start, /pixel_private.fish_active_rod\(u\)/);
  // 장착 + 소유(ownership join)를 모두 확인한다.
  assert.match(v4Fn('fish_active_rod'), /join public.pixel_item_ownership o on o.user_id = e.user_id and o.item_id = e.rod_id/);
  assert.match(v4Fn('equip_pixel_rod'), /'not_owned'/);
  assert.match(V4, /grant select on public.pixel_rod_equipment to authenticated/);
  assert.doesNotMatch(V4, /grant [^;]*(insert|update)[^;]*pixel_rod_equipment/);
  assert.match(V4, /grant execute on function public.equip_pixel_rod\(text\) to authenticated/);
  assert.match(V4, /revoke all on function public.equip_pixel_rod\(text\) from public, anon, authenticated, service_role/);
  // 배포 순서: 예전 응답 필드를 모두 그대로 돌려주고 rod·speed·trophy는 덧붙이기만.
  for (const key of ['castId', 'shadow', 'biteDelayMs', 'difficulty', 'big', 'remaining', 'pattern', 'hint', 'rod', 'speed', 'trophy']) assert.match(start, new RegExp(`'${key}', `), key);
  assert.match(start, /create or replace function pixel_private.start_pixel_cast\(p_pet text, p_override_clock text default null, p_override_weather text default null\)/);
});

test('v4 SQL 굴림 상수가 모의 서버와 같다', () => {
  const start = v4Fn('start_pixel_cast');
  assert.match(start, /random\(\) \* 100 < 15 \+ v_bonus/);
  assert.equal(HARD_FISH_PERCENT, 15);
  assert.match(start, /case s.rarity when 'rare' then 5 else 1 end/);
  assert.match(start, /random\(\) < 0.35/);
  assert.equal(PITY_CHANCE, 0.35);
  assert.match(start, /0.85 \+ random\(\) \* 0.15/);
  assert.match(start, /least\(5, v_difficulty \+ 1.5\)/);
  assert.match(start, /greatest\(1, v_difficulty - v_down\)/);
  assert.match(start, /'common' then 60 when 'uncommon' then 28 when 'rare' then 10 else 2/);
});

async function simulate(phase: string, weather: 'clear' | 'cloudy' | 'rain', rod: FishingRodId | null, casts: number, seed: number) {
  let now = noonKst;
  const mock = createMockFishingAdapter({ seed, now: () => now, override: { clock: PHASE_CLOCK[phase], weather }, rod });
  const tally = { hard: 0, trophy: 0, rareOrLegend: 0, total: 0 };
  for (let i = 0; i < casts; i++) {
    now += 3000;
    const s = await mock.start(null); assert.ok(s.ok);
    const p = mock.peek()!;
    tally.total++;
    if (p.hard) tally.hard++;
    if (p.trophy) tally.trophy++;
    const r = fishById(p.speciesId)!.rarity;
    if (r === 'rare' || r === 'legendary') tally.rareOrLegend++;
    await mock.finish(s.castId, false);
  }
  return tally;
}

test('v4 분포: 시간대·날씨마다 10,000번 던지면 어려운 물고기(희귀/전설 또는 대물)가 15% ±2%', async () => {
  const lines: string[] = [];
  for (const phase of ['morning', 'day', 'evening', 'night']) for (const weather of ['clear', 'cloudy', 'rain'] as const) {
    const t = await simulate(phase, weather, null, 10_000, 1000 + phase.length * 7 + weather.length);
    const share = t.hard / t.total;
    assert.ok(Math.abs(share - 0.15) <= 0.02, `${phase}/${weather} hard ${share}`);
    const hasHard = FISH_CATALOG.some(f => (f.rarity === 'rare' || f.rarity === 'legendary') && fishValidNow(f, phase as never, weather));
    // 지금 희귀/전설이 있으면 대물은 없고, 없으면 어려운 굴림은 전부 대물.
    if (hasHard) assert.equal(t.trophy, 0, `${phase}/${weather}`); else assert.equal(t.trophy, t.hard, `${phase}/${weather}`);
    lines.push(`${phase}/${weather} hard=${(share * 100).toFixed(1)}% trophy=${t.trophy} rare+legendary(all rolls)=${(t.rareOrLegend / t.total * 100).toFixed(1)}%`);
  }
  console.log('v4 distribution\n' + lines.join('\n'));
});

test('v4 분포: 낚싯대 희귀 보너스(%p)가 어려운 물고기 확률에 그대로 더해진다', async () => {
  for (const rod of FISHING_RODS) for (const [phase, weather] of [['night', 'clear'], ['day', 'clear']] as const) {
    const t = await simulate(phase, weather, rod.id, 10_000, 77 + rod.tier);
    const want = (HARD_FISH_PERCENT + rod.rareBonus) / 100;
    assert.ok(Math.abs(t.hard / t.total - want) <= 0.02, `${rod.id} ${phase}/${weather} ${t.hard / t.total} vs ${want}`);
  }
});

test('v4 대물: 보통(없으면 흔함) 물고기, 난이도 +1.5(최대 5) 후 낚싯대만큼 낮춤(최소 1)', () => {
  let a = 9;
  const rand = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; };
  const dayClear = FISH_CATALOG.filter(f => fishValidNow(f, 'day', 'clear'));
  for (let i = 0; i < 2000; i++) {
    const r = rollCastFish({ valid: dayClear, caught: new Set(), pityDue: false, skipPity: false, rareBonus: 0, rand })!;
    if (r.trophy) assert.equal(r.fish.rarity, 'uncommon');
    assert.notEqual(r.fish.rarity, 'rare'); assert.notEqual(r.fish.rarity, 'legendary');
  }
  const commonsOnly = FISH_CATALOG.filter(f => f.rarity === 'common');
  for (let i = 0; i < 500; i++) {
    const r = rollCastFish({ valid: commonsOnly, caught: new Set(), pityDue: false, skipPity: false, rareBonus: 100, rand })!;
    assert.ok(r.trophy && r.fish.rarity === 'common');
  }
  assert.equal(rodDifficulty(4.2, 0, true), 5);
  assert.equal(rodDifficulty(2, 0.8, true), 2.7);
  assert.equal(rodDifficulty(1.1, 0.5), 1);
});

test('v4 대물 캐스트는 길이 상위 15%·큰 물고기·trophy=true', async () => {
  let seen = 0;
  for (let seed = 0; seed < 400 && seen < 20; seed++) {
    const mock = createMockFishingAdapter({ seed, now: () => noonKst, override: { clock: '13:00', weather: 'clear' } });
    const s = await mock.start(null); assert.ok(s.ok);
    const p = mock.peek()!;
    if (!p.trophy) continue;
    seen++;
    const fish = fishById(p.speciesId)!;
    assert.ok(p.lengthCm >= fish.minCm + 0.85 * (fish.maxCm - fish.minCm) - 0.05, `${fish.id} ${p.lengthCm}`);
    assert.ok(s.trophy === true && s.big === true);
    assert.equal(s.difficulty, rodDifficulty(fishDifficulty(fish, p.lengthCm), 0, true));
  }
  assert.ok(seen >= 20, `trophy casts ${seen}`);
});

test('v4 피티: 놓친 피티 캐스트 바로 다음은 피티가 아니고, 같은 물고기가 되풀이되지 않는다', async () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    let now = noonKst;
    const mock = createMockFishingAdapter({ seed, now: () => now, override: { clock: '22:00', weather: 'clear' }, catches: pityCatches() });
    let prevPityMissed = false, pityCount = 0, eligible = 0, run = 1, longest = 1, prev = '';
    for (let i = 0; i < 400; i++) {
      now += 3000;
      const s = await mock.start(null); assert.ok(s.ok);
      const p = mock.peek()!;
      if (prevPityMissed) assert.equal(p.pity, false, `seed ${seed} cast ${i}: pity right after a missed pity cast`);
      else { eligible++; if (p.pity) pityCount++; }
      run = p.speciesId === prev ? run + 1 : 1; longest = Math.max(longest, run); prev = p.speciesId;
      // 학생이 계속 놓친다(가장 나쁜 경우).
      assert.deepEqual(await mock.finish(s.castId, false), { ok: true, landed: false });
      prevPityMissed = p.pity;
    }
    const share = pityCount / eligible;
    assert.ok(share > 0.28 && share < 0.42, `seed ${seed} pity share ${share}`);
    assert.ok(longest <= 6, `seed ${seed} same fish ${longest} times in a row`);
  }
});

test('v4 피티: 만료된 피티 캐스트도 놓친 것으로 친다(SQL도 같은 규칙)', async () => {
  let checked = 0;
  for (let seed = 0; seed < 200 && checked < 10; seed++) {
    let now = noonKst;
    const mock = createMockFishingAdapter({ seed, now: () => now, override: { clock: '22:00', weather: 'clear' }, catches: pityCatches() });
    assert.ok((await mock.start(null)).ok);
    if (!mock.peek()!.pity) continue;
    now += 91_000; // 만료
    assert.ok((await mock.start(null)).ok);
    assert.equal(mock.peek()!.pity, false); checked++;
  }
  assert.equal(checked, 10);
  const fin = v4Fn('finish_pixel_cast');
  assert.match(fin, /if k.id is not null and k.pity then[^]*?skip_next = true/);
  assert.match(fin, /if k.pity then update pixel_private.fish_pity_state set skip_next = false/);
  const start = v4Fn('start_pixel_cast');
  assert.match(start, /returning pity\)\s+select coalesce\(bool_or\(pity\), false\) into v_skip/);
  assert.match(start, /coalesce\(v_pity, false\) and not v_skip and random\(\) < 0.35/);
});

test('v4 속도: 입질 대기·최소 끌어올리기 시간을 speed로 나누고, 시작할 때 값으로 끝낸다', async () => {
  assert.equal(rodBiteDelayMs(2700, 1.35), 2000);
  assert.equal(rodBiteDelayMs(1200, 1), 1200);
  assert.equal(rodMinReelMs(1, 1), 1500);
  assert.equal(rodMinReelMs(3, 1.25), (1500 + 2 * 375) / 1.25);
  assert.equal(rodMinReelMs(5, 1.35), minReelMs(5) / 1.35);
  const start = v4Fn('start_pixel_cast'), fin = v4Fn('finish_pixel_cast');
  assert.match(start, /v_delay := round\(v_delay \/ v_speed\)/);
  assert.match(fin, /k.bite_delay_ms \+ \(1500 \+ \(v_difficulty - 1\) \* 375\) \/ k.rod_speed/);
  assert.match(fin, /v_difficulty := coalesce\(k.difficulty, pixel_private.fish_difficulty\(k.species_id, k.length_cm\)\)/);
  assert.doesNotMatch(fin, /fish_active_rod|fish_rods/, 'finish must not re-read the equipped rod');

  for (const rod of FISHING_RODS) {
    let now = noonKst;
    const mock = createMockFishingAdapter({ seed: rod.tier, now: () => now, override: { clock: '22:00', weather: 'clear' }, rod: rod.id });
    for (let i = 0; i < 30; i++) {
      now += 3000;
      const s = await mock.start(null); assert.ok(s.ok);
      const p = mock.peek()!, fish = fishById(p.speciesId)!;
      assert.equal(s.speed, rod.speed); assert.deepEqual(s.rod, { id: rod.id, tier: rod.tier });
      assert.ok(s.biteDelayMs >= Math.round(1200 / rod.speed) && s.biteDelayMs <= Math.round(5000 / rod.speed), `${rod.id} ${s.biteDelayMs}`);
      assert.equal(s.difficulty, rodDifficulty(fishDifficulty(fish, p.lengthCm), rod.difficultyDown, p.trophy));
      // 중간에 낚싯대를 바꿔도 이 캐스트는 그대로.
      assert.ok((await mock.equipRod(null)).ok);
      const ready = s.biteDelayMs + rodMinReelMs(s.difficulty!, rod.speed);
      now += Math.floor(ready) - 5;
      if (i % 2) assert.deepEqual(await mock.finish(s.castId, true), { ok: true, landed: false });
      else { now += 10; const f = await mock.finish(s.castId, true); assert.ok(f.ok && f.landed, `${rod.id} landed at min reel/speed`); }
      assert.ok((await mock.equipRod(rod.id)).ok);
    }
  }
});

test('v4 모의 서버: 장착은 가진 낚싯대만, 상태에 rod가 보인다', async () => {
  const mock = createMockFishingAdapter({ now: () => noonKst, ownedRods: ['rod_bamboo'] });
  assert.deepEqual((await mock.state()).rod, { id: null, tier: 0 });
  assert.deepEqual(await mock.equipRod('rod_gold'), { ok: false, reason: 'not_owned' });
  assert.deepEqual(await mock.equipRod('rod_nope' as FishingRodId), { ok: false, reason: 'not_found' });
  assert.deepEqual(await mock.equipRod('rod_bamboo'), { ok: true, rod: { id: 'rod_bamboo', tier: 1 } });
  assert.deepEqual((await mock.state()).rod, { id: 'rod_bamboo', tier: 1 });
  const s = await mock.start(null); assert.ok(s.ok && s.speed === 1 && s.trophy !== undefined);
  assert.deepEqual(await mock.equipRod(null), { ok: true, rod: { id: null, tier: 0 } });
});

test('v4 어댑터: rod·speed·trophy는 덧붙이기만, 방어적으로 읽고 equip_pixel_rod를 부른다', async () => {
  const old = parseCastStart({ ok: true, castId: 'c', shadow: 'S', biteDelayMs: 1200, difficulty: 2 });
  assert.ok(old.ok && old.rod === undefined && old.speed === undefined && old.trophy === undefined);
  const v4 = parseCastStart({ ok: true, castId: 'c', shadow: 'S', biteDelayMs: 900, difficulty: 2, rod: { id: 'rod_gold', tier: 4 }, speed: '1.35', trophy: true });
  assert.ok(v4.ok); assert.deepEqual([v4.rod, v4.speed, v4.trophy], [{ id: 'rod_gold', tier: 4 }, 1.35, true]);
  const weird = parseCastStart({ ok: true, castId: 'c', shadow: 'S', biteDelayMs: 900, rod: { id: 'rod_laser', tier: 9 }, speed: 50, trophy: 'yes' });
  assert.ok(weird.ok); assert.deepEqual([weird.rod, weird.speed, weird.trophy], [{ id: null, tier: 0 }, 2, undefined]);
  const slow = parseCastStart({ ok: true, castId: 'c', shadow: 'S', biteDelayMs: 900, speed: 0.1 }); assert.ok(slow.ok && slow.speed === 1);
  // 서버가 tier를 잘못 보내도 카탈로그 tier를 믿는다.
  assert.deepEqual(parseFishingState({ rod: { id: 'rod_steel', tier: 99 } }).rod, { id: 'rod_steel', tier: 2 });
  assert.deepEqual(parseFishingState({}).rod, { id: null, tier: 0 });
  assert.deepEqual(parseFishingState(null).rod, { id: null, tier: 0 });
  assert.deepEqual(parseEquipRod({ ok: false, reason: 'not_owned' }), { ok: false, reason: 'not_owned' });
  assert.deepEqual(parseEquipRod({ ok: false, reason: 'boom' }), { ok: false, reason: 'error' });
  assert.deepEqual(parseEquipRod('x'), { ok: false, reason: 'error' });
  assert.deepEqual(parseEquipRod({ ok: true, rod: { id: 'rod_lucky', tier: 3 } }), { ok: true, rod: { id: 'rod_lucky', tier: 3 } });
  const calls: [string, Record<string, unknown> | undefined][] = [];
  const client: FishingRpcClient = { rpc(fn, args) { calls.push([fn, args]); return Promise.resolve({ data: { ok: true, rod: { id: null, tier: 0 } }, error: null }); } };
  const a = createFishingAdapter(client);
  assert.deepEqual(await a.equipRod!(null), { ok: true, rod: { id: null, tier: 0 } });
  await a.equipRod!('rod_bamboo');
  assert.deepEqual(calls, [['equip_pixel_rod', { p_item_id: null }], ['equip_pixel_rod', { p_item_id: 'rod_bamboo' }]]);
  const failing: FishingRpcClient = { rpc: () => Promise.reject(new Error('net')) };
  assert.deepEqual(await createFishingAdapter(failing).equipRod!('rod_gold'), { ok: false, reason: 'error' });
});
