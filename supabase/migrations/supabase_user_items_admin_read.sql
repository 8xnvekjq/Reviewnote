-- ================================================
-- ADMIN READ ACCESS FOR user_items MIGRATION
-- Supabase 대시보드 SQL Editor에 복사하여 실행해 주세요.
-- ================================================
-- 어드민 패널에서 학생 카드를 클릭하면 그 학생의 럭키상점 보유 아이템을
-- 조회할 수 있어야 하는데, user_items 테이블의 RLS가 "본인 행만 조회 가능"으로
-- 되어있어서 어드민 계정으로도 다른 학생의 아이템을 조회할 수 없었습니다.
-- 관리자(profiles.is_admin = true)는 모든 학생의 인벤토리를 읽을 수 있도록
-- 별도의 SELECT 정책을 추가합니다. (기존 "본인만 조회 가능" 정책은 그대로 유지되어
-- 일반 학생 계정의 권한은 변경되지 않습니다.)

DROP POLICY IF EXISTS "Admins can view all user_items" ON public.user_items;
CREATE POLICY "Admins can view all user_items" ON public.user_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );
