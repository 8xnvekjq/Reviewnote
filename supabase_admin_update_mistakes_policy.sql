-- Create policy to allow admins to update all mistakes (e.g. grade, chapter, root causes, etc.)
DROP POLICY IF EXISTS "Admins can update all mistakes" ON public.mistakes;

CREATE POLICY "Admins can update all mistakes" ON public.mistakes
  FOR UPDATE USING (
    auth.uid() = user_id OR 
    (auth.jwt() ->> 'email') LIKE '8xnvekjq%'
  ) WITH CHECK (
    auth.uid() = user_id OR 
    (auth.jwt() ->> 'email') LIKE '8xnvekjq%'
  );
