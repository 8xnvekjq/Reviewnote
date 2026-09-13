-- Explicit one-time admin Preview credit requested for PR #71.
-- No new point source, no client hardcode, no student updates.
DO $credit$
DECLARE affected integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('pixel_world_admin_preview_credit', 0));
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = 'pixel_world_admin_preview_credit') THEN
    RETURN;
  END IF;
  UPDATE public.profiles AS p
  SET point_adjustment = coalesce(p.point_adjustment, 0) + 1000
  WHERE p.id = '50b0db29-89b6-4601-bfd9-a17c5c81137b'::uuid
    AND EXISTS (SELECT 1 FROM private.app_admins AS a WHERE a.user_id = p.id);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected exactly one authorized admin, updated %', affected; END IF;
END
$credit$;
