BEGIN;

-- Keep privileged implementations outside the Data API. Public RPCs below are
-- SECURITY INVOKER entry points and are executable only by signed-in users.
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.activate_combo_booster(user_id_param UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  new_expiry TIMESTAMPTZ;
  decremented_qty INTEGER;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR (SELECT auth.uid()) IS DISTINCT FROM user_id_param THEN
    RAISE EXCEPTION 'Not authorized to activate this user''s booster'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_items
     SET quantity = quantity - 1
   WHERE user_id = user_id_param
     AND item_id = 'item_point_booster'
     AND quantity > 0
  RETURNING quantity INTO decremented_qty;

  IF decremented_qty IS NULL THEN
    RETURN NULL;
  END IF;

  new_expiry := now() + INTERVAL '3 hours';

  UPDATE public.profiles
     SET combo_booster_expires_at = new_expiry
   WHERE id = user_id_param;

  RETURN new_expiry;
END;
$function$;

REVOKE ALL ON FUNCTION private.activate_combo_booster(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.activate_combo_booster(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.activate_combo_booster(user_id_param UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.activate_combo_booster(user_id_param);
$function$;

REVOKE ALL ON FUNCTION public.activate_combo_booster(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_combo_booster(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION private.decrement_item_quantity(
  user_id_param UUID,
  item_id_param TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  remaining_quantity INTEGER;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR (SELECT auth.uid()) IS DISTINCT FROM user_id_param THEN
    RAISE EXCEPTION 'Not authorized to modify this user''s inventory'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_items
     SET quantity = quantity - 1
   WHERE user_id = user_id_param
     AND item_id = item_id_param
     AND quantity > 0
  RETURNING quantity INTO remaining_quantity;

  RETURN remaining_quantity;
END;
$function$;

REVOKE ALL ON FUNCTION private.decrement_item_quantity(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.decrement_item_quantity(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.decrement_item_quantity(
  user_id_param UUID,
  item_id_param TEXT
)
RETURNS INTEGER
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.decrement_item_quantity(user_id_param, item_id_param);
$function$;

REVOKE ALL ON FUNCTION public.decrement_item_quantity(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decrement_item_quantity(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION private.record_daily_review_progress(
  user_id_param UUID,
  today_param TEXT,
  increment_param INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  expected_today TEXT;
  cur_date TEXT;
  cur_count INTEGER;
  cur_claimed BOOLEAN;
  new_count INTEGER;
  just_earned BOOLEAN := FALSE;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR (SELECT auth.uid()) IS DISTINCT FROM user_id_param THEN
    RAISE EXCEPTION 'Not authorized to update this user''s daily progress'
      USING ERRCODE = '42501';
  END IF;

  expected_today := to_char(timezone('Asia/Seoul', now()), 'YYYY-MM-DD');
  IF today_param IS DISTINCT FROM expected_today THEN
    RAISE EXCEPTION 'Invalid daily review date'
      USING ERRCODE = '22023';
  END IF;

  IF increment_param IS NULL OR increment_param < 1 OR increment_param > 3 THEN
    RAISE EXCEPTION 'Daily review increment must be between 1 and 3'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    profiles.daily_review_date,
    COALESCE(profiles.daily_review_count, 0),
    COALESCE(profiles.daily_quest_claimed, FALSE)
  INTO cur_date, cur_count, cur_claimed
  FROM public.profiles AS profiles
  WHERE profiles.id = user_id_param
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF cur_date IS DISTINCT FROM today_param THEN
    cur_count := 0;
    cur_claimed := FALSE;
  END IF;

  new_count := cur_count + increment_param;

  IF new_count >= 5 AND NOT cur_claimed THEN
    just_earned := TRUE;
    cur_claimed := TRUE;
  END IF;

  UPDATE public.profiles
     SET daily_review_date = today_param,
         daily_review_count = new_count,
         daily_quest_claimed = cur_claimed
   WHERE id = user_id_param;

  RETURN jsonb_build_object('count', new_count, 'bonusEarned', just_earned);
END;
$function$;

REVOKE ALL ON FUNCTION private.record_daily_review_progress(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.record_daily_review_progress(UUID, TEXT, INTEGER)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.record_daily_review_progress(
  user_id_param UUID,
  today_param TEXT,
  increment_param INTEGER
)
RETURNS JSONB
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.record_daily_review_progress(
    user_id_param,
    today_param,
    increment_param
  );
$function$;

REVOKE ALL ON FUNCTION public.record_daily_review_progress(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_daily_review_progress(UUID, TEXT, INTEGER)
  TO authenticated;

-- Point calculations are intentionally unchanged. This only keeps the existing
-- self-only authorization behind a private privileged implementation.
CREATE OR REPLACE FUNCTION private.increment_bonus_points(
  user_id_param UUID,
  amount_param INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  new_total INTEGER;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR (SELECT auth.uid()) IS DISTINCT FROM user_id_param THEN
    RAISE EXCEPTION 'Not authorized to modify this user''s points'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET bonus_points = GREATEST(0, COALESCE(bonus_points, 0) + amount_param)
   WHERE id = user_id_param
  RETURNING bonus_points INTO new_total;

  RETURN new_total;
END;
$function$;

REVOKE ALL ON FUNCTION private.increment_bonus_points(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.increment_bonus_points(UUID, INTEGER)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.increment_bonus_points(
  user_id_param UUID,
  amount_param INTEGER
)
RETURNS INTEGER
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.increment_bonus_points(user_id_param, amount_param);
$function$;

REVOKE ALL ON FUNCTION public.increment_bonus_points(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_bonus_points(UUID, INTEGER)
  TO authenticated;

CREATE OR REPLACE FUNCTION private.record_diagnosis_duration(duration_ms BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF duration_ms IS NULL OR duration_ms <= 0 OR duration_ms >= 600000 THEN
    RETURN;
  END IF;

  UPDATE public.diagnosis_stats
     SET total_count = total_count + 1,
         total_duration_ms = total_duration_ms + duration_ms,
         updated_at = now()
   WHERE id = 1;
END;
$function$;

REVOKE ALL ON FUNCTION private.record_diagnosis_duration(BIGINT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.record_diagnosis_duration(BIGINT)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.record_diagnosis_duration(duration_ms BIGINT)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.record_diagnosis_duration(duration_ms);
$function$;

REVOKE ALL ON FUNCTION public.record_diagnosis_duration(BIGINT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_diagnosis_duration(BIGINT)
  TO authenticated;

CREATE OR REPLACE FUNCTION private.finalize_last_week_medals_if_needed()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  last_week_start_date TEXT;
  already_done TEXT;
  top1 UUID;
  top2 UUID;
  top3 UUID;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- Multiple clients can open together on Monday. Serialize finalization so
  -- medals and gifts cannot be awarded twice before system_config is updated.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('reviewnote:weekly-medal-finalization', 0)
  );

  SELECT to_char(
    (timezone('Asia/Seoul', date_trunc('week', timezone('Asia/Seoul', now())))
      - INTERVAL '7 days')::date,
    'YYYY-MM-DD'
  ) INTO last_week_start_date;

  SELECT system_config.value
    INTO already_done
    FROM public.system_config AS system_config
   WHERE system_config.key = 'last_finalized_medal_week';

  IF already_done IS NOT DISTINCT FROM last_week_start_date THEN
    RETURN;
  END IF;

  SELECT leaderboard.user_id INTO top1
    FROM public.last_weekly_leaderboard AS leaderboard
   ORDER BY leaderboard.score DESC LIMIT 1 OFFSET 0;
  SELECT leaderboard.user_id INTO top2
    FROM public.last_weekly_leaderboard AS leaderboard
   ORDER BY leaderboard.score DESC LIMIT 1 OFFSET 1;
  SELECT leaderboard.user_id INTO top3
    FROM public.last_weekly_leaderboard AS leaderboard
   ORDER BY leaderboard.score DESC LIMIT 1 OFFSET 2;

  IF top1 IS NOT NULL THEN
    UPDATE public.profiles
       SET weekly_gold_count = weekly_gold_count + 1
     WHERE id = top1;

    INSERT INTO public.user_items (user_id, item_id, quantity)
    VALUES (top1, 'item_point_booster', 1)
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET quantity = public.user_items.quantity + 1;

    INSERT INTO public.user_items (user_id, item_id, quantity)
    VALUES (top1, 'item_ur_ticket', 1)
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET quantity = public.user_items.quantity + 1;

    UPDATE public.profiles
       SET pending_gift_notice = jsonb_build_object(
         'title', '🏆 지난주 명예의 전당 1등 축하해요!',
         'message', '주간 복습 랭킹 1등 보상으로\n⚡ 콤보 부스터(5배 3시간권) 1개\n🎫 UR 확정 뽑기권 1개\n을(를) 받았습니다!',
         'icon', '🏆',
         'badge', '주간 1등 보상'
       )
     WHERE id = top1;
  END IF;

  IF top2 IS NOT NULL THEN
    UPDATE public.profiles
       SET weekly_silver_count = weekly_silver_count + 1
     WHERE id = top2;

    INSERT INTO public.user_items (user_id, item_id, quantity)
    VALUES (top2, 'item_point_booster', 1)
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET quantity = public.user_items.quantity + 1;

    INSERT INTO public.user_items (user_id, item_id, quantity)
    VALUES (top2, 'item_ssr_ticket', 1)
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET quantity = public.user_items.quantity + 1;

    UPDATE public.profiles
       SET pending_gift_notice = jsonb_build_object(
         'title', '🥈 지난주 명예의 전당 2등 축하해요!',
         'message', '주간 복습 랭킹 2등 보상으로\n⚡ 콤보 부스터(5배 3시간권) 1개\n🎫 SSR 확정 뽑기권 1개\n을(를) 받았습니다!',
         'icon', '🥈',
         'badge', '주간 2등 보상'
       )
     WHERE id = top2;
  END IF;

  IF top3 IS NOT NULL THEN
    UPDATE public.profiles
       SET weekly_bronze_count = weekly_bronze_count + 1
     WHERE id = top3;

    INSERT INTO public.user_items (user_id, item_id, quantity)
    VALUES (top3, 'item_point_booster', 1)
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET quantity = public.user_items.quantity + 1;

    UPDATE public.profiles
       SET bonus_points = COALESCE(bonus_points, 0) + 70,
           pending_gift_notice = jsonb_build_object(
             'title', '🥉 지난주 명예의 전당 3등 축하해요!',
             'message', '주간 복습 랭킹 3등 보상으로\n⚡ 콤보 부스터(5배 3시간권) 1개\n⚡ 콤보 포인트 70점\n을(를) 받았습니다!',
             'icon', '🥉',
             'badge', '주간 3등 보상'
           )
     WHERE id = top3;
  END IF;

  INSERT INTO public.system_config (key, value, description)
  VALUES (
    'last_finalized_medal_week',
    last_week_start_date,
    '명예의 전당 주간 메달(금/은/동) 집계 및 순위 보상이 마지막으로 반영된 지난주 시작일(KST)'
  )
  ON CONFLICT (key)
  DO UPDATE SET value = excluded.value, updated_at = now();
END;
$function$;

REVOKE ALL ON FUNCTION private.finalize_last_week_medals_if_needed()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.finalize_last_week_medals_if_needed()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_last_week_medals_if_needed()
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.finalize_last_week_medals_if_needed();
$function$;

REVOKE ALL ON FUNCTION public.finalize_last_week_medals_if_needed()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_last_week_medals_if_needed()
  TO authenticated;

-- Views used for cross-student social summaries must not run directly with the
-- view owner's privileges. Make them invoker views and remove Data API access.
ALTER VIEW public.weekly_leaderboard SET (security_invoker = TRUE);
ALTER VIEW public.last_weekly_leaderboard SET (security_invoker = TRUE);
ALTER VIEW public.recent_activity_feed SET (security_invoker = TRUE);
ALTER VIEW public.recent_peer_activities SET (security_invoker = TRUE);

REVOKE ALL ON public.weekly_leaderboard
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.last_weekly_leaderboard
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.recent_activity_feed
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.recent_peer_activities
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.get_weekly_leaderboard()
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  display_name TEXT,
  nickname TEXT,
  title TEXT,
  weekly_total_count BIGINT,
  weekly_completed_count BIGINT,
  score BIGINT,
  weekly_gold_count INTEGER,
  weekly_silver_count INTEGER,
  weekly_bronze_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT leaderboard.*
    FROM public.weekly_leaderboard AS leaderboard
   WHERE (SELECT auth.uid()) IS NOT NULL
   ORDER BY leaderboard.score DESC;
$function$;

REVOKE ALL ON FUNCTION private.get_weekly_leaderboard()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_weekly_leaderboard() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_weekly_leaderboard()
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  display_name TEXT,
  nickname TEXT,
  title TEXT,
  weekly_total_count BIGINT,
  weekly_completed_count BIGINT,
  score BIGINT,
  weekly_gold_count INTEGER,
  weekly_silver_count INTEGER,
  weekly_bronze_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.get_weekly_leaderboard();
$function$;

REVOKE ALL ON FUNCTION public.get_weekly_leaderboard()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_weekly_leaderboard() TO authenticated;

CREATE OR REPLACE FUNCTION private.get_recent_activity_feed()
RETURNS TABLE (
  mistake_id UUID,
  user_id UUID,
  event_type TEXT,
  chapter TEXT,
  event_time TIMESTAMPTZ,
  name TEXT,
  equipped_title TEXT,
  equipped_theme TEXT,
  equipped_stamp TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT activity.*
    FROM public.recent_activity_feed AS activity
   WHERE (SELECT auth.uid()) IS NOT NULL
   ORDER BY activity.event_time DESC
   LIMIT 100;
$function$;

REVOKE ALL ON FUNCTION private.get_recent_activity_feed()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_recent_activity_feed() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_recent_activity_feed()
RETURNS TABLE (
  mistake_id UUID,
  user_id UUID,
  event_type TEXT,
  chapter TEXT,
  event_time TIMESTAMPTZ,
  name TEXT,
  equipped_title TEXT,
  equipped_theme TEXT,
  equipped_stamp TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.get_recent_activity_feed();
$function$;

REVOKE ALL ON FUNCTION public.get_recent_activity_feed()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_activity_feed() TO authenticated;

CREATE OR REPLACE FUNCTION private.get_recent_peer_activities()
RETURNS TABLE (
  mistake_id UUID,
  user_id UUID,
  display_name TEXT,
  username TEXT,
  last_seen_at TIMESTAMPTZ,
  title TEXT,
  reviews JSONB,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT activity.*
    FROM public.recent_peer_activities AS activity
   WHERE (SELECT auth.uid()) IS NOT NULL
   ORDER BY activity.updated_at DESC
   LIMIT 100;
$function$;

REVOKE ALL ON FUNCTION private.get_recent_peer_activities()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_recent_peer_activities() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_recent_peer_activities()
RETURNS TABLE (
  mistake_id UUID,
  user_id UUID,
  display_name TEXT,
  username TEXT,
  last_seen_at TIMESTAMPTZ,
  title TEXT,
  reviews JSONB,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.get_recent_peer_activities();
$function$;

REVOKE ALL ON FUNCTION public.get_recent_peer_activities()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_peer_activities() TO authenticated;

DO $verify_security_surface$
DECLARE
  insecure_view_count INTEGER;
  anon_view_count INTEGER;
  public_definer_count INTEGER;
  anon_rpc_count INTEGER;
BEGIN
  SELECT count(*) INTO insecure_view_count
  FROM pg_class AS views
  JOIN pg_namespace AS schemas ON schemas.oid = views.relnamespace
  WHERE schemas.nspname = 'public'
    AND views.relname IN (
      'weekly_leaderboard',
      'last_weekly_leaderboard',
      'recent_activity_feed',
      'recent_peer_activities'
    )
    AND NOT COALESCE(views.reloptions, ARRAY[]::TEXT[])
      @> ARRAY['security_invoker=true'];

  SELECT count(*) INTO anon_view_count
  FROM pg_class AS views
  JOIN pg_namespace AS schemas ON schemas.oid = views.relnamespace
  WHERE schemas.nspname = 'public'
    AND views.relname IN (
      'weekly_leaderboard',
      'last_weekly_leaderboard',
      'recent_activity_feed',
      'recent_peer_activities'
    )
    AND has_table_privilege('anon', views.oid, 'SELECT');

  SELECT count(*) INTO public_definer_count
  FROM pg_proc AS functions
  JOIN pg_namespace AS schemas ON schemas.oid = functions.pronamespace
  WHERE schemas.nspname = 'public'
    AND functions.proname IN (
      'activate_combo_booster',
      'decrement_item_quantity',
      'finalize_last_week_medals_if_needed',
      'record_daily_review_progress',
      'increment_bonus_points',
      'record_diagnosis_duration',
      'get_weekly_leaderboard',
      'get_recent_activity_feed',
      'get_recent_peer_activities'
    )
    AND functions.prosecdef;

  SELECT count(*) INTO anon_rpc_count
  FROM pg_proc AS functions
  JOIN pg_namespace AS schemas ON schemas.oid = functions.pronamespace
  WHERE schemas.nspname = 'public'
    AND functions.proname IN (
      'activate_combo_booster',
      'decrement_item_quantity',
      'finalize_last_week_medals_if_needed',
      'record_daily_review_progress',
      'increment_bonus_points',
      'record_diagnosis_duration',
      'get_weekly_leaderboard',
      'get_recent_activity_feed',
      'get_recent_peer_activities'
    )
    AND has_function_privilege('anon', functions.oid, 'EXECUTE');

  IF insecure_view_count <> 0
     OR anon_view_count <> 0
     OR public_definer_count <> 0
     OR anon_rpc_count <> 0 THEN
    RAISE EXCEPTION
      'Security verification failed: views=%, anon_views=%, definers=%, anon_rpcs=%',
      insecure_view_count,
      anon_view_count,
      public_definer_count,
      anon_rpc_count;
  END IF;
END;
$verify_security_surface$;

COMMIT;
