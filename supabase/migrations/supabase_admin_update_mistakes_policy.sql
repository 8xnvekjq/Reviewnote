-- Create policy to allow admins to update all mistakes (e.g. grade, chapter, root causes, etc.)
DROP POLICY IF EXISTS "Admins can update all mistakes" ON public.mistakes;

CREATE POLICY "Admins can update all mistakes" ON public.mistakes
  FOR UPDATE USING (
    (SELECT auth.uid()) = user_id OR
    (SELECT private.is_current_user_admin())
  ) WITH CHECK (
    (SELECT auth.uid()) = user_id OR
    (SELECT private.is_current_user_admin())
  );
