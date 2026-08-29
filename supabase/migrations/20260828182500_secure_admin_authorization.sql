BEGIN;

-- Keep authorization data outside the exposed public schema. The application
-- must never infer administrator privileges from an email prefix or from a
-- profile field that the profile owner can update.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS private.app_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE private.app_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.app_admins FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.app_admins FROM PUBLIC, anon, authenticated;

-- Seed the one current teacher account by exact email. Fail loudly instead of
-- deploying policies that would accidentally lock the teacher out.
DO $seed_admin$
DECLARE
  teacher_user_id UUID;
BEGIN
  SELECT users.id
    INTO teacher_user_id
    FROM auth.users AS users
   WHERE lower(users.email) = '8xnvekjq@reviewnote.com'
   ORDER BY users.created_at ASC
   LIMIT 1;

  IF teacher_user_id IS NULL THEN
    RAISE EXCEPTION
      'Admin bootstrap failed: auth user 8xnvekjq@reviewnote.com was not found';
  END IF;

  INSERT INTO private.app_admins (user_id)
  VALUES (teacher_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$seed_admin$;

-- SECURITY DEFINER is required only for this private membership lookup because
-- authenticated users have no direct access to private.app_admins. The caller's
-- auth.uid() is always part of the predicate and every object is schema-qualified.
CREATE OR REPLACE FUNCTION private.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM private.app_admins AS admins
       WHERE admins.user_id = (SELECT auth.uid())
    );
$function$;

REVOKE ALL ON FUNCTION private.is_current_user_admin()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_current_user_admin() TO authenticated;

-- Public RPC wrapper for the React client. It remains SECURITY INVOKER and can
-- only return whether the currently authenticated caller is in the private list.
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.is_current_user_admin();
$function$;

REVOKE ALL ON FUNCTION public.is_current_user_admin()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- Derive profiles.is_admin from the private allow-list on every attempted
-- insert/change, so a profile owner cannot grant the flag to themselves.
CREATE OR REPLACE FUNCTION private.enforce_profile_admin_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  NEW.is_admin := EXISTS (
    SELECT 1
      FROM private.app_admins AS admins
     WHERE admins.user_id = NEW.id
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.enforce_profile_admin_flag()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS enforce_profile_admin_flag ON public.profiles;
CREATE TRIGGER enforce_profile_admin_flag
  BEFORE INSERT OR UPDATE OF is_admin ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_profile_admin_flag();

-- Keep the legacy display/filter column synchronized if an administrator is
-- added to or removed from the private allow-list later.
CREATE OR REPLACE FUNCTION private.sync_admin_profile_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
       SET is_admin = false
     WHERE id = OLD.user_id;
    RETURN OLD;
  END IF;

  UPDATE public.profiles
     SET is_admin = true
   WHERE id = NEW.user_id;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.sync_admin_profile_flag()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS sync_admin_profile_flag ON private.app_admins;
CREATE TRIGGER sync_admin_profile_flag
  AFTER INSERT OR DELETE ON private.app_admins
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_admin_profile_flag();

-- Remove any stale or self-assigned flags before recreating authorization
-- policies. This does not modify points, streaks, rewards, or hint contents.
UPDATE public.profiles AS profiles
   SET is_admin = EXISTS (
     SELECT 1
       FROM private.app_admins AS admins
      WHERE admins.user_id = profiles.id
   )
 WHERE profiles.is_admin IS DISTINCT FROM EXISTS (
   SELECT 1
     FROM private.app_admins AS admins
    WHERE admins.user_id = profiles.id
 );

-- Profiles: the existing owner policies continue to handle each student's own
-- row. These policies add only the administrator-wide access.
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
CREATE POLICY "Admins can read all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT private.is_current_user_admin()));

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT private.is_current_user_admin()))
  WITH CHECK ((SELECT private.is_current_user_admin()));

-- Mistakes: owner policies remain unchanged; these policies cover teacher-wide
-- read, update, and delete operations without relying on an email pattern.
DROP POLICY IF EXISTS "Admins can read all mistakes" ON public.mistakes;
CREATE POLICY "Admins can read all mistakes"
  ON public.mistakes
  FOR SELECT
  TO authenticated
  USING ((SELECT private.is_current_user_admin()));

DROP POLICY IF EXISTS "Admins can update all mistakes" ON public.mistakes;
CREATE POLICY "Admins can update all mistakes"
  ON public.mistakes
  FOR UPDATE
  TO authenticated
  USING ((SELECT private.is_current_user_admin()))
  WITH CHECK ((SELECT private.is_current_user_admin()));

DROP POLICY IF EXISTS "Admins can delete all mistakes" ON public.mistakes;
CREATE POLICY "Admins can delete all mistakes"
  ON public.mistakes
  FOR DELETE
  TO authenticated
  USING ((SELECT private.is_current_user_admin()));

-- Preserve the existing two-way scaffolding access model exactly; only replace
-- the old, user-editable profiles.is_admin authorization lookup.
DROP POLICY IF EXISTS "Scaffoldings select policy" ON public.mistake_scaffoldings;
CREATE POLICY "Scaffoldings select policy"
  ON public.mistake_scaffoldings
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = student_id
    OR (SELECT private.is_current_user_admin())
  );

DROP POLICY IF EXISTS "Scaffoldings insert policy" ON public.mistake_scaffoldings;
CREATE POLICY "Scaffoldings insert policy"
  ON public.mistake_scaffoldings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = teacher_id
    OR (SELECT private.is_current_user_admin())
  );

DROP POLICY IF EXISTS "Scaffoldings delete policy" ON public.mistake_scaffoldings;
CREATE POLICY "Scaffoldings delete policy"
  ON public.mistake_scaffoldings
  FOR DELETE
  TO authenticated
  USING (
    (SELECT auth.uid()) = teacher_id
    OR (SELECT private.is_current_user_admin())
  );

DROP POLICY IF EXISTS "Scaffoldings update policy" ON public.mistake_scaffoldings;
CREATE POLICY "Scaffoldings update policy"
  ON public.mistake_scaffoldings
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = student_id
    OR (SELECT private.is_current_user_admin())
  );

DROP POLICY IF EXISTS "Admins can view all user_items" ON public.user_items;
CREATE POLICY "Admins can view all user_items"
  ON public.user_items
  FOR SELECT
  TO authenticated
  USING ((SELECT private.is_current_user_admin()));

-- Migration-time invariant: the exact teacher account must be the sole seeded
-- administrator. Additional admins can be added explicitly to private.app_admins.
DO $verify_admin$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM private.app_admins AS admins
      JOIN auth.users AS users ON users.id = admins.user_id
     WHERE lower(users.email) = '8xnvekjq@reviewnote.com'
  ) THEN
    RAISE EXCEPTION 'Admin authorization verification failed';
  END IF;
END;
$verify_admin$;

COMMIT;
