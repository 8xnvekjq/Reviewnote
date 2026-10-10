-- 펫 효과 개편(2026-10-11, 선생님 결정): 강아지 = 낚시 경험치 +10%, 비둘기 = 놓칠 뻔하면 하루 2번 버텨 주기(화면),
-- 오리 = 릴 원 +10%(화면). 예전 강아지 반짝 그림자·비둘기 힌트는 없앤다(값은 null로 남겨 예전 화면과 호환).
begin;

create or replace function pixel_private.get_pixel_fishing_state(p_override_clock text default null, p_override_weather text default null)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $function$
declare
  u uuid := auth.uid();
  c record;
  v_rod text;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into c from pixel_private.fish_clock(p_override_clock, p_override_weather);
  v_rod := pixel_private.fish_active_rod(u);
  return jsonb_build_object(
    'kstDate', to_char(c.kst_date, 'YYYY-MM-DD'), 'phase', c.phase, 'weather', c.weather,
    'remaining', -1, 'sparkleShadow', null, 'pigeonHint', null,
    'level', pixel_private.get_pixel_level(),
    'bait', jsonb_build_object('charges', coalesce((select charges from public.pixel_bait where user_id=u), 0)),
    'rod', jsonb_build_object('id', v_rod, 'tier', coalesce((select tier from pixel_private.fish_rods where id = v_rod), 0)),
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
  v_xp_gain jsonb;
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
  select count(*), max(length_cm) into v_prev_count, v_prev_best
    from public.pixel_fish_catches where user_id = u and species_id = k.species_id;
  insert into public.pixel_fish_catches (user_id, species_id, length_cm, kst_date, phase, weather, pet)
  values (u, k.species_id, k.length_cm, k.kst_date, k.phase, k.weather, k.pet);

  v_xp := (case s.rarity when 'common' then 5 when 'uncommon' then 10 when 'rare' then 25 else 60 end) + case when k.trophy then 15 else 0 end;
  -- 강아지: 낚시 경험치 +10%(던질 때 데리고 있던 펫 기준, 반올림).
  if k.pet = 'pet_dog' then v_xp := round(v_xp * 1.1); end if;
  v_xp_gain := pixel_private.award_pixel_xp(u, v_xp);

  return jsonb_build_object('ok', true, 'landed', true, 'speciesId', k.species_id, 'lengthCm', k.length_cm,
    'rarity', s.rarity, 'isNew', v_prev_count = 0,
    'isBig', k.length_cm >= s.min_cm + 0.8 * (s.max_cm - s.min_cm),
    'isPersonalBest', v_prev_count > 0 and k.length_cm > v_prev_best,
    'remaining', -1, 'xpGain', v_xp_gain);
end $function$;

commit;
