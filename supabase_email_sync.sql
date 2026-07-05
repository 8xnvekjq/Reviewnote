-- ================================================
-- SUPABASE EMAIL SYNC & TRIGGER FIX MIGRATION
-- 이 스크립트를 Supabase 대시보드의 SQL Editor에 붙여넣고 Run을 눌러 실행해 주세요.
-- ================================================

-- 1. profiles 테이블에 email 컬럼이 없는 경우 추가
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- 2. 기존 가입 사용자들의 이메일을 auth.users 테이블로부터 일괄 연동 (소급 적용)
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email = '');

-- 3. 신규 가입 시 이메일(email)과 이름(display_name)이 profiles 테이블에 동시 저장되도록 트리거 함수 업데이트
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'display_name'
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = EXCLUDED.display_name;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. trigger가 활성화되어 있는지 재정의 (없을 시 생성)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
