-- 지식의 조각: 오답 복습으로만 모으는 Pixel World 특수 재화(소수 둘째 자리까지).
-- 1차 O 0.10 · 2차 O 0.20 · 3차 O 0.30 · 세 칸 모두 O면 완료 보너스 0.40 → 오답 하나 완료 = 1.00.
-- 오답·칸마다 한 번만 준다(O↔X를 오가도 다시 주지 않음). 오답을 지워도 받은 조각은 그대로 둔다.
-- 완료 보너스는 등록한 날(KST)이 지난 오답에만 준다 — 새 오답을 그 자리에서 OOO로 찍어 모으지 못하게.
-- 포인트(P)와 서로 바꿀 수 없다. 조각 전용 아이템은 pixel_item_catalog.shard_price가 있는 줄이다.
begin;

create table if not exists public.knowledge_shard_wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance numeric(10,2) not null default 0 check (balance >= 0),
  earned_total numeric(10,2) not null default 0 check (earned_total >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.knowledge_shard_grants (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mistake_id uuid not null,
  slot smallint not null check (slot between 0 and 3), -- 0~2: 1~3차 O, 3: 완료 보너스
  amount numeric(4,2) not null check (amount > 0),
  source text not null default 'review' check (source in ('review','retro')),
  granted_at timestamptz not null default now(),
  unique (mistake_id, slot)
);
create index if not exists knowledge_shard_grants_user_idx on public.knowledge_shard_grants(user_id, granted_at desc);
create table if not exists public.knowledge_shard_spends (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null,
  amount numeric(10,2) not null check (amount > 0),
  spent_at timestamptz not null default now()
);
create index if not exists knowledge_shard_spends_user_idx on public.knowledge_shard_spends(user_id, spent_at desc);

alter table public.knowledge_shard_wallets enable row level security;
alter table public.knowledge_shard_grants enable row level security;
alter table public.knowledge_shard_spends enable row level security;
drop policy if exists own_read on public.knowledge_shard_wallets;
drop policy if exists own_read on public.knowledge_shard_grants;
drop policy if exists own_read on public.knowledge_shard_spends;
create policy own_read on public.knowledge_shard_wallets for select to authenticated using (user_id = (select auth.uid()));
create policy own_read on public.knowledge_shard_grants for select to authenticated using (user_id = (select auth.uid()));
create policy own_read on public.knowledge_shard_spends for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.knowledge_shard_wallets, public.knowledge_shard_grants, public.knowledge_shard_spends from anon, authenticated;
grant select on public.knowledge_shard_wallets, public.knowledge_shard_grants, public.knowledge_shard_spends to authenticated;

-- 칸별 지급량. 소급 지급과 실시간 지급이 같은 표를 쓴다.
create or replace function private.knowledge_shard_amount(p_slot integer) returns numeric
language sql immutable set search_path = '' as $$
  select (array[0.10, 0.20, 0.30, 0.40]::numeric[])[p_slot + 1];
$$;

-- 오답 복습 결과가 저장될 때 새로 생긴 O만 지급한다(트리거 — 클라이언트 코드가 바뀌어도 그대로 적용).
create or replace function private.grant_knowledge_shards() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_slot integer;
  v_total numeric(10,2) := 0;
  v_amount numeric(4,2);
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if new.reviews is null or jsonb_typeof(new.reviews) <> 'array' then return new; end if;
  for v_slot in 0..2 loop
    if new.reviews->>v_slot = 'O' then
      insert into public.knowledge_shard_grants(user_id, mistake_id, slot, amount)
        values (new.user_id, new.id, v_slot, private.knowledge_shard_amount(v_slot))
        on conflict (mistake_id, slot) do nothing
        returning amount into v_amount;
      v_total := v_total + coalesce(v_amount, 0);
      v_amount := null;
    end if;
  end loop;
  if new.reviews->>0 = 'O' and new.reviews->>1 = 'O' and new.reviews->>2 = 'O'
     and (new.date at time zone 'Asia/Seoul')::date < v_today then
    insert into public.knowledge_shard_grants(user_id, mistake_id, slot, amount)
      values (new.user_id, new.id, 3, private.knowledge_shard_amount(3))
      on conflict (mistake_id, slot) do nothing
      returning amount into v_amount;
    v_total := v_total + coalesce(v_amount, 0);
  end if;
  if v_total > 0 then
    insert into public.knowledge_shard_wallets(user_id, balance, earned_total, updated_at)
      values (new.user_id, v_total, v_total, now())
      on conflict (user_id) do update set balance = public.knowledge_shard_wallets.balance + excluded.balance,
        earned_total = public.knowledge_shard_wallets.earned_total + excluded.earned_total, updated_at = now();
  end if;
  return new;
end;
$$;
revoke all on function private.grant_knowledge_shards() from public, anon, authenticated;
drop trigger if exists grant_knowledge_shards on public.mistakes;
create trigger grant_knowledge_shards after insert or update of reviews on public.mistakes
  for each row execute function private.grant_knowledge_shards();

-- 소급 지급: 지금까지 찍힌 O와 완료를 같은 기준으로(완료 보너스의 '등록 다음 날' 조건은 과거 기록이라 적용하지 않음).
insert into public.knowledge_shard_grants(user_id, mistake_id, slot, amount, source)
select m.user_id, m.id, s.slot, private.knowledge_shard_amount(s.slot), 'retro'
from public.mistakes m
cross join generate_series(0, 3) as s(slot)
where m.user_id is not null and jsonb_typeof(m.reviews) = 'array'
  and case when s.slot < 3 then m.reviews->>s.slot = 'O'
    else m.reviews->>0 = 'O' and m.reviews->>1 = 'O' and m.reviews->>2 = 'O' end
on conflict (mistake_id, slot) do nothing;
insert into public.knowledge_shard_wallets(user_id, balance, earned_total)
select g.user_id, sum(g.amount), sum(g.amount) from public.knowledge_shard_grants g group by g.user_id
on conflict (user_id) do update set
  balance = excluded.balance - coalesce((select sum(sp.amount) from public.knowledge_shard_spends sp where sp.user_id = excluded.user_id), 0),
  earned_total = excluded.earned_total, updated_at = now();

-- 조각 전용 아이템: shard_price가 있으면 포인트로는 살 수 없다(price는 0으로 둔다).
alter table public.pixel_item_catalog add column if not exists shard_price numeric(8,2) check (shard_price is null or shard_price > 0);
alter table public.pixel_item_catalog drop constraint if exists pixel_item_catalog_price_check;
alter table public.pixel_item_catalog add constraint pixel_item_catalog_price_check
  check (price > 0 or item_id = 'hair_bald' or shard_price is not null);
insert into public.pixel_item_catalog(item_id, category, slot, price, shard_price, asset_key, display_name, tier, stackable) values
  ('furniture_crystal_shelf', 'furniture', 'furniture', 0, 15.00, 'crystalshelf', '수정 서재', 3, false),
  ('top_scholar_robe', 'avatar', 'top', 0, 30.00, 'scholar', '지식의 학자 로브', 4, false)
on conflict (item_id) do update set category = excluded.category, slot = excluded.slot, price = excluded.price,
  shard_price = excluded.shard_price, asset_key = excluded.asset_key, display_name = excluded.display_name, tier = excluded.tier;

-- 원본: 라이브 DB purchase_pixel_item — 조각 전용 아이템은 포인트 구매를 막는다.
create or replace function public.purchase_pixel_item(p_item_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_price integer;
  v_shard numeric;
  v_bonus integer;
  v_adj integer;
  v_owned boolean;
  v_new_adj integer;
  v_new_balance integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  perform set_config('reviewnote.pixel_rpc', 'true', true);

  select price, shard_price into v_price, v_shard from public.pixel_item_catalog where item_id = p_item_id;
  if v_price is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', '존재하지 않는 아이템이에요.');
  end if;
  if v_shard is not null then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', '지식의 조각으로만 살 수 있어요.');
  end if;

  select bonus_points, point_adjustment into v_bonus, v_adj
    from public.profiles where id = v_user for update;
  if v_bonus is null then
    raise exception 'profile not found';
  end if;

  select exists(
    select 1 from public.pixel_item_ownership where user_id = v_user and item_id = p_item_id
  ) into v_owned;
  if v_owned then
    return jsonb_build_object('ok', false, 'reason', 'already_owned', 'message', '이미 보유한 아이템이에요.');
  end if;

  if greatest(0, v_bonus + v_adj) < v_price then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_balance', 'message', '포인트가 부족해요.');
  end if;

  v_new_adj := v_adj - v_price;
  update public.profiles set point_adjustment = v_new_adj where id = v_user;

  insert into public.pixel_item_ownership (user_id, item_id, price_paid)
    values (v_user, p_item_id, v_price);

  v_new_balance := greatest(0, v_bonus + v_new_adj);
  return jsonb_build_object('ok', true, 'itemId', p_item_id, 'newBalance', v_new_balance);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_owned', 'message', '이미 보유한 아이템이에요.');
end;
$$;

create or replace function public.get_knowledge_shards() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); w public.knowledge_shard_wallets%rowtype;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into w from public.knowledge_shard_wallets where user_id = v_user;
  return jsonb_build_object('balance', coalesce(w.balance, 0), 'earnedTotal', coalesce(w.earned_total, 0));
end;
$$;

create or replace function public.purchase_pixel_item_with_shards(p_item_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_price numeric(10,2); v_balance numeric(10,2);
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select shard_price into v_price from public.pixel_item_catalog where item_id = p_item_id and shard_price is not null;
  if v_price is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', '조각으로 살 수 없는 아이템이에요.');
  end if;
  insert into public.knowledge_shard_wallets(user_id) values (v_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.knowledge_shard_wallets where user_id = v_user for update;
  if exists(select 1 from public.pixel_item_ownership where user_id = v_user and item_id = p_item_id) then
    return jsonb_build_object('ok', false, 'reason', 'already_owned', 'message', '이미 보유한 아이템이에요.');
  end if;
  if v_balance < v_price then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_balance', 'message', '지식의 조각이 부족해요.');
  end if;
  perform set_config('reviewnote.pixel_rpc', 'true', true);
  update public.knowledge_shard_wallets set balance = balance - v_price, updated_at = now() where user_id = v_user
    returning balance into v_balance;
  insert into public.knowledge_shard_spends(user_id, item_id, amount) values (v_user, p_item_id, v_price);
  insert into public.pixel_item_ownership(user_id, item_id, price_paid) values (v_user, p_item_id, 0);
  return jsonb_build_object('ok', true, 'itemId', p_item_id, 'newShards', v_balance);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_owned', 'message', '이미 보유한 아이템이에요.');
end;
$$;

-- 결정 미끼: 조각 3.00으로 미끼 30회(지렁이 미끼와 같은 효과, 같은 미끼 통에 더해진다).
create or replace function public.buy_pixel_bait_with_shards() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_price constant numeric(10,2) := 3.00; v_balance numeric(10,2); v_charges integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  insert into public.knowledge_shard_wallets(user_id) values (v_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.knowledge_shard_wallets where user_id = v_user for update;
  if v_balance < v_price then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_balance', 'message', '지식의 조각이 부족해요.');
  end if;
  perform set_config('reviewnote.pixel_rpc', 'true', true);
  update public.knowledge_shard_wallets set balance = balance - v_price, updated_at = now() where user_id = v_user
    returning balance into v_balance;
  insert into public.knowledge_shard_spends(user_id, item_id, amount) values (v_user, 'bait_crystal', v_price);
  insert into public.pixel_bait(user_id, charges, updated_at) values (v_user, 30, now())
    on conflict (user_id) do update set charges = public.pixel_bait.charges + 30, updated_at = excluded.updated_at
    returning charges into v_charges;
  return jsonb_build_object('ok', true, 'newShards', v_balance, 'charges', v_charges);
end;
$$;

revoke all on function public.get_knowledge_shards(), public.purchase_pixel_item_with_shards(text), public.buy_pixel_bait_with_shards()
  from public, anon, authenticated;
grant execute on function public.get_knowledge_shards(), public.purchase_pixel_item_with_shards(text), public.buy_pixel_bait_with_shards()
  to authenticated;
commit;
