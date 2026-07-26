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
-- 관리자 판별은 하드코딩된 이메일 패턴이 아니라 profiles.is_admin으로 하여, 관리자 계정이
-- 추가되어도 별도 수정 없이 정상 동작하도록 한다.
CREATE POLICY "Scaffoldings select policy"
  ON public.mistake_scaffoldings FOR SELECT
  USING (
    auth.uid() = student_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

CREATE POLICY "Scaffoldings insert policy"
  ON public.mistake_scaffoldings FOR INSERT
  WITH CHECK (
    auth.uid() = teacher_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

CREATE POLICY "Scaffoldings delete policy"
  ON public.mistake_scaffoldings FOR DELETE
  USING (
    auth.uid() = teacher_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- 5. Grant permissions to authenticated role
GRANT ALL ON public.mistake_scaffoldings TO authenticated;
