import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createFishingAdapter, parseCastStart, parseFishingState } from '../../src/features/pixel-world-phaser/ui/fishingAdapter.ts';
import { createMockFishingAdapter } from '../../src/features/pixel-world-phaser/ui/fishingAdapterMock.ts';
import { fishById } from '../../src/features/pixel-world-phaser/logic/fishCatalog.ts';
const sql = (name: string) => readFileSync(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8');
const user = '11111111-1111-1111-1111-111111111111';
const peer = '22222222-2222-2222-2222-222222222222';
async function database() {
  const db = new PGlite();
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
    await db.exec(sql('20261011170000_pixel_fishing_expansion.sql'));
    return db;
}

test('포인트 응답 검증과 선택적 RPC 인수', async () => {
  const base = { ok: true, castId: 'c', shadow: 'S', biteDelayMs: 1200 };
  for (const id of [-1, 4, 0.5, '0', null]) {
    const start = parseCastStart({ ...base, spot: { id, left: 3, bonus: true } });
    assert.ok(start.ok && start.spot === undefined);
  }
  for (const left of [-1, 6, 1.5, '3', null]) {
    const start = parseCastStart({ ...base, spot: { id: 0, left, bonus: true } });
    assert.ok(start.ok && start.spot === undefined);
  }
  const start = parseCastStart({ ...base, spot: { id: 3, left: 0, bonus: false } });
  assert.ok(start.ok); assert.deepEqual(start.spot, { id: 3, left: 0, bonus: false });
  const valid = { id: 0, active: true, left: 5, readyAt: null };
  assert.deepEqual(parseFishingState({ spots: [valid, valid, { ...valid, id: 4 }, { ...valid, id: 1, active: 1 }, { ...valid, id: 2, readyAt: 'bad' }, { ...valid, id: 3, left: 6 }] }).spots, [valid]);
  const cooling = { id: 1, active: false, left: 0, readyAt: '2026-10-11T03:00:00Z' };
  assert.deepEqual(parseFishingState({ spots: [cooling] }).spots, [cooling]);
  assert.equal(parseFishingState({}).spots, undefined);
  const calls: Record<string, unknown>[] = [];
  const adapter = createFishingAdapter({ rpc: async (_fn, args) => { calls.push(args!); return { data: base, error: null }; } }, { clock: '13:00', weather: 'clear' });
  await adapter.start(null); await adapter.start(null, null); await adapter.start(null, 0);
  assert.deepEqual(calls[0], { p_pet: null, p_override_clock: '13:00', p_override_weather: 'clear' });
  assert.deepEqual(calls[1], calls[0]); assert.deepEqual(calls[2], { ...calls[0], p_spot: 0 });
});

test('서버 포인트: 재적용·기존 호출·소모·재생성·권한·학생 격리', async () => {
  const db = await database();
  try {
    const migration = sql('20261011190000_pixel_fishing_hotspots.sql');
    await db.exec(migration); await db.exec(migration);
    const rpc = async (query: string, args: unknown[] = []) => (await db.query<any>(query, args)).rows[0].r;
    const state = () => rpc('select public.get_pixel_fishing_state() r');
    const reset = () => db.exec('delete from pixel_fish_casts; delete from pixel_private.fish_start_throttle');
    const start = (spot: number) => rpc("select public.start_pixel_cast(null,'13:00','clear',$1) r", [spot]);
    const finish = async (id: string, landed: boolean) => {
      await db.exec("update pixel_fish_casts set created_at=now()-interval '20 seconds'");
      return rpc('select public.finish_pixel_cast($1,$2) r', [id, landed]);
    };
    const initial = (await state()).spots;
    assert.deepEqual(initial.map((s: any) => s.id), [0, 1, 2, 3]);
    assert.ok(initial.every((s: any) => s.active && s.left >= 3 && s.left <= 5 && s.readyAt === null));
    assert.deepEqual((await state()).spots, initial);
    for (const query of ["select public.start_pixel_cast(p_pet=>null) r", "select public.start_pixel_cast(p_pet=>null,p_override_clock=>'13:00',p_override_weather=>'clear') r"]) {
      const cast = await rpc(query); assert.equal(cast.ok, true); assert.equal(cast.spot, undefined); await reset();
    }
    for (const id of [-1, 4, 99]) { assert.equal((await start(id)).spot, undefined); await reset(); }
    let cast = await start(0);
    assert.deepEqual(cast.spot, { id: 0, bonus: true, left: initial[0].left });
    const stored = (await db.query<any>('select spot_id,spot_bonus from pixel_fish_casts')).rows[0];
    assert.deepEqual(stored, { spot_id: 0, spot_bonus: true });
    await finish(cast.castId, false); await reset();
    assert.deepEqual((await state()).spots, initial);
    cast = await start(0);
    assert.deepEqual(await rpc('select public.finish_pixel_cast($1,true) r', [cast.castId]), { ok: true, landed: false });
    await reset(); assert.deepEqual((await state()).spots, initial);
    cast = await start(0);
    await db.exec("update pixel_fish_casts set expires_at=now()-interval '1 second'");
    assert.deepEqual(await finish(cast.castId, true), { ok: false });
    await reset(); assert.deepEqual((await state()).spots, initial);
    cast = await start(0);
    await db.exec("update pixel_fish_casts set junk='junk_can',species_id=null,length_cm=null,pity=false,trophy=false");
    assert.equal((await finish(cast.castId, true)).junk, 'junk_can'); await reset();
    assert.deepEqual((await state()).spots, initial);
    for (let remaining = initial[0].left; remaining > 0; remaining--) {
      cast = await start(0); assert.equal(cast.spot.left, remaining);
      await db.exec("update pixel_fish_casts set junk=null,species_id='carp',length_cm=30");
      const result = await finish(cast.castId, true);
      assert.equal(result.spot.left, remaining - 1);
      assert.equal(result.spot.id, 0);
      if (remaining > 1) assert.equal(result.spot.readyAt, null);
      else {
        const seconds = (Date.parse(result.spot.readyAt) - Date.now()) / 1000;
        assert.ok(seconds >= 179 && seconds <= 301, String(seconds));
      }
      assert.deepEqual(await rpc('select public.finish_pixel_cast($1,true) r', [cast.castId]), { ok: false });
      await reset();
    }
    const depleted = (await state()).spots;
    assert.equal(depleted[0].active, false); assert.equal(depleted[0].left, 0);
    assert.deepEqual(depleted.slice(1), initial.slice(1));
    assert.deepEqual((await start(0)).spot, { id: 0, bonus: false, left: 0 }); await reset();
    await db.exec("update pixel_private.fish_spot_state set ready_at=now()-interval '1 second' where spot_id=0");
    const refreshed = (await start(0)).spot;
    assert.equal(refreshed.bonus, true); assert.ok(refreshed.left >= 3 && refreshed.left <= 5); await reset();
    assert.equal((await state()).spots[0].readyAt, null);
    await db.exec('update pixel_private.fish_spot_state set "left"=0,ready_at=now()-interval \'1 second\' where spot_id=1');
    const refreshedByRead = (await state()).spots[1];
    assert.ok(refreshedByRead.active && refreshedByRead.left >= 3 && refreshedByRead.left <= 5 && refreshedByRead.readyAt === null);
    await db.exec(`select set_config('request.jwt.claim.sub','${peer}',false)`);
    assert.ok((await state()).spots.every((s: any) => s.left >= 3 && s.active));
    assert.equal(Number((await db.query<any>('select count(*) n from pixel_private.fish_spot_state')).rows[0].n), 8);
    for (const schema of ['public', 'pixel_private']) for (const signature of ['start_pixel_cast(text,text,text,integer)', 'get_pixel_fishing_state(text,text)', 'finish_pixel_cast(uuid,boolean)']) {
      for (const role of ['authenticated', 'anon', 'service_role']) assert.equal((await db.query<any>('select has_function_privilege($1,$2,\'EXECUTE\') allowed', [role, schema + '.' + signature])).rows[0].allowed, role === 'authenticated');
    }
    assert.equal(Number((await db.query<any>("select count(*) n from pg_proc where proname='start_pixel_cast'")).rows[0].n), 2);
    for (const role of ['anon', 'authenticated', 'service_role']) assert.equal((await db.query<any>("select has_table_privilege($1,'pixel_private.fish_spot_state','SELECT,INSERT,UPDATE,DELETE') allowed", [role])).rows[0].allowed, false);
    assert.equal((await db.query<any>("select relrowsecurity rls from pg_class where oid='pixel_private.fish_spot_state'::regclass")).rows[0].rls, true);
    assert.equal((await db.query<any>("select has_function_privilege('authenticated','pixel_private.refresh_fish_spots(uuid)','EXECUTE') allowed")).rows[0].allowed, false);
    await db.exec('set role anon'); await assert.rejects(db.query('select public.start_pixel_cast(null)'), /permission denied/);
    await db.exec('reset role; set role authenticated'); assert.equal((await state()).spots.length, 4);
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(state(), /Authentication required/);
  } finally { await db.close(); }
});

test('서버 통계: 포인트의 희귀 확률·큰 길이·미끼 상한', async () => {
  const db = await database();
  try {
    await db.exec(sql('20261011190000_pixel_fishing_hotspots.sql'));
    await db.exec(`select setseed(0.42);
      insert into pixel_item_ownership values ('${user}','rod_gold');
      insert into pixel_rod_equipment(user_id,rod_id) values ('${user}',null);
      create temporary table samples(bait boolean, bonus boolean, hard boolean, size numeric, junk boolean);
      do $$ declare b boolean; h boolean; i integer; r jsonb; k record; begin
        foreach b in array array[false,true] loop
          update pixel_rod_equipment set rod_id=case when b then 'rod_gold' else null end where user_id='${user}';
          foreach h in array array[false,true] loop
            insert into public.pixel_bait(user_id,charges) values ('${user}',case when b then 10000 else 0 end)
              on conflict(user_id) do update set charges=excluded.charges;
            for i in 1..1800 loop
              r := public.start_pixel_cast(null,'13:00','clear',case when h then 0 else null end);
              select c.*,s.min_cm,s.max_cm,s.rarity into k from pixel_fish_casts c left join pixel_fish_species s on s.id=c.species_id;
              if k.rarity='mythic' and (k.difficulty<>5 or not (r->>'heavy')::boolean) then raise exception '신화 규칙 변경'; end if;
              insert into samples values(b,h,k.rarity in ('rare','legendary','mythic'),(k.length_cm-k.min_cm)/(k.max_cm-k.min_cm),k.junk is not null);
              perform public.finish_pixel_cast((r->>'castId')::uuid,false);
              delete from pixel_private.fish_start_throttle;
            end loop;
          end loop;
        end loop;
      end $$;`);
    const rows = (await db.query<any>('select bait,bonus,avg(hard::int) hard,avg(size) size,avg(junk::int) junk from samples group by bait,bonus')).rows;
    for (const bait of [false, true]) {
      const plain = rows.find(r => r.bait === bait && !r.bonus)!;
      const bonus = rows.find(r => r.bait === bait && r.bonus)!;
      assert.ok(Number(bonus.hard) - Number(plain.hard) > 0.08, JSON.stringify(rows));
      assert.ok(Number(bonus.size) > Number(plain.size) + 0.12, JSON.stringify(rows));
      for (const row of [plain, bonus]) assert.ok(Number(row.junk) > 0.035 && Number(row.junk) < 0.085);
    }
    const capped = rows.find(r => r.bait && r.bonus)!;
    assert.ok(Number(capped.hard) > 0.58 && Number(capped.hard) < 0.68);
  } finally { await db.close(); }
});

test('모의 포인트: 소모·잡동사니·도망·재생성·효과', async () => {
  let now = Date.parse('2026-10-11T03:00:00Z');
  const mock = createMockFishingAdapter({ now: () => now, seed: 42 });
  const initial = (await mock.state()).spots!;
  let left = initial[0].left, junk = 0;
  for (let i = 0; left > 0 && i < 40; i++) {
    now += 3000;
    const start = await mock.start(null, 0); assert.ok(start.ok);
    assert.equal(start.spot?.left, left); assert.equal(start.spot?.bonus, true);
    now += 10000;
    const landed = i !== 0;
    const result = await mock.finish(start.castId, landed); assert.ok(result.ok);
    if (landed && !start.junk) left--;
    if (landed && !start.junk) assert.equal((result as any).spot.left, left);
    if (start.junk) junk++;
    assert.equal((await mock.state()).spots![0].left, left);
  }
  assert.equal(left, 0); assert.ok(junk > 0);
  const depleted = (await mock.state()).spots!;
  assert.deepEqual(depleted.slice(1), initial.slice(1));
  const ready = Date.parse(depleted[0].readyAt!);
  assert.ok(ready - now >= 180000 && ready - now <= 300000);
  now = ready - 1;
  const inactive = await mock.start(null, 0); assert.ok(inactive.ok && inactive.spot?.bonus === false);
  await mock.finish(inactive.castId, false);
  now = ready;
  const fresh = (await mock.state()).spots![0];
  assert.ok(fresh.active && fresh.left >= 3 && fresh.left <= 5 && fresh.readyAt === null);
  const other = createMockFishingAdapter({ seed: 42, now: () => now });
  assert.ok((await other.state()).spots!.every(s => s.active));
  const averages = [];
  for (const bonus of [false, true]) {
    const adapter = createMockFishingAdapter({ seed: 123, now: () => now, override: { clock: '13:00', weather: 'clear' } });
    let hard = 0, size = 0, count = 0;
    for (let i = 0; i < 2500; i++) {
      now += 3000;
      const start = await adapter.start(null, bonus ? 0 : null); assert.ok(start.ok);
      const cast = adapter.peek()!;
      if (!cast.junk) {
        const fish = fishById(cast.speciesId)!;
        hard += Number(cast.hard); size += (cast.lengthCm - fish.minCm) / (fish.maxCm - fish.minCm); count++;
      }
      await adapter.finish(start.castId, false);
    }
    averages.push({ hard: hard / count, size: size / count });
  }
  assert.ok(averages[1].hard > averages[0].hard + 0.09);
  assert.ok(averages[1].size > averages[0].size + 0.12);
});
