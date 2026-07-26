-- ================================================
-- ENABLE RLS ON youtube_lectures / youtube_timelines
-- Supabase 대시보드 SQL Editor에 복사하여 실행해 주세요.
-- (이미 Supabase MCP를 통해 실제 DB에는 적용 완료된 상태이며, 이 파일은 레포 기록용입니다.)
-- ================================================
-- 보안 어드바이저(get_advisors)에서 두 테이블이 RLS 없이 public으로 노출되어
-- anon key만으로 누구나 조회는 물론 삭제/수정까지 가능한 상태임이 확인되어 수정합니다.
-- 앱 코드는 두 테이블을 조회(select)만 하고 절대 쓰지 않으므로(데이터는 import_new_youtube_data_*.sql로
-- SQL Editor에서 직접 넣음), 읽기 전용 정책만 추가하고 쓰기 정책은 추가하지 않습니다.

ALTER TABLE public.youtube_lectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_timelines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on youtube_lectures" ON public.youtube_lectures;
CREATE POLICY "Allow public read on youtube_lectures" ON public.youtube_lectures FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read on youtube_timelines" ON public.youtube_timelines;
CREATE POLICY "Allow public read on youtube_timelines" ON public.youtube_timelines FOR SELECT USING (true);
