import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// 손 칸·맨손 낚시·잠자리 업적 마이그레이션(PGlite). 잠자리·가방은 실제 마이그레이션을 차례로 돌리고,
// 낚시 시작 함수는 바꿀 줄만 담은 흉내 함수로 확인한다.
const sql = (name: string) => readFileSync(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8');
const U = '11111111-1111-1111-1111-111111111111';

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema pixel_private;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table auth.users(id uuid primary key);
    grant usage on schema auth,public to authenticated;
    create table public.profiles(id uuid primary key,point_adjustment integer not null default 0);
    create table public.pixel_item_ownership(user_id uuid,item_id text,primary key(user_id,item_id));
    create table public.pixel_item_catalog(item_id text primary key,category text,slot text,price integer,asset_key text,display_name text,tier integer check(tier between 1 and 4),stackable boolean);
    create table public.pixel_fish_casts(id uuid);
    insert into public.profiles(id) values ('${U}'); insert into auth.users(id) values ('${U}');
    select set_config('request.jwt.claim.sub','${U}',false);`);
  const levels = sql('supabase_pixel_level_bait.sql');
  await db.exec(levels.slice(0, levels.indexOf('create or replace function pixel_private.get_pixel_fishing_state')) + '\ncommit;');
  await db.exec(sql('20261011220000_pixel_game_points.sql'));
  await db.exec(sql('20261011250000_pixel_game_points_fifth.sql'));
  await db.exec(sql('20261011260000_pixel_game_points_total_cap.sql'));
  await db.exec(sql('20261011240000_pixel_bugs.sql'));
  // 가방 마이그레이션이 필요로 하는 것(물고기 종류·작물·낚시 끝내기 지급 줄).
  await db.exec(`create table public.pixel_fish_species(id text primary key, rarity text);
    create table public.pixel_farm_crops(id uuid primary key default gen_random_uuid(), user_id uuid, status text, harvested_at timestamptz, size_score integer);
    create function pixel_private.finish_pixel_cast(p_cast_id uuid, p_landed boolean) returns jsonb language plpgsql as $f$
      declare u uuid := auth.uid(); k record; s record; v_points jsonb; begin
  v_points := pixel_private.award_game_points(u,
    case s.rarity when 'common' then 1 when 'uncommon' then 2 when 'rare' then 4 when 'legendary' then 15 when 'mythic' then 40 end,
    case when s.rarity in ('legendary','mythic') then 'full' else 'normal' end);
        return v_points; end $f$;`);
  await db.exec(sql('20261012120000_pixel_bag.sql'));
  await db.exec(sql('20261012140000_pixel_bug_timing.sql'));
  // 낚싯대(v4 그대로) + 낚시 시작 흉내(바뀌는 줄만 실제와 같은 글자로).
  const v4 = sql('supabase_pixel_fishing_v4.sql');
  const part = (from: string, to: string) => v4.slice(v4.indexOf(from), v4.indexOf(to));
  await db.exec(part('create table if not exists pixel_private.fish_rods', '-- 2) 상점 카탈로그'));
  await db.exec(part('create table if not exists public.pixel_rod_equipment', '-- 4) 캐스트 행에'));
  await db.exec(part('create or replace function pixel_private.fish_active_rod', '-- 8) get_pixel_fishing_state'));
  await db.exec(`create function pixel_private.start_pixel_cast(p_pet text, p_override_clock text default null, p_override_weather text default null, p_spot integer default null)
    returns jsonb language plpgsql security definer set search_path = '' as $f$
declare
  u uuid := auth.uid();
  v_rod pixel_private.fish_rods%rowtype;
  v_speed numeric := 1;
  v_down numeric := 0;
  v_bonus numeric := 0;
  v_difficulty numeric := 4.8;
  v_fish record;
begin
  if p_spot between 0 and 3 then
    v_bonus := 0;
  end if;
  insert into public.pixel_fish_casts(id) values (gen_random_uuid());
  select * into v_rod from pixel_private.fish_rods where id = pixel_private.fish_active_rod(u);
  if v_rod.id is not null then
    v_speed := v_rod.speed; v_down := v_rod.difficulty_down; v_bonus := v_rod.rare_bonus;
  end if;
  select 'legendary' as rarity into v_fish;
  v_difficulty := greatest(1, v_difficulty - v_down);
  if v_fish.rarity = 'mythic' then v_difficulty := 5; end if;
  return jsonb_build_object('ok', true, 'speed', v_speed, 'difficulty', v_difficulty, 'bonus', v_bonus, 'rod', jsonb_build_object('id', v_rod.id, 'tier', coalesce(v_rod.tier, 0)));
end $f$;`);
  const hand = sql('20261012150000_pixel_hand_slot.sql');
  await db.exec(hand);
  await db.exec(hand.replace(/create policy[^;]*;/g, '')); // 다시 돌려도 한 번만 바뀐다
  await db.exec(sql('20261012160000_pixel_bug_master_30.sql'));
  await db.exec(sql('20261012160000_pixel_bug_master_30.sql'));
  await db.exec(sql('20261012170000_pixel_bug_spawns.sql'));
  const rpc = async (query: string, args: any[] = []) => (await db.query<any>(query, args)).rows[0].r;
  return { db, rpc };
}

test('손 칸: 낚싯대·잠자리채·맨손은 하나만, 잠자리채라야 잠자리, 맨손 낚시는 어렵고 느리다 (PGlite)', async () => {
  const { db, rpc } = await setup();
  try {
    const equip = (id: string | null) => rpc('select public.equip_pixel_hand($1) r', [id]);
    const cast = () => rpc('select pixel_private.start_pixel_cast(null) r');
    const bug = () => rpc("select public.start_bug_catch('plaza') r");
    const casts = async () => Number((await db.query<any>('select count(*) n from public.pixel_fish_casts')).rows[0].n);

    // 처음에는 기본 낚싯대를 든 상태(예전과 같은 낚시).
    let bag = await rpc('select public.get_pixel_bag() r');
    assert.equal(bag.hand, 'rod'); assert.deepEqual(bag.rod, { id: null, tier: 0 }); assert.equal(bag.netOwned, false); assert.deepEqual(bag.rods, []);
    assert.deepEqual(await cast(), { ok: true, speed: 1, difficulty: 4.8, bonus: 0, rod: { id: null, tier: 0 } });
    assert.deepEqual(await equip('tool_net'), { ok: false, reason: 'not_owned' });
    assert.deepEqual(await equip('rod_gold'), { ok: false, reason: 'not_owned' });
    assert.equal((await bug()).reason, 'no_net');

    await db.exec(`insert into pixel_item_ownership values ('${U}','tool_net'),('${U}','rod_gold')`);
    // 잠자리채를 사도 손에 들기 전에는 잠자리를 잡지 않는다.
    assert.equal((await bug()).reason, 'net_not_equipped');
    const net = await equip('tool_net');
    assert.equal(net.ok, true); assert.equal(net.hand, 'net'); assert.deepEqual(net.rods, ['rod_gold']);
    assert.equal((await bug()).ok, true);
    // 잠자리채를 든 채로는 낚시하지 않는다(캐스트도 만들지 않는다).
    const before = await casts();
    assert.deepEqual(await cast(), { ok: false, reason: 'net_equipped' });
    assert.equal(await casts(), before);

    // 낚싯대(옷장의 예전 RPC로 골라도) → 손에 낚싯대, 잠자리는 못 잡는다.
    assert.equal((await rpc("select pixel_private.equip_pixel_rod('rod_gold') r")).ok, true);
    assert.equal((await rpc('select public.get_pixel_bag() r')).hand, 'rod');
    await db.exec('delete from public.pixel_bug_attempts; delete from pixel_private.bug_start_throttle;');
    assert.equal((await bug()).reason, 'net_not_equipped');
    assert.deepEqual(await cast(), { ok: true, speed: 1.35, difficulty: 4, bonus: 8, rod: { id: 'rod_gold', tier: 4 } });

    // 맨손: 낚싯대 효과 없이 난이도 +0.5(최대 5), 속도 0.8.
    const bare = await equip(null);
    assert.equal(bare.hand, 'bare'); assert.deepEqual(bare.rod, { id: 'rod_gold', tier: 4 }, '낚싯대 선택은 기억한다');
    assert.deepEqual(await cast(), { ok: true, speed: 0.8, difficulty: 5, bonus: 0, rod: { id: null, tier: 0 } });
    // 기본 낚싯대: 산 낚싯대 해제 + 손에 낚싯대.
    const basic = await equip('rod_basic');
    assert.equal(basic.hand, 'rod'); assert.deepEqual(basic.rod, { id: null, tier: 0 });
    assert.deepEqual(await cast(), { ok: true, speed: 1, difficulty: 4.8, bonus: 0, rod: { id: null, tier: 0 } });
    assert.deepEqual(await equip('rod_nope'), { ok: false, reason: 'not_found' });
  } finally { await db.close(); }
});

test('잠자리 업적: 새 규칙 이후 별5만 세고, 박사 30kg·명인(별5 30마리) 60kg 가방 (PGlite)', async () => {
  const { db, rpc } = await setup();
  try {
    await db.exec(`insert into pixel_item_ownership values ('${U}','tool_net')`);
    assert.equal((await rpc("select public.equip_pixel_hand('tool_net') r")).hand, 'net');
    const catchOne = async (bugId: string, stars: number) => {
      await db.exec('delete from public.pixel_bug_attempts; delete from pixel_private.bug_start_throttle;');
      const a = await rpc("select public.start_bug_catch('river') r");
      await db.query("update pixel_bug_attempts set bug_id=$1,difficulty=$2,created_at=clock_timestamp()-interval '1 second'", [bugId, stars]);
      return rpc('select public.finish_bug_catch($1,true) r', [a.catchId]);
    };
    // 새 규칙 전에 잡은 별5는 세지 않는다.
    await db.exec(`insert into pixel_bug_catches(user_id,bug_id,scene,caught_at) values ('${U}','dragonfly_gold','river','2026-10-11 12:00+09')`);
    for (const [id, stars] of [['dragonfly_red', 1], ['dragonfly_wheat', 2], ['damselfly', 3]] as const) assert.deepEqual((await catchOne(id, stars)).achievements, []);
    let state = await rpc('select public.get_bug_state() r');
    assert.equal(state.hand, 'net');
    assert.deepEqual(state.achievements, { star5: 0, species: 4, speciesTotal: 5, earned: [] });
    // 별5를 잡아도 도감이 다 차지 않으면 아직.
    assert.deepEqual((await catchOne('dragonfly_gold', 5)).achievements, []);
    assert.equal((await rpc('select public.get_pixel_bag() r')).capacity, 20);
    // 왕잠자리로 도감 완성 → 잠자리 박사, 그 잡은 결과의 가방에 바로 30kg.
    const doctor = await catchOne('dragonfly_king', 4);
    assert.deepEqual(doctor.achievements, ['bug_doctor']);
    assert.equal(Number(doctor.points.bag.capacity), 30);
    assert.deepEqual((await catchOne('dragonfly_red', 1)).achievements, [], '한 번만 받는다');
    for (let i = 2; i <= 29; i++) assert.deepEqual((await catchOne('dragonfly_gold', 5)).achievements, []);
    const master = await catchOne('dragonfly_gold', 5);
    assert.deepEqual(master.achievements, ['bug_master']); assert.equal(Number(master.points.bag.capacity), 60);
    state = await rpc('select public.get_bug_state() r');
    assert.deepEqual(state.achievements, { star5: 30, species: 5, speciesTotal: 5, earned: ['bug_doctor', 'bug_master'] });
  } finally { await db.close(); }
});

test('손 칸·업적 표는 본인만 읽고 RPC는 로그인 사용자만', async () => {
  const { db } = await setup();
  try {
    for (const role of ['anon', 'authenticated']) {
      const allowed = (await db.query<any>("select has_function_privilege($1,'public.equip_pixel_hand(text)','EXECUTE') a", [role])).rows[0].a;
      assert.equal(allowed, role === 'authenticated');
      for (const fn of ['pixel_private.hand_of(uuid)', 'pixel_private.check_bug_achievements(uuid)', 'pixel_private.bag_capacity(uuid)'])
        assert.equal((await db.query<any>("select has_function_privilege($1,$2,'EXECUTE') a", [role, fn])).rows[0].a, false);
      for (const table of ['public.pixel_hand_equipment', 'public.pixel_achievements'])
        assert.equal((await db.query<any>("select has_table_privilege($1,$2,'INSERT,UPDATE,DELETE') a", [role, table])).rows[0].a, false);
    }
  } finally { await db.close(); }
});

test('잠자리 미리 정하기: 최대 2마리·20초에 한 번, 그 잠자리로 시작하면 한 번만 쓴다 (PGlite)', async () => {
  const { db, rpc } = await setup();
  try {
    await db.exec(`insert into pixel_item_ownership values ('${U}','tool_net')`);
    await rpc("select public.equip_pixel_hand('tool_net') r");
    const spawn = (release: string | null = null) => rpc('select public.spawn_bug($1, $2) r', ['plaza', release]);
    const older = async () => db.exec("update public.pixel_bug_spawns set created_at = created_at - interval '21 seconds'");
    const first = await spawn();
    assert.equal(first.ok, true); assert.ok(first.stars >= 1 && first.stars <= 5);
    assert.equal((await spawn()).reason, 'wait');
    await older(); const second = await spawn(); assert.equal(second.ok, true);
    await older(); assert.equal((await spawn()).reason, 'full');
    // 날아가 버린 자리를 놓아 주면 새로 받는다.
    await older(); const third = await spawn(first.spawnId); assert.equal(third.ok, true);
    // 그 잠자리로 시작: 종류가 같고, 한 번 쓰면 사라진다. 다른 사람·지난 것은 안 된다.
    const start = (id: string) => rpc('select public.start_bug_catch($1, $2) r', ['plaza', id]);
    const started = await start(second.spawnId);
    assert.equal(started.ok, true); assert.equal(started.bugId, second.bugId); assert.equal(started.difficulty, second.stars);
    // 살아 있는 시도가 있으면 대기(잠자리는 쓰지 않는다), 만료되면 새 시도로 덮어쓴다(지우지 않는다).
    await db.exec('delete from pixel_private.bug_start_throttle;');
    assert.equal((await start(third.spawnId)).reason, 'pending');
    await db.exec("update public.pixel_bug_attempts set expires_at = clock_timestamp() - interval '1 second'");
    const again = await start(third.spawnId);
    assert.equal(again.ok, true); assert.notEqual(again.catchId, started.catchId);
    assert.equal(Number((await db.query<any>('select count(*) n from public.pixel_bug_attempts')).rows[0].n), 1);
    await db.exec('delete from pixel_private.bug_start_throttle;');
    await db.exec("update public.pixel_bug_attempts set expires_at = clock_timestamp() - interval '1 second'");
    assert.equal((await start(second.spawnId)).reason, 'gone');
    await older(); const fourth = await spawn();
    await db.exec("update public.pixel_bug_spawns set expires_at = clock_timestamp() - interval '1 second'");
    assert.equal((await start(fourth.spawnId)).reason, 'gone');
  } finally { await db.close(); }
});
