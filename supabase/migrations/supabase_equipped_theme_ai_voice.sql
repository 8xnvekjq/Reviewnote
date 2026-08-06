-- ================================================
-- PROFILES EQUIPPED THEME & AI VOICE COLUMNS MIGRATION
-- Supabase 대시보드 SQL Editor에 복사하여 실행해 주세요.
-- ================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_theme text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_ai_voice text;
