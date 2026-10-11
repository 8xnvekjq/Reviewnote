import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// 지식의 조각 마이그레이션(PGlite). 운영 스키마 중 필요한 표만 최소로 흉내 낸다.
const pkg = '@electric-sql/pglite';
const { PGlite } = await import(pkg);
const migration = fs.readFileSync(new URL('../../supabase/migrations/20261011280000_knowledge_shards.sql', import.meta.url), 'utf8');
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('knowledge shards: retro grant, per-slot once, completion day rule, shard-only purchases (PGlite)', async () => {
  const db = new PGlite();
  const A = id(1), B = id(2);
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth; create schema private;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      grant usage on schema auth, public to authenticated;
      grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('${A}'),('${B}');
      create table public.profiles(id uuid primary key, bonus_points integer default 0, point_adjustment integer default 0);
      insert into public.profiles(id, bonus_points) values ('${A}', 1000),('${B}', 1000);
      create table public.mistakes(id uuid primary key, user_id uuid, reviews jsonb default '["","",""]', date timestamptz default now());
      grant all on public.mistakes to authenticated;
      create table public.pixel_item_catalog(item_id text primary key, category text, slot text, price integer not null, asset_key text, display_name text,
        tier smallint, stackable boolean default false, constraint pixel_item_catalog_price_check check (price > 0 or item_id = 'hair_bald'));
      insert into public.pixel_item_catalog values ('top_sage','avatar','top',25,'sage','세이지',1,false);
      create table public.pixel_item_ownership(id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles, item_id text references public.pixel_item_catalog,
        price_paid integer, acquired_at timestamptz default now(), unique(user_id, item_id));
      create function private.guard_pixel_direct_write() returns trigger language plpgsql as $$ begin
        if coalesce(current_setting('reviewnote.pixel_rpc', true), '') <> 'true' then raise exception 'direct write'; end if; return coalesce(new, old); end $$;
      create trigger guard before insert or update or delete on public.pixel_item_ownership for each row execute function private.guard_pixel_direct_write();
      create table public.pixel_bait(user_id uuid primary key references public.profiles, charges integer not null check (charges >= 0), updated_at timestamptz);
      -- A: 완료 2개(어제 등록), 1차만 O 1개 → 1.00*2 + 0.10 = 2.10
      insert into public.mistakes values ('${id(11)}','${A}','["O","O","O"]', now() - interval '3 days'),
        ('${id(12)}','${A}','["O","O","O"]', now() - interval '3 days'), ('${id(13)}','${A}','["O","X",""]', now() - interval '3 days');
    `);
    await db.exec(migration);
    const as = async <T = any>(uid: string, query: string, args: unknown[] = []) => {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`);
      try { return (await db.query<T>(query, args)).rows; } finally { await db.exec('reset role'); }
    };
    const shards = async (uid: string) => (await as<{ r: { balance: number; earnedTotal: number } }>(uid, 'select get_knowledge_shards() r'))[0].r;
    assert.deepEqual(await shards(A), { balance: 2.1, earnedTotal: 2.1 }, 'retro grant uses the same per-slot amounts');
    assert.deepEqual(await shards(B), { balance: 0, earnedTotal: 0 });

    // 재실행해도 두 번 주지 않는다.
    await db.exec(migration);
    assert.equal((await shards(A)).balance, 2.1, 'migration is idempotent');

    // 실시간: 2차 O → +0.20, O↔X를 오가도 다시 주지 않는다.
    await as(A, `update public.mistakes set reviews='["O","O",""]' where id=$1`, [id(13)]);
    await as(A, `update public.mistakes set reviews='["O","X",""]' where id=$1`, [id(13)]);
    await as(A, `update public.mistakes set reviews='["O","O",""]' where id=$1`, [id(13)]);
    assert.equal((await shards(A)).balance, 2.3);
    await as(A, `update public.mistakes set reviews='["O","O","O"]' where id=$1`, [id(13)]);
    assert.equal((await shards(A)).balance, 3, 'third O 0.30 + completion 0.40 on an older mistake');

    // 오늘 등록한 오답은 세 칸을 다 찍어도 완료 보너스 없이 0.60만.
    await as(B, `insert into public.mistakes(id,user_id,reviews) values ($1,$2,'["O","O","O"]')`, [id(21), B]);
    assert.equal((await shards(B)).balance, 0.6, 'no completion bonus on the registration day');

    // 남의 지갑은 못 읽고 직접 쓰지도 못한다.
    assert.equal((await as(B, 'select count(*)::int n from public.knowledge_shard_wallets'))[0].n, 1);
    await assert.rejects(as(B, 'update public.knowledge_shard_wallets set balance = 999'), /permission denied/);

    // 조각 전용 아이템은 포인트로 못 산다.
    const pointBuy = (await as<{ r: any }>(A, `select purchase_pixel_item('furniture_crystal_shelf') r`))[0].r;
    assert.equal(pointBuy.ok, false);
    assert.equal((await as<{ r: any }>(A, `select purchase_pixel_item('top_sage') r`))[0].r.ok, true, 'normal items still sell for points');

    // 조각 부족 → 거절, 충분하면 차감·소유·사용 기록.
    const poor = (await as<{ r: any }>(B, `select purchase_pixel_item_with_shards('furniture_crystal_shelf') r`))[0].r;
    assert.equal(poor.reason, 'insufficient_balance');
    await db.exec(`update public.knowledge_shard_wallets set balance = 20 where user_id = '${A}'`);
    const bought = (await as<{ r: any }>(A, `select purchase_pixel_item_with_shards('furniture_crystal_shelf') r`))[0].r;
    assert.deepEqual(bought, { ok: true, itemId: 'furniture_crystal_shelf', newShards: 5 });
    assert.equal((await as<{ r: any }>(A, `select purchase_pixel_item_with_shards('furniture_crystal_shelf') r`))[0].r.reason, 'already_owned');
    assert.equal((await as<{ r: any }>(A, `select purchase_pixel_item_with_shards('top_sage') r`))[0].r.reason, 'not_found', 'point items cannot be bought with shards');

    // 결정 미끼: 3.00 → 미끼 30회.
    const bait = (await as<{ r: any }>(A, 'select buy_pixel_bait_with_shards() r'))[0].r;
    assert.deepEqual(bait, { ok: true, newShards: 2, charges: 30 });
    assert.equal((await as<{ r: any }>(A, 'select buy_pixel_bait_with_shards() r'))[0].r.reason, 'insufficient_balance');
    assert.equal((await as<{ n: number }>(A, 'select count(*)::int n from public.knowledge_shard_spends'))[0].n, 2);

    // 오답을 지워도 받은 조각은 남는다.
    await db.exec(`delete from public.mistakes where id = '${id(11)}'`);
    assert.equal((await shards(A)).balance, 2);
  } finally { await db.close(); }
});
