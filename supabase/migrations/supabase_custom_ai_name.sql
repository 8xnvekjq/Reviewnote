-- ================================================
-- CUSTOM AI PERSONA NAME COLUMN
-- Supabase 대시보드 SQL Editor에 복사하여 실행해 주세요.
-- ================================================
-- AI 이름 변경권(SSR 뽑기 아이템, item_ai_name_change)을 사용하면 학생별로
-- Gemini AI 비서의 페르소나 이름(기본값 '밤티')을 원하는 이름으로 바꿀 수 있다.
-- 값이 없으면(NULL/빈 문자열) 클라이언트에서 기본값 '밤티'로 대체해서 사용한다.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_ai_name text;
