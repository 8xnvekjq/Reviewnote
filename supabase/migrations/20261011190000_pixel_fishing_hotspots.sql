begin;
-- 포인트 상태는 학생마다 독립적이며 서버만 남은 마리를 바꾼다.
create table if not exists pixel_private.fish_spot_state (
 user_id uuid not null references public.profiles(id) on delete cascade,
 spot_id smallint not null check (spot_id between 0 and 3),
 "left" smallint not null check ("left" between 0 and 5),
 ready_at timestamptz,
 primary key(user_id, spot_id)
);
alter table pixel_private.fish_spot_state enable row level security;
revoke all on pixel_private.fish_spot_state from public, anon, authenticated, service_role;
alter table public.pixel_fish_casts add column if not exists spot_id smallint;
alter table public.pixel_fish_casts add column if not exists spot_bonus boolean;
-- 학생 잠금을 잡은 호출자만 사용한다. 처음 또는 재생성 시에만 채운다.
create or replace function pixel_private.refresh_fish_spots(p_user uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
 insert into pixel_private.fish_spot_state(user_id, spot_id, "left")
 select p_user, id, 3 + floor(random()*3)::integer from generate_series(0,3) id
 on conflict(user_id,spot_id) do nothing;
 update pixel_private.fish_spot_state set "left"=3+floor(random()*3)::integer, ready_at=null
 where user_id=p_user and ready_at <= now();
end $$;
revoke all on function pixel_private.refresh_fish_spots(uuid) from public, anon, authenticated, service_role;
-- 기본 인수가 있는 구형 오버로드를 없애 PostgREST 호출을 하나로 모은다.
drop function if exists public.start_pixel_cast(text,text,text);
drop function if exists pixel_private.start_pixel_cast(text,text,text);
create or replace function pixel_private.start_pixel_cast(p_pet text, p_override_clock text default null, p_override_weather text default null, p_spot integer default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  c record;
  v_pet text;
  v_pity boolean;
  v_fish public.pixel_fish_species%rowtype;
  v_len numeric;
  v_junk text;
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
  v_spot pixel_private.fish_spot_state%rowtype;
  v_spot_bonus boolean := false;
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

  -- 서버 상태가 활성인 포인트만 이번 캐스트에 보너스를 준다.
  if p_spot between 0 and 3 then
    perform pixel_private.refresh_fish_spots(u);
    select * into v_spot from pixel_private.fish_spot_state where user_id=u and spot_id=p_spot;
    v_spot_bonus := (v_spot.ready_at is null or v_spot.ready_at <= now()) and v_spot."left" > 0;
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

  -- 포인트 보너스는 미끼의 두 배 계산 전에 더한다.
  if v_spot_bonus then v_bonus := v_bonus + 15; end if;
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
      select s.*, case s.rarity when 'common' then 60 when 'uncommon' then 28 when 'rare' then 10 when 'legendary' then 2 else 0.5 end as w
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
  if not v_forced and random() < 0.06 then
    v_junk := (array['junk_shoe','junk_can','junk_coin'])[1 + floor(random() * 3)::integer];
  end if;

  if v_junk is null and v_fish.id is null and random() * 100 < (case when v_bait then least(60, (15 + v_bonus) * 2) else 15 + v_bonus end) then
    v_roll := random();
    with hard as (
      select s.*, case s.rarity when 'rare' then 5 when 'legendary' then 1 else 0.5 end as w
        from public.pixel_fish_species s
       where s.rarity in ('rare','legendary','mythic')
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
  if v_junk is null and v_fish.id is null then
    v_roll := random();
    with pool as (
      select s.*, case s.rarity when 'common' then 60 when 'uncommon' then 28 when 'rare' then 10 when 'legendary' then 2 else 0.5 end as w
        from public.pixel_fish_species s
       where (s.phases is null or c.phase = any(s.phases)) and (s.weather is null or c.weather = any(s.weather))
    ), cum as (
      select p.*, sum(w) over (order by sort_order) as upto, sum(w) over () as total from pool p
    )
    select id, name, rarity, phases, weather, min_cm, max_cm, shadow, sort_order into v_fish
      from cum where upto > v_roll * total order by sort_order limit 1;
  end if;
  if v_junk is null and v_fish.id is null then return jsonb_build_object('ok', false, 'reason', 'error'); end if;

  -- 대물은 길이 상위 15% 안에서.
  v_len := v_fish.min_cm + (case when v_trophy then 0.85 + random() * 0.15 when v_spot_bonus then sqrt(random()) else random() end) * (v_fish.max_cm - v_fish.min_cm);
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
  if v_fish.rarity = 'mythic' then v_difficulty := 5; end if;
  if v_junk is not null then v_difficulty := 1; end if;
  insert into pixel_private.fish_start_throttle (user_id, started_at) values (u, clock_timestamp())
  on conflict (user_id) do update set started_at = excluded.started_at;

  insert into public.pixel_fish_casts (user_id, species_id, length_cm, expires_at, kst_date, phase, weather, pet, bite_delay_ms,
    rod_id, rod_tier, rod_speed, difficulty, pity, trophy, bait, junk, spot_id, spot_bonus)
  values (u, v_fish.id, v_len, now() + interval '90 seconds', c.kst_date, c.phase, c.weather, v_pet, v_delay,
    v_rod.id, coalesce(v_rod.tier, 0), v_speed, v_difficulty, v_forced, v_trophy, v_bait, v_junk, v_spot.spot_id, case when v_spot.spot_id is not null then v_spot_bonus end)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'castId', v_id, 'shadow', case when v_junk is not null then 'S' else v_fish.shadow end, 'junk', v_junk, 'heavy', coalesce(v_fish.rarity = 'mythic', false), 'biteDelayMs', v_delay,
    'difficulty', v_difficulty, 'big', v_len >= v_fish.min_cm + 0.8 * (v_fish.max_cm - v_fish.min_cm), 'remaining', -1, 'pattern', v_pattern, 'hint', null,
    'rod', jsonb_build_object('id', v_rod.id, 'tier', coalesce(v_rod.tier, 0)), 'speed', v_speed, 'trophy', v_trophy, 'bait', jsonb_build_object('used', v_bait, 'charges', v_charges))
    || case when v_spot.spot_id is not null then jsonb_build_object('spot', jsonb_build_object('id', v_spot.spot_id, 'bonus', v_spot_bonus, 'left', v_spot."left")) else '{}'::jsonb end;
end $$;

create or replace function pixel_private.get_pixel_fishing_state(p_override_clock text default null, p_override_weather text default null)
returns jsonb
language plpgsql
volatile security definer
set search_path = ''
as $function$
declare
  u uuid := auth.uid();
  c record;
  v_rod text;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pixel_fish:' || u::text, 0));
  perform pixel_private.refresh_fish_spots(u);
  select * into c from pixel_private.fish_clock(p_override_clock, p_override_weather);
  v_rod := pixel_private.fish_active_rod(u);
  return jsonb_build_object(
    'kstDate', to_char(c.kst_date, 'YYYY-MM-DD'), 'phase', c.phase, 'weather', c.weather,
    'spots', (select jsonb_agg(jsonb_build_object('id', spot_id, 'active', ready_at is null or ready_at <= now(), 'left', "left", 'readyAt', ready_at) order by spot_id) from pixel_private.fish_spot_state where user_id=u),
    'remaining', -1, 'sparkleShadow', null, 'pigeonHint', null,
    'level', pixel_private.get_pixel_level(),
    'bait', jsonb_build_object('charges', coalesce((select charges from public.pixel_bait where user_id=u), 0)),
    'rod', jsonb_build_object('id', v_rod, 'tier', coalesce((select tier from pixel_private.fish_rods where id = v_rod), 0)),
    'junk', jsonb_build_object(
      'junk_shoe', (select count(*) from public.pixel_fish_junk where user_id=u and junk_id='junk_shoe'),
      'junk_can', (select count(*) from public.pixel_fish_junk where user_id=u and junk_id='junk_can'),
      'junk_coin', (select count(*) from public.pixel_fish_junk where user_id=u and junk_id='junk_coin')),
    'album', coalesce((
      select jsonb_agg(jsonb_build_object('speciesId', a.species_id, 'count', a.cnt, 'bestCm', a.best, 'firstAt', a.first_at) order by s.sort_order)
        from (select species_id, count(*) as cnt, max(length_cm) as best, min(caught_at) as first_at
                from public.pixel_fish_catches where user_id = u group by species_id) a
        join public.pixel_fish_species s on s.id = a.species_id), '[]'::jsonb));
end $function$;

create or replace function pixel_private.finish_pixel_cast(p_cast_id uuid, p_landed boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  u uuid := auth.uid();
  k public.pixel_fish_casts%rowtype;
  s public.pixel_fish_species%rowtype;
  v_prev_count integer;
  v_prev_best numeric;
  v_difficulty numeric;
  v_xp integer;
  v_percentile numeric;
  v_xp_gain jsonb;
  v_spot pixel_private.fish_spot_state%rowtype;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pixel_fish:' || u::text, 0));
  delete from public.pixel_fish_casts where id = p_cast_id and user_id = u returning * into k;
  if k.id is not null and k.pity then
    insert into pixel_private.fish_pity_state (user_id, skip_next) values (u, true)
    on conflict (user_id) do update set skip_next = true;
  end if;
  if k.id is null or k.expires_at <= now() then return jsonb_build_object('ok', false); end if;
  select * into s from public.pixel_fish_species where id = k.species_id;
  v_difficulty := coalesce(k.difficulty, pixel_private.fish_difficulty(k.species_id, k.length_cm));
  if not coalesce(p_landed, false) or clock_timestamp() < k.created_at + make_interval(secs => (k.bite_delay_ms + (1500 + (v_difficulty - 1) * 375) / k.rod_speed) / 1000.0) then
    return jsonb_build_object('ok', true, 'landed', false);
  end if;
  if k.pity then update pixel_private.fish_pity_state set skip_next = false where user_id = u; end if;
  if k.junk is not null then
    insert into public.pixel_fish_junk(user_id, junk_id) values (u, k.junk);
    v_xp_gain := pixel_private.award_pixel_xp(u, 1);
    return jsonb_build_object('ok', true, 'landed', true, 'junk', k.junk, 'remaining', -1, 'xpGain', v_xp_gain);
  end if;
  -- 잡동사니·도망·만료는 위에서 끝나므로 실제 물고기만 포인트를 소모한다.
  if k.spot_bonus and k.spot_id between 0 and 3 then
    update pixel_private.fish_spot_state
      set "left"=greatest(0,"left"-1),
          ready_at=case when "left"=1 then now()+make_interval(secs => 180+random()*120) else ready_at end
      where user_id=u and spot_id=k.spot_id returning * into v_spot;
  end if;
  select count(*), max(length_cm) into v_prev_count, v_prev_best
    from public.pixel_fish_catches where user_id = u and species_id = k.species_id;
  insert into public.pixel_fish_catches (user_id, species_id, length_cm, kst_date, phase, weather, pet)
  values (u, k.species_id, k.length_cm, k.kst_date, k.phase, k.weather, k.pet);

  select round(100.0 * count(*) filter (where length_cm >= k.length_cm) / count(*), 1)
    into v_percentile from public.pixel_fish_catches where species_id = k.species_id;

  v_xp := (case s.rarity when 'common' then 5 when 'uncommon' then 10 when 'rare' then 25 when 'mythic' then 120 else 60 end) + case when k.trophy then 15 else 0 end;
  -- 강아지: 낚시 경험치 +10%(던질 때 데리고 있던 펫 기준, 반올림).
  if k.pet = 'pet_dog' then v_xp := round(v_xp * 1.1); end if;
  v_xp_gain := pixel_private.award_pixel_xp(u, v_xp);

  return jsonb_build_object('ok', true, 'landed', true, 'speciesId', k.species_id, 'lengthCm', k.length_cm,
    'rarity', s.rarity, 'isNew', v_prev_count = 0,
    'isBig', k.length_cm >= s.min_cm + 0.8 * (s.max_cm - s.min_cm),
    'isPersonalBest', v_prev_count > 0 and k.length_cm > v_prev_best,
    'remaining', -1, 'xpGain', v_xp_gain, 'percentile', v_percentile)
    || case when v_spot.spot_id is not null then jsonb_build_object('spot', jsonb_build_object('id', v_spot.spot_id, 'left', v_spot."left", 'readyAt', v_spot.ready_at)) else '{}'::jsonb end;
end $function$;


create or replace function public.start_pixel_cast(p_pet text, p_override_clock text default null, p_override_weather text default null, p_spot integer default null)
returns jsonb language sql volatile security invoker set search_path = '' as $$
 select pixel_private.start_pixel_cast(p_pet,p_override_clock,p_override_weather,p_spot);
$$;
create or replace function public.get_pixel_fishing_state(p_override_clock text default null, p_override_weather text default null)
returns jsonb language sql volatile security invoker set search_path = '' as $$
 select pixel_private.get_pixel_fishing_state(p_override_clock,p_override_weather);
$$;
revoke all on function pixel_private.start_pixel_cast(text,text,text,integer), public.start_pixel_cast(text,text,text,integer),
 pixel_private.get_pixel_fishing_state(text,text), public.get_pixel_fishing_state(text,text), pixel_private.finish_pixel_cast(uuid,boolean)
 from public, anon, authenticated, service_role;
grant execute on function pixel_private.start_pixel_cast(text,text,text,integer), public.start_pixel_cast(text,text,text,integer),
 pixel_private.get_pixel_fishing_state(text,text), public.get_pixel_fishing_state(text,text), pixel_private.finish_pixel_cast(uuid,boolean)
 to authenticated;
commit;
