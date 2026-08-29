-- Create policy to allow admins to update other users' profiles (e.g. school_grade, display_name)
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (
    id = (SELECT auth.uid()) OR
    (SELECT private.is_current_user_admin())
  ) WITH CHECK (
    id = (SELECT auth.uid()) OR
    (SELECT private.is_current_user_admin())
  );
