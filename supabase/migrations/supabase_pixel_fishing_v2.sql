-- 무제한 낚시와 끌어올리기 미니게임. 기존 잠금과 권한을 유지한다.
-- 종료 시 캐스트를 삭제하므로 시작 간격은 별도의 비공개 행에 보관한다.
create table if not exists pixel_private.fish_start_throttle (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null
);
alter table pixel_private.fish_start_throttle enable row level security;
revoke all on pixel_private.fish_start_throttle from public, anon, authenticated, service_role;

create or replace function pixel_private.get_pixel_fishing_state(p_override_clock text default null, p_override_weather text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  c record;
  v_used integer;
  v_pet text;
  v_hint text;
  v_spark integer;
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
  return jsonb_build_object(
    'kstDate', to_char(c.kst_date, 'YYYY-MM-DD'), 'phase', c.phase, 'weather', c.weather,
    'remaining', -1, 'sparkleShadow', v_spark, 'pigeonHint', v_hint,
    'album', coalesce((
      select jsonb_agg(jsonb_build_object('speciesId', a.species_id, 'count', a.cnt, 'bestCm', a.best, 'firstAt', a.first_at) order by s.sort_order)
        from (select species_id, count(*) as cnt, max(length_cm) as best, min(caught_at) as first_at
                from public.pixel_fish_catches where user_id = u group by species_id) a
        join public.pixel_fish_species s on s.id = a.species_id), '[]'::jsonb));
end $$;

-- 6) start_pixel_cast — 물고기를 정하지만 정체는 알려 주지 않는다.
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
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  -- 같은 학생의 시작/끝을 한 줄로 세운다(시작 간격·대기 1개를 경쟁 없이 지키기 위해).
  perform pg_advisory_xact_lock(hashtextextended('pixel_fish:' || u::text, 0));
  select * into c from pixel_private.fish_clock(p_override_clock, p_override_weather);

  delete from public.pixel_fish_casts where user_id = u and expires_at <= now();
  if exists (select 1 from public.pixel_fish_casts where user_id = u) then
    return jsonb_build_object('ok', false, 'reason', 'pending');
  end if;
  if exists (select 1 from pixel_private.fish_start_throttle where user_id = u
             and started_at > clock_timestamp() - interval '2 seconds') then
    return jsonb_build_object('ok', false, 'reason', 'pending');
  end if;

  v_pet := pixel_private.fish_active_pet(u);
  if p_pet is distinct from v_pet then v_pet := null; end if;

  -- 피티: 최근 5마리(최소 5마리) 중 "그 종의 첫 마리"가 하나도 없으면 발동.
  with mine as (
    select k.species_id, row_number() over (order by k.caught_at desc, k.id desc) as recent,
           row_number() over (partition by k.species_id order by k.caught_at, k.id) as nth
      from public.pixel_fish_catches k where k.user_id = u
  )
  select count(*) filter (where recent <= 5) = 5 and not bool_or(recent <= 5 and nth = 1)
    into v_pity from mine;

  v_roll := random();
  with pool as (
    select s.*, case s.rarity when 'common' then 60 when 'uncommon' then 28 when 'rare' then 10 else 2 end as w
      from public.pixel_fish_species s
     where (s.phases is null or c.phase = any(s.phases)) and (s.weather is null or c.weather = any(s.weather))
  ), fresh as (
    select * from pool p where not exists (select 1 from public.pixel_fish_catches k where k.user_id = u and k.species_id = p.id)
  ), chosen as (
    select * from fresh where coalesce(v_pity, false)
    union all
    select * from pool where not (coalesce(v_pity, false) and exists (select 1 from fresh))
  ), cum as (
    select ch.*, sum(w) over (order by sort_order) as upto, sum(w) over () as total from chosen ch
  )
  select id, name, rarity, phases, weather, min_cm, max_cm, shadow, sort_order into v_fish
    from cum where upto > v_roll * total order by sort_order limit 1;
  if v_fish.id is null then return jsonb_build_object('ok', false, 'reason', 'error'); end if;

  v_len := v_fish.min_cm + random() * (v_fish.max_cm - v_fish.min_cm);
  if v_pet = 'pet_bear' then v_len := least(v_len * 1.08, v_fish.max_cm * 1.08); end if;
  v_len := round(v_len, 1);

  v_roll := random();
  v_pattern := case when v_roll < 0.4 then 'quick' when v_roll < 0.75 then 'double' else 'long' end;
  v_delay := case v_pattern when 'quick' then 1200 + floor(random() * 1300)
                            when 'double' then 2200 + floor(random() * 1400)
                            else 3200 + floor(random() * 1800) end;

  v_difficulty := least(5, (case v_fish.rarity when 'common' then 1 when 'uncommon' then 2 when 'rare' then 3.5 else 5 end) + (v_fish.sort_order % 3) * 0.08);
  insert into pixel_private.fish_start_throttle (user_id, started_at) values (u, clock_timestamp())
  on conflict (user_id) do update set started_at = excluded.started_at;

  insert into public.pixel_fish_casts (user_id, species_id, length_cm, expires_at, kst_date, phase, weather, pet, bite_delay_ms)
  values (u, v_fish.id, v_len, now() + interval '90 seconds', c.kst_date, c.phase, c.weather, v_pet, v_delay)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'castId', v_id, 'shadow', v_fish.shadow, 'biteDelayMs', v_delay,
    'difficulty', v_difficulty, 'remaining', -1, 'pattern', v_pattern, 'hint', case when v_pet = 'pet_dog' and v_fish.rarity in ('rare','legendary') then 'sparkle' end);
end $$;

-- 7) finish_pixel_cast — 캐스트를 지우고, 낚았으면 한 마리를 기록한다.
create or replace function pixel_private.finish_pixel_cast(p_cast_id uuid, p_landed boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  k public.pixel_fish_casts%rowtype;
  s public.pixel_fish_species%rowtype;
  v_prev_count integer;
  v_prev_best numeric;
  v_difficulty numeric;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pixel_fish:' || u::text, 0));
  delete from public.pixel_fish_casts where id = p_cast_id and user_id = u returning * into k;
  if k.id is null or k.expires_at <= now() then return jsonb_build_object('ok', false); end if;
  select * into s from public.pixel_fish_species where id = k.species_id;
  v_difficulty := least(5, (case s.rarity when 'common' then 1 when 'uncommon' then 2 when 'rare' then 3.5 else 5 end) + (s.sort_order % 3) * 0.08);
  -- 입질과 최소 끌어올리기 시간을 모두 채워야 기록한다.
  if not coalesce(p_landed, false) or clock_timestamp() < k.created_at + make_interval(secs => (k.bite_delay_ms + 1500 + (v_difficulty - 1) * 375) / 1000.0) then
    return jsonb_build_object('ok', true, 'landed', false);
  end if;
  select count(*), max(length_cm) into v_prev_count, v_prev_best
    from public.pixel_fish_catches where user_id = u and species_id = k.species_id;
  insert into public.pixel_fish_catches (user_id, species_id, length_cm, kst_date, phase, weather, pet)
  values (u, k.species_id, k.length_cm, k.kst_date, k.phase, k.weather, k.pet);

  return jsonb_build_object('ok', true, 'landed', true, 'speciesId', k.species_id, 'lengthCm', k.length_cm,
    'rarity', s.rarity, 'isNew', v_prev_count = 0,
    'isBig', k.length_cm >= s.min_cm + 0.8 * (s.max_cm - s.min_cm),
    'isPersonalBest', v_prev_count > 0 and k.length_cm > v_prev_best,
    'remaining', -1);
end $$;

