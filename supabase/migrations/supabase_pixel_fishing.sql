-- 강가의 하루(낚시) — docs/pixel-world/FISHING_SPEC.md의 서버 쪽.
-- 서버가 기준이다: 시간대(KST)·날씨·어떤 물고기가 물지·길이는 모두 여기서 정한다. 클라이언트는 결과만 보여 준다.
-- 포인트는 절대 건드리지 않는다(profiles.point_adjustment / bonus_points 모두 손대지 않음). 두 번째 화폐도 없다.
-- 여러 번 적용해도 안전하다(if not exists / create or replace / 시드 upsert).
--
-- 규칙 요약
--   * 하루(KST) 6마리 = 성공해서 낚은 횟수. 놓치거나 너무 빨리 당기면 횟수를 쓰지 않는다.
--   * 캐스트는 사용자당 1개만 대기, 90초 뒤 만료. 대기 캐스트 행에는 물고기 정체가 있으므로 학생은 읽을 수 없다.
--   * 피티: 최근 5마리가 모두 이미 잡아 본 종이면, 지금 나올 수 있는 안 잡아 본 종 중에서 (희귀도 가중치로) 하나를 보장.
--   * 펫(실제로 데리고 있는 활성 펫만): 강아지 반짝임·희귀 이상 hint, 비둘기 하루 힌트, 곰 길이 +8%(최대 max·1.08).
--   * 날씨 = FNV-1a 32비트('YYYY-MM-DD') % 100: 0–24 비, 25–49 흐림, 나머지 맑음.
--     TS 쌍둥이: src/features/pixel-world-phaser/logic/worldClock.ts (단위 테스트가 같은 값을 확인).
--   * 관리자만 p_override_clock('HH:MM')·p_override_weather를 쓸 수 있다. 학생이 넘기면 조용히 무시한다.
--     덮어쓰기는 시간대·날씨만 바꾸고 날짜(하루 6마리 계산)는 바꾸지 않는다.

create schema if not exists pixel_private;
revoke all on schema pixel_private from public, anon;
grant usage on schema pixel_private to authenticated;

-- 1) 물고기 도감(시드). logic/fishCatalog.ts와 한 글자도 다르면 안 된다 — 단위 테스트가 아래 values를 파싱해 대조한다.
--    phases/weather가 null이면 '언제든'.
create table if not exists public.pixel_fish_species (
  id text primary key,
  name text not null,
  rarity text not null check (rarity in ('common','uncommon','rare','legendary')),
  phases text[] check (phases is null or phases <@ array['morning','day','evening','night']),
  weather text[] check (weather is null or weather <@ array['clear','cloudy','rain']),
  min_cm numeric(5,1) not null check (min_cm > 0),
  max_cm numeric(5,1) not null,
  shadow text not null check (shadow in ('S','M','L')),
  sort_order smallint not null,
  check (max_cm > min_cm)
);

insert into public.pixel_fish_species (id, name, rarity, phases, weather, min_cm, max_cm, shadow, sort_order) values
  ('pirami', '피라미', 'common', null, null, 6, 12, 'S', 1),
  ('buri', '붕어', 'common', null, null, 10, 25, 'M', 2),
  ('minnow', '송사리', 'common', array['morning','day'], null, 2, 4, 'S', 3),
  ('catfish_small', '동자개', 'uncommon', array['evening','night'], null, 12, 25, 'M', 4),
  ('carp', '잉어', 'uncommon', null, null, 30, 70, 'L', 5),
  ('mandarin', '쏘가리', 'uncommon', array['day','evening'], array['clear','cloudy'], 20, 45, 'M', 6),
  ('eel', '뱀장어', 'rare', array['night'], null, 40, 90, 'L', 7),
  ('catfish', '메기', 'rare', array['evening','night'], array['rain'], 30, 80, 'L', 8),
  ('goby', '꺽지', 'uncommon', array['morning','day'], null, 10, 20, 'S', 9),
  ('trout', '산천어', 'rare', array['morning'], array['clear'], 20, 35, 'M', 10),
  ('moonfish', '달빛 피라미', 'legendary', array['night'], array['clear'], 8, 14, 'S', 11),
  ('rainbow_koi', '무지개 잉어', 'legendary', null, array['rain'], 40, 80, 'L', 12)
on conflict (id) do update set name = excluded.name, rarity = excluded.rarity, phases = excluded.phases,
  weather = excluded.weather, min_cm = excluded.min_cm, max_cm = excluded.max_cm, shadow = excluded.shadow,
  sort_order = excluded.sort_order;

-- 2) 낚은 물고기(성공한 것만, 한 마리 한 행). 쓰기는 finish_pixel_cast만 한다.
create table if not exists public.pixel_fish_catches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  species_id text not null references public.pixel_fish_species(id),
  length_cm numeric(5,1) not null check (length_cm > 0),
  caught_at timestamptz not null default now(),
  kst_date date not null,
  phase text not null check (phase in ('morning','day','evening','night')),
  weather text not null check (weather in ('clear','cloudy','rain')),
  pet text
);
create index if not exists pixel_fish_catches_user_day on public.pixel_fish_catches(user_id, kst_date);
create index if not exists pixel_fish_catches_user_time on public.pixel_fish_catches(user_id, caught_at desc);
create index if not exists pixel_fish_catches_time on public.pixel_fish_catches(caught_at);

-- 3) 대기 중인 캐스트(사용자당 최대 1개, 끝나면 지운다). 스펙 열 외에 낚은 행을 만들 때 필요한
--    kst_date/phase/weather/pet/bite_delay_ms를 함께 들고 있다.
create table if not exists public.pixel_fish_casts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  species_id text not null references public.pixel_fish_species(id),
  length_cm numeric(5,1) not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  kst_date date not null,
  phase text not null,
  weather text not null,
  pet text,
  bite_delay_ms integer not null
);
create unique index if not exists pixel_fish_casts_one_per_user on public.pixel_fish_casts(user_id);

alter table public.pixel_fish_species enable row level security;
alter table public.pixel_fish_catches enable row level security;
alter table public.pixel_fish_casts enable row level security;
revoke all on public.pixel_fish_species, public.pixel_fish_catches, public.pixel_fish_casts from public, anon, authenticated;
grant select on public.pixel_fish_species, public.pixel_fish_catches to authenticated;
-- 캐스트 표는 아무 권한도 주지 않는다(물고기 정체가 들어 있음). 함수만 접근한다.
drop policy if exists pixel_fish_species_read on public.pixel_fish_species;
create policy pixel_fish_species_read on public.pixel_fish_species for select to authenticated using (true);
drop policy if exists pixel_fish_catches_read on public.pixel_fish_catches;
create policy pixel_fish_catches_read on public.pixel_fish_catches for select to authenticated using ((select auth.uid()) = user_id);

-- 4) 도우미 함수(pixel_private, 바깥 노출 없음)
create or replace function pixel_private.fish_fnv1a(p_text text)
returns bigint language plpgsql immutable strict set search_path = '' as $$
declare
  b bytea := convert_to(p_text, 'UTF8');
  h bigint := 2166136261;
begin
  for i in 0 .. length(b) - 1 loop
    h := ((h # get_byte(b, i)) * 16777619) % 4294967296;
  end loop;
  return h;
end $$;

create or replace function pixel_private.fish_weather_for(p_date date)
returns text language sql immutable strict set search_path = '' as $$
  select case when r < 25 then 'rain' when r < 50 then 'cloudy' else 'clear' end
    from (select pixel_private.fish_fnv1a(to_char(p_date, 'YYYY-MM-DD')) % 100 as r) x;
$$;

create or replace function pixel_private.fish_phase_for(p_minutes integer)
returns text language sql immutable strict set search_path = '' as $$
  select case when m >= 360 and m < 660 then 'morning' when m >= 660 and m < 1020 then 'day'
              when m >= 1020 and m < 1200 then 'evening' else 'night' end
    from (select ((p_minutes % 1440) + 1440) % 1440 as m) x;
$$;

-- 지금의 KST 날짜·분·시간대·날씨. 덮어쓰기는 관리자에게만 적용된다.
create or replace function pixel_private.fish_clock(p_override_clock text, p_override_weather text,
  out kst_date date, out minutes integer, out phase text, out weather text)
language plpgsql stable security definer set search_path = '' as $$
declare
  t timestamp := now() at time zone 'Asia/Seoul';
  v_admin boolean := private.is_current_user_admin();
begin
  kst_date := t::date;
  minutes := extract(hour from t)::integer * 60 + extract(minute from t)::integer;
  if v_admin and p_override_clock ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    minutes := split_part(p_override_clock, ':', 1)::integer * 60 + split_part(p_override_clock, ':', 2)::integer;
  end if;
  phase := pixel_private.fish_phase_for(minutes);
  weather := case when v_admin and p_override_weather in ('clear','cloudy','rain') then p_override_weather
                  else pixel_private.fish_weather_for(kst_date) end;
end $$;

-- 실제로 데리고 있는 활성 펫(pixel_pet_equipment의 FK가 소유를 보장). 없으면 null(빌린 오리 = 혜택 없음).
create or replace function pixel_private.fish_active_pet(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select e.active_pet from public.pixel_pet_equipment e
    join public.pixel_item_ownership o on o.user_id = e.user_id and o.item_id = e.active_pet
   where e.user_id = p_user;
$$;

-- "밤에 맑으면 달빛 피라미 친구가 나온대요!" — fishingAdapterMock.ts의 fishHintText와 같은 문장.
create or replace function pixel_private.fish_hint_text(p_species text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(
      case when s.phases is null then '' else array_to_string(array(
        select case p when 'morning' then '아침' when 'day' then '낮' when 'evening' then '저녁' else '밤' end
          from unnest(s.phases) with ordinality u(p, n) order by n), '·') || '에 ' end
      || case when s.weather is null then ''
              when cardinality(s.weather) = 1 then case s.weather[1] when 'clear' then '맑으면 ' when 'cloudy' then '흐리면 ' else '비가 오면 ' end
              when 'rain' = any(s.weather) then '' else '비가 안 오면 ' end, ''), '언제든 ')
    || s.name || ' 친구가 나온대요!'
    from public.pixel_fish_species s where s.id = p_species;
$$;

-- 5) get_pixel_fishing_state
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
  if v_pet = 'pet_dog' and v_used < 6 then
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
    'remaining', greatest(0, 6 - v_used), 'sparkleShadow', v_spark, 'pigeonHint', v_hint,
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
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  -- 같은 학생의 시작/끝을 한 줄로 세운다(하루 6마리·대기 1개를 경쟁 없이 지키기 위해).
  perform pg_advisory_xact_lock(hashtextextended('pixel_fish:' || u::text, 0));
  select * into c from pixel_private.fish_clock(p_override_clock, p_override_weather);

  delete from public.pixel_fish_casts where user_id = u and expires_at <= now();
  if exists (select 1 from public.pixel_fish_casts where user_id = u) then
    return jsonb_build_object('ok', false, 'reason', 'pending');
  end if;
  if (select count(*) from public.pixel_fish_catches where user_id = u and kst_date = c.kst_date) >= 6 then
    return jsonb_build_object('ok', false, 'reason', 'budget');
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

  insert into public.pixel_fish_casts (user_id, species_id, length_cm, expires_at, kst_date, phase, weather, pet, bite_delay_ms)
  values (u, v_fish.id, v_len, now() + interval '90 seconds', c.kst_date, c.phase, c.weather, v_pet, v_delay)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'castId', v_id, 'shadow', v_fish.shadow, 'biteDelayMs', v_delay,
    'pattern', v_pattern, 'hint', case when v_pet = 'pet_dog' and v_fish.rarity in ('rare','legendary') then 'sparkle' end);
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
  v_used integer;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pixel_fish:' || u::text, 0));
  delete from public.pixel_fish_casts where id = p_cast_id and user_id = u returning * into k;
  if k.id is null or k.expires_at <= now() then return jsonb_build_object('ok', false); end if;
  -- 입질 전에 "낚았다"가 오면(서버 기준 시각) 너무 빨랐던 것 — 공짜 재도전으로 처리한다.
  if not coalesce(p_landed, false) or clock_timestamp() < k.created_at + make_interval(secs => greatest(k.bite_delay_ms - 250, 0) / 1000.0) then
    return jsonb_build_object('ok', true, 'landed', false);
  end if;
  select count(*) into v_used from public.pixel_fish_catches where user_id = u and kst_date = k.kst_date;
  if v_used >= 6 then return jsonb_build_object('ok', false); end if;

  select * into s from public.pixel_fish_species where id = k.species_id;
  select count(*), max(length_cm) into v_prev_count, v_prev_best
    from public.pixel_fish_catches where user_id = u and species_id = k.species_id;
  insert into public.pixel_fish_catches (user_id, species_id, length_cm, kst_date, phase, weather, pet)
  values (u, k.species_id, k.length_cm, k.kst_date, k.phase, k.weather, k.pet);

  return jsonb_build_object('ok', true, 'landed', true, 'speciesId', k.species_id, 'lengthCm', k.length_cm,
    'rarity', s.rarity, 'isNew', v_prev_count = 0,
    'isBig', k.length_cm >= s.min_cm + 0.8 * (s.max_cm - s.min_cm),
    'isPersonalBest', v_prev_count > 0 and k.length_cm > v_prev_best,
    'remaining', greatest(0, 6 - (v_used + 1)));
end $$;

-- 8) get_class_fish_board — 이번 주(KST 월요일 시작, 주간 토마토 대회와 같은 관용구) 종마다 가장 큰 1마리, 상위 10.
--    대회와 같은 범위(앱 전체 = 한 반)이며 선생님(app_admins)의 시험 낚시는 뺀다.
--    이름·user_id는 절대 내보내지 않는다. 얼굴은 시험 친구 풀이와 같은 규칙:
--    md5('exam-peer-face:' || user_id) 앞 8자리 % 33 → 같은 학생은 어디서나 같은 동물.
create or replace function pixel_private.get_class_fish_board()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  v_week_start timestamptz := timezone('Asia/Seoul', date_trunc('week', timezone('Asia/Seoul', now())));
  v_faces constant text[] := array['🐶','🐱','🐰','🦊','🐼','🐨','🐯','🦁','🐻','🐹','🐧','🐥','🐸','🐵','🐷','🐮','🐙','🦄',
    '🐭','🦔','🦦','🦥','🐳','🐬','🦭','🐢','🦋','🐝','🐞','🦉','🦆','🐤','🐣'];
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('speciesId', b.species_id, 'lengthCm', b.length_cm,
               'animal', v_faces[1 + (('x' || substr(md5('exam-peer-face:' || b.user_id::text), 1, 8))::bit(32)::bigint % array_length(v_faces, 1))::integer],
               'caughtAt', b.caught_at) order by b.length_cm desc, b.caught_at)
        from (
          select * from (
            select distinct on (k.species_id) k.species_id, k.length_cm, k.user_id, k.caught_at
              from public.pixel_fish_catches k
             where k.caught_at >= v_week_start and k.caught_at < v_week_start + interval '7 days'
               and not exists (select 1 from private.app_admins ad where ad.user_id = k.user_id)
             order by k.species_id, k.length_cm desc, k.caught_at
          ) best order by length_cm desc, caught_at limit 10
        ) b), '[]'::jsonb),
    -- "우리 반이 찾은 물고기 n/12": 지금까지(전체 기간) 누구든 한 번이라도 낚은 종 수.
    'classSpecies', (select count(distinct k.species_id) from public.pixel_fish_catches k
                      where not exists (select 1 from private.app_admins ad where ad.user_id = k.user_id)));
end $$;

-- 9) 권한: 구현은 pixel_private(외부 비노출), public에는 invoker 래퍼만.
revoke all on function pixel_private.fish_fnv1a(text), pixel_private.fish_weather_for(date), pixel_private.fish_phase_for(integer),
  pixel_private.fish_clock(text, text), pixel_private.fish_active_pet(uuid), pixel_private.fish_hint_text(text),
  pixel_private.get_pixel_fishing_state(text, text), pixel_private.start_pixel_cast(text, text, text),
  pixel_private.finish_pixel_cast(uuid, boolean), pixel_private.get_class_fish_board()
  from public, anon, authenticated, service_role;
grant execute on function pixel_private.get_pixel_fishing_state(text, text), pixel_private.start_pixel_cast(text, text, text),
  pixel_private.finish_pixel_cast(uuid, boolean), pixel_private.get_class_fish_board() to authenticated;

create or replace function public.get_pixel_fishing_state(p_override_clock text default null, p_override_weather text default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select pixel_private.get_pixel_fishing_state(p_override_clock, p_override_weather);
$$;
create or replace function public.start_pixel_cast(p_pet text, p_override_clock text default null, p_override_weather text default null)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select pixel_private.start_pixel_cast(p_pet, p_override_clock, p_override_weather);
$$;
create or replace function public.finish_pixel_cast(p_cast_id uuid, p_landed boolean)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select pixel_private.finish_pixel_cast(p_cast_id, p_landed);
$$;
create or replace function public.get_class_fish_board()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select pixel_private.get_class_fish_board();
$$;
revoke all on function public.get_pixel_fishing_state(text, text), public.start_pixel_cast(text, text, text),
  public.finish_pixel_cast(uuid, boolean), public.get_class_fish_board()
  from public, anon, authenticated, service_role;
grant execute on function public.get_pixel_fishing_state(text, text), public.start_pixel_cast(text, text, text),
  public.finish_pixel_cast(uuid, boolean), public.get_class_fish_board() to authenticated;

do $verify_pixel_fishing$
begin
  if has_function_privilege('anon', 'public.start_pixel_cast(text, text, text)', 'EXECUTE') then
    raise exception 'Anonymous role can execute start_pixel_cast';
  end if;
  if has_table_privilege('authenticated', 'public.pixel_fish_casts', 'SELECT')
     or has_table_privilege('authenticated', 'public.pixel_fish_catches', 'INSERT') then
    raise exception 'Students must not read casts or insert catches directly';
  end if;
  if (select count(*) from public.pixel_fish_species) <> 12 then
    raise exception 'pixel_fish_species must have 12 rows';
  end if;
  if pixel_private.fish_fnv1a('a') <> 3826002220 then
    raise exception 'fish_fnv1a does not match FNV-1a 32';
  end if;
end;
$verify_pixel_fishing$;
