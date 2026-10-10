import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SQL = readFileSync(new URL('../../supabase/migrations/20261011220000_pixel_game_points.sql', import.meta.url), 'utf8');
const U = '11111111-1111-1111-1111-111111111111';

async function setup() {
  const pkg = '@electric-sql/pglite';
  const { PGlite } = await import(pkg);
  const db = new PGlite();
  await db.exec(`create schema pixel_private; create role anon; create role authenticated; create role service_role;
    create table public.profiles(id uuid primary key, bonus_points int not null default 0, point_adjustment int not null default 0);
    insert into public.profiles(id) values ('${U}');`);
  await db.exec(SQL); await db.exec(SQL);
  const award = async (points: number, kind = 'normal') => (await db.query('select pixel_private.award_game_points($1,$2,$3) r', [U, points, kind])).rows[0].r as any;
  const balance = async () => (await db.query('select point_adjustment from public.profiles where id=$1', [U])).rows[0].point_adjustment as number;
  return { db, award, balance };
}

test('하루 50P까지는 그대로, 넘으면 절반(반 포인트는 모았다가 지급), 별 4·5는 전부, 잡동사니는 상한 뒤 0', async () => {
  const { db, award, balance } = await setup();
  try {
    for (let i = 0; i < 48; i++) await award(1);
    assert.equal(await balance(), 48);
    // 4P 중 2P는 상한까지 그대로, 남은 2P는 절반 → 1P.
    assert.deepEqual(await award(4), { awarded: 3, todayEarned: 51, cap: 50, capped: true });
    // 상한 뒤 1P씩: 반 포인트가 모여 두 번에 1P.
    assert.equal((await award(1)).awarded, 0);
    assert.equal((await award(1)).awarded, 1);
    // 잡동사니(녹슨 동전)는 상한 뒤 0.
    assert.equal((await award(1, 'junk')).awarded, 0);
    // 별 4·5는 상한과 상관없이 전부.
    assert.equal((await award(40, 'full')).awarded, 40);
    assert.equal(await balance(), 48 + 3 + 0 + 1 + 0 + 40);
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
