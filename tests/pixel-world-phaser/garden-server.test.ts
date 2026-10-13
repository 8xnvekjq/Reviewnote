import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// 텃밭 마이그레이션(PGlite). 예전 밭 마이그레이션을 차례로 올린 뒤 새 세 파일을 올린다.
// 운영 스키마 중 필요한 표와 함수(날씨·경험치·게임 포인트·가방 요약)는 흉내 낸다.
const pkg = '@electric-sql/pglite';
const { PGlite } = await import(pkg);
const read = (name: string) => fs.readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const OLD = ['20260917155631_pixel_tomato_farm.sql', '20260918090000_pixel_farm_crop_size.sql', '20260918110000_pixel_farm_4day_review_bonus.sql',
  '20260919090000_pixel_farm_live_review_hint.sql', '20260920090000_pixel_farm_crop_collection.sql', '20260921100000_pixel_farm_crop_submission.sql'];
const NEW = ['20261020100000_pixel_garden_schema.sql', '20261020100100_pixel_garden_economy.sql', '20261020100200_pixel_garden_actions.sql'];
const U = '00000000-0000-0000-0000-000000000001';
const V = '00000000-0000-0000-0000-000000000002';

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth; create schema private; create schema pixel_private;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    create function private.is_current_user_admin() returns boolean language sql as $$ select false $$;
    create table public.profiles(id uuid primary key, bonus_points integer default 0, point_adjustment integer default 0, nickname text, display_name text);
    insert into public.profiles(id) values ('${U}'), ('${V}');
    create table public.pixel_item_catalog(item_id text primary key, category text, slot text, price integer, asset_key text, display_name text, tier integer, stackable boolean, shard_price numeric);
    create table public.pixel_item_ownership(user_id uuid, item_id text, price_paid integer, primary key(user_id, item_id));
    -- 날씨: 시험 표에 적힌 날만 비. 오늘은 test_override가 있으면 그 값(관리자 덮어쓰기 흉내).
    create table public.test_rain(day date primary key);
    create table public.test_override(weather text);
    create function pixel_private.fish_weather_for(p_date date) returns text language sql stable as $$
      select case when exists(select 1 from public.test_rain where day = p_date) then 'rain' else 'clear' end $$;
    create function pixel_private.fish_clock(p_override_clock text, p_override_weather text, out kst_date date, out minutes integer, out phase text, out weather text)
      language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date, 720, 'day',
        coalesce((select weather from public.test_override limit 1), pixel_private.fish_weather_for((now() at time zone 'Asia/Seoul')::date)) $$;
    create table public.test_xp(user_id uuid, gained integer, track text);
    create function pixel_private.award_pixel_xp(p_user uuid, p_gained integer, p_track text) returns jsonb language plpgsql as $$
      begin insert into public.test_xp values (p_user, p_gained, p_track);
        return jsonb_build_object('gained', p_gained, 'xp', (select sum(gained) from public.test_xp where user_id = p_user), 'level', 1, 'leveledUp', false, 'track', p_track); end $$;
    create table public.pixel_fish_species(id text primary key, rarity text);
    create table public.pixel_bug_species(id text primary key, stars integer, points integer);
    insert into public.pixel_fish_species values ('carp','common');
    create table public.pixel_bag_items(user_id uuid, kind text not null check (kind in ('fish','bug')), ref text, qty integer not null check (qty > 0),
      updated_at timestamptz default now(), primary key(user_id, kind, ref));
    create function pixel_private.bag_summary(p_user uuid) returns jsonb language plpgsql as $$
      begin return jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'ref', ref, 'qty', qty) order by kind, ref) from public.pixel_bag_items where user_id = p_user), '[]'::jsonb),
        'crops', coalesce((select jsonb_agg(id) from public.pixel_farm_crops where user_id = p_user and status = 'stored' and harvested_at is not null), '[]'::jsonb)); end $$;
    create function pixel_private.award_game_points(p_user uuid, p_points integer, p_kind text) returns jsonb language plpgsql as $$
      begin update public.profiles set point_adjustment = point_adjustment + p_points where id = p_user;
        return jsonb_build_object('awarded', p_points); end $$;
  `);
  for (const file of OLD) await db.exec(read(file));
  return db;
}
const as = (db: any, user: string) => db.exec(`select set_config('request.jwt.claim.sub','${user}',false)`);
const one = async (db: any, sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0].r;
const act = (db: any, index: number, action: string, revision: number) => one(db, 'select public.act_pixel_farm($1,$2,$3) r', [index, action, revision]);
const cell = (snap: any, index: number) => snap.plots.find((p: any) => p.index === index);
const points = async (db: any, user = U) => (await db.query(`select point_adjustment p from public.profiles where id = $1`, [user])).rows[0].p;
// 시간을 앞당기는 대신 작물이 이미 익었다고 적는다.
const ripen = (db: any, user = U) => db.exec(`update public.pixel_farm_crops set planted_at = now() - interval '5 days', ready_at = now() - interval '1 minute' where user_id = '${user}' and harvested_at is null`);
const kstToday = async (db: any) => (await db.query(`select (now() at time zone 'Asia/Seoul')::date::text d`)).rows[0].d;

test('garden migration keeps growing plot 0/1 crops (tilled), harvested history untouched, and is idempotent', async () => {
  const db = await setup();
  try {
    await as(db, U);
    // 예전 서버: 1번 밭에 자라는 토마토, 이미 수확·출품한 토마토 하나.
    await db.exec(`insert into public.pixel_farm_plots(user_id, plot_index, revision) values ('${U}', 0, 3), ('${U}', 1, 2)`);
    await db.exec(`insert into public.pixel_farm_crops(user_id, plot_index, planted_at, ready_at, harvested_at, size_score, status, submitted_at, reward_points)
      values ('${U}', 1, now() - interval '9 days', now() - interval '5 days', now() - interval '4 days', 77, 'submitted', now() - interval '4 days', 41)`);
    const growing = (await db.query(`insert into public.pixel_farm_crops(user_id, plot_index, planted_at, ready_at, care_count) values ('${U}', 0, now() - interval '1 day', now() + interval '3 days', 1) returning id`)).rows[0].id;
    await db.exec(`update public.pixel_farm_plots set crop_id = '${growing}' where user_id = '${U}' and plot_index = 0`);
    for (const file of NEW) await db.exec(read(file));
    for (const file of NEW) await db.exec(read(file)); // 두 번 올려도 같다.
    const snap = await one(db, 'select public.get_pixel_farm() r');
    assert.equal(snap.plots.length, 24);
    assert.deepEqual([snap.cols, snap.rows], [6, 4]);
    assert.equal(cell(snap, 0).crop.id, growing);
    assert.equal(cell(snap, 0).soil, 'tilled');
    assert.equal(cell(snap, 0).revision, 3);
    assert.equal(cell(snap, 1).crop, null);
    assert.equal(cell(snap, 1).soil, 'grass');
    assert.equal(snap.harvestCount, 1);
    const history = (await db.query(`select status, reward_points, size_score from public.pixel_farm_crops where harvested_at is not null`)).rows[0];
    assert.deepEqual(history, { status: 'submitted', reward_points: 41, size_score: 77 });
    // 칸 번호는 y*8+x: (5,3) = 29는 있고, (6,0) = 6은 텃밭 밖이다.
    assert.ok(cell(snap, 29)); assert.equal(cell(snap, 6), undefined);
    await assert.rejects(act(db, 6, 'till', 0), /Invalid farm action/);
    await assert.rejects(act(db, 64, 'till', 0), /Invalid farm action/);
    await assert.rejects(act(db, 8, 'dig', 0), /Invalid farm action/);
    await as(db, '');
    await assert.rejects(one(db, 'select public.get_pixel_farm() r'), /Authentication required/);
  } finally { await db.close(); }
});

test('tools act per cell: till → plant tomato/strawberry → water once a day → harvest; tomato keeps size + collection', async () => {
  const db = await setup();
  try {
    for (const file of NEW) await db.exec(read(file));
    await as(db, U);
    let s = await act(db, 9, 'plant_tomato', 0);
    assert.equal(s.result, 'untilled');
    s = await act(db, 9, 'till', 0); assert.equal(s.result, 'ok'); assert.equal(cell(s, 9).soil, 'tilled');
    s = await act(db, 9, 'till', 1); assert.equal(s.result, 'already');
    s = await act(db, 9, 'till', 0); assert.equal(s.result, 'changed', 'stale revision is a no-op');
    s = await act(db, 10, 'till', 0);
    s = await act(db, 9, 'plant_tomato', 1); assert.equal(cell(s, 9).crop.type, 'tomato');
    s = await act(db, 10, 'plant_strawberry', 1); assert.equal(cell(s, 10).crop.type, 'strawberry');
    const tomatoHours = (Date.parse(cell(s, 9).crop.readyAt) - Date.parse(cell(s, 9).crop.plantedAt)) / 3600000;
    const berryHours = (Date.parse(cell(s, 10).crop.readyAt) - Date.parse(cell(s, 10).crop.plantedAt)) / 3600000;
    assert.equal(tomatoHours, 96); assert.equal(berryHours, 64);
    s = await act(db, 9, 'plant_strawberry', 2); assert.equal(s.result, 'occupied');
    s = await act(db, 9, 'water', 2); assert.equal(s.result, 'ok'); assert.equal(cell(s, 9).crop.careCount, 1);
    assert.equal(cell(s, 9).wateredOn, await kstToday(db));
    s = await act(db, 9, 'water', 3); assert.equal(s.result, 'already_watered'); assert.equal(cell(s, 9).crop.careCount, 1);
    s = await act(db, 9, 'harvest', 3); assert.equal(s.result, 'growing');
    // 마른 빈 흙에도 물을 줄 수 있고, 그날 심으면 첫 돌봄으로 친다.
    s = await act(db, 11, 'till', 0); s = await act(db, 11, 'water', 1); s = await act(db, 11, 'plant_tomato', 2);
    assert.equal(cell(s, 11).crop.careCount, 1);
    // 잔디에는 물을 줄 수 없다.
    assert.equal((await act(db, 12, 'water', 0)).result, 'untilled');

    await ripen(db);
    s = await one(db, 'select public.get_pixel_farm() r');
    s = await act(db, 9, 'harvest', cell(s, 9).revision);
    assert.equal(s.harvest.cropType, 'tomato');
    assert.ok(s.harvest.sizeScore >= 10 && s.harvest.sizeScore <= 100);
    assert.equal(s.xpGain.gained, 40);
    assert.equal(cell(s, 9).crop, null); assert.equal(cell(s, 9).soil, 'tilled', 'harvested cell stays tilled');
    assert.equal(s.harvestCount, 1); assert.equal(s.lastHarvestSize, s.harvest.sizeScore);
    const stored = (await db.query(`select crop_type, status from public.pixel_farm_crops where harvested_at is not null`)).rows;
    assert.deepEqual(stored, [{ crop_type: 'tomato', status: 'stored' }]);
  } finally { await db.close(); }
});

test('strawberry regrows to 자람, ripens again in half the time, gives 1–2 berries into the bag, and ends after 3 harvests', async () => {
  const db = await setup();
  try {
    for (const file of NEW) await db.exec(read(file));
    await as(db, U);
    await act(db, 0, 'till', 0);
    let s = await act(db, 0, 'plant_strawberry', 1);
    const id = cell(s, 0).crop.id;
    for (let round = 1; round <= 3; round++) {
      await ripen(db);
      if (round === 2) await db.exec(`update public.pixel_farm_crops set care_count = 1 where id = '${id}'`);
      s = await one(db, 'select public.get_pixel_farm() r');
      s = await act(db, 0, 'harvest', cell(s, 0).revision);
      assert.equal(s.result, 'ok');
      assert.equal(s.harvest.cropType, 'strawberry'); assert.equal(s.harvest.harvests, round);
      assert.equal(s.harvest.berries, round === 2 ? 2 : 1, 'watered cycle gives a second berry');
      assert.equal(s.xpGain.gained, 10);
      if (round < 3) {
        const crop = cell(s, 0).crop;
        assert.equal(crop.id, id); assert.equal(crop.harvests, round); assert.equal(crop.careCount, 0);
        assert.equal((Date.parse(crop.readyAt) - Date.parse(crop.plantedAt)) / 3600000, 32);
      }
    }
    assert.equal(cell(s, 0).crop, null); assert.equal(cell(s, 0).soil, 'tilled', 'spent plant leaves dry tilled soil');
    const bag = await db.query(`select kind, ref, qty from public.pixel_bag_items where user_id = '${U}'`);
    assert.deepEqual(bag.rows, [{ kind: 'crop', ref: 'strawberry', qty: 4 }]);
    const row = (await db.query(`select status, harvests, harvested_at is not null done from public.pixel_farm_crops where id = '${id}'`)).rows[0];
    assert.deepEqual(row, { status: 'spent', harvests: 3, done: true });
    assert.equal(s.harvestCount, 0, 'strawberries are not tomato harvests');
    // 딸기 포기는 출품할 수 없다.
    const submit = await one(db, 'select public.submit_farm_crop($1) r', [id]);
    assert.equal(submit.ok, false);
  } finally { await db.close(); }
});

test('rain (server weather or override) and the sprinkler count care once a day, including days the student was away', async () => {
  const db = await setup();
  try {
    for (const file of NEW) await db.exec(read(file));
    await as(db, U);
    const today = await kstToday(db);
    // 텃밭 (1,1)=9, 이웃 (2,2)=18, 멀리 (5,3)=29.
    for (const i of [9, 18, 29, 0]) await act(db, i, 'till', 0);
    await act(db, 18, 'plant_tomato', 1); await act(db, 29, 'plant_tomato', 1); await act(db, 0, 'plant_strawberry', 1);
    // 이틀 전에 심은 것으로 돌리고, 어제는 비가 왔다.
    await db.exec(`update public.pixel_farm_crops set planted_at = planted_at - interval '2 days'`);
    await db.exec(`insert into public.test_rain values ((date '${today}' - 1))`);
    let s = await one(db, 'select public.get_pixel_farm() r');
    assert.equal(s.rainToday, false);
    assert.deepEqual([cell(s, 18).crop.careCount, cell(s, 29).crop.careCount, cell(s, 0).crop.careCount], [1, 1, 1], 'yesterday rain counted while away');
    s = await one(db, 'select public.get_pixel_farm() r');
    assert.equal(cell(s, 18).crop.careCount, 1, 'settling twice does not double count');
    // 관리자 덮어쓰기로 오늘 비: 모두 오늘 돌봄 1번, 흙도 젖는다.
    await db.exec(`insert into public.test_override values ('rain')`);
    s = await one(db, 'select public.get_pixel_farm() r');
    assert.equal(s.rainToday, true);
    assert.deepEqual([cell(s, 18).crop.careCount, cell(s, 29).crop.careCount], [2, 2]);
    assert.equal(cell(s, 9).wateredOn, today, 'empty tilled soil looks wet in rain');
    assert.equal((await act(db, 18, 'water', cell(s, 18).revision)).result, 'already_watered', 'rain already watered today');
    await db.exec(`delete from public.test_override`);

    // 스프링클러: 사야 놓을 수 있고, 하나만, 작물이 없는 칸에만.
    s = await act(db, 9, 'place_sprinkler', cell(s, 9).revision);
    assert.equal(s.result, 'no_sprinkler');
    await db.exec(`insert into public.pixel_item_ownership values ('${U}', 'tool_sprinkler', 300)`);
    assert.equal((await act(db, 18, 'place_sprinkler', cell(s, 18).revision)).result, 'occupied');
    // 내일이라고 치고(오늘 돌봄을 지운다) 스프링클러를 놓으면 이웃만 젖는다.
    await db.exec(`delete from public.pixel_farm_care where care_day = date '${today}'; update public.pixel_farm_crops set care_count = care_count - 1;
      update public.pixel_farm_plots set watered_on = null`);
    s = await one(db, 'select public.get_pixel_farm() r');
    s = await act(db, 9, 'place_sprinkler', cell(s, 9).revision);
    assert.equal(s.result, 'ok'); assert.equal(cell(s, 9).sprinkler, true);
    assert.equal(cell(s, 18).crop.careCount, 2, 'diagonal neighbour watered by sprinkler');
    assert.equal(cell(s, 18).wateredOn, today);
    assert.equal(cell(s, 0).crop.careCount, 2, 'top-left neighbour too');
    assert.equal(cell(s, 29).crop.careCount, 1, 'far cell not watered');
    assert.equal((await act(db, 29, 'place_sprinkler', cell(s, 29).revision)).result, 'occupied');
    assert.equal((await act(db, 9, 'till', cell(s, 9).revision)).result, 'blocked');
    assert.equal((await act(db, 9, 'plant_tomato', cell(s, 9).revision)).result, 'blocked');
    await act(db, 1, 'till', 0);
    assert.equal((await act(db, 1, 'place_sprinkler', 1)).result, 'sprinkler_elsewhere', 'one sprinkler per student');
    s = await act(db, 9, 'remove_sprinkler', cell(s, 9).revision);
    assert.equal(cell(s, 9).sprinkler, false);
    s = await act(db, 1, 'place_sprinkler', cell(s, 1).revision); assert.equal(s.result, 'ok', 'can move it after picking it up');
  } finally { await db.close(); }
});

test('economy: farm XP ≤ 80 and farm points ≤ 100 per KST day no matter how many cells; strawberry sale counts toward the cap', async () => {
  const db = await setup();
  try {
    for (const file of NEW) await db.exec(read(file));
    await as(db, U);
    // 칸 6개에 토마토 → 하루에 모두 수확해도 경험치는 80까지.
    for (let i = 0; i < 6; i++) { await act(db, i, 'till', 0); await act(db, i, 'plant_tomato', 1); }
    await ripen(db);
    let gained = 0;
    for (let i = 0; i < 6; i++) {
      const s = await one(db, 'select public.get_pixel_farm() r');
      gained += (await act(db, i, 'harvest', cell(s, i).revision)).xpGain.gained;
    }
    assert.equal(gained, 80);
    const farmToday = (await one(db, 'select public.get_pixel_farm() r')).farmToday;
    assert.deepEqual(farmToday, { xp: 80, xpCap: 80, points: 0, pointsCap: 100 });
    // 출품: 상한 100P까지만. 남은 것이 없으면 출품을 미룬다(작물은 그대로 보관).
    await db.exec(`update public.pixel_farm_crops set size_score = 100 where harvested_at is not null`);
    const ids = (await db.query(`select id from public.pixel_farm_crops where status = 'stored' and harvested_at is not null order by id`)).rows.map((r: any) => r.id);
    const rewards = [];
    for (const id of ids.slice(0, 3)) rewards.push(await one(db, 'select public.submit_farm_crop($1) r', [id]));
    assert.deepEqual(rewards.map(r => [r.ok, r.rewardPoints ?? r.reason]), [[true, 50], [true, 50], [false, 'daily_cap']]);
    assert.equal(await points(db), 100);
    assert.equal((await db.query(`select status from public.pixel_farm_crops where id = $1`, [ids[2]])).rows[0].status, 'stored');
    // 딸기 판매도 같은 상한: 오늘은 더 팔리지 않고 가방에 남는다.
    await db.exec(`insert into public.pixel_bag_items(user_id, kind, ref, qty) values ('${U}', 'crop', 'strawberry', 5)`);
    let sale = await one(db, `select public.sell_pixel_bag('[{"kind":"crop","ref":"strawberry","qty":5}]') r`);
    assert.equal(sale.ok, false); assert.equal(sale.reason, 'farm_cap');
    // 다음 날이라고 치면: 딸기 5알 = 10P(농사 상한 안), 물고기는 게임 포인트로 그대로.
    await db.exec(`update pixel_private.farm_days set kst_date = kst_date - 1`);
    await db.exec(`insert into public.pixel_bag_items(user_id, kind, ref, qty) values ('${U}', 'fish', 'carp', 2)`);
    sale = await one(db, `select public.sell_pixel_bag(null) r`);
    assert.equal(sale.ok, true); assert.equal(sale.sold, 7); assert.equal(sale.value, 12); assert.equal(sale.points.awarded, 12);
    assert.equal(await points(db), 112);
    assert.equal((await one(db, 'select public.get_pixel_farm() r')).farmToday.points, 10);
    // 딸기가 상한 끝에 걸리면 남은 만큼만 판다.
    await db.exec(`update pixel_private.farm_days set points = 95; insert into public.pixel_bag_items(user_id, kind, ref, qty) values ('${U}', 'crop', 'strawberry', 5)`);
    sale = await one(db, `select public.sell_pixel_bag(null) r`);
    assert.equal(sale.sold, 2); assert.equal(sale.farmCapped, true);
    assert.deepEqual((await db.query(`select qty from public.pixel_bag_items where ref = 'strawberry'`)).rows, [{ qty: 3 }]);
    // 다른 학생의 칸은 건드릴 수 없다(자기 칸만 보인다).
    await as(db, V);
    const other = await one(db, 'select public.get_pixel_farm() r');
    assert.ok(other.plots.every((p: any) => p.crop === null && p.soil === 'grass'));
  } finally { await db.close(); }
});
