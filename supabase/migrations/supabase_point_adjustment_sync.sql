-- ================================================
-- POINT ADJUSTMENT (럭키상점 사용 점수) SYNC MIGRATION
-- Supabase 대시보드 SQL Editor에 복사하여 실행해 주세요.
-- ================================================
-- 럭키상점에서 뽑기로 점수를 쓴 기록(pointAdjustment)이 지금까지 localStorage에만
-- 저장되어 기기를 바꾸거나 브라우저 데이터를 지우면 "쓴 적 없음"으로 리셋되어
-- 이미 쓴 점수가 다시 살아나던 문제를 해결하기 위한 컬럼입니다.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS point_adjustment integer DEFAULT 0;
