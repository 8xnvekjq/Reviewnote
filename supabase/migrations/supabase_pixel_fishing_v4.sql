-- 낚시 v4 — 낚싯대(상점), 어려운 물고기 15% 굴림, 피티가 같은 물고기를 되풀이하지 않게.
-- v3 다음에 적용한다. 여러 번 적용해도 안전하다(if not exists / create or replace / 시드 upsert).
-- 포인트는 여기서 건드리지 않는다. 낚싯대 값은 기존 purchase_pixel_item이 차감만 한다.
--
-- 규칙 요약
--   * 낚싯대: 상점 카테고리 'rod'. 장착은 새 RPC equip_pixel_rod(p_item_id) — null이면 해제(기본 낚싯대).
--     효과(난이도 낮춤·희귀 보너스·속도)는 서버만 계산하고, 시작할 때 캐스트 행에 적어 끝낼 때 그대로 쓴다.
--   * 어려운 물고기: 캐스트마다 15% + 희귀 보너스(%p)로 굴린다. 맞으면 지금 나올 수 있는 희귀/전설을 5:1로.
--     없으면 '대물' — 보통(없으면 흔함) 물고기를 길이 상위 15%로, 난이도 +1.5(최대 5), trophy=true.
--     빗나가면 예전처럼 모든 물고기를 60/28/10/2로 굴린다.
--   * 피티: 발동 조건은 그대로, 다만 캐스트마다 35%만. 피티로 정한 캐스트를 놓치거나(도망·너무 빨리·만료)
--     하면 바로 다음 캐스트에는 피티를 쓰지 않는다.
--   * 배포 순서: 예전 클라이언트도 그대로 동작한다. 새 응답 필드(rod·speed·trophy)는 덧붙이기만 했다.

-- 1) 낚싯대 효과표(비공개). fishingAdapter.ts의 FISHING_RODS와 같은 숫자 — 단위 테스트가 대조한다.
create table if not exists pixel_private.fish_rods (
  id text primary key,
  tier smallint not null check (tier between 1 and 4),
  difficulty_down numeric(3,2) not null check (difficulty_down >= 0),
  rare_bonus numeric(4,2) not null check (rare_bonus >= 0),
  speed numeric(4,2) not null check (speed >= 1)
);
alter table pixel_private.fish_rods enable row level security;
revoke all on pixel_private.fish_rods from public, anon, authenticated, service_role;

insert into pixel_private.fish_rods (id, tier, difficulty_down, rare_bonus, speed) values
  ('rod_bamboo', 1, 0.3, 0, 1.0),
  ('rod_steel', 2, 0.5, 0, 1.15),
  ('rod_lucky', 3, 0.5, 5, 1.25),
  ('rod_gold', 4, 0.8, 8, 1.35)
on conflict (id) do update set tier = excluded.tier, difficulty_down = excluded.difficulty_down,
  rare_bonus = excluded.rare_bonus, speed = excluded.speed;

-- 2) 상점 카탈로그: 카테고리·슬롯 'rod' 추가(기존 값은 그대로 유지).
alter table public.pixel_item_catalog drop constraint if exists pixel_item_catalog_category_check;
alter table public.pixel_item_catalog add constraint pixel_item_catalog_category_check check (category in ('avatar','furniture','pet','rod'));
alter table public.pixel_item_catalog drop constraint if exists pixel_item_catalog_slot_check;
alter table public.pixel_item_catalog add constraint pixel_item_catalog_slot_check check (slot in ('top','bottom','shoes','hair','eyes','furniture','pet','rod'));
-- 황금 낚싯대는 tier 4다. tier를 3까지로 막는 검사 제약이 있으면 1~4로 넓힌다(없으면 아무것도 안 함).
do $widen_tier$
declare r record;
begin
  for r in select con.conname from pg_constraint con
            where con.conrelid = 'public.pixel_item_catalog'::regclass and con.contype = 'c'
              and pg_get_constraintdef(con.oid) ~ '\mtier\M' loop
    execute format('alter table public.pixel_item_catalog drop constraint %I', r.conname);
    execute 'alter table public.pixel_item_catalog add constraint pixel_item_catalog_tier_check check (tier between 1 and 4)';
  end loop;
end $widen_tier$;

insert into public.pixel_item_catalog(item_id,category,slot,price,asset_key,display_name,tier,stackable) values
  ('rod_bamboo','rod','rod',80,'bamboo','대나무 낚싯대',1,false),
  ('rod_steel','rod','rod',200,'steel','강철 낚싯대',2,false),
  ('rod_lucky','rod','rod',400,'lucky','행운의 낚싯대',3,false),
  ('rod_gold','rod','rod',700,'gold','황금 낚싯대',4,false)
on conflict (item_id) do update set category=excluded.category,slot=excluded.slot,price=excluded.price,
  asset_key=excluded.asset_key,display_name=excluded.display_name,tier=excluded.tier,stackable=excluded.stackable;

-- 3) 장착한 낚싯대(사용자당 1줄). 소유는 복합 FK가 보장하고, 쓰기는 equip_pixel_rod만 한다.
create table if not exists public.pixel_rod_equipment (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  rod_id text references pixel_private.fish_rods(id),
  updated_at timestamptz not null default now(),
  foreign key (user_id, rod_id) references public.pixel_item_ownership(user_id, item_id) on delete cascade
);
alter table public.pixel_rod_equipment enable row level security;
revoke all on public.pixel_rod_equipment from public, anon, authenticated;
grant select on public.pixel_rod_equipment to authenticated;
drop policy if exists rod_read_own on public.pixel_rod_equipment;
create policy rod_read_own on public.pixel_rod_equipment for select to authenticated using (user_id = (select auth.uid()));

-- 4) 캐스트 행에 낚싯대 효과·최종 난이도·피티/대물 표시를 적어 둔다(끝낼 때 다시 계산하지 않음).
--    v3 때 만든 대기 캐스트는 difficulty가 null → 끝낼 때 예전 계산(속도 1)으로 처리한다.
alter table public.pixel_fish_casts
  add column if not exists rod_id text,
  add column if not exists rod_tier smallint not null default 0,
  add column if not exists rod_speed numeric(4,2) not null default 1,
  add column if not exists difficulty numeric(4,2),
  add column if not exists pity boolean not null default false,
  add column if not exists trophy boolean not null default false;

-- 5) 피티 건너뛰기 표시(비공개). 피티로 정한 캐스트를 놓치면 true, 다음 시작에서 읽고 바로 false로.
create table if not exists pixel_private.fish_pity_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  skip_next boolean not null default false
);
alter table pixel_private.fish_pity_state enable row level security;
revoke all on pixel_private.fish_pity_state from public, anon, authenticated, service_role;

-- 6) 지금 쓸 수 있는 낚싯대: 장착했고 아직 가지고 있는 것만(아니면 기본 낚싯대 = null).
create or replace function pixel_private.fish_active_rod(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select e.rod_id from public.pixel_rod_equipment e
    join public.pixel_item_ownership o on o.user_id = e.user_id and o.item_id = e.rod_id
    join pixel_private.fish_rods r on r.id = e.rod_id
   where e.user_id = p_user;
$$;

-- 7) equip_pixel_rod — null이면 해제. 가지고 있지 않거나 낚싯대가 아니면 거절.
create or replace function pixel_private.equip_pixel_rod(p_item_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  v_tier smallint := 0;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_item_id is not null then
    select tier into v_tier from pixel_private.fish_rods where id = p_item_id;
    if v_tier is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
    if not exists (select 1 from public.pixel_item_ownership where user_id = u and item_id = p_item_id) then
      return jsonb_build_object('ok', false, 'reason', 'not_owned');
    end if;
  end if;
  insert into public.pixel_rod_equipment (user_id, rod_id, updated_at) values (u, p_item_id, now())
  on conflict (user_id) do update set rod_id = excluded.rod_id, updated_at = excluded.updated_at;
  return jsonb_build_object('ok', true, 'rod', jsonb_build_object('id', p_item_id, 'tier', coalesce(v_tier, 0)));
end $$;

-- 8) get_pixel_fishing_state — v2 본문 + 'rod'.
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
    'rod', jsonb_build_object('id', v_rod, 'tier', coalesce((select tier from pixel_private.fish_rods where id = v_rod), 0)),
    'album', coalesce((
      select jsonb_agg(jsonb_build_object('speciesId', a.species_id, 'count', a.cnt, 'bestCm', a.best, 'firstAt', a.first_at) order by s.sort_order)
        from (select species_id, count(*) as cnt, max(length_cm) as best, min(caught_at) as first_at
                from public.pixel_fish_catches where user_id = u group by species_id) a
        join public.pixel_fish_species s on s.id = a.species_id), '[]'::jsonb));
end $$;

-- 9) start_pixel_cast — v3 본문 + 낚싯대·어려운 물고기 굴림·피티 35%/건너뛰기.
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
  if v_fish.id is null and random() * 100 < 15 + v_bonus then
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
  v_difficulty := round(greatest(1, v_difficulty - v_down), 2);
  insert into pixel_private.fish_start_throttle (user_id, started_at) values (u, clock_timestamp())
  on conflict (user_id) do update set started_at = excluded.started_at;

  insert into public.pixel_fish_casts (user_id, species_id, length_cm, expires_at, kst_date, phase, weather, pet, bite_delay_ms,
    rod_id, rod_tier, rod_speed, difficulty, pity, trophy)
  values (u, v_fish.id, v_len, now() + interval '90 seconds', c.kst_date, c.phase, c.weather, v_pet, v_delay,
    v_rod.id, coalesce(v_rod.tier, 0), v_speed, v_difficulty, v_forced, v_trophy)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'castId', v_id, 'shadow', v_fish.shadow, 'biteDelayMs', v_delay,
    'difficulty', v_difficulty, 'big', v_len >= v_fish.min_cm + 0.8 * (v_fish.max_cm - v_fish.min_cm), 'remaining', -1, 'pattern', v_pattern, 'hint', case when v_pet = 'pet_dog' and v_fish.rarity in ('rare','legendary') then 'sparkle' end,
    'rod', jsonb_build_object('id', v_rod.id, 'tier', coalesce(v_rod.tier, 0)), 'speed', v_speed, 'trophy', v_trophy);
end $$;

-- 10) finish_pixel_cast — 시작할 때 적어 둔 난이도·속도로만 판단한다. 놓친 피티는 다음 피티를 쉬게 한다.
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

  return jsonb_build_object('ok', true, 'landed', true, 'speciesId', k.species_id, 'lengthCm', k.length_cm,
    'rarity', s.rarity, 'isNew', v_prev_count = 0,
    'isBig', k.length_cm >= s.min_cm + 0.8 * (s.max_cm - s.min_cm),
    'isPersonalBest', v_prev_count > 0 and k.length_cm > v_prev_best,
    'remaining', -1);
end $$;

-- 11) 권한: 구현은 pixel_private, public에는 invoker 래퍼만.
revoke all on function pixel_private.fish_active_rod(uuid) from public, anon, authenticated, service_role;
revoke all on function pixel_private.get_pixel_fishing_state(text, text), pixel_private.start_pixel_cast(text, text, text),
  pixel_private.finish_pixel_cast(uuid, boolean), pixel_private.equip_pixel_rod(text) from public, anon, service_role;
grant execute on function pixel_private.get_pixel_fishing_state(text, text), pixel_private.start_pixel_cast(text, text, text),
  pixel_private.finish_pixel_cast(uuid, boolean), pixel_private.equip_pixel_rod(text) to authenticated;

create or replace function public.equip_pixel_rod(p_item_id text)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select pixel_private.equip_pixel_rod(p_item_id);
$$;
revoke all on function public.equip_pixel_rod(text) from public, anon, authenticated, service_role;
grant execute on function public.equip_pixel_rod(text) to authenticated;

do $verify_pixel_fishing_v4$
begin
  if has_function_privilege('anon', 'public.equip_pixel_rod(text)', 'EXECUTE') then
    raise exception 'Anonymous role can execute equip_pixel_rod';
  end if;
  if has_table_privilege('authenticated', 'public.pixel_rod_equipment', 'INSERT')
     or has_table_privilege('authenticated', 'public.pixel_rod_equipment', 'UPDATE') then
    raise exception 'Students must equip rods only through equip_pixel_rod';
  end if;
  if (select count(*) from public.pixel_item_catalog where category = 'rod') <> 4
     or (select count(*) from pixel_private.fish_rods) <> 4 then
    raise exception 'Expected 4 rods in catalog and fish_rods';
  end if;
end;
$verify_pixel_fishing_v4$;
