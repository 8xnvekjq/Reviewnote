-- ================================================
-- FIX: 관리자가 학생의 오답 카드를 삭제해도 삭제되지 않던 버그
-- Supabase 대시보드 SQL Editor에 복사하여 실행해 주세요.
-- ================================================
-- 증상: 관리자가 오답노트 카드를 삭제하면 화면에서는 즉시 사라지지만,
-- 시간이 지나면(다른 학생의 활동으로 실시간 동기화가 발생하면) 다시 나타남.
--
-- 원인: public.mistakes 테이블의 DELETE 정책이 "본인 것만 삭제 가능"
-- (auth.uid() = user_id)으로만 되어 있었고, SELECT/UPDATE에는 이미 있는
-- 관리자 우회 조건이 DELETE에는 빠져 있었음.
--
-- 그 결과, 관리자가 학생 카드를 삭제해도 RLS가 조용히 걸러서 실제로는
-- 0건 삭제됨 (Supabase는 이 경우도 error:null을 반환하므로 클라이언트
-- 코드는 성공으로 착각). 화면에서는 로컬 state만 지워졌다가, 앱의
-- 무필터 실시간 구독(mistakes_live_sync 채널)이 다른 사용자의 변경사항으로
-- 트리거되어 전체 재조회를 하면 DB에 그대로 남아있던 카드가 다시 나타남.
--
-- 조치: 이미 SELECT/UPDATE에 적용된 것과 동일한 관리자 우회 패턴을
-- DELETE 정책에도 추가.

CREATE POLICY "Admins can delete all mistakes" ON public.mistakes
  FOR DELETE USING (auth.uid() = user_id OR (auth.jwt() ->> 'email') LIKE '8xnvekjq%');
