-- 레벨·경험치·소모성 미끼. 기존 응답과 권한에 필드만 추가한다.
begin;
create table if not exists public.pixel_player_level (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.pixel_bait (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  charges integer not null default 0 check (charges >= 0),
  updated_at timestamptz not null default now()
);
alter table public.pixel_player_level enable row level security;
alter table public.pixel_bait enable row level security;
revoke all on public.pixel_player_level, public.pixel_bait from public, anon, authenticated;
grant select on public.pixel_player_level, public.pixel_bait to authenticated;
drop policy if exists level_read_own on public.pixel_player_level;
create policy level_read_own on public.pixel_player_level for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists bait_read_own on public.pixel_bait;
create policy bait_read_own on public.pixel_bait for select to authenticated using (user_id = (select auth.uid()));
alter table public.pixel_fish_casts add column if not exists bait boolean not null default false;
alter table public.pixel_item_catalog drop constraint if exists pixel_item_catalog_category_check;
alter table public.pixel_item_catalog add constraint pixel_item_catalog_category_check check (category in ('avatar','furniture','pet','rod','bait'));
alter table public.pixel_item_catalog drop constraint if exists pixel_item_catalog_slot_check;
alter table public.pixel_item_catalog add constraint pixel_item_catalog_slot_check check (slot in ('top','bottom','shoes','hair','eyes','furniture','pet','rod','bait'));
insert into public.pixel_item_catalog (item_id, category, slot, price, asset_key, display_name, tier, stackable)
values ('bait_worm', 'bait', 'bait', 50, 'worm', '지렁이 미끼 (100회)', 1, true)
on conflict (item_id) do update set category=excluded.category, slot=excluded.slot, price=excluded.price,
 asset_key=excluded.asset_key, display_name=excluded.display_name, tier=excluded.tier, stackable=excluded.stackable;

-- 최대 레벨은 이 순수 계산 함수 한 곳에서만 정한다.
create or replace function pixel_private.level_for_xp(p_xp integer)
returns table (level integer, xp_into_level integer, xp_for_next integer)
language plpgsql immutable security definer set search_path = '' as $$
declare
  max_level constant integer := 100;
begin
  level := 1;
  xp_into_level := greatest(0, coalesce(p_xp, 0));
  while level < max_level and xp_into_level >= 50 + 10 * (level - 1) loop
    xp_into_level := xp_into_level - (50 + 10 * (level - 1));
    level := level + 1;
  end loop;
  xp_for_next := case when level = max_level then 0 else 50 + 10 * (level - 1) end;
  return next;
end $$;

create or replace function pixel_private.get_pixel_level()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  u uuid := auth.uid(); v_xp integer; v_level record; v_max record;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select coalesce((select xp from public.pixel_player_level where user_id = u), 0) into v_xp;
  select * into v_level from pixel_private.level_for_xp(v_xp);
  select * into v_max from pixel_private.level_for_xp(2147483647);
  return jsonb_build_object('xp', v_xp, 'level', v_level.level, 'xpIntoLevel', v_level.xp_into_level,
    'xpForNext', v_level.xp_for_next, 'maxLevel', v_max.level);
end $$;

-- 동시 수확·낚시도 같은 경험치 행 잠금으로 누락 없이 누적한다.
create or replace function pixel_private.award_pixel_xp(p_user uuid, p_gained integer)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_before integer; v_xp integer; v_old record; v_new record;
begin
  if p_user is distinct from auth.uid() or p_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.pixel_player_level(user_id) values(p_user) on conflict do nothing;
  select xp into v_before from public.pixel_player_level where user_id=p_user for update;
  update public.pixel_player_level set xp=xp+p_gained, updated_at=now() where user_id=p_user returning xp into v_xp;
  select * into v_old from pixel_private.level_for_xp(v_before);
  select * into v_new from pixel_private.level_for_xp(v_xp);
  return jsonb_build_object('gained', p_gained, 'xp', v_xp, 'level', v_new.level, 'leveledUp', v_new.level > v_old.level);
end $$;
create or replace function pixel_private.get_pixel_fishing_state(p_override_clock text default null, p_override_weather text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  c record;
  v_used integer;
  v_pet text;
  v_hint text;
  v_spark integer;
  v_rod text;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into c from pixel_private.fish_clock(p_override_clock, p_override_weather);
  select count(*) into v_used from public.pixel_fish_catches where user_id = u and kst_date = c.kst_date;
  v_pet := pixel_private.fish_active_pet(u);
  if v_pet = 'pet_dog' then
    -- 하루 씨앗 + 오늘 낚은 수: 한 마리 낚을 때마다 반짝이는 그림자가 바뀐다.
    v_spark := pixel_private.fish_fnv1a('sparkle:' || u::text || ':' || to_char(c.kst_date, 'YYYY-MM-DD') || ':' || v_used) % 3;
  end if;
  if v_pet = 'pet_pigeon' then
    select pixel_private.fish_hint_text(x.id) into v_hint from (
      select s.id, row_number() over (order by s.sort_order) - 1 as i, count(*) over () as n
        from public.pixel_fish_species s
       where not exists (select 1 from public.pixel_fish_catches k where k.user_id = u and k.species_id = s.id)
    ) x where x.i = pixel_private.fish_fnv1a('pigeon:' || u::text || ':' || to_char(c.kst_date, 'YYYY-MM-DD')) % x.n;
  end if;
  v_rod := pixel_private.fish_active_rod(u);
  return jsonb_build_object(
    'kstDate', to_char(c.kst_date, 'YYYY-MM-DD'), 'phase', c.phase, 'weather', c.weather,
    'remaining', -1, 'sparkleShadow', v_spark, 'pigeonHint', v_hint,
    'level', pixel_private.get_pixel_level(),
    'bait', jsonb_build_object('charges', coalesce((select charges from public.pixel_bait where user_id=u), 0)),
    'rod', jsonb_build_object('id', v_rod, 'tier', coalesce((select tier from pixel_private.fish_rods where id = v_rod), 0)),
    'album', coalesce((
      select jsonb_agg(jsonb_build_object('speciesId', a.species_id, 'count', a.cnt, 'bestCm', a.best, 'firstAt', a.first_at) order by s.sort_order)
        from (select species_id, count(*) as cnt, max(length_cm) as best, min(caught_at) as first_at
                from public.pixel_fish_catches where user_id = u group by species_id) a
        join public.pixel_fish_species s on s.id = a.species_id), '[]'::jsonb));
end $$;

create or replace function pixel_private.start_pixel_cast(p_pet text, p_override_clock text default null, p_override_weather text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  c record;
  v_pet text;
  v_pity boolean;
  v_fish public.pixel_fish_species%rowtype;
  v_len numeric;
  v_roll double precision;
  v_pattern text;
  v_delay integer;
  v_id uuid;
  v_difficulty numeric;
  v_rod pixel_private.fish_rods%rowtype;
  v_speed numeric := 1;
  v_down numeric := 0;
  v_bonus numeric := 0;
  v_skip boolean := false;
  v_forced boolean := false;
  v_trophy boolean := false;
  v_bait boolean := false;
  v_charges integer := 0;
  v_level integer;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  -- 같은 학생의 시작/끝을 한 줄로 세운다(시작 간격·대기 1개를 경쟁 없이 지키기 위해).
  perform pg_advisory_xact_lock(hashtextextended('pixel_fish:' || u::text, 0));
  select * into c from pixel_private.fish_clock(p_override_clock, p_override_weather);

  -- 만료된 피티 캐스트도 '놓친 것'으로 친다.
  with gone as (delete from public.pixel_fish_casts where user_id = u and expires_at <= now() returning pity)
  select coalesce(bool_or(pity), false) into v_skip from gone;
  if exists (select 1 from public.pixel_fish_casts where user_id = u) then
    return jsonb_build_object('ok', false, 'reason', 'pending');
  end if;
  if exists (select 1 from pixel_private.fish_start_throttle where user_id = u
             and started_at > clock_timestamp() - interval '2 seconds') then
    return jsonb_build_object('ok', false, 'reason', 'pending');
  end if;

  -- 행 잠금 UPDATE로 미끼 한 회만 소비한다. 시작 거절에는 소비하지 않는다.
  update public.pixel_bait set charges=charges-1, updated_at=now()
    where user_id=u and charges>0 returning charges into v_charges;
  v_bait := found;
  if not v_bait then v_charges := 0; end if;
  select level into v_level from pixel_private.level_for_xp(coalesce((select xp from public.pixel_player_level where user_id=u),0));

  v_pet := pixel_private.fish_active_pet(u);
  if p_pet is distinct from v_pet then v_pet := null; end if;

  -- 낚싯대: 장착·소유를 서버에서 확인한다. 없으면 기본 낚싯대(0 / 0 / 1.0).
  select * into v_rod from pixel_private.fish_rods where id = pixel_private.fish_active_rod(u);
  if v_rod.id is not null then
    v_speed := v_rod.speed; v_down := v_rod.difficulty_down; v_bonus := v_rod.rare_bonus;
  end if;

  -- 피티 건너뛰기 표시는 이번 시작에서 한 번 읽고 지운다.
  select v_skip or coalesce((select skip_next from pixel_private.fish_pity_state where user_id = u), false) into v_skip;
  insert into pixel_private.fish_pity_state (user_id, skip_next) values (u, false)
  on conflict (user_id) do update set skip_next = false;

  -- 피티: 최근 5마리(최소 5마리) 중 "그 종의 첫 마리"가 하나도 없으면 발동 대상.
  with mine as (
    select k.species_id, row_number() over (order by k.caught_at desc, k.id desc) as recent,
           row_number() over (partition by k.species_id order by k.caught_at, k.id) as nth
      from public.pixel_fish_catches k where k.user_id = u
  )
  select count(*) filter (where recent <= 5) = 5 and not bool_or(recent <= 5 and nth = 1)
    into v_pity from mine;

  -- 발동 대상이어도 캐스트마다 35%만, 방금 놓친 피티 바로 다음에는 쉬어 간다.
  if coalesce(v_pity, false) and not v_skip and random() < 0.35 then
    v_roll := random();
    with fresh as (
      select s.*, case s.rarity when 'common' then 60 when 'uncommon' then 28 when 'rare' then 10 else 2 end as w
        from public.pixel_fish_species s
       where (s.phases is null or c.phase = any(s.phases)) and (s.weather is null or c.weather = any(s.weather))
         and not exists (select 1 from public.pixel_fish_catches k where k.user_id = u and k.species_id = s.id)
    ), cum as (
      select f.*, sum(w) over (order by sort_order) as upto, sum(w) over () as total from fresh f
    )
    select id, name, rarity, phases, weather, min_cm, max_cm, shadow, sort_order into v_fish
      from cum where upto > v_roll * total order by sort_order limit 1;
    v_forced := v_fish.id is not null;
  end if;

  -- 어려운 물고기 굴림: 15% + 희귀 보너스(%p). 희귀:전설 = 5:1.
  if v_fish.id is null and random() * 100 < (case when v_bait then least(60, (15 + v_bonus) * 2) else 15 + v_bonus end) then
    v_roll := random();
    with hard as (
      select s.*, case s.rarity when 'rare' then 5 else 1 end as w
        from public.pixel_fish_species s
       where s.rarity in ('rare','legendary')
         and (s.phases is null or c.phase = any(s.phases)) and (s.weather is null or c.weather = any(s.weather))
    ), cum as (
      select h.*, sum(w) over (order by sort_order) as upto, sum(w) over () as total from hard h
    )
    select id, name, rarity, phases, weather, min_cm, max_cm, shadow, sort_order into v_fish
      from cum where upto > v_roll * total order by sort_order limit 1;
    if v_fish.id is null then
      -- 지금 희귀/전설이 없으면 '대물': 보통(없으면 흔함) 물고기 중 하나.
      v_roll := random();
      with big as (
        select s.*, row_number() over (order by s.sort_order) - 1 as i, count(*) over () as n
          from public.pixel_fish_species s
         where s.rarity = (select case when bool_or(t.rarity = 'uncommon') then 'uncommon' else 'common' end
                             from public.pixel_fish_species t
                            where t.rarity in ('common','uncommon')
                              and (t.phases is null or c.phase = any(t.phases)) and (t.weather is null or c.weather = any(t.weather)))
           and (s.phases is null or c.phase = any(s.phases)) and (s.weather is null or c.weather = any(s.weather))
      )
      select id, name, rarity, phases, weather, min_cm, max_cm, shadow, sort_order into v_fish
        from big where i = least(n - 1, floor(v_roll * n));
      v_trophy := v_fish.id is not null;
    end if;
  end if;

  -- 나머지: 예전처럼 지금 나올 수 있는 모든 물고기를 60/28/10/2로.
  if v_fish.id is null then
    v_roll := random();
    with pool as (
      select s.*, case s.rarity when 'common' then 60 when 'uncommon' then 28 when 'rare' then 10 else 2 end as w
        from public.pixel_fish_species s
       where (s.phases is null or c.phase = any(s.phases)) and (s.weather is null or c.weather = any(s.weather))
    ), cum as (
      select p.*, sum(w) over (order by sort_order) as upto, sum(w) over () as total from pool p
    )
    select id, name, rarity, phases, weather, min_cm, max_cm, shadow, sort_order into v_fish
      from cum where upto > v_roll * total order by sort_order limit 1;
  end if;
  if v_fish.id is null then return jsonb_build_object('ok', false, 'reason', 'error'); end if;

  -- 대물은 길이 상위 15% 안에서.
  v_len := v_fish.min_cm + (case when v_trophy then 0.85 + random() * 0.15 else random() end) * (v_fish.max_cm - v_fish.min_cm);
  if v_pet = 'pet_bear' then v_len := least(v_len * 1.08, v_fish.max_cm * 1.08); end if;
  v_len := round(v_len, 1);

  v_roll := random();
  v_pattern := case when v_roll < 0.4 then 'quick' when v_roll < 0.75 then 'double' else 'long' end;
  v_delay := case v_pattern when 'quick' then 1200 + floor(random() * 1300)
                            when 'double' then 2200 + floor(random() * 1400)
                            else 3200 + floor(random() * 1800) end;
  -- 빠른 낚싯대는 입질도 빨리 온다.
  v_delay := round(v_delay / v_speed);

  -- 최종 난이도 = max(1, min(5, 기본 + 대물 1.5) - 낚싯대).
  v_difficulty := pixel_private.fish_difficulty(v_fish.id, v_len);
  if v_trophy then v_difficulty := least(5, v_difficulty + 1.5); end if;
  v_difficulty := greatest(1, v_difficulty - v_down);
  v_difficulty := v_difficulty * (1 - least(v_level - 1, case when v_fish.rarity = 'legendary' then 15 else 50 end)::numeric / 100);
  if v_bait then v_difficulty := v_difficulty - 0.3; end if;
  v_difficulty := round(greatest(case when v_fish.rarity = 'legendary' then 4.0 else 1 end, v_difficulty), 2);
  insert into pixel_private.fish_start_throttle (user_id, started_at) values (u, clock_timestamp())
  on conflict (user_id) do update set started_at = excluded.started_at;

  insert into public.pixel_fish_casts (user_id, species_id, length_cm, expires_at, kst_date, phase, weather, pet, bite_delay_ms,
    rod_id, rod_tier, rod_speed, difficulty, pity, trophy, bait)
  values (u, v_fish.id, v_len, now() + interval '90 seconds', c.kst_date, c.phase, c.weather, v_pet, v_delay,
    v_rod.id, coalesce(v_rod.tier, 0), v_speed, v_difficulty, v_forced, v_trophy, v_bait)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'castId', v_id, 'shadow', v_fish.shadow, 'biteDelayMs', v_delay,
    'difficulty', v_difficulty, 'big', v_len >= v_fish.min_cm + 0.8 * (v_fish.max_cm - v_fish.min_cm), 'remaining', -1, 'pattern', v_pattern, 'hint', case when v_pet = 'pet_dog' and v_fish.rarity in ('rare','legendary') then 'sparkle' end,
    'rod', jsonb_build_object('id', v_rod.id, 'tier', coalesce(v_rod.tier, 0)), 'speed', v_speed, 'trophy', v_trophy, 'bait', jsonb_build_object('used', v_bait, 'charges', v_charges));
end $$;

create or replace function pixel_private.finish_pixel_cast(p_cast_id uuid, p_landed boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  k public.pixel_fish_casts%rowtype;
  s public.pixel_fish_species%rowtype;
  v_prev_count integer;
  v_prev_best numeric;
  v_difficulty numeric;
  v_xp_gain jsonb;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pixel_fish:' || u::text, 0));
  delete from public.pixel_fish_casts where id = p_cast_id and user_id = u returning * into k;
  if k.id is not null and k.pity then
    -- 일단 '놓침'으로 적어 두고, 실제로 낚으면 아래에서 지운다.
    insert into pixel_private.fish_pity_state (user_id, skip_next) values (u, true)
    on conflict (user_id) do update set skip_next = true;
  end if;
  if k.id is null or k.expires_at <= now() then return jsonb_build_object('ok', false); end if;
  select * into s from public.pixel_fish_species where id = k.species_id;
  v_difficulty := coalesce(k.difficulty, pixel_private.fish_difficulty(k.species_id, k.length_cm));
  -- 입질과 최소 끌어올리기 시간(낚싯대 속도로 나눔)을 모두 채워야 기록한다.
  if not coalesce(p_landed, false) or clock_timestamp() < k.created_at + make_interval(secs => (k.bite_delay_ms + (1500 + (v_difficulty - 1) * 375) / k.rod_speed) / 1000.0) then
    return jsonb_build_object('ok', true, 'landed', false);
  end if;
  if k.pity then update pixel_private.fish_pity_state set skip_next = false where user_id = u; end if;
  select count(*), max(length_cm) into v_prev_count, v_prev_best
    from public.pixel_fish_catches where user_id = u and species_id = k.species_id;
  insert into public.pixel_fish_catches (user_id, species_id, length_cm, kst_date, phase, weather, pet)
  values (u, k.species_id, k.length_cm, k.kst_date, k.phase, k.weather, k.pet);

  v_xp_gain := pixel_private.award_pixel_xp(u, (case s.rarity when 'common' then 5 when 'uncommon' then 10 when 'rare' then 25 else 60 end) + case when k.trophy then 15 else 0 end);

  return jsonb_build_object('ok', true, 'landed', true, 'speciesId', k.species_id, 'lengthCm', k.length_cm,
    'rarity', s.rarity, 'isNew', v_prev_count = 0,
    'isBig', k.length_cm >= s.min_cm + 0.8 * (s.max_cm - s.min_cm),
    'isPersonalBest', v_prev_count > 0 and k.length_cm > v_prev_best,
    'remaining', -1, 'xpGain', v_xp_gain);
end $$;

CREATE OR REPLACE FUNCTION pixel_private.farm_action(p_plot integer, p_action text, p_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  u uuid := auth.uid(); p public.pixel_farm_plots%rowtype; c public.pixel_farm_crops%rowtype;
  t timestamptz; day date; result text := 'ok';
  v_max_care_days integer; v_care_ratio numeric; v_luck numeric; v_base_size integer;
  v_review_gained integer; v_review_ratio numeric; v_bonus_chance numeric; v_bonus_roll numeric;
  v_bonus_amount integer; v_size smallint; v_inputs jsonb; v_harvest jsonb := '{}'::jsonb;
  v_current_points integer;
  v_xp_gain jsonb;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_plot is null or p_plot not between 0 and 1 or p_action is null or p_action not in ('plant','water','harvest') or p_revision is null or p_revision < 0 then
    raise exception 'Invalid farm action' using errcode = '22023';
  end if;
  insert into public.pixel_farm_plots(user_id,plot_index) values(u,p_plot) on conflict do nothing;
  select * into p from public.pixel_farm_plots where user_id=u and plot_index=p_plot for update;
  if p.revision <> p_revision then return public.get_pixel_farm() || jsonb_build_object('result','changed'); end if;
  t := clock_timestamp(); day := (t at time zone 'Asia/Seoul')::date;
  select * into c from public.pixel_farm_crops where user_id=u and id=p.crop_id;
  if p_action = 'plant' then
    if p.crop_id is not null then result := 'changed';
    else
      select bonus_points into v_current_points from public.profiles where id=u;
      insert into public.pixel_farm_crops(user_id,plot_index,planted_at,ready_at,review_points_at_plant)
        values(u,p_plot,t,t + interval '4 days',coalesce(v_current_points,0)) returning * into c;
      update public.pixel_farm_plots set crop_id=c.id,revision=revision+1 where user_id=u and plot_index=p_plot;
    end if;
  elsif p.crop_id is null then result := 'changed';
  elsif p_action = 'water' then
    if c.last_watered_on = day then result := 'already_watered';
    elsif t >= c.ready_at then result := 'ready';
    elsif c.care_count >= 4 then result := 'already_watered';
    else
      insert into public.pixel_farm_care(user_id,crop_id,care_day,watered_at) values(u,c.id,day,t);
      update public.pixel_farm_crops set care_count=care_count+1,last_watered_on=day where id=c.id;
      update public.pixel_farm_plots set revision=revision+1 where user_id=u and plot_index=p_plot;
    end if;
  elsif t < c.ready_at then result := 'growing';
  else
    v_max_care_days := least(4, greatest(1, ((c.ready_at at time zone 'Asia/Seoul')::date - (c.planted_at at time zone 'Asia/Seoul')::date) + 1));
    v_care_ratio := least(1.0, c.care_count::numeric / v_max_care_days);
    v_luck := (random() + random() + random()) / 3.0;
    v_base_size := greatest(10, least(100, round(40 + v_care_ratio * 30 + (v_luck - 0.5) * 40)));
    select bonus_points into v_current_points from public.profiles where id=u;
    v_review_gained := greatest(0, coalesce(v_current_points,0) - coalesce(c.review_points_at_plant, coalesce(v_current_points,0)));
    v_review_ratio := least(1.0, v_review_gained::numeric / 50.0);
    v_bonus_chance := 0.12 + v_review_ratio * 0.28;
    v_bonus_roll := random();
    if v_bonus_roll < v_bonus_chance then
      v_bonus_amount := round(6 + (random() + random()) / 2.0 * 12);
    else
      v_bonus_amount := 0;
    end if;
    v_size := greatest(10, least(100, v_base_size + v_bonus_amount))::smallint;
    v_inputs := jsonb_build_object('careCount',c.care_count,'maxCareDays',v_max_care_days,
      'careRatio',round(v_care_ratio,4),'luckRoll',round(v_luck,6),'baseSize',v_base_size,
      'base',40,'careBonusMax',30,'luckSpread',40,
      'reviewGained',v_review_gained,'reviewRatio',round(v_review_ratio,4),
      'bonusChance',round(v_bonus_chance,4),'bonusRoll',round(v_bonus_roll,6),'bonusAmount',v_bonus_amount);
    update public.pixel_farm_crops set harvested_at=t,size_score=v_size,size_calc_version=2,size_inputs=v_inputs where id=c.id;
    update public.pixel_farm_plots set crop_id=null,revision=revision+1 where user_id=u and plot_index=p_plot;
    v_harvest := jsonb_build_object('sizeScore',v_size,'bonusApplied',v_bonus_amount>0);
    v_xp_gain := pixel_private.award_pixel_xp(u, 40);
  end if;
  return public.get_pixel_farm() || jsonb_build_object('result',result) ||
    case when v_harvest = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('harvest',v_harvest,'xpGain',v_xp_gain) end;
end $function$;

CREATE OR REPLACE FUNCTION pixel_private.buy_pixel_bait()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_price integer;
  v_bonus integer;
  v_adj integer;
  v_charges integer;
  v_new_adj integer;
  v_new_balance integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  perform set_config('reviewnote.pixel_rpc', 'true', true);

  v_price := 50;

  select bonus_points, point_adjustment into v_bonus, v_adj
    from public.profiles where id = v_user for update;
  if v_bonus is null then
    raise exception 'profile not found';
  end if;

  if greatest(0, v_bonus + v_adj) < v_price then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_balance', 'message', '포인트가 부족해요.');
  end if;

  v_new_adj := v_adj - v_price;
  update public.profiles set point_adjustment = v_new_adj where id = v_user;

  insert into public.pixel_bait (user_id, charges, updated_at) values (v_user, 100, now())
  on conflict (user_id) do update set charges=public.pixel_bait.charges+100, updated_at=excluded.updated_at
  returning charges into v_charges;

  v_new_balance := greatest(0, v_bonus + v_new_adj);
  return jsonb_build_object('ok', true, 'newBalance', v_new_balance, 'charges', v_charges);
end;
$function$;

revoke all on function pixel_private.level_for_xp(integer), pixel_private.award_pixel_xp(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function pixel_private.get_pixel_level(), pixel_private.buy_pixel_bait() from public, anon, authenticated, service_role;
grant execute on function pixel_private.get_pixel_level(), pixel_private.buy_pixel_bait() to authenticated;
create or replace function public.get_pixel_level()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select pixel_private.get_pixel_level();
$$;
create or replace function public.buy_pixel_bait()
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select pixel_private.buy_pixel_bait();
$$;
revoke all on function public.get_pixel_level(), public.buy_pixel_bait() from public, anon, authenticated, service_role;
grant execute on function public.get_pixel_level(), public.buy_pixel_bait() to authenticated;
commit;
