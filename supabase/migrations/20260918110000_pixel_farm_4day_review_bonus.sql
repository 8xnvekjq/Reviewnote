-- Two changes to the farm, built on the existing harvest-branch/revision-CAS mechanism
-- (20260917155631_pixel_tomato_farm.sql, 20260918090000_pixel_farm_crop_size.sql):
--
-- 1) Growth duration 24h -> 4 days. care_count's ratio denominator becomes a fixed 4 (the
--    intended "X of 4 days watered" meaning the product asked for) rather than the old
--    calendar-day-span value, capped so legacy in-flight 24h crops (denominator ~2, computed from
--    their own actual planted/ready span) are unaffected and stay fair to their shorter window.
--
-- 2) A probabilistic, review-linked bonus layered ON TOP of the unchanged watering-driven base
--    size (never added directly to size): reviewRatio comes from the ONLY genuinely
--    server-authoritative, tamper-resistant-ish review signal in this schema —
--    profiles.bonus_points, which is exclusively written by the existing
--    increment_bonus_points() RPC from real review combo/streak/quest activity (see
--    src/features/mistakes/useReviewState.ts) and is NEVER touched by shop/gacha/admin credits
--    (those use profiles.point_adjustment). No login-count/session-time signal exists or is used.
--    We snapshot bonus_points at plant time and diff it at harvest — a per-crop, one-shot
--    measurement of "how many combo points were earned during THIS crop's own 4-day window",
--    reusing existing infrastructure instead of inventing a new tracking table.
--    Caveat (documented, not silently ignored): reviewGained inherits whatever gaming resistance
--    profiles.bonus_points itself has. It is not a new attack surface — the same signal already
--    gates real spendable points — and the farm's own payout is a small, capped, chance-gated
--    nudge, consumed once per crop by the same revision-CAS/row-lock that already makes retries
--    and duplicate harvests impossible.
alter table public.pixel_farm_crops
  add column review_points_at_plant integer;

create or replace function pixel_private.farm_action(p_plot integer, p_action text, p_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid(); p public.pixel_farm_plots%rowtype; c public.pixel_farm_crops%rowtype;
  t timestamptz; day date; result text := 'ok';
  v_max_care_days integer; v_care_ratio numeric; v_luck numeric; v_base_size integer;
  v_review_gained integer; v_review_ratio numeric; v_bonus_chance numeric; v_bonus_roll numeric;
  v_bonus_amount integer; v_size smallint; v_inputs jsonb; v_harvest jsonb := '{}'::jsonb;
  v_current_points integer;
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
    -- Fixed 4-opportunity cap (matches the fixed 4-day duration) — closes the rare sub-minute
    -- calendar-boundary sliver that could otherwise offer a 5th watering day for some plant times.
    elsif c.care_count >= 4 then result := 'already_watered';
    else
      insert into public.pixel_farm_care(user_id,crop_id,care_day,watered_at) values(u,c.id,day,t);
      update public.pixel_farm_crops set care_count=care_count+1,last_watered_on=day where id=c.id;
      update public.pixel_farm_plots set revision=revision+1 where user_id=u and plot_index=p_plot;
    end if;
  elsif t < c.ready_at then result := 'growing';
  else
    -- Watering-driven base size: unchanged formula, denominator capped at 4 (the "X of 4 days"
    -- meaning) but still computed from THIS crop's own planted..ready span, so a legacy in-flight
    -- crop still planted under the old 24h duration correctly gets its true (smaller) denominator
    -- instead of being unfairly judged against a 4-day standard it was never offered.
    v_max_care_days := least(4, greatest(1, ((c.ready_at at time zone 'Asia/Seoul')::date - (c.planted_at at time zone 'Asia/Seoul')::date) + 1));
    v_care_ratio := least(1.0, c.care_count::numeric / v_max_care_days);
    v_luck := (random() + random() + random()) / 3.0;
    v_base_size := greatest(10, least(100, round(40 + v_care_ratio * 30 + (v_luck - 0.5) * 40)));

    -- Review-linked bonus: a separate, additive, chance-gated nudge — never added directly.
    -- reviewGained is null-safe zero for crops planted before this column existed.
    select bonus_points into v_current_points from public.profiles where id=u;
    v_review_gained := greatest(0, coalesce(v_current_points,0) - coalesce(c.review_points_at_plant, coalesce(v_current_points,0)));
    v_review_ratio := least(1.0, v_review_gained::numeric / 50.0);
    v_bonus_chance := 0.12 + v_review_ratio * 0.28; -- 12% (no review activity) .. 40% (well above the 50pt/4d reference)
    v_bonus_roll := random();
    if v_bonus_roll < v_bonus_chance then
      v_bonus_amount := round(6 + (random() + random()) / 2.0 * 12); -- bell-shaped 6..18, mean ~12
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
  end if;
  return public.get_pixel_farm() || jsonb_build_object('result',result) ||
    case when v_harvest = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('harvest',v_harvest) end;
end $$;
