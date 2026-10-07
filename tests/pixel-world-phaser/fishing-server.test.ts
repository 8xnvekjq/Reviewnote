import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAILY_CATCHES, FISH_CATALOG, fishById } from '../../src/features/pixel-world-phaser/logic/fishCatalog.ts';
import { fnv1a32, kstParts, parseClockOverride, phaseForMinutes, weatherForDate, worldClockAt } from '../../src/features/pixel-world-phaser/logic/worldClock.ts';
import { createMockFishingAdapter, fishHintText, fishValidNow, pityDue } from '../../src/features/pixel-world-phaser/ui/fishingAdapterMock.ts';
import type { MockCatch } from '../../src/features/pixel-world-phaser/ui/fishingAdapterMock.ts';
import { createFishingAdapter, parseCastFinish, parseCastStart, parseClassFishBoard, parseFishingState } from '../../src/features/pixel-world-phaser/ui/fishingAdapter.ts';
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
const day = (fixedNow: number, extra: Parameters<typeof createMockFishingAdapter>[0] = {}) => createMockFishingAdapter({ now: () => fixedNow, override: { weather: 'clear' }, ...extra });

test('mock: 6 catches per KST day, misses are free, one pending cast with 90 s expiry', async () => {
  let now = noonKst;
  const mock = createMockFishingAdapter({ now: () => now, seed: 7 });
  assert.equal((await mock.state()).remaining, 6);
  const first = await mock.start(null);
  assert.ok(first.ok);
  assert.deepEqual(await mock.start(null), { ok: false, reason: 'pending' });
  assert.deepEqual(await mock.finish(first.castId, false), { ok: true, landed: false });
  assert.deepEqual(await mock.finish(first.castId, true), { ok: false }, 'a consumed cast cannot be reused');
  assert.equal((await mock.state()).remaining, 6, 'a miss does not use the budget');
  const stale = await mock.start(null); assert.ok(stale.ok);
  now += 90_000;
  assert.deepEqual(await mock.finish(stale.castId, true), { ok: false }, 'expired');
  for (let i = 0; i < 6; i++) {
    const s = await mock.start(null); assert.ok(s.ok);
    const f = await mock.finish(s.castId, true); assert.ok(f.ok && f.landed);
    assert.equal(f.remaining, 5 - i);
  }
  assert.deepEqual(await mock.start(null), { ok: false, reason: 'budget' });
  assert.equal((await mock.state()).remaining, 0);
  now += 24 * 3600_000;
  assert.equal((await mock.state()).remaining, 6, 'next KST day resets');
});

test('mock: catch facts follow the catalog, phase and weather', async () => {
  const mock = createMockFishingAdapter({ now: () => Date.parse('2026-10-08T13:00:00Z'), override: { weather: 'clear' }, seed: 3 }); // KST 22:00 밤
  const seen: string[] = [];
  for (;;) {
    const s = await mock.start(null);
    if (!s.ok) { assert.equal(s.reason, 'budget'); break; }
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

test('mock: pity forces an uncaught valid species after 5 known catches', async () => {
  const old = (i: number, speciesId: string): MockCatch => ({ id: 'c' + i, speciesId, lengthCm: 8, caughtAt: `2026-09-0${i + 1}T00:00:00.000Z`, kstDate: `2026-09-0${i + 1}` });
  const catches = [old(0, 'pirami'), old(1, 'pirami'), old(2, 'pirami'), old(3, 'pirami'), old(4, 'pirami'), old(5, 'pirami')];
  assert.equal(pityDue(catches), true);
  assert.equal(pityDue(catches.slice(0, 5)), false, 'the first pirami was new');
  assert.equal(pityDue([...catches, { speciesId: 'buri' }]), false);
  for (let seed = 1; seed <= 25; seed++) {
    const mock = day(noonKst, { seed, catches });
    const s = await mock.start(null); assert.ok(s.ok);
    assert.notEqual(mock.peek()!.speciesId, 'pirami', 'seed ' + seed);
    assert.ok(fishValidNow(fishById(mock.peek()!.speciesId)!, 'day', 'clear'));
  }
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
  assert.equal((await dog.state()).sparkleShadow, null, 'no sparkle once the budget is used');

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
    { ok: true, castId: 'c', shadow: 'M', biteDelayMs: 1500, pattern: 'quick', hint: null });

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
  assert.deepEqual(await admin.start(null), { ok: true, castId: 'k', shadow: 'L', biteDelayMs: 2000, pattern: 'long', hint: 'sparkle' });
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
