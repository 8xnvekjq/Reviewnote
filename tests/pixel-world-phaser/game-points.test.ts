import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = (name: string) => readFileSync(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8');
const SQL = sql('20261011220000_pixel_game_points.sql'), FIFTH = sql('20261011250000_pixel_game_points_fifth.sql'), TOTAL = sql('20261011260000_pixel_game_points_total_cap.sql');
const U = '11111111-1111-1111-1111-111111111111';

async function setup() {
  const pkg = '@electric-sql/pglite';
  const { PGlite } = await import(pkg);
  const db = new PGlite();
  await db.exec(`create schema pixel_private; create role anon; create role authenticated; create role service_role;
    create table public.profiles(id uuid primary key, bonus_points int not null default 0, point_adjustment int not null default 0);
    insert into public.profiles(id) values ('${U}');`);
  await db.exec(SQL); await db.exec(SQL);
  await db.exec(FIFTH); await db.exec(FIFTH);
  await db.exec(TOTAL);
  const award = async (points: number, kind = 'normal') => (await db.query('select pixel_private.award_game_points($1,$2,$3) r', [U, points, kind])).rows[0].r as any;
  const balance = async () => (await db.query('select point_adjustment from public.profiles where id=$1', [U])).rows[0].point_adjustment as number;
  return { db, award, balance };
}

test('하루 50P까지는 그대로, 넘으면 1/5(조각은 모았다가 지급), 별 4·5는 전부, 잡동사니는 상한 뒤 0', async () => {
  const { db, award, balance } = await setup();
  try {
    for (let i = 0; i < 48; i++) await award(1);
    assert.equal(await balance(), 48);
    // 4P 중 2P는 상한까지 그대로, 남은 2P는 1/5 조각 2개로 모아 둔다.
    assert.deepEqual(await award(4), { awarded: 2, todayEarned: 50, cap: 50, capped: true });
    // 상한 뒤 1P씩: 조각이 5개가 되는 세 번째에 1P.
    assert.equal((await award(1)).awarded, 0);
    assert.equal((await award(1)).awarded, 0);
    assert.equal((await award(1)).awarded, 1);
    assert.deepEqual((await db.query('select carry from pixel_private.game_point_days')).rows, [{ carry: 0 }]);
    // 큰 묶음도 1/5씩(남은 조각은 1/10P 단위로 이월): 12P → 2.4P → 2P, 조각 4.
    assert.equal((await award(12)).awarded, 2);
    assert.deepEqual((await db.query('select carry from pixel_private.game_point_days')).rows, [{ carry: 4 }]);
    // 잡동사니(녹슨 동전)는 상한 뒤 0.
    assert.equal((await award(1, 'junk')).awarded, 0);
    // 별 4·5는 상한과 상관없이 전부.
    assert.equal((await award(40, 'full')).awarded, 40);
    assert.equal(await balance(), 48 + 2 + 0 + 0 + 1 + 2 + 0 + 40);
    // 전체 상한 100P: 93.4P에서 별 5(40P)는 7P까지 그대로(100.4P), 남은 33P는 1/10 → 10P, 조각 7.
    assert.deepEqual(await award(40, 'full'), { awarded: 10, todayEarned: 103, cap: 50, capped: true });
    // 100P 넘은 뒤 별 1~3도 1/10: 103.7P + 0.5P → 1P.
    assert.equal((await award(5)).awarded, 1);
    assert.equal(await balance(), 104);
    // 0·음수는 아무것도 안 한다.
    assert.equal((await award(0)).awarded, 0);
    assert.equal((await db.query("select has_function_privilege('authenticated','pixel_private.award_game_points(uuid,integer,text)','EXECUTE') ok")).rows[0].ok, false);
  } finally { await db.close(); }
});

test('잡동사니는 상한 전엔 상한까지만 준다', async () => {
  const { db, award } = await setup();
  try {
    for (let i = 0; i < 49; i++) await award(1);
    assert.equal((await award(5, 'junk')).awarded, 1);
  } finally { await db.close(); }
});
