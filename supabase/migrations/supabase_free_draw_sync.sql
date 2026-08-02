-- ================================================
-- FREE DAILY/WEEKLY DRAW MIGRATION
-- Supabase 대시보드 SQL Editor에 복사하여 실행해 주세요.
-- ================================================
-- 학생별로 매일 무료 1회 뽑기, 매주 월요일(KST) 기준 무료 10회 뽑기를 제공하기 위한 컬럼입니다.
-- 기기를 바꿔도 무료 뽑기를 중복으로 받지 못하도록 서버에 마지막 사용일을 기록합니다.
--
-- last_free_draw_date: 마지막으로 무료 1회 뽑기를 사용한 날짜 (YYYY-MM-DD, KST)
-- last_free_weekly_draw_date: 마지막으로 무료 10회 뽑기를 사용한 주의 월요일 날짜 (YYYY-MM-DD, KST)

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_free_draw_date text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_free_weekly_draw_date text;
