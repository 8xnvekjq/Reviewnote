-- 시험대비 분석 "선생님 코멘트" — 학생별 공통 코멘트 1개(시험범위별 아님).
-- 관리자가 자유 텍스트로 직접 작성하고, 학생은 본인 것만 읽기 전용으로 볼 수 있다.
-- AI 생성 없음 — 순수 사람이 작성한 텍스트를 저장/조회하는 테이블.

BEGIN;

CREATE TABLE IF NOT EXISTS public.exam_prep_teacher_comments (
  student_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id)
);

ALTER TABLE public.exam_prep_teacher_comments ENABLE ROW LEVEL SECURITY;

-- updated_at/updated_by는 클라이언트가 보낸 값을 신뢰하지 않고 서버에서 항상 덮어쓴다
-- (private.enforce_profile_admin_flag와 같은 원칙 — 저장 시점의 실제 호출자만 기록).
CREATE OR REPLACE FUNCTION private.set_exam_prep_teacher_comment_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := (SELECT auth.uid());
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.set_exam_prep_teacher_comment_metadata()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS set_exam_prep_teacher_comment_metadata ON public.exam_prep_teacher_comments;
CREATE TRIGGER set_exam_prep_teacher_comment_metadata
  BEFORE INSERT OR UPDATE ON public.exam_prep_teacher_comments
  FOR EACH ROW
  EXECUTE FUNCTION private.set_exam_prep_teacher_comment_metadata();

-- 학생은 본인 코멘트만 읽는다(다른 학생 코멘트 접근 불가). 쓰기는 관리자만 — 학생 본인도 수정 불가.
DROP POLICY IF EXISTS "Exam prep teacher comments select policy" ON public.exam_prep_teacher_comments;
CREATE POLICY "Exam prep teacher comments select policy"
  ON public.exam_prep_teacher_comments
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = student_id
    OR (SELECT private.is_current_user_admin())
  );

DROP POLICY IF EXISTS "Exam prep teacher comments insert policy" ON public.exam_prep_teacher_comments;
CREATE POLICY "Exam prep teacher comments insert policy"
  ON public.exam_prep_teacher_comments
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT private.is_current_user_admin()));

DROP POLICY IF EXISTS "Exam prep teacher comments update policy" ON public.exam_prep_teacher_comments;
CREATE POLICY "Exam prep teacher comments update policy"
  ON public.exam_prep_teacher_comments
  FOR UPDATE
  TO authenticated
  USING ((SELECT private.is_current_user_admin()))
  WITH CHECK ((SELECT private.is_current_user_admin()));

GRANT SELECT, INSERT, UPDATE ON public.exam_prep_teacher_comments TO authenticated;

COMMIT;
