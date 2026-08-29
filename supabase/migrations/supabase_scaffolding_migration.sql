-- ====================================================
-- REVIEWNOTE SCAFFOLDING (스캐폴딩) PHOTO ATTACHMENTS MIGRATION
-- Table for teacher hint photo attachments per mistake
-- ====================================================

-- 1. Create mistake_scaffoldings table
CREATE TABLE IF NOT EXISTS public.mistake_scaffoldings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mistake_id UUID NOT NULL REFERENCES public.mistakes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.mistake_scaffoldings ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies if any
DROP POLICY IF EXISTS "Scaffoldings select policy" ON public.mistake_scaffoldings;
DROP POLICY IF EXISTS "Scaffoldings insert policy" ON public.mistake_scaffoldings;
DROP POLICY IF EXISTS "Scaffoldings delete policy" ON public.mistake_scaffoldings;

-- 4. Create RLS Policies: Students see their own mistake scaffoldings; Teachers (admins) see/manage all.
-- 관리자 판별은 학생이 수정 가능한 profiles.is_admin이 아니라 비공개 관리자 명단을 사용한다.
-- 학생/교사의 기존 양방향 힌트 접근 조건은 그대로 유지한다.
CREATE POLICY "Scaffoldings select policy"
  ON public.mistake_scaffoldings FOR SELECT
  USING (
    (SELECT auth.uid()) = student_id
    OR (SELECT private.is_current_user_admin())
  );

CREATE POLICY "Scaffoldings insert policy"
  ON public.mistake_scaffoldings FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = teacher_id
    OR (SELECT private.is_current_user_admin())
  );

CREATE POLICY "Scaffoldings delete policy"
  ON public.mistake_scaffoldings FOR DELETE
  USING (
    (SELECT auth.uid()) = teacher_id
    OR (SELECT private.is_current_user_admin())
  );

-- 5. Grant permissions to authenticated role
GRANT ALL ON public.mistake_scaffoldings TO authenticated;

-- 6. 실시간 갱신: 선생님이 힌트를 첨부/삭제하면 학생 화면의 오답카드 초록 마크가
-- 새로고침 없이 즉시 반영되도록 Realtime 발행 목록에 추가
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'mistake_scaffoldings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mistake_scaffoldings;
  END IF;
END $$;
