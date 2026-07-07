-- Create policy to allow admins to update other users' profiles (e.g. school_grade, display_name)
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (
    id = auth.uid() OR 
    (auth.jwt() ->> 'email') LIKE '8xnvekjq%'
  ) WITH CHECK (
    id = auth.uid() OR 
    (auth.jwt() ->> 'email') LIKE '8xnvekjq%'
  );
