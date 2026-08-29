BEGIN;

-- The previous policy exposed every profile row and every profile column to
-- authenticated users. Keep the base table limited to the row owner/admin and
-- expose only the small directory projection required by social UI features.
DROP POLICY IF EXISTS "Allow authenticated read of profiles" ON public.profiles;

CREATE OR REPLACE FUNCTION private.get_profile_directory()
RETURNS TABLE (
  id UUID,
  username TEXT,
  nickname TEXT,
  display_name TEXT,
  school_grade TEXT,
  last_seen_at TIMESTAMPTZ,
  equipped_title TEXT,
  equipped_stamp TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    profiles.id,
    split_part(COALESCE(profiles.email, ''), '@', 1) AS username,
    profiles.nickname,
    profiles.display_name,
    profiles.school_grade,
    profiles.last_seen_at,
    profiles.equipped_title,
    profiles.equipped_stamp
  FROM public.profiles AS profiles
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND profiles.is_admin IS NOT TRUE;
$function$;

REVOKE ALL ON FUNCTION private.get_profile_directory()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_profile_directory() TO authenticated;

-- Exposed RPC remains SECURITY INVOKER. The privileged lookup itself stays in
-- the non-exposed private schema and returns no email, points, streak, reward,
-- API-key, or account-control columns.
CREATE OR REPLACE FUNCTION public.get_profile_directory()
RETURNS TABLE (
  id UUID,
  username TEXT,
  nickname TEXT,
  display_name TEXT,
  school_grade TEXT,
  last_seen_at TIMESTAMPTZ,
  equipped_title TEXT,
  equipped_stamp TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.get_profile_directory();
$function$;

REVOKE ALL ON FUNCTION public.get_profile_directory()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_profile_directory() TO authenticated;

DO $verify_profile_directory$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Allow authenticated read of profiles'
  ) THEN
    RAISE EXCEPTION 'Unsafe broad profile read policy still exists';
  END IF;

  IF has_function_privilege('anon', 'public.get_profile_directory()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role can execute get_profile_directory';
  END IF;
END;
$verify_profile_directory$;

COMMIT;
