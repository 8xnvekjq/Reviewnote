-- ====================================================
-- ADD IS_READ COLUMN TO MISTAKE_SCAFFOLDINGS
-- DB 기반 신규 스캐폴딩 읽음 상태 관리
-- ====================================================

ALTER TABLE public.mistake_scaffoldings 
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;

DROP POLICY IF EXISTS "Scaffoldings update policy" ON public.mistake_scaffoldings;

CREATE POLICY "Scaffoldings update policy"
  ON public.mistake_scaffoldings FOR UPDATE
  USING (
    auth.uid() = student_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );
