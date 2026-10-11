import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { BUG_CATALOG } from '../../src/features/pixel-world-phaser/logic/bugCatalog.ts';
import { NET_ITEM } from '../../src/features/pixel-room/shop/catalog.ts';

const sql = (name: string) => readFileSync(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8');
const U = '11111111-1111-1111-1111-111111111111';
const V = '22222222-2222-2222-2222-222222222222';
async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema pixel_private;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated;
    create table public.profiles(id uuid primary key,point_adjustment integer not null default 0);
    create table public.pixel_item_ownership(user_id uuid,item_id text,primary key(user_id,item_id));
    create table public.pixel_item_catalog(item_id text primary key,category text,slot text,price integer,asset_key text,display_name text,tier integer check(tier between 1 and 4),stackable boolean);
    create table public.pixel_fish_casts(id uuid);
    insert into public.profiles(id) values ('${U}'),('${V}');
    select set_config('request.jwt.claim.sub','${U}',false);`);
  const levels = sql('supabase_pixel_level_bait.sql');
  await db.exec(levels.slice(0, levels.indexOf('create or replace function pixel_private.get_pixel_fishing_state')) + '\ncommit;');
  await db.exec(sql('20261011220000_pixel_game_points.sql'));
  await db.exec(sql('20261011250000_pixel_game_points_fifth.sql'));
  await db.exec(sql('20261011260000_pixel_game_points_total_cap.sql'));
  await db.exec(sql('20261011240000_pixel_bugs.sql'));
  await db.exec(sql('20261011240000_pixel_bugs.sql'));
  const rpc = async (query: string, args: any[] = []) => (await db.query<any>(query, args)).rows[0].r;
  const state = () => rpc('select public.get_bug_state() r');
  const start = (scene = 'plaza') => rpc('select public.start_bug_catch($1) r', [scene]);
  const finish = (id: string, caught = true) => rpc('select public.finish_bug_catch($1,$2) r', [id,caught]);
  const reset = () => db.exec('delete from public.pixel_bug_attempts; delete from pixel_private.bug_start_throttle;');
  const age = (seconds: number) => db.query("update public.pixel_bug_attempts set created_at=clock_timestamp()-$1*interval '1 second'", [seconds]);
  return { db,rpc,state,start,finish,reset,age };
}

test('잠자리 시드·채·소유·대기·시간·재생·도감·보상이 서버 규칙을 따른다', async () => {
  const { db,state,start,finish,reset,age } = await setup();
  try {
    const species = (await db.query('select id,name,rarity,stars,points,xp,weight from pixel_bug_species order by sort_order')).rows;
    assert.deepEqual(species, BUG_CATALOG);
    const net = (await db.query<any>("select * from pixel_item_catalog where item_id='tool_net'")).rows[0];
    assert.deepEqual(net, { item_id: NET_ITEM.itemId,category: NET_ITEM.category,slot: NET_ITEM.slot,price: NET_ITEM.price,asset_key: NET_ITEM.assetKey,display_name: NET_ITEM.displayName,tier: NET_ITEM.tier,stackable: NET_ITEM.stackable });
    assert.deepEqual(await state(), { netOwned: false,album: [] });
    assert.deepEqual(await start(), { ok: false,reason: 'no_net' });
    await db.exec(`insert into pixel_item_ownership values ('${U}','tool_net')`);
    assert.deepEqual(await start('invalid'), { ok: false,reason: 'error' });
    let attempt = await start(); assert.equal(attempt.ok,true);
    assert.equal(attempt.difficulty, BUG_CATALOG.find(b => b.id===attempt.bugId)!.stars);
    assert.deepEqual(await start(), { ok: false,reason: 'pending' });
    assert.deepEqual(await finish(attempt.catchId), { ok: true,caught: false });
    assert.deepEqual(await finish(attempt.catchId), { ok: false });
    assert.deepEqual(await start(), { ok: false,reason: 'pending' });
    await db.exec("update pixel_private.bug_start_throttle set started_at=clock_timestamp()-interval '2 seconds'");
    attempt = await start(); assert.equal(attempt.ok,true); await age(0.7);
    assert.deepEqual(await finish(attempt.catchId,false), { ok: true,caught: false });
    await reset(); attempt = await start(); await age(15.1);
    assert.deepEqual(await finish(attempt.catchId), { ok: false });
    await reset(); attempt = await start(); await age(1);
    await db.exec("update pixel_bug_attempts set expires_at=clock_timestamp()-interval '1 second'");
    assert.deepEqual(await finish(attempt.catchId), { ok: false });
    await reset(); attempt = await start();
    await db.exec("update pixel_bug_attempts set expires_at=clock_timestamp()-interval '1 second'; update pixel_private.bug_start_throttle set started_at=clock_timestamp()-interval '3 seconds'");
    const replacement = await start(); assert.equal(replacement.ok,true);
    assert.deepEqual(await finish(attempt.catchId), { ok: false });
    await reset();
    let xp = 0;
    await db.exec(`select pixel_private.award_game_points('${U}',49,'normal')`);
    // 49P에서 시작: 고추(2P) 1P+0.2, 밀(3P) 0.6, 실(6P) 1.2→2P(52P), 왕(★4) 15P(67P), 황금(★5) 33P로 100P + 7조각×1/10.
    const awards = [1,0,2,15,33];
    for (const [i, bug] of BUG_CATALOG.entries()) {
      attempt = await start('river');
      await db.query('update pixel_bug_attempts set bug_id=$1,difficulty=$2', [bug.id,bug.stars]); await age(1);
      const result = await finish(attempt.catchId);
      xp += bug.xp;
      assert.equal(result.caught,true); assert.equal(result.isNew,true);
      assert.equal(result.xpGain.gained,bug.xp); assert.equal(result.xpGain.xp,xp);
      assert.equal(result.points.awarded,awards[i]);
      assert.deepEqual(await finish(attempt.catchId), { ok: false }); await reset();
    }
    const album = (await state()).album; assert.equal(album.length,5);
    assert.deepEqual(album.map((a: any) => [a.bugId,a.count]), BUG_CATALOG.map(b => [b.id,1]));
    attempt = await start('yard'); await db.exec("update pixel_bug_attempts set bug_id='dragonfly_red',difficulty=1"); await age(1);
    await db.exec(`select set_config('request.jwt.claim.sub','${V}',false)`);
    assert.deepEqual(await finish(attempt.catchId), { ok: false }); assert.deepEqual(await state(), { netOwned: false,album: [] });
    await db.exec(`select set_config('request.jwt.claim.sub','${U}',false)`);
    assert.equal((await finish(attempt.catchId)).isNew,false);
    assert.deepEqual((await state()).album[0], { ...album[0],count: 2 });
    assert.equal((await db.query<any>("select count(*) n from pixel_bug_catches where scene='river'")).rows[0].n,5);
    assert.equal((await db.query<any>('select point_adjustment from profiles where id=$1',[U])).rows[0].point_adjustment,100); // 49 + (1+0+2+15+33) + 마지막 고추(100P 넘어 1/10 조각 2개, 0P)
  } finally { await db.close(); }
});

test('결과 접수 마감은 별마다 (시간 제한 + 2초): 별1 7초 ~ 별5 5초', async () => {
  const { db,start,finish,reset,age } = await setup();
  try {
    await db.exec(sql('20261012140000_pixel_bug_timing.sql'));
    await db.exec(sql('20261012140000_pixel_bug_timing.sql')); // 다시 돌려도 그대로
    await db.exec(`insert into pixel_item_ownership values ('${U}','tool_net')`);
    const attempt = async (stars: number, seconds: number) => {
      await reset(); const a = await start();
      await db.query('update pixel_bug_attempts set bug_id=$1,difficulty=$2', [BUG_CATALOG.find(b => b.stars===stars)!.id,stars]); await age(seconds);
      return (await finish(a.catchId)).ok;
    };
    assert.deepEqual([await attempt(1,6.9), await attempt(1,7.1)], [true,false]);
    assert.deepEqual([await attempt(3,5.9), await attempt(3,6.1)], [true,false]);
    assert.deepEqual([await attempt(5,4.9), await attempt(5,5.1)], [true,false]);
  } finally { await db.close(); }
});

test('잠자리 RPC만 인증 사용자에게 열고 테이블은 RLS로 잠근다', async () => {
  const { db,rpc } = await setup();
  try {
    for (const role of ['anon','authenticated','service_role']) {
      for (const signature of ['start_bug_catch(text)','finish_bug_catch(uuid,boolean)','get_bug_state()']) {
        const allowed = (await db.query<any>("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,'public.'+signature])).rows[0].allowed;
        assert.equal(allowed,role==='authenticated');
      }
      for (const table of ['public.pixel_bug_species','public.pixel_bug_attempts','public.pixel_bug_catches','pixel_private.bug_start_throttle']) {
        assert.equal((await db.query<any>("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed",[role,table])).rows[0].allowed,false);
        assert.equal((await db.query<any>('select relrowsecurity rls from pg_class where oid=$1::regclass',[table])).rows[0].rls,true);
      }
    }
    const functions = (await db.query<any>("select prosecdef,proconfig from pg_proc where proname in ('start_bug_catch','finish_bug_catch','get_bug_state')")).rows;
    assert.ok(functions.every(f => f.prosecdef && f.proconfig.includes('search_path=""')));
    await db.exec('set role anon'); await assert.rejects(rpc('select public.get_bug_state() r'), /permission denied/);
    await db.exec('reset role; set role authenticated'); assert.equal((await rpc('select public.get_bug_state() r')).netOwned,false);
    await assert.rejects(db.query('select * from public.pixel_bug_species'), /permission denied/);
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
    for (const query of ["select public.get_bug_state() r","select public.start_bug_catch('plaza') r","select public.finish_bug_catch(null,true) r"]) await assert.rejects(rpc(query), /Authentication required/);
  } finally { await db.close(); }
});

test('실제 구매 RPC의 채 구매·150P 차감', { skip: '프로덕션 함수 읽기가 승인 정책으로 차단되어 실제 구매 본문을 확보할 수 없음' }, () => {});
