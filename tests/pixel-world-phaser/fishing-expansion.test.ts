import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { FISH_CATALOG, JUNK_CATALOG } from '../../src/features/pixel-world-phaser/logic/fishCatalog.ts';
import { parseCastStart, parseCastFinish, parseFishingState } from '../../src/features/pixel-world-phaser/ui/fishingAdapter.ts';
import { createMockFishingAdapter } from '../../src/features/pixel-world-phaser/ui/fishingAdapterMock.ts';
import { fishXpDisplay } from '../../src/features/pixel-world-phaser/logic/levels.ts';
import { celebratesCatch } from '../../src/features/pixel-world-phaser/logic/riverPresence.ts';

const sql = (name: string) => readFileSync(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8');
const expansion = sql('20261011170000_pixel_fishing_expansion.sql');
const user = '11111111-1111-1111-1111-111111111111';
const peer = '22222222-2222-2222-2222-222222222222';

test('어댑터: 신화·잡동사니·백분위는 검증해서 읽는다', () => {
  const start = parseCastStart({ ok: true, castId: 'c', shadow: 'S', biteDelayMs: 1500, heavy: true, junk: 'junk_can' });
  assert.ok(start.ok && start.heavy && start.junk === 'junk_can');
  const invalid = parseCastStart({ ok: true, castId: 'c', shadow: 'S', biteDelayMs: 1500, heavy: 'yes', junk: 'junk_unknown' });
  assert.ok(invalid.ok && invalid.heavy === undefined && invalid.junk === undefined);
  for (const { id } of JUNK_CATALOG) assert.deepEqual(parseCastFinish({ ok: true, landed: true, junk: id, remaining: -1 }), { ok: true, landed: true, junk: id, remaining: -1 });
  assert.deepEqual(parseCastFinish({ ok: true, landed: true, junk: 'nope' }), { ok: false });
  for (const percentile of [0, 12.5, 100, -1, 101, Infinity, '']) {
    const fish = parseCastFinish({ ok: true, landed: true, speciesId: 'whale', lengthCm: 1300, rarity: 'mythic', percentile });
    assert.ok(fish.ok && fish.landed && !('junk' in fish));
    assert.equal(fish.percentile, typeof percentile === 'number' && percentile >= 0 && percentile <= 100 ? percentile : undefined);
  }
  assert.deepEqual(parseFishingState({ junk: { junk_shoe: '3', junk_can: -1, junk_coin: 1.5, bad: 100 } }).junk, { junk_shoe: 3, junk_can: 0, junk_coin: 0 });
  assert.equal(fishXpDisplay('mythic'), 120); assert.equal(celebratesCatch('mythic'), true);
});

test('모의 서버: 잡동사니 약 6%, 피티 보호, 신화 난이도와 강아지 XP', async () => {
  let now = Date.parse('2026-10-08T03:00:00Z');
  const mock = createMockFishingAdapter({ now: () => now, seed: 42, xp: 100000, baitCharges: 3000, rod: 'rod_gold', activePet: 'pet_dog', classmates: [] });
  let junk = 0, mythic = 0;
  for (let i = 0; i < 2000; i++) {
    now += 10000;
    const start = await mock.start('pet_dog'); assert.ok(start.ok);
    assert.equal(start.hint, null);
    if (start.junk) { assert.equal(start.difficulty, 1); assert.equal(start.shadow, 'S'); assert.equal(mock.peek()!.pity, false); junk++; }
    if (start.heavy) { assert.equal(start.difficulty, 5); mythic++; }
    now += 10000;
    const result = await mock.finish(start.castId, true); assert.ok(result.ok && result.landed);
    if ('junk' in result) assert.equal(result.xpGain?.gained, 1);
    else { assert.equal(result.xpGain?.gained, Math.round(fishXpDisplay(result.rarity, start.trophy) * 1.1)); assert.ok(result.percentile! > 0 && result.percentile! <= 100); }
  }
  assert.ok(junk > 80 && junk < 160, String(junk)); assert.ok(mythic > 0);
  const state = await mock.state();
  assert.equal(Object.values(state.junk!).reduce((a, b) => a + b, 0), junk);
  assert.equal(state.album.reduce((a, b) => a + b.count, 0), 2000 - junk);
  assert.equal(mock.catches.length, 2000 - junk);
  assert.ok((await mock.board()).rows.every(row => !row.speciesId.startsWith('junk_')));
});

test('PGlite: 마이그레이션 재적용·실제 캐스트·전체 백분위·분리 기록·권한', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create schema private;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function private.is_current_user_admin() returns boolean language sql as $$ select true $$;
      create function private.user_animal_face(uuid) returns text language sql as $$ select '🐶'::text $$;
      create table private.app_admins(user_id uuid);
      create table auth.users(id uuid primary key);
      create table public.profiles(id uuid primary key);
      create table public.pixel_pet_equipment(user_id uuid primary key, active_pet text);
      create table public.pixel_item_ownership(user_id uuid, item_id text, primary key(user_id,item_id));
      create table public.pixel_item_catalog(item_id text primary key,category text,slot text,price int,asset_key text,display_name text,tier int,stackable boolean);
      grant usage on schema auth, public to authenticated;
      insert into auth.users values ('${user}'),('${peer}');
      insert into public.profiles values ('${user}'),('${peer}');
      select set_config('request.jwt.claim.sub','${user}',false);`);
    for (const name of ['supabase_pixel_fishing.sql', 'supabase_pixel_fishing_v2.sql', 'supabase_pixel_fishing_v3.sql', 'supabase_pixel_fishing_v4.sql']) await db.exec(sql(name));
    const bait = sql('supabase_pixel_level_bait.sql');
    await db.exec(bait.slice(0, bait.indexOf('create or replace function pixel_private.get_pixel_fishing_state')) + '\ncommit;');
    await db.exec(sql('20261011150000_pixel_pet_effects_v2.sql'));
    await db.exec(sql('20261011120000_fish_board_teacher_rainbow_only.sql'));
    const before = await db.query(`select proname, proacl::text acl from pg_proc where pronamespace='pixel_private'::regnamespace and proname in ('start_pixel_cast','finish_pixel_cast','get_pixel_fishing_state','fish_difficulty') order by proname`);
    await db.exec(expansion); await db.exec(expansion);
    assert.deepEqual((await db.query(`select proname, proacl::text acl from pg_proc where pronamespace='pixel_private'::regnamespace and proname in ('start_pixel_cast','finish_pixel_cast','get_pixel_fishing_state','fish_difficulty') order by proname`)).rows, before.rows);
    const catalog = await db.query<any>('select * from pixel_fish_species order by sort_order');
    assert.deepEqual(catalog.rows.map(s => ({ id: s.id, name: s.name, rarity: s.rarity, phases: s.phases ?? 'any', weather: s.weather ?? 'any', minCm: Number(s.min_cm), maxCm: Number(s.max_cm), shadow: s.shadow })), FISH_CATALOG);
    for (const species of ['shark', 'whale']) for (const length of [1, 200, 10000]) assert.equal(Number((await db.query<any>('select pixel_private.fish_difficulty($1,$2) d', [species, length])).rows[0].d), 5);
    const rpc = async (query: string, args: any[] = []) => (await db.query<any>(query, args)).rows[0].r;
    await db.exec(`insert into pixel_rod_equipment(user_id,rod_id) values ('${user}',null);
      insert into pixel_item_ownership values ('${user}','rod_gold'),('${user}','pet_dog');
      update pixel_rod_equipment set rod_id='rod_gold'; insert into pixel_pet_equipment values ('${user}','pet_dog');
      insert into pixel_player_level(user_id,xp) values ('${user}',100000);
      insert into pixel_bait(user_id,charges) values ('${user}',5000);`);
    let junk = 0, mythic = 0, pity = 0;
    await db.exec('select setseed(0.42)');
    for (let i = 0; i < 300; i++) {
      const start = await rpc("select public.start_pixel_cast('pet_dog','13:00','clear') r"); assert.equal(start.ok, true);
      assert.equal(start.hint, null);
      const pending = (await db.query<any>('select pity, junk, species_id, length_cm from pixel_fish_casts')).rows[0];
      if (pending.pity) { pity++; assert.equal(start.junk, null); }
      if (start.heavy) { mythic++; assert.equal(start.difficulty, 5); }
      if (start.junk) { junk++; assert.equal(start.difficulty, 1); assert.equal(start.shadow, 'S'); assert.equal(pending.species_id, null); assert.equal(pending.length_cm, null); }
      await db.exec("update pixel_fish_casts set created_at=now()-interval '20 seconds'");
      const result = await rpc('select public.finish_pixel_cast($1,true) r', [start.castId]); assert.equal(result.landed, true);
      if (start.junk) assert.equal(result.xpGain.gained, 1);
      if (start.heavy) assert.equal(result.xpGain.gained, 132);
      await db.exec('delete from pixel_private.fish_start_throttle');
    }
    assert.ok(junk > 5 && junk < 35, String(junk)); assert.ok(mythic > 0); assert.ok(pity > 0);
    assert.equal(Number((await db.query<any>('select count(*) n from pixel_fish_catches')).rows[0].n), 300 - junk);
    const state = await rpc('select public.get_pixel_fishing_state() r');
    assert.equal(Object.values(state.junk).reduce((a: number, b: any) => a + b, 0), junk);
    assert.equal(state.album.reduce((a: number, b: any) => a + b.count, 0), 300 - junk);
    assert.ok((await rpc('select public.get_class_fish_board() r')).rows.every((r: any) => !r.speciesId.startsWith('junk_')));
    await db.exec(`delete from pixel_fish_catches;
      insert into pixel_fish_catches(user_id,species_id,length_cm,kst_date,phase,weather) values
      ('${peer}','shark',300,current_date,'day','clear'),('${peer}','shark',200,current_date,'day','clear'),('${peer}','shark',100,current_date,'day','clear');
      insert into pixel_fish_casts(user_id,species_id,length_cm,created_at,expires_at,kst_date,phase,weather,bite_delay_ms,difficulty)
      values ('${user}','shark',200,now()-interval '20 seconds',now()+interval '60 seconds',current_date,'day','clear',1200,5);`);
    const cast = (await db.query<any>('select id from pixel_fish_casts')).rows[0].id;
    const result = await rpc('select public.finish_pixel_cast($1,true) r', [cast]);
    assert.equal(result.percentile, 75); assert.equal(result.xpGain.gained, 120);
    assert.deepEqual(await rpc('select public.finish_pixel_cast($1,true) r', [cast]), { ok: false });
    for (const expected of [20, 33.3]) {
      await db.exec(`insert into pixel_fish_casts(user_id,species_id,length_cm,created_at,expires_at,kst_date,phase,weather,bite_delay_ms,difficulty)
        values ('${user}','shark',400,now()-interval '20 seconds',now()+interval '60 seconds',current_date,'day','clear',1200,5);`);
      const id = (await db.query<any>('select id from pixel_fish_casts')).rows[0].id;
      assert.equal((await rpc('select public.finish_pixel_cast($1,true) r', [id])).percentile, expected);
    }
    await db.exec(`insert into pixel_fish_casts(user_id,junk,expires_at,kst_date,phase,weather,bite_delay_ms,difficulty)
      values ('${user}','junk_can',now()+interval '60 seconds',current_date,'day','clear',1200,1);`);
    const premature = (await db.query<any>('select id from pixel_fish_casts')).rows[0].id;
    assert.deepEqual(await rpc('select public.finish_pixel_cast($1,true) r', [premature]), { ok: true, landed: false });
    assert.deepEqual((await rpc('select public.get_pixel_fishing_state() r')).junk, state.junk);
    await assert.rejects(db.exec(`insert into pixel_fish_casts(user_id,species_id,length_cm,junk,expires_at,kst_date,phase,weather,bite_delay_ms)
      values ('${user}','shark',200,'junk_can',now()+interval '60 seconds',current_date,'day','clear',1200)`), /pixel_fish_casts_junk_check/);
    for (const role of ['anon', 'authenticated', 'service_role']) assert.equal((await db.query<any>("select has_table_privilege($1,'pixel_fish_junk','SELECT') allowed", [role])).rows[0].allowed, false);
    assert.equal((await db.query<any>("select relrowsecurity rls from pg_class where oid='pixel_fish_junk'::regclass")).rows[0].rls, true);
    for (const name of ['start_pixel_cast(text,text,text)', 'finish_pixel_cast(uuid,boolean)', 'get_pixel_fishing_state(text,text)']) {
      assert.equal((await db.query<any>("select has_function_privilege('authenticated',$1,'EXECUTE') allowed", ['public.' + name])).rows[0].allowed, true);
      assert.equal((await db.query<any>("select has_function_privilege('anon',$1,'EXECUTE') allowed", ['public.' + name])).rows[0].allowed, false);
    }
    await db.exec('set role authenticated'); await assert.rejects(db.query('select * from pixel_fish_junk'), /permission denied/);
    assert.equal((await rpc('select public.get_pixel_fishing_state() r')).junk.junk_shoe, state.junk.junk_shoe);
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(db.query('select public.get_pixel_fishing_state()'), /Authentication required/);
  } finally { await db.close(); }
});
