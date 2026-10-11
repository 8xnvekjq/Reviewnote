import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { levelForXp } from '../../src/features/pixel-world-phaser/logic/levels.ts';

// 레벨 분리 마이그레이션(PGlite). 운영 스키마 중 필요한 표와, 지급 호출이 들어 있는 함수만 흉내 낸다.
const pkg = '@electric-sql/pglite';
const { PGlite } = await import(pkg);
const migration = fs.readFileSync(new URL('../../supabase/migrations/20261012100000_pixel_level_tracks.sql', import.meta.url), 'utf8');
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('level tracks: proportional split, exponential curve shared with the client, per-track awards and patched callers (PGlite)', async () => {
  const db = new PGlite();
  const A = id(1), B = id(2), C = id(3);
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth; create schema private; create schema pixel_private;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      create table public.pixel_player_level(user_id uuid primary key, xp integer not null default 0 check (xp >= 0), updated_at timestamptz default now());
      create table public.pixel_farm_crops(id serial, user_id uuid, harvested_at timestamptz);
      create table public.pixel_bug_species(id text primary key, xp integer);
      create table public.pixel_bug_catches(id serial, user_id uuid, bug_id text);
      create table public.pixel_fish_species(id text primary key, rarity text);
      create table public.pixel_fish_catches(id serial, user_id uuid, species_id text, pet text);
      create table public.pixel_fish_junk(id serial, user_id uuid);
      insert into public.pixel_bug_species values ('red', 5);
      insert into public.pixel_fish_species values ('carp', 'common'), ('king', 'legendary');
      -- A: 기록 추정 낚시 600(전설 10) + 농사 400(수확 10) = 1000, 실제 누적 500 → 낚시 300 / 농사 200.
      insert into public.pixel_player_level(user_id, xp) values ('${A}', 500), ('${B}', 120), ('${C}', 0);
      insert into public.pixel_fish_catches(user_id, species_id) select '${A}', 'king' from generate_series(1, 10);
      insert into public.pixel_farm_crops(user_id, harvested_at) select '${A}', now() from generate_series(1, 10);
      -- B: 기록이 하나도 없으면 전부 낚시로.
      -- 지급 호출이 들어 있는 함수들(본문은 운영 함수의 해당 줄과 같은 글자).
      create function pixel_private.award_pixel_xp(p_user uuid, p_gained integer) returns jsonb language sql as $$ select '{}'::jsonb $$;
      create function pixel_private.farm_action(p_plot integer, p_action text, p_revision bigint) returns jsonb language plpgsql as $$
        declare u uuid := auth.uid(); v_xp_gain jsonb; begin v_xp_gain := pixel_private.award_pixel_xp(u, 40); return v_xp_gain; end $$;
      create function pixel_private.finish_pixel_cast(p_cast_id uuid, p_landed boolean) returns jsonb language plpgsql as $$
        declare u uuid := auth.uid(); v_xp integer := 60; v_xp_gain jsonb; begin
          if not p_landed then v_xp_gain := pixel_private.award_pixel_xp(u, 1); return v_xp_gain; end if;
          v_xp_gain := pixel_private.award_pixel_xp(u, v_xp); return v_xp_gain; end $$;
      create function public.finish_bug_catch(p_catch_id uuid, p_caught boolean) returns jsonb language plpgsql as $$
        declare u uuid := auth.uid(); b record; v_xp jsonb; begin select 25 as xp into b; v_xp := pixel_private.award_pixel_xp(u,b.xp); return v_xp; end $$;
      create function pixel_private.start_pixel_cast(p_pet text, p_override_clock text, p_override_weather text, p_spot integer) returns integer language plpgsql as $$
        declare u uuid := auth.uid(); v_level integer; begin
          select level into v_level from pixel_private.level_for_xp(coalesce((select xp from public.pixel_player_level where user_id=u),0)); return v_level; end $$;
    `);
    await db.exec(migration);
    await db.exec(migration); // 다시 돌려도 안전(나눈 값·바꾼 호출부를 건드리지 않는다)
    const row = async (u: string) => (await db.query<any>('select xp, fishing_xp, farming_xp, gathering_xp from public.pixel_player_level where user_id=$1', [u])).rows[0];
    assert.deepEqual(await row(A), { xp: 500, fishing_xp: 300, farming_xp: 200, gathering_xp: 0 });
    assert.deepEqual(await row(B), { xp: 120, fishing_xp: 120, farming_xp: 0, gathering_xp: 0 });

    // 서버 곡선 = 클라이언트 곡선.
    for (const xp of [0, 49, 50, 105, 722, 3012, 15147, 99144, 2_000_000]) {
      const r = (await db.query<any>('select * from pixel_private.level_for_xp($1)', [xp])).rows[0];
      const c = levelForXp(xp);
      assert.deepEqual([r.level, r.xp_into_level, r.xp_for_next], [c.level, c.xpIntoLevel, c.xpForNext], `xp ${xp}`);
    }
    assert.equal(levelForXp(15147).level, 33);

    const as = async (u: string, sql: string) => {
      await db.exec(`select set_config('request.jwt.claim.sub','${u}',false)`);
      return (await db.query<{ r: any }>(sql)).rows[0].r;
    };
    // 활동별로 쌓이고, 결과의 xp/level은 그 활동 값이다.
    const farm = await as(C, `select pixel_private.farm_action(0,'harvest',1) r`);
    assert.deepEqual(farm, { gained: 40, xp: 40, level: 1, leveledUp: false, track: 'farming' });
    const fish = await as(C, `select pixel_private.finish_pixel_cast(gen_random_uuid(), true) r`);
    assert.equal(fish.track, 'fishing'); assert.equal(fish.level, 2); assert.equal(fish.leveledUp, true);
    assert.equal((await as(C, `select pixel_private.finish_pixel_cast(gen_random_uuid(), false) r`)).xp, 61);
    assert.equal((await as(C, `select public.finish_bug_catch(gen_random_uuid(), true) r`)).track, 'gathering');
    assert.deepEqual(await row(C), { xp: 126, fishing_xp: 61, farming_xp: 40, gathering_xp: 25 });

    // 낚시 난이도는 낚시 레벨로 읽는다(합계가 아니라).
    await db.exec(`update public.pixel_player_level set farming_xp = farming_xp + 100000, xp = xp + 100000 where user_id = '${C}'`);
    assert.equal(await as(C, `select pixel_private.start_pixel_cast(null,null,null,null) r`), 2);

    const level = await as(C, `select pixel_private.get_pixel_level() r`);
    assert.equal(level.level, 2); assert.equal(level.maxLevel, 100);
    assert.deepEqual(Object.keys(level.tracks).sort(), ['farming', 'fishing', 'gathering']);
    assert.equal(level.tracks.farming.xp, 100040);
  } finally { await db.close(); }
});
