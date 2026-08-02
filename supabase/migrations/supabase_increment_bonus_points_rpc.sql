-- ================================================
-- ATOMIC BONUS POINTS INCREMENT RPC
-- Supabase 대시보드 SQL Editor에 복사하여 실행해 주세요.
-- ================================================
-- 콤보 포인트(bonus_points)를 클라이언트에서 "현재 값 읽기 → 델타 더하기 → 절대값 쓰기"
-- 방식으로 갱신하던 것을 서버 측 원자적 증감으로 교체한다. 기존 방식은 같은 사용자의
-- 두 요청(예: 빠르게 연속으로 복습 단계를 클릭하거나, 실시간 동기화로 인한 재조회가
-- 겹치는 경우)이 겹치면 한쪽의 로컬 상태(closure)가 최신 값을 반영하지 못한 채 그대로
-- 서버에 덮어써서 포인트가 유실되거나 잘못된 값으로 겹쳐 써지는 레이스 컨디션이 있었다.

CREATE OR REPLACE FUNCTION public.increment_bonus_points(user_id_param uuid, amount_param integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_total integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != user_id_param THEN
    RAISE EXCEPTION 'Not authorized to modify this user''s points';
  END IF;

  UPDATE public.profiles
  SET bonus_points = GREATEST(0, COALESCE(bonus_points, 0) + amount_param)
  WHERE id = user_id_param
  RETURNING bonus_points INTO new_total;

  RETURN new_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_bonus_points(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_bonus_points(uuid, integer) TO authenticated;
