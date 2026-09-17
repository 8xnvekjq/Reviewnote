-- Crop size system. The final size is decided exactly once, atomically, inside the existing
-- harvest branch of pixel_private.farm_action — the same revision-CAS + row lock
-- (20260917155631_pixel_tomato_farm.sql) that already makes retries and duplicate harvests
-- no-ops for the crop lifecycle now also protects the size roll: there is no code path that can
-- compute or overwrite size_score for a crop a second time.
--
-- Formula (mirrors src/features/pixel-room/farm/farmModel.ts computeCropSize — keep both in sync):
--   careRatio  = min(1, care_count / maxCareDays)   -- maxCareDays = distinct KST calendar days
--                                                       the crop's planted..ready window touches
--   luckRoll   = (random()+random()+random())/3      -- bell-shaped 0..1, mean .5 (not flat)
--   size       = clamp(40 + careRatio*30 + (luckRoll-0.5)*40, 10, 100)
-- Diligent watering raises the AVERAGE size (mean +30 at full care vs none) without guaranteeing
-- the biggest tomato, and a missed day never fails or kills the crop — consistent with the
-- existing "watering is free, missing it doesn't kill the crop" design.
alter table public.pixel_farm_crops
  add column size_score smallint,
  add column size_calc_version smallint,
  add column size_inputs jsonb,
  add constraint pixel_farm_crops_size_range check (size_score is null or size_score between 1 and 100),
  -- One-directional on purpose: crops harvested before this feature shipped keep size_score null
  -- (nothing to honestly backfill), but a size can never appear on a crop that isn't harvested.
  add constraint pixel_farm_crops_size_requires_harvest check (size_score is null or harvested_at is not null);

create or replace function public.get_pixel_farm() returns jsonb language plpgsql security invoker set search_path = '' as $$
declare u uuid := auth.uid(); t timestamptz := clock_timestamp(); result jsonb;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select jsonb_build_object('serverNow',t,'today',(t at time zone 'Asia/Seoul')::date,
    'harvestCount',(select count(*) from public.pixel_farm_crops where user_id=u and harvested_at is not null),
    'bestSize',(select max(size_score) from public.pixel_farm_crops where user_id=u),
    'lastHarvestSize',(select size_score from public.pixel_farm_crops where user_id=u and harvested_at is not null order by harvested_at desc limit 1),
    'plots',jsonb_agg(jsonb_build_object('index',n,'revision',coalesce(p.revision,0),
      'crop',case when c.id is null then null else jsonb_build_object('id',c.id,'plantedAt',c.planted_at,
        'readyAt',c.ready_at,'careCount',c.care_count,'lastWateredOn',c.last_watered_on) end) order by n)) into result
    from generate_series(0,1) n
    left join public.pixel_farm_plots p on p.user_id=u and p.plot_index=n
    left join public.pixel_farm_crops c on c.user_id=u and c.id=p.crop_id;
  return result;
end $$;

create or replace function pixel_private.farm_action(p_plot integer, p_action text, p_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid(); p public.pixel_farm_plots%rowtype; c public.pixel_farm_crops%rowtype;
  t timestamptz; day date; result text := 'ok';
  v_max_care_days integer; v_care_ratio numeric; v_luck numeric; v_size smallint; v_inputs jsonb; v_harvest jsonb := '{}'::jsonb;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_plot is null or p_plot not between 0 and 1 or p_action is null or p_action not in ('plant','water','harvest') or p_revision is null or p_revision < 0 then
    raise exception 'Invalid farm action' using errcode = '22023';
  end if;
  insert into public.pixel_farm_plots(user_id,plot_index) values(u,p_plot) on conflict do nothing;
  select * into p from public.pixel_farm_plots where user_id=u and plot_index=p_plot for update;
  -- Compare-and-swap makes retries and simultaneous devices harmless, including replanting.
  if p.revision <> p_revision then return public.get_pixel_farm() || jsonb_build_object('result','changed'); end if;
  t := clock_timestamp(); day := (t at time zone 'Asia/Seoul')::date;
  select * into c from public.pixel_farm_crops where user_id=u and id=p.crop_id;
  if p_action = 'plant' then
    if p.crop_id is not null then result := 'changed';
    else
      insert into public.pixel_farm_crops(user_id,plot_index,planted_at,ready_at)
        values(u,p_plot,t,t + interval '24 hours') returning * into c;
      update public.pixel_farm_plots set crop_id=c.id,revision=revision+1 where user_id=u and plot_index=p_plot;
    end if;
  elsif p.crop_id is null then result := 'changed';
  elsif p_action = 'water' then
    if c.last_watered_on = day then result := 'already_watered';
    elsif t >= c.ready_at then result := 'ready';
    else
      insert into public.pixel_farm_care(user_id,crop_id,care_day,watered_at) values(u,c.id,day,t);
      update public.pixel_farm_crops set care_count=care_count+1,last_watered_on=day where id=c.id;
      update public.pixel_farm_plots set revision=revision+1 where user_id=u and plot_index=p_plot;
    end if;
  elsif t < c.ready_at then result := 'growing';
  else
    -- maxCareDays uses the crop's own planted..ready window (not harvest time t, which can be far
    -- later than ready_at) — watering is already blocked once t>=ready_at, so this is the true
    -- upper bound on how many days could have been watered.
    v_max_care_days := greatest(1, ((c.ready_at at time zone 'Asia/Seoul')::date - (c.planted_at at time zone 'Asia/Seoul')::date) + 1);
    v_care_ratio := least(1.0, c.care_count::numeric / v_max_care_days);
    v_luck := (random() + random() + random()) / 3.0;
    v_size := greatest(10, least(100, round(40 + v_care_ratio * 30 + (v_luck - 0.5) * 40)))::smallint;
    v_inputs := jsonb_build_object('careCount',c.care_count,'maxCareDays',v_max_care_days,
      'careRatio',round(v_care_ratio,4),'luckRoll',round(v_luck,6),'base',40,'careBonusMax',30,'luckSpread',40);
    update public.pixel_farm_crops set harvested_at=t,size_score=v_size,size_calc_version=1,size_inputs=v_inputs where id=c.id;
    update public.pixel_farm_plots set crop_id=null,revision=revision+1 where user_id=u and plot_index=p_plot;
    v_harvest := jsonb_build_object('sizeScore',v_size);
  end if;
  return public.get_pixel_farm() || jsonb_build_object('result',result) ||
    case when v_harvest = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('harvest',v_harvest) end;
end $$;
