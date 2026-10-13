-- Pixel World 텃밭(2026-10-20) 3/3 — 칸마다 도구로: 괭이(갈기)·씨앗(토마토/딸기)·물뿌리개·수확·스프링클러.
-- 이름은 그대로 둔다: public.get_pixel_farm(), public.act_pixel_farm(p_plot, p_action, p_revision).
--   p_plot = 칸 번호(y*8+x), p_action = 'till' | 'plant_tomato' | 'plant_strawberry' | 'water' | 'harvest'
--   | 'place_sprinkler' | 'remove_sprinkler' (예전 'plant'는 'plant_tomato'로 보고, 잔디면 먼저 갈아 준다).
-- 규칙(클라이언트 src/features/pixel-room/farm/gardenModel.ts와 같은 값):
--   · 토마토: 예전 그대로 — 4일, 하루 한 번 물(최대 4번), 복습 보너스, 크기 점수, 수확물·출품·주간 대회. 한 번 딴다.
--   · 딸기: 64시간(토마토의 2/3). 따면 '자람'으로 돌아가 32시간 뒤 다시 익는다. 세 번 따면 칸은 마른 흙.
--     한 번 딸 때 1알, 그동안 한 번이라도 물을 받았으면 2알 — 가방으로 간다(출품·대회 없음).
--   · 비 오는 KST 날(낚시와 같은 pixel_private.fish_weather_for + 관리자 덮어쓰기)에는 심긴 칸이 모두 그날 물을 받은
--     것으로 친다(돌봄은 하루 한 번만). 스프링클러는 놓은 날부터 매일 둘레 8칸에 물을 준다.
--   · 자동 물주기는 읽을 때·움직일 때 서버가 지난 날까지 한꺼번에 정산한다(pixel_private.garden_settle) —
--     학생이 그날 들어오지 않았어도 비 온 날·스프링클러 날은 돌봄으로 남는다. 지난 날의 관리자 날씨 덮어쓰기는
--     기억하지 않는다(덮어쓰기는 지금 켜져 있는 동안의 '오늘'에만 적용된다).
begin;

-- 텃밭 크기. 밭 넓히기는 이 값(나중에는 학생별 값)과 구매만 바꾼다. 칸 번호는 y*8+x라 넓혀도 그대로다.
create or replace function pixel_private.garden_dims(p_user uuid, out cols integer, out rows integer)
language sql stable set search_path = '' as $$ select 6, 4 $$;
create or replace function pixel_private.garden_cell_ok(p_user uuid, p_index integer) returns boolean
language sql stable set search_path = '' as $$
  select p_index is not null and p_index between 0 and 63 and p_index % 8 < d.cols and p_index / 8 < d.rows
  from pixel_private.garden_dims(p_user) d;
$$;
-- 작물 규칙.
create or replace function pixel_private.garden_crop_rule(p_type text, out grow interval, out regrow interval, out max_harvests integer, out care_cap integer, out xp integer)
language sql immutable set search_path = '' as $$
  select case p_type when 'strawberry' then interval '64 hours' else interval '4 days' end,
    case p_type when 'strawberry' then interval '32 hours' end,
    case p_type when 'strawberry' then 3 else 1 end, 4,
    case p_type when 'strawberry' then 10 else 40 end;
$$;

-- 그날 비가 왔나. 오늘은 지금 날씨(관리자 덮어쓰기 포함), 지난 날은 그날의 정해진 날씨.
create or replace function pixel_private.garden_rain(p_day date) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_day = (now() at time zone 'Asia/Seoul')::date
    then (select weather from pixel_private.fish_clock(null, null)) = 'rain'
    else pixel_private.fish_weather_for(p_day) = 'rain' end;
$$;

-- 비·스프링클러 물주기 정산(같은 학생의 다른 요청과는 advisory lock으로 줄 세운다 — 부르는 쪽이 잡는다).
create or replace function pixel_private.garden_settle(p_user uuid, p_now timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (p_now at time zone 'Asia/Seoul')::date;
  v_rain_today boolean := pixel_private.garden_rain(v_today);
  r record; d date; v_cap integer;
begin
  for r in select p.plot_index, c.id, c.crop_type, c.planted_at, c.ready_at
      from public.pixel_farm_plots p join public.pixel_farm_crops c on c.user_id = p.user_id and c.id = p.crop_id
      where p.user_id = p_user and c.harvested_at is null
  loop
    v_cap := (select care_cap from pixel_private.garden_crop_rule(r.crop_type));
    for d in select g::date from generate_series((r.planted_at at time zone 'Asia/Seoul')::date::timestamp,
        least(v_today, (r.ready_at at time zone 'Asia/Seoul')::date)::timestamp, interval '1 day') g
    loop
      continue when not ((d = v_today and v_rain_today) or (d < v_today and pixel_private.fish_weather_for(d) = 'rain')
        or exists (select 1 from public.pixel_farm_plots s where s.user_id = p_user and s.sprinkler_since is not null
          and s.sprinkler_since <= d and s.plot_index <> r.plot_index
          and abs(s.plot_index % 8 - r.plot_index % 8) <= 1 and abs(s.plot_index / 8 - r.plot_index / 8) <= 1));
      -- 그날 이미 돌봄이 있으면(직접 줬거나 이미 정산) 그대로. 돌봄 상한(4번)도 지킨다.
      continue when exists (select 1 from public.pixel_farm_care where crop_id = r.id and care_day = d);
      update public.pixel_farm_crops set care_count = care_count + 1,
          last_watered_on = greatest(coalesce(last_watered_on, d), d)
        where id = r.id and care_count < v_cap;
      if found then
        insert into public.pixel_farm_care(user_id, crop_id, care_day, watered_at)
          values (p_user, r.id, d, least(p_now, ((d + 1)::timestamp at time zone 'Asia/Seoul') - interval '1 second'));
      end if;
    end loop;
  end loop;
  -- 오늘 젖은 흙(보이는 모습): 비가 오면 간 칸 전부, 아니면 스프링클러 둘레의 간 칸.
  update public.pixel_farm_plots p set watered_on = v_today
    where p.user_id = p_user and p.soil = 'tilled' and p.watered_on is distinct from v_today
      and (v_rain_today or exists (select 1 from public.pixel_farm_plots s where s.user_id = p_user and s.sprinkler_since is not null
        and s.sprinkler_since <= v_today and s.plot_index <> p.plot_index
        and abs(s.plot_index % 8 - p.plot_index % 8) <= 1 and abs(s.plot_index / 8 - p.plot_index / 8) <= 1));
end $$;

-- 화면에 보낼 텃밭 전체. 예전 모양(serverNow·today·harvestCount·bestSize·lastHarvestSize·plots[index,revision,crop])에
-- 칸 상태(soil·wateredOn·sprinkler)와 작물 종류(type·harvests·maxHarvests), 날씨·스프링클러·오늘 상한을 더했다.
create or replace function pixel_private.garden_snapshot(p_user uuid, p_now timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_points integer; v_dims record; result jsonb;
begin
  select bonus_points into v_points from public.profiles where id = p_user;
  select * into v_dims from pixel_private.garden_dims(p_user);
  select jsonb_build_object('serverNow', p_now, 'today', (p_now at time zone 'Asia/Seoul')::date,
    'cols', v_dims.cols, 'rows', v_dims.rows,
    'rainToday', pixel_private.garden_rain((p_now at time zone 'Asia/Seoul')::date),
    'sprinklerOwned', exists (select 1 from public.pixel_item_ownership where user_id = p_user and item_id = 'tool_sprinkler'),
    'farmToday', pixel_private.farm_today(p_user),
    'harvestCount', (select count(*) from public.pixel_farm_crops where user_id = p_user and harvested_at is not null and crop_type = 'tomato'),
    'bestSize', (select max(size_score) from public.pixel_farm_crops where user_id = p_user),
    'lastHarvestSize', (select size_score from public.pixel_farm_crops where user_id = p_user and harvested_at is not null and crop_type = 'tomato' order by harvested_at desc limit 1),
    'plots', jsonb_agg(jsonb_build_object('index', n, 'revision', coalesce(p.revision, 0),
      'soil', case when c.id is not null then 'tilled' else coalesce(p.soil, 'grass') end,
      'wateredOn', p.watered_on, 'sprinkler', p.sprinkler_since is not null,
      'crop', case when c.id is null then null else jsonb_build_object('id', c.id, 'type', c.crop_type,
        'plantedAt', c.planted_at, 'readyAt', c.ready_at, 'careCount', c.care_count, 'lastWateredOn', c.last_watered_on,
        'harvests', c.harvests, 'maxHarvests', (select max_harvests from pixel_private.garden_crop_rule(c.crop_type)),
        'reviewGained', greatest(0, coalesce(v_points, 0) - coalesce(c.review_points_at_plant, coalesce(v_points, 0)))) end)
      order by n)) into result
  from (select y * 8 + x as n from generate_series(0, v_dims.rows - 1) y cross join generate_series(0, v_dims.cols - 1) x) cells
  left join public.pixel_farm_plots p on p.user_id = p_user and p.plot_index = cells.n
  left join public.pixel_farm_crops c on c.user_id = p_user and c.id = p.crop_id;
  return result;
end $$;

create or replace function pixel_private.garden_get() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); t timestamptz := clock_timestamp();
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pixel_garden:' || u::text, 0));
  perform pixel_private.garden_settle(u, t);
  return pixel_private.garden_snapshot(u, t);
end $$;

create or replace function public.get_pixel_farm() returns jsonb
language sql volatile security invoker set search_path = '' as $$ select pixel_private.garden_get(); $$;

create or replace function pixel_private.farm_action(p_plot integer, p_action text, p_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid(); p public.pixel_farm_plots%rowtype; c public.pixel_farm_crops%rowtype; rule record;
  t timestamptz; day date; result text := 'ok'; v_action text;
  v_max_care_days integer; v_care_ratio numeric; v_luck numeric; v_base_size integer;
  v_review_gained integer; v_review_ratio numeric; v_bonus_chance numeric; v_bonus_roll numeric;
  v_bonus_amount integer; v_size smallint; v_inputs jsonb; v_harvest jsonb := '{}'::jsonb;
  v_current_points integer; v_xp_gain jsonb; v_berries integer;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not coalesce(pixel_private.garden_cell_ok(u, p_plot), false) or p_action is null
    or p_action not in ('plant', 'till', 'plant_tomato', 'plant_strawberry', 'water', 'harvest', 'place_sprinkler', 'remove_sprinkler')
    or p_revision is null or p_revision < 0 then
    raise exception 'Invalid farm action' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pixel_garden:' || u::text, 0));
  t := clock_timestamp(); day := (t at time zone 'Asia/Seoul')::date;
  perform pixel_private.garden_settle(u, t);
  insert into public.pixel_farm_plots(user_id, plot_index) values (u, p_plot) on conflict do nothing;
  select * into p from public.pixel_farm_plots where user_id = u and plot_index = p_plot for update;
  -- 비교 후 교체(CAS): 다시 보내기·여러 기기에서 같은 칸을 눌러도 한 번만 일어난다.
  if p.revision <> p_revision then return pixel_private.garden_snapshot(u, t) || jsonb_build_object('result', 'changed'); end if;
  select * into c from public.pixel_farm_crops where user_id = u and id = p.crop_id;
  v_action := case when p_action = 'plant' then 'plant_tomato' else p_action end;

  if v_action = 'till' then
    if p.sprinkler_since is not null then result := 'blocked';
    elsif p.soil = 'tilled' or c.id is not null then result := 'already';
    else update public.pixel_farm_plots set soil = 'tilled', revision = revision + 1 where user_id = u and plot_index = p_plot;
    end if;

  elsif v_action in ('plant_tomato', 'plant_strawberry') then
    if c.id is not null then result := 'occupied';
    elsif p.sprinkler_since is not null then result := 'blocked';
    elsif p.soil <> 'tilled' and p_action <> 'plant' then result := 'untilled';
    else
      select * into rule from pixel_private.garden_crop_rule(case v_action when 'plant_strawberry' then 'strawberry' else 'tomato' end);
      select bonus_points into v_current_points from public.profiles where id = u;
      insert into public.pixel_farm_crops(user_id, plot_index, crop_type, planted_at, ready_at, review_points_at_plant)
        values (u, p_plot, case v_action when 'plant_strawberry' then 'strawberry' else 'tomato' end, t, t + rule.grow, coalesce(v_current_points, 0))
        returning * into c;
      -- 오늘 이미 젖은 흙에 심으면 오늘 돌봄 1번으로 친다(심고 바로 물 준 것과 같다).
      if p.watered_on = day then
        insert into public.pixel_farm_care(user_id, crop_id, care_day, watered_at) values (u, c.id, day, t);
        update public.pixel_farm_crops set care_count = 1, last_watered_on = day where id = c.id;
      end if;
      update public.pixel_farm_plots set crop_id = c.id, soil = 'tilled', revision = revision + 1 where user_id = u and plot_index = p_plot;
    end if;

  elsif v_action = 'water' then
    if p.soil <> 'tilled' and c.id is null then result := 'untilled';
    elsif p.sprinkler_since is not null then result := 'blocked';
    elsif c.id is null then
      if p.watered_on = day then result := 'already_watered';
      else update public.pixel_farm_plots set watered_on = day, revision = revision + 1 where user_id = u and plot_index = p_plot; end if;
    elsif t >= c.ready_at then result := 'ready';
    elsif exists (select 1 from public.pixel_farm_care where crop_id = c.id and care_day = day) then
      result := 'already_watered';
      update public.pixel_farm_plots set watered_on = day where user_id = u and plot_index = p_plot and watered_on is distinct from day;
    else
      if c.care_count < (select care_cap from pixel_private.garden_crop_rule(c.crop_type)) then
        insert into public.pixel_farm_care(user_id, crop_id, care_day, watered_at) values (u, c.id, day, t);
        update public.pixel_farm_crops set care_count = care_count + 1, last_watered_on = day where id = c.id;
      end if;
      update public.pixel_farm_plots set watered_on = day, revision = revision + 1 where user_id = u and plot_index = p_plot;
    end if;

  elsif v_action = 'harvest' then
    if c.id is null then result := 'changed';
    elsif t < c.ready_at then result := 'growing';
    elsif c.crop_type = 'strawberry' then
      select * into rule from pixel_private.garden_crop_rule('strawberry');
      v_berries := case when c.care_count > 0 then 2 else 1 end;
      perform pixel_private.bag_add_qty(u, 'crop', 'strawberry', v_berries);
      if c.harvests + 1 >= rule.max_harvests then
        update public.pixel_farm_crops set harvests = harvests + 1, harvested_at = t, status = 'spent' where id = c.id;
        update public.pixel_farm_plots set crop_id = null, revision = revision + 1 where user_id = u and plot_index = p_plot;
      else
        -- 다시 '자람'에서 시작: 이번 주기의 시작(planted_at)과 익는 때를 옮기고, 이번 주기의 돌봄을 처음부터 센다.
        update public.pixel_farm_crops set harvests = harvests + 1, planted_at = t, ready_at = t + rule.regrow, care_count = 0 where id = c.id;
        update public.pixel_farm_plots set revision = revision + 1 where user_id = u and plot_index = p_plot;
      end if;
      v_xp_gain := pixel_private.farm_award_xp(u, rule.xp);
      v_harvest := jsonb_build_object('cropType', 'strawberry', 'berries', v_berries, 'harvests', c.harvests + 1, 'maxHarvests', rule.max_harvests);
    else
      -- 토마토: 예전 수확(크기·복습 보너스) 그대로.
      v_max_care_days := least(4, greatest(1, ((c.ready_at at time zone 'Asia/Seoul')::date - (c.planted_at at time zone 'Asia/Seoul')::date) + 1));
      v_care_ratio := least(1.0, c.care_count::numeric / v_max_care_days);
      v_luck := (random() + random() + random()) / 3.0;
      v_base_size := greatest(10, least(100, round(40 + v_care_ratio * 30 + (v_luck - 0.5) * 40)));
      select bonus_points into v_current_points from public.profiles where id = u;
      v_review_gained := greatest(0, coalesce(v_current_points, 0) - coalesce(c.review_points_at_plant, coalesce(v_current_points, 0)));
      v_review_ratio := least(1.0, v_review_gained::numeric / 50.0);
      v_bonus_chance := 0.12 + v_review_ratio * 0.28;
      v_bonus_roll := random();
      if v_bonus_roll < v_bonus_chance then v_bonus_amount := round(6 + (random() + random()) / 2.0 * 12);
      else v_bonus_amount := 0; end if;
      v_size := greatest(10, least(100, v_base_size + v_bonus_amount))::smallint;
      v_inputs := jsonb_build_object('careCount', c.care_count, 'maxCareDays', v_max_care_days,
        'careRatio', round(v_care_ratio, 4), 'luckRoll', round(v_luck, 6), 'baseSize', v_base_size,
        'base', 40, 'careBonusMax', 30, 'luckSpread', 40,
        'reviewGained', v_review_gained, 'reviewRatio', round(v_review_ratio, 4),
        'bonusChance', round(v_bonus_chance, 4), 'bonusRoll', round(v_bonus_roll, 6), 'bonusAmount', v_bonus_amount);
      update public.pixel_farm_crops set harvested_at = t, harvests = 1, size_score = v_size, size_calc_version = 2, size_inputs = v_inputs where id = c.id;
      update public.pixel_farm_plots set crop_id = null, revision = revision + 1 where user_id = u and plot_index = p_plot;
      v_xp_gain := pixel_private.farm_award_xp(u, 40);
      v_harvest := jsonb_build_object('cropType', 'tomato', 'sizeScore', v_size, 'bonusApplied', v_bonus_amount > 0);
    end if;

  elsif v_action = 'place_sprinkler' then
    if not exists (select 1 from public.pixel_item_ownership where user_id = u and item_id = 'tool_sprinkler') then result := 'no_sprinkler';
    elsif c.id is not null then result := 'occupied';
    elsif p.sprinkler_since is not null then result := 'already';
    elsif exists (select 1 from public.pixel_farm_plots where user_id = u and sprinkler_since is not null) then result := 'sprinkler_elsewhere';
    else
      update public.pixel_farm_plots set sprinkler_since = day, revision = revision + 1 where user_id = u and plot_index = p_plot;
      perform pixel_private.garden_settle(u, t);  -- 놓은 날부터 둘레가 젖는다.
    end if;

  else -- remove_sprinkler
    if p.sprinkler_since is null then result := 'changed';
    else update public.pixel_farm_plots set sprinkler_since = null, revision = revision + 1 where user_id = u and plot_index = p_plot; end if;
  end if;

  return pixel_private.garden_snapshot(u, t) || jsonb_build_object('result', result)
    || case when v_harvest = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('harvest', v_harvest, 'xpGain', v_xp_gain) end;
end $$;

create or replace function public.act_pixel_farm(p_plot integer, p_action text, p_revision bigint)
returns jsonb language sql security invoker set search_path = '' as $$
  select pixel_private.farm_action(p_plot, p_action, p_revision);
$$;

revoke all on function pixel_private.garden_dims(uuid), pixel_private.garden_cell_ok(uuid, integer), pixel_private.garden_crop_rule(text),
  pixel_private.garden_rain(date), pixel_private.garden_settle(uuid, timestamptz), pixel_private.garden_snapshot(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function pixel_private.garden_get(), public.get_pixel_farm(), pixel_private.farm_action(integer, text, bigint),
  public.act_pixel_farm(integer, text, bigint) from public, anon, authenticated;
grant execute on function pixel_private.garden_get(), public.get_pixel_farm(), pixel_private.farm_action(integer, text, bigint),
  public.act_pixel_farm(integer, text, bigint) to authenticated;

commit;
