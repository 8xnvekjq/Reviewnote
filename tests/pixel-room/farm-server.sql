-- Run as database administrator. Uses two existing profiles without farms;
-- timestamps are moved ONLY inside this rolled-back verification transaction.
begin;
do $$
declare a uuid; b uuid; c uuid; r jsonb; denied boolean; before_points jsonb; after_points jsonb;
begin
  select id into a from public.profiles where not exists(select 1 from public.pixel_farm_plots where user_id=profiles.id) limit 1;
  select id into b from public.profiles where id<>a and not exists(select 1 from public.pixel_farm_plots where user_id=profiles.id) limit 1;
  if a is null or b is null then raise exception 'Two profiles without farms required'; end if;
  select jsonb_build_array(bonus_points,point_adjustment) into before_points from public.profiles where id=a;
  perform set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  r := public.get_pixel_farm();
  if jsonb_array_length(r->'plots')<>2 or (r->>'harvestCount')::int<>0 then raise exception 'empty farm failed'; end if;
  r := public.act_pixel_farm(0,'plant',0);
  c := (r#>>'{plots,0,crop,id}')::uuid;
  if c is null or r->>'result'<>'ok' then raise exception 'plant failed %',r; end if;
  if (r#>>'{plots,0,crop,readyAt}')::timestamptz - (r#>>'{plots,0,crop,plantedAt}')::timestamptz <> interval '4 days' then raise exception 'growth duration'; end if;
  r := public.act_pixel_farm(0,'plant',0);
  if r->>'result'<>'changed' or (r#>>'{plots,0,crop,id}')::uuid<>c then raise exception 'duplicate plant'; end if;
  r := public.act_pixel_farm(0,'water',1);
  if (r#>>'{plots,0,crop,careCount}')::int<>1 then raise exception 'water failed'; end if;
  r := public.act_pixel_farm(0,'water',1);
  if r->>'result'<>'changed' then raise exception 'stale revision accepted'; end if;
  r := public.act_pixel_farm(0,'water',2);
  if r->>'result'<>'already_watered' or (select count(*) from public.pixel_farm_care)<>1 then raise exception 'duplicate care'; end if;
  r := public.act_pixel_farm(0,'harvest',2);
  if r->>'result'<>'growing' then raise exception 'early harvest'; end if;
  denied:=false;
  begin update public.pixel_farm_crops set ready_at=now() where id=c; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'direct timestamp forgery allowed'; end if;
  denied:=false;
  begin perform public.act_pixel_farm(2,'plant',0); exception when invalid_parameter_value then denied:=true; end;
  if not denied then raise exception 'extra plot allowed'; end if;
  -- Simulate yesterday's care, then verify a new KST day can be recorded once.
  execute 'reset role';
  update public.pixel_farm_care set care_day=care_day-1,watered_at=watered_at-interval '1 day' where crop_id=c;
  update public.pixel_farm_crops set last_watered_on=last_watered_on-1 where id=c;
  execute 'set local role authenticated';
  r := public.act_pixel_farm(0,'water',2);
  if (r#>>'{plots,0,crop,careCount}')::int<>2 then raise exception 'next day care'; end if;
  r := public.act_pixel_farm(1,'plant',0);
  -- No water for a week must still produce a harvestable crop.
  execute 'reset role';
  update public.pixel_farm_crops set planted_at=clock_timestamp()-interval '7 days',ready_at=clock_timestamp()-interval '6 days' where user_id=a;
  perform set_config('request.jwt.claim.sub',b::text,true);
  execute 'set local role authenticated';
  if exists(select 1 from public.pixel_farm_crops where user_id=a) or exists(select 1 from public.pixel_farm_care where user_id=a) or exists(select 1 from public.pixel_farm_plots where user_id=a) then raise exception 'cross-user read'; end if;
  if public.get_pixel_farm()#>>'{plots,0,crop}' is not null then raise exception 'snapshot leaked crop'; end if;
  r := public.act_pixel_farm(0,'harvest',3);
  if r->>'result'<>'changed' then raise exception 'cross-user action'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  r := public.act_pixel_farm(0,'harvest',3);
  if r->>'result'<>'ok' or (r->>'harvestCount')::int<>1 or r#>>'{plots,0,crop}' is not null then raise exception 'harvest failed %',r; end if;
  r := public.act_pixel_farm(0,'harvest',3);
  if r->>'result'<>'changed' or (r->>'harvestCount')::int<>1 then raise exception 'duplicate harvest'; end if;
  r := public.act_pixel_farm(1,'harvest',1);
  if r->>'result'<>'ok' or (r->>'harvestCount')::int<>2 then raise exception 'unwatered crop lost'; end if;
  if not exists(select 1 from public.pixel_farm_crops where id=c and harvested_at is not null and care_count=2) then raise exception 'history lost'; end if;
  r := public.act_pixel_farm(0,'plant',4);
  if (r#>>'{plots,0,crop,id}')::uuid=c then raise exception 'replant reused old crop'; end if;
  r := public.act_pixel_farm(0,'harvest',3);
  if r->>'result'<>'changed' or r#>>'{plots,0,crop,id}' is null then raise exception 'old request mutated new crop'; end if;
  if public.get_pixel_farm()#>>'{plots,0,crop,id}' <> r#>>'{plots,0,crop,id}' then raise exception 'snapshot persistence'; end if;
  execute 'reset role';
  select jsonb_build_array(bonus_points,point_adjustment) into after_points from public.profiles where id=a;
  if before_points<>after_points then raise exception 'points changed'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role authenticated';
  denied:=false;
  begin perform public.act_pixel_farm(0,'plant',0); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'missing uid allowed'; end if;
  execute 'reset role';
  execute 'set local role anon';
  denied:=false;
  begin perform public.get_pixel_farm(); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'anonymous read allowed'; end if;
  denied:=false;
  begin perform public.act_pixel_farm(0,'plant',0); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'anonymous action allowed'; end if;
  execute 'reset role';
end $$;

-- Crop size mechanics (computed exactly once at harvest, stored/returned consistently, audited,
-- retry-safe, forgery-denied, never appears before harvest). Uses a manually-aged 24h-shaped span
-- (same backdating technique as the lifecycle block above) purely so the test doesn't need to wait
-- out a real 4-day window — the real production 4-day duration and its care-day cap are separately
-- verified end-to-end further below. size_calc_version is 2 regardless of a crop's own span length
-- (it reflects which FORMULA the server applied, not that specific crop's duration).
do $$
declare a uuid; b uuid; c uuid; r jsonb; denied boolean; size1 int; size2 int; version1 int; inputs jsonb; best int; last int;
begin
  select id into a from public.profiles where not exists(select 1 from public.pixel_farm_plots where user_id=profiles.id) limit 1;
  select id into b from public.profiles where id<>a and not exists(select 1 from public.pixel_farm_plots where user_id=profiles.id) limit 1;
  if a is null or b is null then raise exception 'Two fresh profiles required for size block'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';

  -- Water twice across two KST days while still growing, then ripen and harvest.
  r := public.act_pixel_farm(0,'plant',0);
  c := (r#>>'{plots,0,crop,id}')::uuid;
  r := public.act_pixel_farm(0,'water',1);
  execute 'reset role';
  update public.pixel_farm_care set care_day=care_day-1,watered_at=watered_at-interval '1 day' where crop_id=c;
  update public.pixel_farm_crops set last_watered_on=last_watered_on-1 where id=c;
  execute 'set local role authenticated';
  r := public.act_pixel_farm(0,'water',2);
  if (r#>>'{plots,0,crop,careCount}')::int<>2 then raise exception 'expected 2 waterings before ripening, got %', r; end if;
  if exists(select 1 from public.pixel_farm_crops where id=c and size_score is not null) then raise exception 'size set before harvest'; end if;

  execute 'reset role';
  update public.pixel_farm_crops set planted_at=clock_timestamp()-interval '25 hours',ready_at=clock_timestamp()-interval '1 hour' where id=c;
  execute 'set local role authenticated';
  r := public.act_pixel_farm(0,'harvest',3);
  if r->>'result'<>'ok' then raise exception 'harvest failed %', r; end if;
  size1 := (r#>>'{harvest,sizeScore}')::int;
  if size1 is null or size1 < 1 or size1 > 100 then raise exception 'harvest payload missing/invalid sizeScore: %', r; end if;

  select size_score,size_calc_version,size_inputs into size2,version1,inputs from public.pixel_farm_crops where id=c;
  if size2 <> size1 then raise exception 'stored size % does not match returned size %', size2, size1; end if;
  if version1 <> 2 then raise exception 'unexpected calc version %', version1; end if;
  if (inputs->>'careCount')::int <> 2 or (inputs->>'maxCareDays')::int <> 2 then raise exception 'unexpected size_inputs %', inputs; end if;
  if inputs->>'careRatio' is null or inputs->>'luckRoll' is null then raise exception 'size_inputs missing audit fields %', inputs; end if;

  -- Retry with the already-consumed revision must not re-roll, duplicate-harvest, or re-emit a payload.
  r := public.act_pixel_farm(0,'harvest',3);
  if r->>'result'<>'changed' then raise exception 'stale harvest retry accepted'; end if;
  if (select size_score from public.pixel_farm_crops where id=c) <> size1 then raise exception 'retry mutated stored size'; end if;
  if r ? 'harvest' then raise exception 'retry re-emitted a harvest payload'; end if;

  denied:=false;
  begin update public.pixel_farm_crops set size_score=100 where id=c; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'direct size_score forgery allowed'; end if;

  r := public.get_pixel_farm();
  best := (r->>'bestSize')::int; last := (r->>'lastHarvestSize')::int;
  if best <> size1 or last <> size1 then raise exception 'bestSize/lastHarvestSize mismatch: best=% last=% expected=%', best, last, size1; end if;

  -- Zero watering must still harvest successfully with a valid size (never fails/dies).
  r := public.act_pixel_farm(1,'plant',0);
  execute 'reset role';
  update public.pixel_farm_crops set planted_at=clock_timestamp()-interval '25 hours',ready_at=clock_timestamp()-interval '1 hour' where user_id=a and plot_index=1;
  execute 'set local role authenticated';
  r := public.act_pixel_farm(1,'harvest',1);
  if r->>'result'<>'ok' then raise exception 'unwatered harvest failed %', r; end if;
  size2 := (r#>>'{harvest,sizeScore}')::int;
  if size2 is null or size2 < 1 or size2 > 100 then raise exception 'unwatered harvest produced no valid size: %', r; end if;

  perform set_config('request.jwt.claim.sub',b::text,true);
  if exists(select 1 from public.pixel_farm_crops where user_id=a and size_score is not null) then raise exception 'cross-user size read leaked'; end if;
  execute 'reset role';
end $$;

-- 4-day growth + review-linked bonus: real 4-day duration, "4 of 4 days watered" care cap, and the
-- profiles.bonus_points snapshot-diff (via the real increment_bonus_points RPC, not forgery) that
-- drives the review bonus chance.
do $$
declare a uuid; b uuid; c uuid; r jsonb; denied boolean;
  points_before int; points_after int; size1 int; inputs jsonb; rev bigint;
begin
  select id into a from public.profiles where not exists(select 1 from public.pixel_farm_plots where user_id=profiles.id) limit 1;
  select id into b from public.profiles where id<>a and not exists(select 1 from public.pixel_farm_plots where user_id=profiles.id) limit 1;
  if a is null or b is null then raise exception 'Two fresh profiles required for the 4-day block'; end if;

  select bonus_points into points_before from public.profiles where id=a;
  perform set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  r := public.act_pixel_farm(0,'plant',0);
  c := (r#>>'{plots,0,crop,id}')::uuid;
  if (r#>>'{plots,0,crop,readyAt}')::timestamptz - (r#>>'{plots,0,crop,plantedAt}')::timestamptz <> interval '4 days' then
    raise exception 'growth duration is not 4 days: %', r;
  end if;
  execute 'reset role';
  if (select review_points_at_plant from public.pixel_farm_crops where id=c) <> points_before then
    raise exception 'review_points_at_plant snapshot mismatch';
  end if;

  -- Water on 4 distinct KST days.
  execute 'set local role authenticated';
  r := public.act_pixel_farm(0,'water',1);
  rev := (r#>>'{plots,0,revision}')::bigint;
  if (r#>>'{plots,0,crop,careCount}')::int <> 1 then raise exception 'water 1 failed %', r; end if;
  for i in 1..3 loop
    execute 'reset role';
    update public.pixel_farm_care set care_day=care_day-1,watered_at=watered_at-interval '1 day' where crop_id=c;
    update public.pixel_farm_crops set last_watered_on=last_watered_on-1 where id=c;
    execute 'set local role authenticated';
    r := public.act_pixel_farm(0,'water',rev);
    rev := (r#>>'{plots,0,revision}')::bigint;
  end loop;
  if (r#>>'{plots,0,crop,careCount}')::int <> 4 then raise exception 'expected careCount=4 after 4 distinct days, got %', r; end if;

  -- A 5th day, still before ready_at, is refused by the new "4 of 4" cap.
  execute 'reset role';
  update public.pixel_farm_care set care_day=care_day-1,watered_at=watered_at-interval '1 day' where crop_id=c;
  update public.pixel_farm_crops set last_watered_on=last_watered_on-1 where id=c;
  execute 'set local role authenticated';
  r := public.act_pixel_farm(0,'water',rev);
  if r->>'result'<>'already_watered' or (r#>>'{plots,0,crop,careCount}')::int<>4 then
    raise exception '5th watering day should be refused (care_count cap), got %', r;
  end if;

  -- Not ready before 4 real days actually pass.
  r := public.act_pixel_farm(0,'harvest',rev);
  if r->>'result'<>'growing' then raise exception 'harvest should still be refused before 4 real days pass: %', r; end if;

  -- Age past ready_at, then award real review points via the same RPC review combo/streak/quest
  -- code uses (not direct forgery) to simulate genuine review activity during the growth window.
  execute 'reset role';
  update public.pixel_farm_crops set planted_at=clock_timestamp()-interval '4 days 1 hour',ready_at=clock_timestamp()-interval '1 hour' where id=c;
  execute 'set local role authenticated';
  perform public.increment_bonus_points(a, 60);
  execute 'reset role';
  select bonus_points into points_after from public.profiles where id=a;
  execute 'set local role authenticated';

  -- Live, pre-harvest hint: get_pixel_farm() already reflects the review gain on the still-growing
  -- crop (no new column — same review_points_at_plant snapshot the harvest branch will use).
  r := public.get_pixel_farm();
  if (r#>>'{plots,0,crop,reviewGained}')::int <> points_after - points_before then
    raise exception 'live reviewGained mismatch before harvest: got % expected %', r#>>'{plots,0,crop,reviewGained}', points_after-points_before;
  end if;

  r := public.act_pixel_farm(0,'harvest',rev);
  if r->>'result'<>'ok' then raise exception 'harvest failed %', r; end if;
  size1 := (r#>>'{harvest,sizeScore}')::int;
  if size1 is null or size1<1 or size1>100 then raise exception 'invalid sizeScore %', r; end if;

  select size_inputs into inputs from public.pixel_farm_crops where id=c;
  if (select size_calc_version from public.pixel_farm_crops where id=c) <> 2 then raise exception 'expected calc version 2'; end if;
  if (inputs->>'maxCareDays')::int <> 4 then raise exception 'expected maxCareDays=4, got %', inputs; end if;
  if (inputs->>'careCount')::int <> 4 then raise exception 'expected careCount=4, got %', inputs; end if;
  if (inputs->>'reviewGained')::int <> (points_after - points_before) then
    raise exception 'reviewGained mismatch: inputs=% expected=%', inputs->>'reviewGained', points_after-points_before;
  end if;
  if (inputs->>'reviewGained')::int <> 60 then raise exception 'expected reviewGained=60, got %', inputs; end if;
  if inputs->>'bonusChance' is null or inputs->>'bonusAmount' is null then raise exception 'missing bonus audit fields %', inputs; end if;

  denied:=false;
  begin update public.pixel_farm_crops set review_points_at_plant=999999 where id=c; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'direct review_points_at_plant forgery allowed'; end if;

  execute 'reset role';
end $$;

-- A crop that predates this migration (no review_points_at_plant snapshot, legacy 24h span) must
-- still harvest safely — reviewGained defaults to 0 rather than erroring, and it keeps its own
-- true (smaller) maxCareDays instead of being judged against the 4-day standard it never had.
do $$
declare a uuid; c uuid; r jsonb; inputs jsonb;
begin
  select id into a from public.profiles where not exists(select 1 from public.pixel_farm_plots where user_id=profiles.id) limit 1;
  if a is null then raise exception 'Fresh profile required for legacy-crop block'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  r := public.act_pixel_farm(0,'plant',0);
  c := (r#>>'{plots,0,crop,id}')::uuid;
  execute 'reset role';
  update public.pixel_farm_crops set review_points_at_plant=null, planted_at=clock_timestamp()-interval '25 hours', ready_at=clock_timestamp()-interval '1 hour' where id=c;
  execute 'set local role authenticated';
  r := public.act_pixel_farm(0,'harvest',1);
  if r->>'result'<>'ok' then raise exception 'legacy crop harvest failed: %', r; end if;
  select size_inputs into inputs from public.pixel_farm_crops where id=c;
  if (inputs->>'maxCareDays')::int <> 2 then raise exception 'legacy crop should keep maxCareDays=2, got %', inputs; end if;
  if (inputs->>'reviewGained')::int <> 0 then raise exception 'legacy crop (no snapshot) should default reviewGained=0, got %', inputs; end if;
  execute 'reset role';
end $$;

-- 농작물 collection: a harvested crop is already a real, single, RLS-scoped
-- pixel_farm_crops row (reused as-is, see 20260920090000_pixel_farm_crop_collection.sql). No new
-- RPC — this checks the exact direct-table-read shape fetchHarvestedCrops() uses.
do $$
declare a uuid; b uuid; c uuid; r jsonb; rows_a int; rows_b int; leaked int;
begin
  select id into a from public.profiles where not exists(select 1 from public.pixel_farm_plots where user_id=profiles.id) limit 1;
  select id into b from public.profiles where id<>a and not exists(select 1 from public.pixel_farm_plots where user_id=profiles.id) limit 1;
  if a is null or b is null then raise exception 'Two fresh profiles required for the crop-collection block'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  r := public.act_pixel_farm(0,'plant',0);
  c := (r#>>'{plots,0,crop,id}')::uuid;
  execute 'reset role';
  update public.pixel_farm_crops set planted_at=clock_timestamp()-interval '4 days 1 hour',ready_at=clock_timestamp()-interval '1 hour' where id=c;
  execute 'set local role authenticated';
  r := public.act_pixel_farm(0,'harvest',1);
  if r->>'result'<>'ok' then raise exception 'harvest failed %', r; end if;

  select count(*) into rows_a from public.pixel_farm_crops where user_id=a and harvested_at is not null;
  if rows_a <> 1 then raise exception 'expected exactly 1 harvested row for a, got %', rows_a; end if;
  if not exists(select 1 from public.pixel_farm_crops where id=c and status='stored') then raise exception 'status not stored by default'; end if;

  -- Duplicate-harvest retry (already covered generically elsewhere) must not add a second row.
  r := public.act_pixel_farm(0,'harvest',1);
  select count(*) into rows_a from public.pixel_farm_crops where user_id=a and harvested_at is not null;
  if rows_a <> 1 then raise exception 'duplicate harvest attempt created a second collection row: %', rows_a; end if;

  -- User b must never see a's harvested rows via the same direct-read query shape, with or
  -- without an explicit user_id filter (RLS must be what actually enforces this, not the filter).
  perform set_config('request.jwt.claim.sub',b::text,true);
  select count(*) into leaked from public.pixel_farm_crops where user_id=a and harvested_at is not null;
  if leaked <> 0 then raise exception 'RLS leak: user b read user a''s harvested crop(s)'; end if;
  select count(*) into rows_b from public.pixel_farm_crops where harvested_at is not null;
  if rows_b <> 0 then raise exception 'RLS leak without explicit filter: got % rows for b', rows_b; end if;

  execute 'reset role';
end $$;

-- 수확물 출품 (20260921100000_pixel_farm_crop_submission.sql): submit_farm_crop의 원자성 +
-- 중복/타인 방지. 전시/랭킹 쪽 검증은 이 아래 "주간 토마토 대회" 블록에서 한다
-- (get_top_submitted_crop은 20260922090000에서 get_weekly_crop_contest로 대체됨).
do $$
declare
  a uuid; b uuid; c1 uuid; r jsonb; denied boolean;
  points_before int; points_after int; reward1 int; sz1 int;
begin
  select id into a from public.profiles where not exists(select 1 from public.pixel_farm_plots where user_id=profiles.id) limit 1;
  select id into b from public.profiles where id<>a and not exists(select 1 from public.pixel_farm_plots where user_id=profiles.id) limit 1;
  if a is null or b is null then raise exception 'Two fresh profiles required for the submission block'; end if;

  perform set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  r := public.act_pixel_farm(0,'plant',0);
  c1 := (r#>>'{plots,0,crop,id}')::uuid;
  execute 'reset role';
  update public.pixel_farm_crops set planted_at=clock_timestamp()-interval '4 days 1 hour',ready_at=clock_timestamp()-interval '1 hour' where id=c1;
  execute 'set local role authenticated';
  r := public.act_pixel_farm(0,'harvest',1);
  if r->>'result'<>'ok' then raise exception 'harvest failed %', r; end if;
  sz1 := (r#>>'{harvest,sizeScore}')::int;

  -- Status change + point credit happen in the same call/transaction: the delta must exactly equal
  -- the reward returned, matching computeSubmitReward's own formula (kept in sync client-side).
  select coalesce(bonus_points,0)+coalesce(point_adjustment,0) into points_before from public.profiles where id=a;
  r := public.submit_farm_crop(c1);
  if r->>'ok' <> 'true' then raise exception 'submit failed %', r; end if;
  reward1 := (r->>'rewardPoints')::int;
  if reward1 <> 10 + round(sz1*0.4) then raise exception 'reward formula mismatch: size=% reward=%', sz1, reward1; end if;
  select coalesce(bonus_points,0)+coalesce(point_adjustment,0) into points_after from public.profiles where id=a;
  if points_after - points_before <> reward1 then
    raise exception 'points credited (%) do not match rewardPoints (%) — status change and point credit must happen atomically', points_after-points_before, reward1;
  end if;
  if not exists(select 1 from public.pixel_farm_crops where id=c1 and status='submitted' and submitted_at is not null and reward_points=reward1) then
    raise exception 'crop row not updated to submitted/reward_points as expected';
  end if;

  -- Duplicate submit (retry/double-click): no second row-worth of credit.
  r := public.submit_farm_crop(c1);
  if r->>'ok' <> 'false' or r->>'reason' <> 'already_submitted' then raise exception 'duplicate submit not rejected: %', r; end if;
  select coalesce(bonus_points,0)+coalesce(point_adjustment,0) into points_after from public.profiles where id=a;
  if points_after - points_before <> reward1 then raise exception 'duplicate submit re-credited points: total delta now %', points_after-points_before; end if;

  -- User b cannot submit a's crop (not their row -> not_found, never "already_submitted" which
  -- would leak that the id exists at all) and gets no points from trying.
  perform set_config('request.jwt.claim.sub',b::text,true);
  select coalesce(bonus_points,0)+coalesce(point_adjustment,0) into points_before from public.profiles where id=b;
  r := public.submit_farm_crop(c1);
  if r->>'ok' <> 'false' or r->>'reason' <> 'not_found' then raise exception 'cross-user submit not blocked as not_found: %', r; end if;
  select coalesce(bonus_points,0)+coalesce(point_adjustment,0) into points_after from public.profiles where id=b;
  if points_after <> points_before then raise exception 'cross-user submit attempt credited b anyway'; end if;

  -- Anonymous/unauthenticated denial (matches the app-wide pattern above).
  execute 'set local role anon';
  denied:=false;
  begin perform public.submit_farm_crop(c1); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'anonymous submit_farm_crop allowed'; end if;
  execute 'reset role';
end $$;

-- 주간 토마토 대회 (20260922090000_pixel_farm_weekly_contest.sql): 새 테이블 없이 submitted_at/
-- size_score만으로 KST 월요일 기준 주간 최고 기록을 계산하는 get_weekly_crop_contest 검증.
--
-- 주의: 이 앱은 이미 실제 학생들이 쓰고 있어서 "이번 주" 대회에 테스트와 무관한 진짜 출품이 이미
-- 있을 수 있다(실제로 검증 중 발견함 — 처음엔 "정확히 내가 만든 것만 있다"고 가정했다가 실패했다).
-- 그래서 top 배열의 절대 길이/순위 번호는 절대 단언하지 않는다 — 오직 (1) 호출자 본인에게만
-- 스코프된 mine 필드(다른 실제 학생 데이터와 무관), (2) 동일 시각에 두 번 호출한 값의 델타만
-- 신뢰한다. 동점 검증도 "순위가 1이다"가 아니라 "a와 b의 순위가 서로 같다"로 확인한다.
do $$
declare
  a uuid; b uuid; c uuid; r jsonb; denied boolean;
  c1 uuid; c2 uuid; c3 uuid; sz1 int; sz2 int;
  contest jsonb; entry jsonb; a_size int; a_rank int; b_rank int;
  baseline_participants int; top_len_before int; top_len_after int; top_len_backdated int;
begin
  select id into a from public.profiles where not exists(select 1 from public.pixel_farm_plots where user_id=profiles.id) limit 1;
  select id into b from public.profiles where id<>a and not exists(select 1 from public.pixel_farm_plots where user_id=profiles.id) limit 1;
  select id into c from public.profiles where id<>a and id<>b and not exists(select 1 from public.pixel_farm_plots where user_id=profiles.id) limit 1;
  if a is null or b is null or c is null then raise exception 'Three fresh profiles required for the weekly-contest block'; end if;

  -- Baseline, read by an uninvolved non-participant BEFORE a/b touch anything, so later assertions
  -- can check deltas instead of assuming an empty board.
  perform set_config('request.jwt.claim.sub',c::text,true);
  execute 'set local role authenticated';
  contest := public.get_weekly_crop_contest();
  execute 'reset role';
  baseline_participants := (contest#>>'{mine,participantCount}')::int;
  top_len_before := jsonb_array_length(contest->'top');

  -- a harvests+submits twice this week (plot 0 then plot 1). Only the LARGER of the two must count
  -- as a's weekly best — not the most recent, not both averaged/summed. This lives entirely in
  -- "mine" (scoped to the caller), so it's unaffected by whatever else is on the board.
  perform set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  r := public.act_pixel_farm(0,'plant',0);
  c1 := (r#>>'{plots,0,crop,id}')::uuid;
  execute 'reset role';
  update public.pixel_farm_crops set planted_at=clock_timestamp()-interval '4 days 1 hour',ready_at=clock_timestamp()-interval '1 hour' where id=c1;
  execute 'set local role authenticated';
  r := public.act_pixel_farm(0,'harvest',1);
  sz1 := (r#>>'{harvest,sizeScore}')::int;
  perform public.submit_farm_crop(c1);
  r := public.act_pixel_farm(1,'plant',0);
  c2 := (r#>>'{plots,1,crop,id}')::uuid;
  execute 'reset role';
  update public.pixel_farm_crops set planted_at=clock_timestamp()-interval '4 days 1 hour',ready_at=clock_timestamp()-interval '1 hour' where id=c2;
  execute 'set local role authenticated';
  r := public.act_pixel_farm(1,'harvest',1);
  sz2 := (r#>>'{harvest,sizeScore}')::int;
  perform public.submit_farm_crop(c2);
  contest := public.get_weekly_crop_contest();
  execute 'reset role';

  a_size := (contest#>>'{mine,sizeScore}')::int;
  a_rank := (contest#>>'{mine,rank}')::int;
  if a_size <> greatest(sz1, sz2) then
    raise exception 'weekly best should be the LARGER of a''s two submissions (% and %), got %', sz1, sz2, a_size;
  end if;
  if a_rank is null then raise exception 'a just submitted this week and should have a real rank, got null'; end if;
  top_len_after := jsonb_array_length(contest->'top');
  if top_len_after < top_len_before then raise exception 'top list should never shrink just from a new submission: % -> %', top_len_before, top_len_after; end if;
  -- Structural check on whatever's actually in the list (real students' rows included) — only the
  -- safe projection, never a raw id.
  if jsonb_array_length(contest->'top') > 0 then
    entry := contest->'top'->0;
    if (entry ? 'userId') or (entry ? 'user_id') then raise exception 'weekly contest leaked a raw user id: %', entry; end if;
    if not (entry ? 'rank' and entry ? 'sizeScore' and entry ? 'submitterLabel') then
      raise exception 'weekly contest entry missing expected fields: %', entry;
    end if;
  end if;

  -- b submits a crop forced to the EXACT same size as a's best -> a natural tie: whatever rank
  -- number they land on, a and b must land on the SAME one (never split by submission order).
  perform set_config('request.jwt.claim.sub',b::text,true);
  execute 'set local role authenticated';
  r := public.act_pixel_farm(0,'plant',0);
  c3 := (r#>>'{plots,0,crop,id}')::uuid;
  execute 'reset role';
  update public.pixel_farm_crops set planted_at=clock_timestamp()-interval '4 days 1 hour',ready_at=clock_timestamp()-interval '1 hour' where id=c3;
  execute 'set local role authenticated';
  r := public.act_pixel_farm(0,'harvest',1);
  execute 'reset role';
  update public.pixel_farm_crops set size_score=a_size where id=c3;
  execute 'set local role authenticated';
  perform public.submit_farm_crop(c3);
  contest := public.get_weekly_crop_contest();
  b_rank := (contest#>>'{mine,rank}')::int;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  a_rank := ((public.get_weekly_crop_contest())#>>'{mine,rank}')::int;
  execute 'reset role';
  if a_rank <> b_rank then raise exception 'a and b now have the identical size % but different ranks (a=% b=%) — ties must share a rank', a_size, a_rank, b_rank; end if;

  -- c still never submitted: null mine, and participantCount grew by exactly 2 (a and b) over the
  -- untouched baseline — a delta check, not an absolute one, since real students may already be on
  -- the board.
  perform set_config('request.jwt.claim.sub',c::text,true);
  execute 'set local role authenticated';
  contest := public.get_weekly_crop_contest();
  execute 'reset role';
  if contest#>'{mine,sizeScore}' <> 'null'::jsonb or contest#>'{mine,rank}' <> 'null'::jsonb then
    raise exception 'a student who never submitted should have null mine.sizeScore/rank, got %', contest->'mine';
  end if;
  if (contest#>>'{mine,participantCount}')::int <> baseline_participants + 2 then
    raise exception 'participantCount should grow by exactly 2 (a, b) over the baseline %, got %', baseline_participants, contest#>>'{mine,participantCount}';
  end if;

  -- Week rollover: backdating b's crop into last (KST) week must remove it from THIS week's contest
  -- (the top list shrinks back to what it was right after a's own submissions, before b's) — while
  -- the same data is still findable by asking for THAT past week explicitly (nothing is deleted; a
  -- week's results are always reconstructible from submitted_at alone).
  execute 'reset role';
  update public.pixel_farm_crops set submitted_at=submitted_at - interval '8 days' where id=c3;
  perform set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  contest := public.get_weekly_crop_contest();
  execute 'reset role';
  top_len_backdated := jsonb_array_length(contest->'top');
  if top_len_backdated <> top_len_after then
    raise exception 'backdating b out of this week should return the top list to its pre-tie size % (still counting a), got %', top_len_after, top_len_backdated;
  end if;
  if (contest#>>'{mine,sizeScore}')::int <> a_size then raise exception 'a''s own weekly best should be unaffected by b''s backdating, expected %, got %', a_size, contest#>>'{mine,sizeScore}'; end if;

  perform set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  contest := public.get_weekly_crop_contest(now() - interval '8 days');
  execute 'reset role';
  if not exists (
    select 1 from jsonb_array_elements(contest->'top') top_entry
     where (top_entry->>'sizeScore')::int = a_size
  ) then
    raise exception 'querying last week explicitly should still find b''s now-backdated (size %) submission: %', a_size, contest->'top';
  end if;

  -- A week with genuinely nobody in it (far enough in the past that this brand-new feature could
  -- not possibly have any real data there either) comes back empty, not an error.
  perform set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  contest := public.get_weekly_crop_contest(now() - interval '3650 days');
  execute 'reset role';
  if jsonb_array_length(contest->'top') <> 0 then raise exception 'a genuinely empty past week should have no entries: %', contest->'top'; end if;
  if contest#>'{mine,participantCount}' <> '0'::jsonb then raise exception 'empty week should report 0 participants: %', contest->'mine'; end if;

  -- Anonymous denial (matches the app-wide pattern above).
  execute 'set local role anon';
  denied:=false;
  begin perform public.get_weekly_crop_contest(); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'anonymous get_weekly_crop_contest allowed'; end if;
  execute 'reset role';
end $$;
select 'PASS: lifecycle, KST daily care, revisions/retries, stale replant, missed watering, history, server time, unchanged points, RLS/anonymous denial, crop size computed once/stored/audited/retry-safe/forgery-denied/best+last surfaced/unwatered-never-fails, real 4-day duration + 4-of-4 care cap, review snapshot-diff via the real RPC (including the live pre-harvest hint), legacy pre-migration crop compatibility, harvested crop collection (single RLS-scoped row, no duplicate on retry, no cross-user leak), crop submission (atomic status+points, no duplicate credit, cross-user denial, anonymous denial), weekly tomato contest (per-user best-of-week only, natural ties, non-participant view, week rollover excludes/past-week still reconstructible, empty week, anonymous denial, no raw user id leaked); all rolled back' as result;
rollback;
