import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createFishingAdapter, parseCastStart, parseFishingState } from '../../src/features/pixel-world-phaser/ui/fishingAdapter.ts';
import { createMockFishingAdapter } from '../../src/features/pixel-world-phaser/ui/fishingAdapterMock.ts';
import { fishById } from '../../src/features/pixel-world-phaser/logic/fishCatalog.ts';
import { FISH_POINTS } from '../../src/features/pixel-world-phaser/logic/gamePoints.ts';
import { parseCastFinish, parseClassFishBoard } from '../../src/features/pixel-world-phaser/ui/fishingAdapter.ts';
import { createRewardsAdapter, createMockRewardsAdapter, parseWeeklyRewards } from '../../src/features/pixel-world-phaser/ui/rewardsAdapter.ts';
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
      create table public.profiles(id uuid primary key, point_adjustment integer not null default 0, nickname text, display_name text);
      create table public.pixel_pet_equipment(user_id uuid primary key, active_pet text);
      create table public.pixel_item_ownership(user_id uuid, item_id text, primary key(user_id,item_id));
      create table public.pixel_item_catalog(item_id text primary key,category text,slot text,price int,asset_key text,display_name text,tier int,stackable boolean);
      grant usage on schema auth, public to authenticated;
      insert into auth.users values ('${user}'),('${peer}');
      insert into public.profiles(id) values ('${user}'),('${peer}');
      select set_config('request.jwt.claim.sub','${user}',false);`);
    for (const name of ['supabase_pixel_fishing.sql', 'supabase_pixel_fishing_v2.sql', 'supabase_pixel_fishing_v3.sql', 'supabase_pixel_fishing_v4.sql']) await db.exec(sql(name));
    const bait = sql('supabase_pixel_level_bait.sql');
    await db.exec(bait.slice(0, bait.indexOf('create or replace function pixel_private.get_pixel_fishing_state')) + '\ncommit;');
    await db.exec(sql('20261011150000_pixel_pet_effects_v2.sql'));
    await db.exec(sql('20261011120000_fish_board_teacher_rainbow_only.sql'));
    await db.exec(sql('20261011170000_pixel_fishing_expansion.sql'));
    await db.exec(sql('20261011190000_pixel_fishing_hotspots.sql'));
    await db.exec(sql('20261011220000_pixel_game_points.sql'));
    await db.exec(sql('20261011250000_pixel_game_points_fifth.sql'));
    await db.exec(`create table public.pixel_farm_crops(user_id uuid, status text, submitted_at timestamptz, size_score numeric);`);
    await db.exec(sql('20260922090000_pixel_farm_weekly_contest.sql'));
    await db.exec(sql('20261011230000_pixel_fish_points_weekly.sql'));
    await db.exec(sql('20261011230000_pixel_fish_points_weekly.sql'));
    return db;
}

test('어종별 포인트, 상한 이후 1/5과 전액, 동전과 탈출', async () => {
  const db = await database();
  try {
    const species = (await db.query<any>('select distinct on (rarity) id,rarity,min_cm from pixel_fish_species order by rarity,id')).rows;
    const finish = async (s: any, junk: string | null = null, landed = true) => {
      await db.exec('delete from pixel_fish_casts; delete from pixel_private.fish_start_throttle');
      const start = (await db.query<any>("select public.start_pixel_cast(null,'13:00','clear') r")).rows[0].r;
      await db.query("update pixel_fish_casts set created_at=now()-interval '30 seconds',junk=$1,species_id=$2,length_cm=$3,difficulty=1", [junk, junk ? null : s.id, junk ? null : s.min_cm]);
      return (await db.query<any>('select public.finish_pixel_cast($1,$2) r', [start.castId,landed])).rows[0].r;
    };
    for (const s of species) {
      await db.exec('delete from pixel_private.game_point_days');
      assert.equal((await finish(s)).points.awarded, FISH_POINTS[s.rarity as keyof typeof FISH_POINTS]);
      await db.exec('update pixel_private.game_point_days set earned=50,carry=0');
      const base = FISH_POINTS[s.rarity as keyof typeof FISH_POINTS];
      assert.equal((await finish(s)).points.awarded, ['legendary','mythic'].includes(s.rarity) ? base : Math.floor(base/5));
    }
    await db.exec('delete from pixel_private.game_point_days');
    assert.equal((await finish(species[0], 'junk_coin')).points.awarded,1);
    await db.exec('update pixel_private.game_point_days set earned=50');
    assert.equal((await finish(species[0], 'junk_coin')).points.awarded,0);
    for (const junk of ['junk_shoe','junk_can']) assert.equal((await finish(species[0],junk)).points.awarded,0);
    const before = (await db.query<any>('select point_adjustment n from profiles where id=$1',[user])).rows[0].n;
    assert.deepEqual(await finish(species[0],null,false), {ok:true,landed:false});
    assert.equal((await db.query<any>('select point_adjustment n from profiles where id=$1',[user])).rows[0].n,before);
  } finally { await db.close(); }
});

test('주간 정산: 크기 점수·동점·관리자 제외·공동 순위·참가상·소유자 확인', async () => {
  const db = await database();
  const admin = '33333333-3333-3333-3333-333333333333';
  const third = '44444444-4444-4444-4444-444444444444';
  const fourth = '55555555-5555-5555-5555-555555555555';
  try {
    await db.exec(`insert into profiles(id) values ('${admin}'),('${third}'),('${fourth}'); insert into private.app_admins values('${admin}');`);
    const week = (await db.query<any>("select timezone('Asia/Seoul',date_trunc('week',timezone('Asia/Seoul',now())))-interval '7 days' w")).rows[0].w;
    const add = (u: string, species: string, length: number, seconds: number) => db.query("insert into pixel_fish_catches(user_id,species_id,length_cm,caught_at,kst_date,phase,weather) values($1,$2,$3,$4::timestamptz+make_interval(secs=>$5),($4::timestamptz at time zone 'Asia/Seoul')::date,'day','clear')",[u,species,length,week,seconds]);
    await add(admin,'carp',70,0);
    await add(user,'carp',50,1);
    await add(peer,'goby',18,2);
    await add(user,'goby',18,3);
    await add(user,'pirami',9,1);
    await add(peer,'pirami',9,2);
    // 빈 등급과 경계 밖 기록은 보상하지 않는다.
    await add(user,'moonfish',14,-1);
    for (const [u,size] of [[admin,100],[user,90],[peer,80],[third,70],[fourth,60]] as const) {
      await db.query("insert into pixel_farm_crops values($1,'submitted',$2::timestamptz+interval '1 day',$3)",[u,week,size]);
    }
    await db.query("insert into pixel_farm_crops values($1,'stored',$2,100),($1,'submitted',$2,50)",[user,week]);
    const rpc = async () => (await db.query<any>('select public.get_pixel_rewards() r')).rows[0].r;
    const mine = await rpc();
    assert.equal(mine.length,2);
    assert.deepEqual(mine.map((r:any)=>r.points).sort((a:number,b:number)=>a-b),[25,100]);
    const balances = (await db.query<any>('select id,point_adjustment p from profiles order by id')).rows;
    assert.deepEqual(balances.map(r=>r.p),[125,110,0,50,10]);
    assert.equal(Number((await db.query<any>('select count(*) n from pixel_weekly_rewards')).rows[0].n),6);
    await db.query('select pixel_private.settle_pixel_week($1)',[week]); await rpc();
    assert.deepEqual((await db.query<any>('select id,point_adjustment p from profiles order by id')).rows,balances);
    const otherId = (await db.query<any>('select id from pixel_weekly_rewards where user_id=$1',[peer])).rows[0].id;
    await db.query('select public.ack_pixel_rewards($1)',[[mine[0].id,otherId]]);
    assert.equal((await rpc()).length,1);
    await db.exec(`select set_config('request.jwt.claim.sub','${peer}',false)`);
    assert.equal((await rpc()).length,2);
    await db.query('select public.ack_pixel_rewards($1)',[(await rpc()).map((r:any)=>r.id)]);
    assert.deepEqual(await rpc(),[]);
    // 다음 주 게시판: 학생 우선, 선생님만 낚은 등급은 보상 0.
    await db.exec("update pixel_fish_catches set caught_at=caught_at+interval '7 days' where caught_at>='"+new Date(week).toISOString()+"'::timestamptz");
    await add(admin,'moonfish',14,7*86400+10);
    const board = (await db.query<any>('select public.get_class_fish_board() r')).rows[0].r;
    // 선생님 기록은 무지개 잉어만 게시판에 — 달빛 피라미는 챔피언 줄에도 나오지 않는다.
    assert.deepEqual(board.champions.map((c:any)=>[c.rarity,c.speciesId,c.teacher,c.reward]),[['uncommon','goby',false,40],['common','pirami',false,25]]);
    await add(admin,'rainbow_koi',70,7*86400+20);
    const board2 = (await db.query<any>('select public.get_class_fish_board() r')).rows[0].r;
    const koi = board2.champions.find((c:any)=>c.rarity==='legendary');
    assert.deepEqual(koi && [koi.speciesId,koi.teacher,koi.reward],['rainbow_koi',true,0]);
    await db.query("delete from pixel_fish_catches where species_id='rainbow_koi' and user_id=$1",[admin]); // 아래 기존 게시판 비교는 이 기록 없이
    assert.equal(board.champions[0].score,80);
    assert.equal(board.champions[1].score,50);
    const oldBoardSql = sql('20261011130000_unique_animal_faces_teacher_gorilla.sql');
    await db.exec(oldBoardSql.slice(oldBoardSql.indexOf('create or replace function pixel_private.get_class_fish_board()'),oldBoardSql.lastIndexOf('commit;')));
    const oldBoard = (await db.query<any>('select public.get_class_fish_board() r')).rows[0].r;
    assert.deepEqual({rows:board.rows,classSpecies:board.classSpecies},oldBoard);
    await db.exec(sql('20261011230000_pixel_fish_points_weekly.sql'));
    for (const role of ['anon','authenticated','service_role']) {
      for (const table of ['public.pixel_weekly_rewards','pixel_private.weekly_settlements']) {
        assert.equal((await db.query<any>('select has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE\') v',[role,table])).rows[0].v,false);
        assert.equal((await db.query<any>('select relrowsecurity v from pg_class where oid=$1::regclass',[table])).rows[0].v,true);
      }
      for (const fn of ['public.get_pixel_rewards()','public.ack_pixel_rewards(uuid[])','pixel_private.get_class_fish_board()','pixel_private.finish_pixel_cast(uuid,boolean)'])
        assert.equal((await db.query<any>("select has_function_privilege($1,$2,'EXECUTE') v",[role,fn])).rows[0].v,role==='authenticated');
      for (const fn of ['pixel_private.settle_pixel_week(timestamptz)','pixel_private.fish_tier_leaders(timestamptz,boolean)'])
        assert.equal((await db.query<any>("select has_function_privilege($1,$2,'EXECUTE') v",[role,fn])).rows[0].v,false);
    }
    await db.exec('set role authenticated'); await rpc();
    await assert.rejects(db.query('select * from public.pixel_weekly_rewards'), /permission denied/);
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(rpc(),/Authentication required/);
    await assert.rejects(db.query('select public.ack_pixel_rewards(array[]::uuid[])'),/Authentication required/);
  } finally { await db.close(); }
});

test('한 학생의 여러 등급 우승과 토마토 공동 순위, 정규화 및 상한 우회', async () => {
  const db = await database();
  const third='44444444-4444-4444-4444-444444444444', fourth='55555555-5555-5555-5555-555555555555';
  try {
    await db.exec(`insert into profiles(id) values('${third}'),('${fourth}');
      insert into pixel_private.game_point_days(user_id,kst_date,earned,carry) values('${user}',(now() at time zone 'Asia/Seoul')::date,50,1);
      insert into pixel_fish_catches(user_id,species_id,length_cm,caught_at,kst_date,phase,weather)
        select '${user}',id,max_cm,timezone('Asia/Seoul',date_trunc('week',timezone('Asia/Seoul',now())))-interval '1 day',
        (now() at time zone 'Asia/Seoul')::date,'day','clear'
        from (select distinct on(rarity) * from pixel_fish_species order by rarity,id) s;
      insert into pixel_farm_crops(user_id,status,submitted_at,size_score) values
        ('${user}','submitted',timezone('Asia/Seoul',date_trunc('week',timezone('Asia/Seoul',now())))-interval '1 day',90),
        ('${peer}','submitted',timezone('Asia/Seoul',date_trunc('week',timezone('Asia/Seoul',now())))-interval '1 day',90),
        ('${third}','submitted',timezone('Asia/Seoul',date_trunc('week',timezone('Asia/Seoul',now())))-interval '1 day',70),
        ('${fourth}','submitted',timezone('Asia/Seoul',date_trunc('week',timezone('Asia/Seoul',now())))-interval '1 day',60);`);
    const rewards=(await db.query<any>('select public.get_pixel_rewards() r')).rows[0].r;
    assert.deepEqual(rewards.filter((r:any)=>r.kind==='fish_tier').map((r:any)=>r.points).sort((a:number,b:number)=>a-b),[25,40,60,100,150]);
    assert.ok(rewards.every((r:any)=>r.label.startsWith('지난주 ')));
    assert.deepEqual((await db.query<any>('select point_adjustment p from profiles order by id')).rows.map(r=>r.p),[475,100,50,10]);
    assert.deepEqual((await db.query<any>('select earned,carry from pixel_private.game_point_days')).rows,[{earned:50,carry:1}]);
    await db.exec("set timezone='America/New_York'; select pixel_private.settle_pixel_week(now()-interval '7 days');");
    assert.equal(Number((await db.query<any>('select count(*) n from pixel_private.weekly_settlements')).rows[0].n),1);
    await assert.rejects(db.query('select pixel_private.settle_pixel_week(now())'),/Week is not complete/);
    await db.exec('delete from pixel_fish_catches; delete from pixel_farm_crops');
    await db.exec("select pixel_private.settle_pixel_week(now()-interval '14 days');");
    assert.equal(Number((await db.query<any>('select count(*) n from pixel_weekly_rewards')).rows[0].n),9);
  } finally { await db.close(); }
});

test('포인트와 챔피언 파싱, 보상 어댑터와 오류 복구', async () => {
  const points = { awarded:4,todayEarned:51,cap:50,capped:true };
  const fish = {ok:true,landed:true,speciesId:'carp',lengthCm:50,rarity:'uncommon',remaining:-1};
  for (const base of [fish,{ok:true,landed:true,junk:'junk_coin',remaining:-1}]) {
    assert.deepEqual((parseCastFinish({...base,points}) as any).points,points);
    for (const bad of [null,{}, {...points,awarded:-1},{...points,cap:100},{...points,capped:false}]) assert.equal((parseCastFinish({...base,points:bad}) as any).points,undefined);
  }
  const champion = {rarity:'uncommon',speciesId:'carp',lengthCm:50,score:50,animal:'🐻',reward:40,teacher:false};
  assert.deepEqual(parseClassFishBoard({rows:[],classSpecies:2,champions:[champion,champion,{...champion,rarity:'bad'},{...champion,rarity:'mythic',score:NaN}]}).champions,[champion]);
  assert.equal(parseClassFishBoard({rows:[]}).champions,undefined);
  const reward = {id:user,weekStart:'2026-10-04T15:00:00Z',kind:'fish_tier' as const,label:'지난주 챔피언',points:25};
  assert.deepEqual(parseWeeklyRewards([reward,reward,{...reward,id:peer,points:-1}]),[reward]);
  const calls:any[]=[];
  const adapter = createRewardsAdapter({rpc:async(fn,args)=>{calls.push([fn,args]);return {data:fn==='get_pixel_rewards'?[reward]:true,error:null};}});
  assert.deepEqual(await adapter.pending(),[reward]); assert.equal(await adapter.ack([user,user]),true);
  assert.deepEqual(calls[1],['ack_pixel_rewards',{p_ids:[user]}]);
  assert.equal(await adapter.ack(['bad']),false);
  const broken=createRewardsAdapter({rpc:()=>{throw Error('오류');}}); assert.deepEqual(await broken.pending(),[]); assert.equal(await broken.ack([user]),false);
  const mock=createMockRewardsAdapter([reward]); const snapshot=await mock.pending(); snapshot[0].points=0;
  assert.equal((await mock.pending())[0].points,25); await mock.ack([user]); assert.deepEqual(await mock.pending(),[]);
});

test('모의 낚시도 1/5 조각 누적과 날짜 초기화 규칙을 따른다', async () => {
  let now=Date.parse('2026-10-11T03:00:00Z');
  const mock=createMockFishingAdapter({seed:42,now:()=>now,todayEarned:50,override:{clock:'13:00',weather:'clear'}});
  let earned=50,carry=0;
  for(let i=0;i<150;i++) {
    now+=3000; const start=await mock.start(null); assert.ok(start.ok); now+=15000;
    const r=await mock.finish(start.castId,true); assert.ok(r.ok&&r.landed);
    const base='junk' in r ? (r.junk==='junk_coin'?1:0) : FISH_POINTS[r.rarity];
    let expected=0;
    if(!('junk' in r)&&['legendary','mythic'].includes(r.rarity)) expected=base;
    else if(!('junk' in r)){expected=Math.floor((carry+base)/5);carry=(carry+base)%5;}
    earned+=expected; assert.equal(r.points?.awarded,expected); assert.equal(r.points?.todayEarned,earned);
  }
  now+=86400000; const start=await mock.start(null); assert.ok(start.ok); now+=15000;
  const r=await mock.finish(start.castId,true); assert.ok(r.ok&&r.landed);
  const base='junk' in r ? (r.junk==='junk_coin'?1:0) : FISH_POINTS[r.rarity];
  assert.equal(r.points?.todayEarned,base);
});
