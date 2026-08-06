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

-- 전광판에 표시할 획득 당시의 닉네임/칭호 스냅샷 (나중에 닉네임을 바꿔도 로그는 그대로 남도록)
ALTER TABLE public.gacha_logs ADD COLUMN IF NOT EXISTS user_name text;
ALTER TABLE public.gacha_logs ADD COLUMN IF NOT EXISTS user_title text;

-- RLS 보안 정책 설정: 모든 유저는 피드를 읽을 수 있고, 본인 유저 ID로 기록을 생성할 수 있음
ALTER TABLE public.gacha_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on gacha_logs" ON public.gacha_logs;
CREATE POLICY "Allow public read on gacha_logs" ON public.gacha_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert for auth users on gacha_logs" ON public.gacha_logs;
CREATE POLICY "Allow insert for auth users on gacha_logs" ON public.gacha_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 실시간 전광판 갱신: 이 테이블에 새 행이 생기면(다른 학생이 SSR/UR을 뽑으면)
-- 모든 접속자의 화면에 새로고침 없이 즉시 반영되도록 Realtime 복제 대상에 추가
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'gacha_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gacha_logs;
  END IF;
END $$;
