-- ================================================
-- DISPLAY NAME MIGRATION
-- Supabase SQL Editor에서 실행하세요
-- ================================================

-- 1. profiles 테이블에 display_name 컬럼 추가
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text;

-- 2. 기존 사용자의 display_name을 auth.users 메타데이터에서 자동 채우기
UPDATE public.profiles p
SET display_name = u.raw_user_meta_data ->> 'display_name'
FROM auth.users u
WHERE p.id = u.id
  AND (p.display_name IS NULL OR p.display_name = '')
  AND (u.raw_user_meta_data ->> 'display_name') IS NOT NULL;

-- 3. 신규 가입 시 display_name을 profiles에 자동 저장하도록 트리거 함수 수정
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'display_name'
  )
  ON CONFLICT (id) DO UPDATE
    SET display_name = EXCLUDED.display_name;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
