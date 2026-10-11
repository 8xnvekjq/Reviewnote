import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bagSpeedFactor } from '../../src/features/pixel-world-phaser/logic/bag.ts';

// 가방 마이그레이션(PGlite). 운영 스키마 중 필요한 표와, 포인트 지급 줄이 들어 있는 함수만 흉내 낸다.
const pkg = '@electric-sql/pglite';
const { PGlite } = await import(pkg);
const migration = fs.readFileSync(new URL('../../supabase/migrations/20261012120000_pixel_bag.sql', import.meta.url), 'utf8');
const U = '00000000-0000-0000-0000-000000000001';

test('bag: catches go to the bag, weight includes stored tomatoes, selling pays the old points through the daily cap (PGlite)', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth; create schema private; create schema pixel_private;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      create table public.profiles(id uuid primary key, point_adjustment integer default 0);
      insert into public.profiles(id) values ('${U}');
      create table public.pixel_fish_species(id text primary key, rarity text);
      insert into public.pixel_fish_species values ('carp','common'), ('king','legendary');
      create table public.pixel_bug_species(id text primary key, stars integer, points integer);
      insert into public.pixel_bug_species values ('red', 1, 2);
      create table public.pixel_farm_crops(id uuid primary key default gen_random_uuid(), user_id uuid, status text, harvested_at timestamptz, size_score integer);
      insert into public.pixel_farm_crops(user_id, status, harvested_at, size_score) values ('${U}','stored',now(),80), ('${U}','submitted',now(),50), ('${U}','stored',null,null);
      create table pixel_private.game_point_days(user_id uuid, kst_date date, earned integer default 0, primary key(user_id, kst_date));
      -- 하루 상한 흉내: normal은 그대로, full은 그대로(시험에는 상한까지 가지 않는다).
      create function pixel_private.award_game_points(p_user uuid, p_points integer, p_kind text) returns jsonb language plpgsql as $$
        begin update public.profiles set point_adjustment = point_adjustment + p_points where id = p_user;
          return jsonb_build_object('awarded', p_points, 'todayEarned', p_points, 'cap', 50, 'capped', false, 'kind', p_kind); end $$;
      create function pixel_private.finish_pixel_cast(p_cast_id uuid, p_landed boolean) returns jsonb language plpgsql as $$
        declare u uuid := auth.uid(); k record; s record; v_points jsonb; begin
          select p_cast_id::text as x, (case when p_landed then 'king' else 'carp' end) as species_id into k;
          select * into s from public.pixel_fish_species where id = k.species_id;
  v_points := pixel_private.award_game_points(u,
    case s.rarity when 'common' then 1 when 'uncommon' then 2 when 'rare' then 4 when 'legendary' then 15 when 'mythic' then 40 end,
    case when s.rarity in ('legendary','mythic') then 'full' else 'normal' end);
          return v_points; end $$;
      create function public.finish_bug_catch(p_catch_id uuid, p_caught boolean) returns jsonb language plpgsql as $$
        declare u uuid := auth.uid(); b public.pixel_bug_species%rowtype; v_points jsonb; begin
          select * into b from public.pixel_bug_species where id = 'red';
 v_points := pixel_private.award_game_points(u,b.points,case when b.stars>=4 then 'full' else 'normal' end);
          return v_points; end $$;
    `);
    await db.exec(migration);
    await db.exec(`select set_config('request.jwt.claim.sub','${U}',false)`);
    const one = async (sql: string) => (await db.query<{ r: any }>(sql)).rows[0].r;
    const points = async () => (await db.query<{ p: number }>(`select point_adjustment p from public.profiles`)).rows[0].p;

    // 잡으면 포인트 0, 가방에 쌓인다.
    for (let i = 0; i < 3; i++) await one(`select pixel_private.finish_pixel_cast(gen_random_uuid(), false) r`);
    const king = await one(`select pixel_private.finish_pixel_cast(gen_random_uuid(), true) r`);
    assert.equal(king.awarded, 0); assert.equal(king.bagged, true);
    await one(`select public.finish_bug_catch(gen_random_uuid(), true) r`);
    assert.equal(await points(), 0);

    const bag = await one(`select public.get_pixel_bag() r`);
    // 붕어 3×1.0 + 왕 1×4.0 + 잠자리 1×0.3 + 보관 토마토 1×1.5 = 8.8
    assert.equal(Number(bag.weight), 8.8); assert.equal(Number(bag.capacity), 20);
    assert.deepEqual(bag.items.map((i: any) => [i.kind, i.ref, i.qty]), [['bug', 'red', 1], ['fish', 'king', 1], ['fish', 'carp', 3]]);
    assert.equal(bag.crops.length, 1);

    // 일부 판매: 붕어 2마리 → 2P(normal). 가진 것보다 많이 팔 수 없다.
    const partial = await one(`select public.sell_pixel_bag('[{"kind":"fish","ref":"carp","qty":2},{"kind":"bug","ref":"nope","qty":5}]') r`);
    assert.equal(partial.ok, true); assert.equal(partial.sold, 2); assert.equal(partial.points.awarded, 2);
    assert.equal(await points(), 2);
    // 전부 판매: 붕어 1(1P) + 잠자리(2P) + 왕(15P, full) = 18P.
    const all = await one(`select public.sell_pixel_bag(null) r`);
    assert.equal(all.sold, 3); assert.equal(all.value, 18); assert.equal(all.points.awarded, 18);
    assert.equal(await points(), 20);
    assert.equal((await one(`select public.get_pixel_bag() r`)).items.length, 0);
    assert.equal((await one(`select public.sell_pixel_bag(null) r`)).reason, 'nothing');

    // 다시 돌려도 호출부는 한 번만 바뀐다.
    await db.exec(migration.replace(/create table if not exists[\s\S]*?grant select on public.pixel_bag_items to authenticated;/, ''));
    const def = (await db.query<{ d: string }>(`select pg_get_functiondef('pixel_private.finish_pixel_cast(uuid,boolean)'::regprocedure) d`)).rows[0].d;
    assert.equal(def.split('bag_add').length - 1, 1);
    assert.ok(!def.includes('award_game_points'));
  } finally { await db.close(); }
});

test('bag speed: full speed up to capacity, then gradually slower, never below 20%', () => {
  assert.equal(bagSpeedFactor(0, 20), 1);
  assert.equal(bagSpeedFactor(20, 20), 1);
  assert.equal(bagSpeedFactor(30, 20), 0.6);
  assert.equal(bagSpeedFactor(40, 20), 0.2);
  assert.equal(bagSpeedFactor(100, 20), 0.2);
  assert.ok(bagSpeedFactor(21, 20) < 1 && bagSpeedFactor(21, 20) > bagSpeedFactor(25, 20));
});
