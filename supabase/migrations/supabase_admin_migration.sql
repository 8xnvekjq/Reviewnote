-- ================================================
-- RLS RECURSION FIX MIGRATION
-- Run this in Supabase SQL Editor
-- ================================================

-- 1. Drop the policies and functions that cause recursion
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all mistakes" ON public.mistakes;
DROP FUNCTION IF EXISTS public.is_admin();

-- 2. Create clean, recursion-free RLS policies using the private admin allow-list.
-- Requires 20260828181839_secure_admin_authorization.sql to be applied first.
CREATE POLICY "Admins can read all profiles" ON public.profiles
  FOR SELECT USING (
    id = (SELECT auth.uid()) OR
    (SELECT private.is_current_user_admin())
  );

CREATE POLICY "Admins can read all mistakes" ON public.mistakes
  FOR SELECT USING (
    (SELECT auth.uid()) = user_id OR
    (SELECT private.is_current_user_admin())
  );
