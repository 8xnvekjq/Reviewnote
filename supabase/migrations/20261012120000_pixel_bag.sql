-- Pixel World 가방: 잡은 물고기·곤충은 바로 포인트가 되지 않고 가방에 쌓인다. 광장 상점에서 팔면 그때 포인트를 받는다.
-- · 같은 종류는 한 칸에 겹쳐 쌓인다(종류 × 개수). 경험치·도감 기록은 잡는 순간 그대로 남는다.
-- · 판매 값은 예전에 잡자마자 받던 포인트와 같고, 하루 상한(award_game_points)도 판매할 때 똑같이 적용된다.
-- · 무게: 물고기는 희귀도별, 곤충은 별 개수별, 보관 중인 토마토(수확 후 출품 전)도 가방 무게에 들어간다.
--   기본 가방은 20kg. 넘으면 점점 느려지고 40kg부터는 평소의 20%(클라이언트 logic/bag.ts와 같은 식).
begin;

create table if not exists public.pixel_bag_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('fish', 'bug')),
  ref text not null,
  qty integer not null check (qty > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
alter table public.pixel_bag_items enable row level security;
create policy own_read on public.pixel_bag_items for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.pixel_bag_items from anon, authenticated;
grant select on public.pixel_bag_items to authenticated;

-- 한 개의 무게(kg)·판매 포인트·상한 종류. 판매 포인트는 예전 잡을 때 받던 값 그대로.
create or replace function pixel_private.bag_item_spec(p_kind text, p_ref text)
returns table(weight numeric, points integer, award_kind text)
language sql stable security definer set search_path = '' as $$
  select case s.rarity when 'common' then 1.0 when 'uncommon' then 1.5 when 'rare' then 2.5 when 'legendary' then 4.0 else 6.0 end,
    case s.rarity when 'common' then 1 when 'uncommon' then 2 when 'rare' then 4 when 'legendary' then 15 else 40 end,
    case when s.rarity in ('legendary', 'mythic') then 'full' else 'normal' end
  from public.pixel_fish_species s where p_kind = 'fish' and s.id = p_ref
  union all
  select 0.2 + 0.1 * b.stars, b.points, case when b.stars >= 4 then 'full' else 'normal' end
  from public.pixel_bug_species b where p_kind = 'bug' and b.id = p_ref;
$$;

create or replace function pixel_private.bag_summary(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with items as (
    select i.kind, i.ref, i.qty, s.weight, s.points
    from public.pixel_bag_items i cross join lateral pixel_private.bag_item_spec(i.kind, i.ref) s
    where i.user_id = p_user),
  crops as (
    select c.id, c.size_score from public.pixel_farm_crops c
    where c.user_id = p_user and c.status = 'stored' and c.harvested_at is not null)
  select jsonb_build_object(
    'capacity', 20.0,
    'weight', round(coalesce((select sum(qty * weight) from items), 0) + 1.5 * (select count(*) from crops), 2),
    'items', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'ref', ref, 'qty', qty, 'unitWeight', weight, 'unitPoints', points)
      order by kind, points desc, ref) from items), '[]'::jsonb),
    'crops', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'sizeScore', size_score, 'unitWeight', 1.5) order by size_score desc, id) from crops), '[]'::jsonb));
$$;

-- 잡은 것을 가방에 넣는다. 결과는 포인트 결과와 같은 모양(받은 포인트 0) + bag.
create or replace function pixel_private.bag_add(p_user uuid, p_kind text, p_ref text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_day pixel_private.game_point_days%rowtype;
begin
  insert into public.pixel_bag_items(user_id, kind, ref, qty) values (p_user, p_kind, p_ref, 1)
    on conflict (user_id, kind, ref) do update set qty = public.pixel_bag_items.qty + 1, updated_at = now();
  select * into v_day from pixel_private.game_point_days where user_id = p_user and kst_date = (now() at time zone 'Asia/Seoul')::date;
  return jsonb_build_object('awarded', 0, 'todayEarned', coalesce(v_day.earned, 0), 'cap', 50, 'capped', coalesce(v_day.earned, 0) >= 50,
    'bagged', true, 'bag', pixel_private.bag_summary(p_user));
end $$;
revoke all on function pixel_private.bag_item_spec(text, text), pixel_private.bag_summary(uuid), pixel_private.bag_add(uuid, text, text) from public, anon, authenticated;

create or replace function public.get_pixel_bag() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return pixel_private.bag_summary(auth.uid());
end $$;

-- 광장 상점에서 판매. p_items = [{kind, ref, qty}], null이면 물고기·곤충 전부. 상한 종류별로 묶어 award_game_points에 넘긴다.
create or replace function public.sell_pixel_bag(p_items jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid(); r record; v_qty integer; v_normal integer := 0; v_full integer := 0; v_sold integer := 0;
  v_points jsonb; v_awarded integer := 0;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pixel_bag:' || u::text, 0));
  for r in
    select i.kind, i.ref, i.qty as have,
      case when p_items is null then i.qty
        else least(i.qty, coalesce((select sum(greatest(0, (x->>'qty')::int)) from jsonb_array_elements(p_items) x
          where x->>'kind' = i.kind and x->>'ref' = i.ref), 0)) end as want,
      s.points, s.award_kind
    from public.pixel_bag_items i cross join lateral pixel_private.bag_item_spec(i.kind, i.ref) s
    where i.user_id = u for update of i
  loop
    v_qty := r.want;
    continue when v_qty <= 0;
    if v_qty = r.have then delete from public.pixel_bag_items where user_id = u and kind = r.kind and ref = r.ref;
    else update public.pixel_bag_items set qty = qty - v_qty, updated_at = now() where user_id = u and kind = r.kind and ref = r.ref; end if;
    v_sold := v_sold + v_qty;
    if r.award_kind = 'full' then v_full := v_full + v_qty * r.points; else v_normal := v_normal + v_qty * r.points; end if;
  end loop;
  if v_sold = 0 then return jsonb_build_object('ok', false, 'reason', 'nothing', 'bag', pixel_private.bag_summary(u)); end if;
  -- 전설·신화(full)를 먼저 넣어 하루 상한을 일반보다 먼저 쓰게 한다(예전 잡을 때와 같은 상한 규칙).
  if v_full > 0 then v_points := pixel_private.award_game_points(u, v_full, 'full'); v_awarded := v_awarded + (v_points->>'awarded')::int; end if;
  if v_normal > 0 then v_points := pixel_private.award_game_points(u, v_normal, 'normal'); v_awarded := v_awarded + (v_points->>'awarded')::int; end if;
  return jsonb_build_object('ok', true, 'sold', v_sold, 'value', v_full + v_normal,
    'points', v_points || jsonb_build_object('awarded', v_awarded), 'bag', pixel_private.bag_summary(u));
end $$;
revoke all on function public.get_pixel_bag(), public.sell_pixel_bag(jsonb) from public, anon, authenticated;
grant execute on function public.get_pixel_bag(), public.sell_pixel_bag(jsonb) to authenticated;

-- 잡는 순간의 포인트 지급을 가방 넣기로 바꾼다(그 한 줄만 정확히 바꾼다 — 못 찾으면 실패).
do $$
declare patch record; v_def text;
begin
  for patch in select * from (values
    ('pixel_private.finish_pixel_cast(uuid,boolean)',
     E'v_points := pixel_private.award_game_points(u,\n    case s.rarity when ''common'' then 1 when ''uncommon'' then 2 when ''rare'' then 4 when ''legendary'' then 15 when ''mythic'' then 40 end,\n    case when s.rarity in (''legendary'',''mythic'') then ''full'' else ''normal'' end);',
     'v_points := pixel_private.bag_add(u, ''fish'', k.species_id);'),
    ('public.finish_bug_catch(uuid,boolean)',
     'v_points := pixel_private.award_game_points(u,b.points,case when b.stars>=4 then ''full'' else ''normal'' end);',
     'v_points := pixel_private.bag_add(u, ''bug'', b.id);')
  ) as t(sig, find, repl) loop
    v_def := pg_get_functiondef(patch.sig::regprocedure);
    if position(patch.repl in v_def) > 0 then continue; end if;
    if position(patch.find in v_def) = 0 then raise exception 'bag patch: award line not found in %', patch.sig; end if;
    execute replace(v_def, patch.find, patch.repl);
  end loop;
end $$;
commit;
