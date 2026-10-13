-- Pixel World 텃밭(2026-10-20) 2/3 — 경제: 칸이 늘어도 포인트·경험치가 늘지 않게.
-- 예전 밭 두 개의 하루 최대치(같은 날 두 칸을 모두 수확·출품):
--   · 농사 경험치: 토마토 수확 1번 40 XP × 2 = 80 XP
--   · 농사 포인트: 출품 보상 10 + 크기×0.4(최대 50P) × 2 = 100P
-- 그래서 KST 하루 농사 상한을 경험치 80 XP, 포인트 100P로 둔다(토마토 출품 + 딸기 판매를 합쳐서).
--   · 토마토 수확 40 XP, 딸기 수확 10 XP — 상한까지만 준다(넘으면 0 XP, 수확 자체는 된다).
--   · 토마토 출품 보상은 예전 식 그대로, 상한까지만 준다. 오늘 남은 포인트가 0이면 출품을 미룬다(작물은 가방에 남는다).
--   · 딸기 열매는 가방('crop' 칸, 0.1kg)에 쌓이고 광장 상점에서 한 알 2P에 판다. 남은 상한만큼만 팔린다(나머지는 가방에).
--   · 게임 포인트 하루 상한(award_game_points: 물고기·곤충)과는 따로 센다 — 농사는 처음부터 그 상한 밖이었다.
-- · 스프링클러: 광장 상점 '도구' 300P, 학생마다 하나.
begin;

create table if not exists pixel_private.farm_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kst_date date not null,
  xp integer not null default 0 check (xp >= 0),
  points integer not null default 0 check (points >= 0),
  primary key (user_id, kst_date)
);
alter table pixel_private.farm_days enable row level security;
revoke all on pixel_private.farm_days from public, anon, authenticated;

-- 하루 상한(클라이언트 gardenModel.ts FARM_DAILY_CAP과 같은 값).
create or replace function pixel_private.farm_caps(out xp_cap integer, out points_cap integer)
language sql immutable set search_path = '' as $$ select 80, 100 $$;

create or replace function pixel_private.farm_today(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('xp', coalesce(d.xp, 0), 'xpCap', c.xp_cap, 'points', coalesce(d.points, 0), 'pointsCap', c.points_cap)
  from pixel_private.farm_caps() c
  left join pixel_private.farm_days d on d.user_id = p_user and d.kst_date = (now() at time zone 'Asia/Seoul')::date;
$$;

-- 농사 경험치: 오늘 남은 만큼만 준다. 결과는 award_pixel_xp와 같은 모양(받은 것이 0이어도).
create or replace function pixel_private.farm_award_xp(p_user uuid, p_want integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_day date := (now() at time zone 'Asia/Seoul')::date; v_have integer; v_gain integer;
begin
  insert into pixel_private.farm_days(user_id, kst_date) values (p_user, v_day) on conflict do nothing;
  select xp into v_have from pixel_private.farm_days where user_id = p_user and kst_date = v_day for update;
  v_gain := greatest(0, least(coalesce(p_want, 0), (select xp_cap from pixel_private.farm_caps()) - v_have));
  update pixel_private.farm_days set xp = xp + v_gain where user_id = p_user and kst_date = v_day;
  return pixel_private.award_pixel_xp(p_user, v_gain, 'farming');
end $$;

-- 농사 포인트: 오늘 남은 만큼만 point_adjustment에 더하고, 실제로 준 값을 돌려준다.
create or replace function pixel_private.farm_award_points(p_user uuid, p_want integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_day date := (now() at time zone 'Asia/Seoul')::date; v_have integer; v_gain integer;
begin
  insert into pixel_private.farm_days(user_id, kst_date) values (p_user, v_day) on conflict do nothing;
  select points into v_have from pixel_private.farm_days where user_id = p_user and kst_date = v_day for update;
  v_gain := greatest(0, least(coalesce(p_want, 0), (select points_cap from pixel_private.farm_caps()) - v_have));
  if v_gain > 0 then
    update pixel_private.farm_days set points = points + v_gain where user_id = p_user and kst_date = v_day;
    perform set_config('reviewnote.pixel_rpc', 'true', true);
    update public.profiles set point_adjustment = coalesce(point_adjustment, 0) + v_gain where id = p_user;
  end if;
  return v_gain;
end $$;
-- 오늘 더 받을 수 있는 농사 포인트.
create or replace function pixel_private.farm_points_left(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select greatest(0, c.points_cap - coalesce(d.points, 0)) from pixel_private.farm_caps() c
  left join pixel_private.farm_days d on d.user_id = p_user and d.kst_date = (now() at time zone 'Asia/Seoul')::date;
$$;
revoke all on function pixel_private.farm_caps(), pixel_private.farm_today(uuid), pixel_private.farm_award_xp(uuid, integer),
  pixel_private.farm_award_points(uuid, integer), pixel_private.farm_points_left(uuid) from public, anon, authenticated;

-- 토마토 출품: 예전 식(10 + 크기×0.4) 그대로, 오늘 농사 상한까지만. 딸기 포기나 다 쓴 줄은 출품할 수 없다.
create or replace function pixel_private.submit_farm_crop(p_crop_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  u uuid := auth.uid();
  c public.pixel_farm_crops%rowtype;
  v_reward integer; v_left integer; v_paid integer;
  t timestamptz;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_crop_id is null then raise exception 'Invalid crop id' using errcode = '22023'; end if;

  select * into c from public.pixel_farm_crops where id = p_crop_id and user_id = u for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', '작물을 찾을 수 없어요.');
  end if;
  if c.harvested_at is null or c.status <> 'stored' or c.crop_type <> 'tomato' then
    return jsonb_build_object('ok', false,
      'reason', case when c.status = 'submitted' then 'already_submitted' else 'not_stored' end,
      'message', '이미 출품했거나 아직 보관 중인 작물이 아니에요.');
  end if;

  v_reward := 10 + round(c.size_score * 0.4);
  v_left := pixel_private.farm_points_left(u);
  if v_left <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'daily_cap',
      'message', '오늘 받을 수 있는 농사 포인트를 다 받았어요. 내일 출품해 주세요!');
  end if;

  t := clock_timestamp();
  v_paid := pixel_private.farm_award_points(u, v_reward);
  update public.pixel_farm_crops
     set status = 'submitted', submitted_at = t, reward_points = v_paid
   where id = c.id and status = 'stored';

  return jsonb_build_object('ok', true, 'cropId', c.id, 'rewardPoints', v_paid, 'fullReward', v_reward,
    'submittedAt', t, 'status', 'submitted');
end;
$function$;
revoke all on function pixel_private.submit_farm_crop(uuid) from public, anon, authenticated, service_role;
grant execute on function pixel_private.submit_farm_crop(uuid) to authenticated;

-- 스프링클러(광장 상점 '도구', 300P, 하나만). 소유하면 텃밭 도구 막대에서 칸에 놓고 거둔다.
insert into public.pixel_item_catalog(item_id, category, slot, price, asset_key, display_name, tier, stackable)
values ('tool_sprinkler', 'tool', 'tool', 300, 'tool_sprinkler', '스프링클러', 2, false)
on conflict (item_id) do update set category = excluded.category, slot = excluded.slot, price = excluded.price,
  asset_key = excluded.asset_key, display_name = excluded.display_name, tier = excluded.tier, stackable = excluded.stackable;

-- 가방: 딸기 열매('crop'/'strawberry').
do $$
declare r record;
begin
  for r in select con.conname from pg_constraint con where con.conrelid = 'public.pixel_bag_items'::regclass
    and con.contype = 'c' and pg_get_constraintdef(con.oid) ~ 'kind'
  loop execute format('alter table public.pixel_bag_items drop constraint %I', r.conname); end loop;
end $$;
alter table public.pixel_bag_items add constraint pixel_bag_items_kind_check check (kind in ('fish', 'bug', 'crop'));

-- 한 개의 무게·판매 포인트·상한 종류. 물고기·곤충은 20261012130000_pixel_bag_fish_weights.sql 그대로, 딸기는 'farm'(농사 상한).
create or replace function pixel_private.bag_item_spec(p_kind text, p_ref text)
returns table(weight numeric, points integer, award_kind text)
language sql stable security definer set search_path = '' as $$
  select coalesce(case s.id
      when 'minnow' then 0.1 when 'pirami' then 0.2 when 'moonfish' then 0.3 when 'goby' then 0.4 when 'buri' then 0.5
      when 'catfish_small' then 0.6 when 'trout' then 1.0 when 'mandarin' then 1.5 when 'eel' then 2.0 when 'carp' then 3.0
      when 'catfish' then 4.0 when 'rainbow_koi' then 5.0 when 'shark' then 30.0 when 'whale' then 80.0 end,
      case s.rarity when 'common' then 1.0 when 'uncommon' then 1.5 when 'rare' then 2.5 when 'legendary' then 4.0 else 6.0 end),
    case s.rarity when 'common' then 1 when 'uncommon' then 2 when 'rare' then 4 when 'legendary' then 15 else 40 end,
    case when s.rarity in ('legendary', 'mythic') then 'full' else 'normal' end
  from public.pixel_fish_species s where p_kind = 'fish' and s.id = p_ref
  union all
  select 0.2 + 0.1 * b.stars, b.points, case when b.stars >= 4 then 'full' else 'normal' end
  from public.pixel_bug_species b where p_kind = 'bug' and b.id = p_ref
  union all
  select 0.1, 2, 'farm' where p_kind = 'crop' and p_ref = 'strawberry';
$$;
revoke all on function pixel_private.bag_item_spec(text, text) from public, anon, authenticated;

-- 같은 것을 여러 개 한 번에 넣는다(딸기 1~2알).
create or replace function pixel_private.bag_add_qty(p_user uuid, p_kind text, p_ref text, p_qty integer) returns void
language sql security definer set search_path = '' as $$
  insert into public.pixel_bag_items(user_id, kind, ref, qty) values (p_user, p_kind, p_ref, greatest(1, p_qty))
    on conflict (user_id, kind, ref) do update set qty = public.pixel_bag_items.qty + greatest(1, p_qty), updated_at = now();
$$;
revoke all on function pixel_private.bag_add_qty(uuid, text, text, integer) from public, anon, authenticated;

-- 광장 상점 판매(20261012120000_pixel_bag.sql과 같고 딸기만 더했다). 딸기는 농사 상한이 남은 만큼만 팔린다.
create or replace function public.sell_pixel_bag(p_items jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid(); r record; v_qty integer; v_normal integer := 0; v_full integer := 0; v_farm integer := 0; v_sold integer := 0;
  v_points jsonb; v_awarded integer := 0; v_farm_left integer; v_farm_capped boolean := false;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pixel_bag:' || u::text, 0));
  v_farm_left := pixel_private.farm_points_left(u);
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
    if r.award_kind = 'farm' and v_qty > 0 then
      if v_qty * r.points > v_farm_left - v_farm then v_farm_capped := true; end if;
      v_qty := least(v_qty, (v_farm_left - v_farm) / greatest(1, r.points));
    end if;
    continue when v_qty <= 0;
    if v_qty = r.have then delete from public.pixel_bag_items where user_id = u and kind = r.kind and ref = r.ref;
    else update public.pixel_bag_items set qty = qty - v_qty, updated_at = now() where user_id = u and kind = r.kind and ref = r.ref; end if;
    v_sold := v_sold + v_qty;
    if r.award_kind = 'farm' then v_farm := v_farm + v_qty * r.points;
    elsif r.award_kind = 'full' then v_full := v_full + v_qty * r.points; else v_normal := v_normal + v_qty * r.points; end if;
  end loop;
  if v_sold = 0 then
    return jsonb_build_object('ok', false, 'reason', case when v_farm_capped then 'farm_cap' else 'nothing' end, 'bag', pixel_private.bag_summary(u));
  end if;
  if v_full > 0 then v_points := pixel_private.award_game_points(u, v_full, 'full'); v_awarded := v_awarded + (v_points->>'awarded')::int; end if;
  if v_normal > 0 then v_points := pixel_private.award_game_points(u, v_normal, 'normal'); v_awarded := v_awarded + (v_points->>'awarded')::int; end if;
  if v_farm > 0 then v_awarded := v_awarded + pixel_private.farm_award_points(u, v_farm); end if;
  return jsonb_build_object('ok', true, 'sold', v_sold, 'value', v_full + v_normal + v_farm, 'farmCapped', v_farm_capped,
    'points', coalesce(v_points, '{}'::jsonb) || jsonb_build_object('awarded', v_awarded), 'bag', pixel_private.bag_summary(u));
end $$;
revoke all on function public.sell_pixel_bag(jsonb) from public, anon, authenticated;
grant execute on function public.sell_pixel_bag(jsonb) to authenticated;

commit;
