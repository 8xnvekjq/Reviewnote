-- ================================================
-- STREAK SYNC & COMBO BONUS MIGRATION
-- Supabase 대시보드 SQL Editor에 복사하여 실행해 주세요.
-- ================================================
-- 지금까지 연속 복습 스트릭(streak.ts)이 localStorage에만 저장되어 기기를 바꾸면
-- 끊기던 문제와, 스트릭이 점수/보상과 전혀 연결되지 않던 문제를 함께 해결하기 위한 컬럼입니다.
--
-- current_streak / streak_last_review_date / streak_shields: 기존 localStorage 상태를 그대로
--   서버에도 영구 저장 (기기 변경/브라우저 데이터 삭제에도 안 끊기도록).
-- streak_milestone_claimed: 이번 스트릭 런에서 이미 지급받은 콤보 보너스 중 가장 높은 마일스톤
--   (0, 3, 7, 14). 스트릭이 끊기고 새로 시작하면 0으로 리셋되어 다시 받을 수 있음.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_streak integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS streak_last_review_date text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS streak_shields integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS streak_milestone_claimed integer DEFAULT 0;
