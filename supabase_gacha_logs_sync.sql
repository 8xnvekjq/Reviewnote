-- ================================================
-- GACHA LOGS (SSR/UR 전광판/실시간 획득 피드) TABLE MIGRATION
-- Supabase 대시보드 SQL Editor에 복사하여 실행해 주세요.
-- ================================================
-- 가챠 뽑기에서 SSR 및 UR 희귀 아이템을 획득했을 때
-- 모든 학생들에게 실시간으로 축하 피드가 노출되도록 저장하는 테이블입니다.

CREATE TABLE IF NOT EXISTS public.gacha_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  item_name text NOT NULL,
  item_icon text NOT NULL,
  rarity text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS 보안 정책 설정: 모든 유저는 피드를 읽을 수 있고, 본인 유저 ID로 기록을 생성할 수 있음
ALTER TABLE public.gacha_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on gacha_logs" ON public.gacha_logs;
CREATE POLICY "Allow public read on gacha_logs" ON public.gacha_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert for auth users on gacha_logs" ON public.gacha_logs;
CREATE POLICY "Allow insert for auth users on gacha_logs" ON public.gacha_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
