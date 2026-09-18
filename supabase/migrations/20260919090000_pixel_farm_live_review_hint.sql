-- Exposes a live, forward-looking reviewGained estimate on each still-growing crop, purely so the
-- new scarecrow guide (client-side, no new endpoint) can hint "복습 보너스가 기대되는 상태" while a
-- crop is still growing. No new column: it is the exact same snapshot-diff
-- (bonus_points - review_points_at_plant, both already stored) the harvest branch already computes
-- and freezes at harvest time — this just lets the client read the CURRENT value early. It cannot
-- be used to predict or lock in the final size (the real roll only happens once, at harvest, inside
-- the existing revision-CAS/row-locked branch — unchanged).
create or replace function public.get_pixel_farm() returns jsonb language plpgsql security invoker set search_path = '' as $$
declare u uuid := auth.uid(); t timestamptz := clock_timestamp(); result jsonb; v_points integer;
begin
  if u is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select bonus_points into v_points from public.profiles where id = u;
  select jsonb_build_object('serverNow',t,'today',(t at time zone 'Asia/Seoul')::date,
    'harvestCount',(select count(*) from public.pixel_farm_crops where user_id=u and harvested_at is not null),
    'bestSize',(select max(size_score) from public.pixel_farm_crops where user_id=u),
    'lastHarvestSize',(select size_score from public.pixel_farm_crops where user_id=u and harvested_at is not null order by harvested_at desc limit 1),
    'plots',jsonb_agg(jsonb_build_object('index',n,'revision',coalesce(p.revision,0),
      'crop',case when c.id is null then null else jsonb_build_object('id',c.id,'plantedAt',c.planted_at,
        'readyAt',c.ready_at,'careCount',c.care_count,'lastWateredOn',c.last_watered_on,
        'reviewGained',greatest(0, coalesce(v_points,0) - coalesce(c.review_points_at_plant, coalesce(v_points,0)))
      ) end) order by n)) into result
    from generate_series(0,1) n
    left join public.pixel_farm_plots p on p.user_id=u and p.plot_index=n
    left join public.pixel_farm_crops c on c.user_id=u and c.id=p.crop_id;
  return result;
end $$;
