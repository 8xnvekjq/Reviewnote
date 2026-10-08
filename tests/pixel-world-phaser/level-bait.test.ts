import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BAIT_CHARGES, BAIT_PRICE, FISH_XP, HARVEST_XP, MAX_LEVEL, TROPHY_XP, hardFishChance, levelBaitDifficulty, levelForXp, parseXpGain } from '../../src/features/pixel-world-phaser/logic/levels.ts';
import { createFishingAdapter, parseBait, parseBuyBait, parseCastFinish, parseCastStart, parseFishingState, parsePlayerLevel } from '../../src/features/pixel-world-phaser/ui/fishingAdapter.ts';
import { createMockFishingAdapter } from '../../src/features/pixel-world-phaser/ui/fishingAdapterMock.ts';
import { FISH_CATALOG, RARITY_WEIGHT, fishById } from '../../src/features/pixel-world-phaser/logic/fishCatalog.ts';

const sql = readFileSync(new URL('../../supabase/migrations/supabase_pixel_level_bait.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const curve = /function pixel_private.level_for_xp\(p_xp integer\)([^]*?)end \$\$;/.exec(sql)![1];

test('SQL에서 읽은 레벨 곡선과 TS는 모든 경계와 최대 레벨 뒤에도 같다', () => {
  const max = Number(/max_level constant integer := (\d+)/.exec(curve)![1]);
  const [base, increment] = /while level < max_level and xp_into_level >= (\d+) \+ (\d+) \* \(level - 1\)/.exec(curve)!.slice(1).map(Number);
  assert.equal(max, MAX_LEVEL);
  assert.match(curve, /xp_into_level := xp_into_level - \(50 \+ 10 \* \(level - 1\)\)/);
  assert.match(curve, /case when level = max_level then 0 else 50 \+ 10 \* \(level - 1\) end/);
  const sqlTwin = (xp: number) => {
    let level = 1, remaining = Math.max(0, xp);
    while (level < max && remaining >= base + increment * (level - 1)) remaining -= base + increment * (level++ - 1);
    return { level, xpIntoLevel: remaining, xpForNext: level === max ? 0 : base + increment * (level - 1), isMax: level === max };
  };
  let threshold = 0;
  for (let l = 1; l <= MAX_LEVEL; l++) {
    for (const xp of [threshold - 1, threshold, threshold + 1]) assert.deepEqual(levelForXp(xp), sqlTwin(xp));
    threshold += base + increment * (l - 1);
  }
  for (const xp of [0, 49, 50, 109, 110, 1_000_000, 2147483647]) assert.deepEqual(levelForXp(xp), sqlTwin(xp));
  assert.equal(levelForXp(NaN).level, 1);
  assert.equal(levelForXp(50).level, 2);
  assert.equal(levelForXp(110).level, 3);
});

test('경험치 보상은 계약과 SQL을 따른다', () => {
  assert.deepEqual(FISH_XP, { common: 5, uncommon: 10, rare: 25, legendary: 60 });
  assert.equal(TROPHY_XP, 15); assert.equal(HARVEST_XP, 40);
  assert.match(sql, /case s.rarity when 'common' then 5 when 'uncommon' then 10 when 'rare' then 25 else 60 end/);
  assert.match(sql, /case when k.trophy then 15 else 0 end/);
  assert.match(sql, /v_xp_gain := pixel_private.award_pixel_xp\(u, 40\)/);
});

test('레벨 감소 상한은 보통 50%, 전설 15%이고 전설은 미끼에도 4 이상이다', () => {
  assert.equal(levelBaitDifficulty(5, 51, false), 2.5);
  assert.equal(levelBaitDifficulty(5, 100, false), 2.5);
  assert.equal(levelBaitDifficulty(5, 16, true), 4.25);
  assert.equal(levelBaitDifficulty(5, 100, true), 4.25);
  assert.equal(levelBaitDifficulty(4.2, 100, true), 4);
  assert.equal(levelBaitDifficulty(5, 100, true, true), 4);
  assert.equal(levelBaitDifficulty(1, 100, false, true), 1);
  assert.equal(levelBaitDifficulty(4, 2, false, true), 3.66);
  assert.equal(levelBaitDifficulty(4, 1, false, true), 3.7);
  assert.match(sql, /least\(v_level - 1, case when v_fish.rarity = 'legendary' then 15 else 50 end\)::numeric \/ 100/);
  assert.match(sql, /if v_bait then v_difficulty := v_difficulty - 0.3/);
  assert.match(sql, /case when v_fish.rarity = 'legendary' then 4.0 else 1 end/);
});

test('미끼 50P 구매는 100회씩 누적되고 거절·중복 시작·실패 종료는 계약을 지킨다', async () => {
  assert.equal(BAIT_PRICE, 50); assert.equal(BAIT_CHARGES, 100);
  assert.equal(hardFishChance(0, true), 30); assert.equal(hardFishChance(8, true), 46);
  assert.equal(hardFishChance(100, true), 60); assert.equal(hardFishChance(8, false), 23);
  let now = Date.UTC(2026, 9, 8, 3);
  const mock = createMockFishingAdapter({ balance: 100, now: () => now });
  assert.deepEqual(await mock.buyBait(), { ok: true, newBalance: 50, charges: 100 });
  assert.deepEqual(await mock.buyBait(), { ok: true, newBalance: 0, charges: 200 });
  const failed = await mock.buyBait(); assert.ok(!failed.ok && failed.reason === 'insufficient_balance');
  const start = await mock.start(null); assert.ok(start.ok); assert.deepEqual(start.bait, { used: true, charges: 199 });
  assert.deepEqual(await mock.start(null), { ok: false, reason: 'pending' });
  assert.equal((await mock.state()).bait?.charges, 199);
  await mock.finish(start.castId, false);
  assert.equal((await mock.getLevel()).xp, 0);
  now += 3000;
  const next = await mock.start(null); assert.ok(next.ok); assert.equal(next.bait?.charges, 198);
  const one = createMockFishingAdapter({ baitCharges: 1, now: () => now });
  const a = await one.start(null); assert.ok(a.ok && a.bait?.used); await one.finish(a.castId, false);
  now += 3000;
  const b = await one.start(null); assert.ok(b.ok); assert.deepEqual(b.bait, { used: false, charges: 0 });
});

test('모의 서버는 성공한 물고기와 대물에 한 번만 경험치를 주고 레벨 상승을 알린다', async () => {
  for (let seed = 0; seed < 80; seed++) {
    let now = Date.UTC(2026, 9, 8, 3);
    const mock = createMockFishingAdapter({ seed, xp: 49, now: () => now, override: { clock: '12:00', weather: 'clear' } });
    const start = await mock.start(null); assert.ok(start.ok);
    const p = mock.peek()!, fish = fishById(p.speciesId)!;
    now += 20_000;
    const result = await mock.finish(start.castId, true); assert.ok(result.ok && result.landed);
    const gained = FISH_XP[fish.rarity] + (p.trophy ? TROPHY_XP : 0);
    assert.deepEqual(result.xpGain, { gained, xp: 49 + gained, level: levelForXp(49 + gained).level, leveledUp: true });
    assert.deepEqual(await mock.finish(start.castId, true), { ok: false });
    assert.equal((await mock.getLevel()).xp, 49 + gained);
  }
});

test('미끼 유무별 10,000회 캐스트의 어려운 굴림 분포와 소비량', async t => {
  const counts: number[] = [];
  const valid = FISH_CATALOG.filter(f => (f.phases === 'any' || f.phases.includes('night')) && (f.weather === 'any' || f.weather.includes('clear')));
  const totalWeight = valid.reduce((sum, f) => sum + RARITY_WEIGHT[f.rarity], 0);
  const hardWeight = valid.filter(f => f.rarity === 'rare' || f.rarity === 'legendary').reduce((sum, f) => sum + RARITY_WEIGHT[f.rarity], 0);
  for (const baitCharges of [0, 10000]) {
    let now = Date.UTC(2026, 9, 8, 3), hard = 0, rareFish = 0;
    const mock = createMockFishingAdapter({ seed: 1234, baitCharges, now: () => now, override: { clock: '22:00', weather: 'clear' } });
    for (let i = 0; i < 10000; i++) {
      const start = await mock.start(null); assert.ok(start.ok);
      if (mock.peek()!.hard) hard++;
      if (['rare', 'legendary'].includes(fishById(mock.peek()!.speciesId)!.rarity)) rareFish++;
      assert.deepEqual(start.bait, { used: baitCharges > 0, charges: Math.max(0, baitCharges - i - 1) });
      await mock.finish(start.castId, false); now += 3000;
    }
    assert.equal((await mock.state()).bait?.charges, 0);
    const chance = baitCharges > 0 ? 0.3 : 0.15;
    const expectedRare = chance + (1 - chance) * hardWeight / totalWeight;
    assert.ok(Math.abs(rareFish / 10000 - expectedRare) < 0.02, `rare ${rareFish}, expected ${expectedRare}`);
    t.diagnostic(`bait=${baitCharges > 0}: hard rolls=${hard}/10000, rare/legendary fish=${rareFish}/10000`);
    counts.push(hard);
  }
  assert.ok(counts[0] > 1400 && counts[0] < 1600, String(counts));
  assert.ok(counts[1] > 2850 && counts[1] < 3150, String(counts));
});

test('어댑터는 추가 필드를 검증하고 구형 응답·잘못된 값·RPC 실패도 처리한다', async () => {
  const level = { xp: 50, level: 2, xpIntoLevel: 0, xpForNext: 60, maxLevel: 100 };
  const xpGain = { gained: 5, xp: 50, level: 2, leveledUp: true };
  assert.deepEqual(parsePlayerLevel({ ...level, xp: '50' }), level);
  assert.equal(parsePlayerLevel({ ...level, level: 101 }), undefined);
  assert.equal(parsePlayerLevel({ ...level, xp: Infinity }), undefined);
  assert.equal(parseBait({ charges: -1 }), undefined);
  assert.equal(parseBait({ charges: 1.5 }), undefined);
  assert.deepEqual(parseBait({ charges: '100' }), { charges: 100 });
  assert.equal(parseXpGain({ ...xpGain, leveledUp: 'true' }), undefined);
  assert.deepEqual(parseXpGain(xpGain), xpGain);
  const state = parseFishingState({ level, bait: { charges: 100 } });
  assert.deepEqual(state.level, level); assert.deepEqual(state.bait, { charges: 100 });
  assert.equal(parseFishingState({}).level, undefined);
  assert.equal(parseFishingState({ bait: { charges: NaN } }).bait, undefined);
  const cast = { ok: true, castId: 'c', shadow: 'S', biteDelayMs: 1000 };
  const parsed = parseCastStart({ ...cast, bait: { used: true, charges: '99' } });
  assert.ok(parsed.ok); assert.deepEqual(parsed.bait, { used: true, charges: 99 });
  const bad = parseCastStart({ ...cast, bait: { used: 'true', charges: 99 } }); assert.ok(bad.ok && bad.bait === undefined);
  const finish = parseCastFinish({ ok: true, landed: true, speciesId: 'pirami', lengthCm: 10, rarity: 'common', xpGain });
  assert.ok(finish.ok && finish.landed); assert.deepEqual(finish.xpGain, xpGain);
  assert.deepEqual(parseBuyBait({ ok: true, newBalance: -1, charges: 100 }), { ok: false, reason: 'error' });
  const called: string[] = [];
  const adapter = createFishingAdapter({ rpc: async name => { called.push(name); return { data: name === 'get_pixel_level' ? level : { ok: true, newBalance: 9, charges: 100 }, error: null }; } });
  assert.deepEqual(await adapter.getLevel!(), level);
  assert.deepEqual(await adapter.buyBait!(), { ok: true, newBalance: 9, charges: 100 });
  assert.deepEqual(called, ['get_pixel_level', 'buy_pixel_bait']);
  const broken = createFishingAdapter({ rpc: async () => { throw new Error('offline'); } });
  assert.equal(await broken.getLevel!(), null);
  assert.deepEqual(await broken.buyBait!(), { ok: false, reason: 'error' });
});

test('새 테이블은 본인 조회만, 새 RPC는 인증 사용자만, 포인트 차감은 운영 방식 그대로다', () => {
  for (const table of ['pixel_player_level', 'pixel_bait']) {
    assert.ok(sql.includes(`alter table public.${table} enable row level security`));
    assert.ok(sql.includes(`on public.${table} for select to authenticated using (user_id = (select auth.uid()))`));
  }
  assert.match(sql, /revoke all on public.pixel_player_level, public.pixel_bait from public, anon, authenticated/);
  assert.match(sql, /perform set_config\('reviewnote.pixel_rpc', 'true', true\)/);
  assert.match(sql, /from public.profiles where id = v_user for update/);
  assert.match(sql, /v_new_adj := v_adj - v_price/);
  assert.match(sql, /charges=public.pixel_bait.charges\+100/);
  assert.match(sql, /where user_id=u and charges>0 returning charges/);
  assert.doesNotMatch(sql, /create or replace function public.act_pixel_farm/i);
  assert.match(sql, /revoke all on function public.get_pixel_level\(\), public.buy_pixel_bait\(\) from public, anon, authenticated, service_role/);
  assert.match(sql, /grant execute on function public.get_pixel_level\(\), public.buy_pixel_bait\(\) to authenticated/);
});

test('운영 농장 본문과 v4 종료 본문은 경험치 추가 외에 그대로 유지한다', () => {
  const prod = readFileSync(new URL('../../PROD_FUNCTIONS.sql', import.meta.url), 'utf8');
  const farmPattern = /CREATE OR REPLACE FUNCTION pixel_private.farm_action[^]*?end \$function\$;/;
  const migratedFarm = farmPattern.exec(sql)![0]
    .replace('  v_xp_gain jsonb;\n', '')
    .replace('    v_xp_gain := pixel_private.award_pixel_xp(u, 40);\n', '')
    .replace("jsonb_build_object('harvest',v_harvest,'xpGain',v_xp_gain)", "jsonb_build_object('harvest',v_harvest)");
  assert.equal(migratedFarm, farmPattern.exec(prod.replace(/\r\n/g, '\n'))![0]);
  const v4 = readFileSync(new URL('../../supabase/migrations/supabase_pixel_fishing_v4.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const finishPattern = /create or replace function pixel_private.finish_pixel_cast[^]*?end \$\$;/;
  const migratedFinish = finishPattern.exec(sql)![0]
    .replace('  v_xp_gain jsonb;\n', '')
    .replace(/  v_xp_gain := pixel_private.award_pixel_xp\(u, \(case s.rarity[^]*?\);\n\n/, '')
    .replace("'remaining', -1, 'xpGain', v_xp_gain", "'remaining', -1");
  assert.equal(migratedFinish, finishPattern.exec(v4)![0]);
});
