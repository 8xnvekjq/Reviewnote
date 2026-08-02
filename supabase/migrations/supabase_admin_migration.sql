-- ================================================
-- RLS RECURSION FIX MIGRATION
-- Run this in Supabase SQL Editor
-- ================================================

-- 1. Drop the policies and functions that cause recursion
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all mistakes" ON public.mistakes;
DROP FUNCTION IF EXISTS public.is_admin();

-- 2. Create clean, recursion-free RLS policies using JWT metadata
-- This completely avoids querying the profiles table during policy checks.
CREATE POLICY "Admins can read all profiles" ON public.profiles
  FOR SELECT USING (
    id = auth.uid() OR 
    (auth.jwt() ->> 'email') LIKE '8xnvekjq%'
  );

CREATE POLICY "Admins can read all mistakes" ON public.mistakes
  FOR SELECT USING (
    auth.uid() = user_id OR 
    (auth.jwt() ->> 'email') LIKE '8xnvekjq%'
  );
