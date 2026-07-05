-- ================================================
-- WEEKLY LEADERBOARD VIEW MIGRATION
-- 이 SQL 구문을 Supabase 대시보드의 SQL Editor에 복사하여 실행(Run)해 주세요.
-- ================================================

-- 1. 기존에 weekly_leaderboard 뷰가 존재하면 삭제
DROP VIEW IF EXISTS public.weekly_leaderboard;

-- 2. 이번주 최다 오답 완료 챔피언을 산출하는 보안 정의자 뷰 생성 (RLS 우회 조회용)
CREATE OR REPLACE VIEW public.weekly_leaderboard AS
SELECT 
  p.id as user_id,
  split_part(p.email, '@', 1) as username,
  p.display_name,
  COALESCE(m_total.count, 0) as weekly_total_count,
  COALESCE(m_completed.count, 0) as weekly_completed_count,
  CASE 
    WHEN COALESCE(m_total.count, 0) > 0 THEN 
      (COALESCE(m_completed.count, 0)::float / m_total.count::float)
    ELSE 0 
  END as completion_rate,
  (COALESCE(m_completed.count, 0) * 10) + 
  (CASE 
    WHEN COALESCE(m_total.count, 0) > 0 THEN 
      (COALESCE(m_completed.count, 0)::float / m_total.count::float) * 100
    ELSE 0 
  END) as score
FROM public.profiles p
INNER JOIN (
  -- 이번주(한국시간 월요일 00:00:00 기준) 등록된 오답 총합
  SELECT user_id, count(*) as count 
  FROM public.mistakes 
  WHERE date >= date_trunc('week', timezone('Asia/Seoul', now()))
  GROUP BY user_id
) m_total ON m_total.user_id = p.id
LEFT JOIN (
  -- 이번주에 등록되고 복습 O가 3개 이상 찍혀 완전히 완료된 오답 수
  SELECT user_id, count(*) as count 
  FROM public.mistakes 
  WHERE date >= date_trunc('week', timezone('Asia/Seoul', now()))
    AND (reviews->>0 = 'O' AND reviews->>1 = 'O' AND reviews->>2 = 'O')
  GROUP BY user_id
) m_completed ON m_completed.user_id = p.id
WHERE COALESCE(m_total.count, 0) > 0;
