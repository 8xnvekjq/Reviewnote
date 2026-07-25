-- ================================================
-- WEEKLY & LAST WEEKLY LEADERBOARD VIEW MIGRATION (Clean Linear Score)
-- 이 SQL 구문을 Supabase 대시보드의 SQL Editor에 복사하여 실행(Run)해 주세요.
-- ================================================

-- 1. 이번주 리더보드 뷰 (7일 롤링 + 3차 완료 1개당 15점 정직한 직선 비례)
DROP VIEW IF EXISTS public.weekly_leaderboard;

CREATE VIEW public.weekly_leaderboard AS
WITH m_total AS (
  SELECT user_id, count(*) as count 
  FROM public.mistakes 
  WHERE date >= (now() - interval '7 days')
  GROUP BY user_id
),
m_completed AS (
  SELECT user_id, count(*) as count 
  FROM public.mistakes 
  WHERE updated_at >= (now() - interval '7 days')
    AND (reviews->>0 = 'O' AND reviews->>1 = 'O' AND reviews->>2 = 'O')
  GROUP BY user_id
)
SELECT 
  p.id as user_id,
  split_part(p.email, '@', 1) as username,
  p.display_name,
  COALESCE(p.nickname, p.display_name) as nickname,
  COALESCE(t.count, 0) as weekly_total_count,
  COALESCE(c.count, 0) as weekly_completed_count,
  CASE 
    WHEN COALESCE(t.count, 0) > 0 THEN 
      ROUND((COALESCE(c.count, 0)::numeric / t.count::numeric), 2)
    ELSE 1.0
  END as completion_rate,
  (COALESCE(c.count, 0) * 15) as score
FROM public.profiles p
LEFT JOIN m_total t ON t.user_id = p.id
LEFT JOIN m_completed c ON c.user_id = p.id
WHERE (p.is_admin IS NOT TRUE)
  AND (COALESCE(p.email, '') NOT LIKE '8xnvekjq%')
  AND (COALESCE(p.email, '') NOT LIKE 'test%')
  AND (COALESCE(c.count, 0) > 0 OR COALESCE(t.count, 0) > 0);

-- 2. 지난주 리더보드 뷰 (14일~7일 전 롤링)
DROP VIEW IF EXISTS public.last_weekly_leaderboard;

CREATE VIEW public.last_weekly_leaderboard AS
WITH m_total AS (
  SELECT user_id, count(*) as count 
  FROM public.mistakes 
  WHERE date >= (now() - interval '14 days')
    AND date < (now() - interval '7 days')
  GROUP BY user_id
),
m_completed AS (
  SELECT user_id, count(*) as count 
  FROM public.mistakes 
  WHERE updated_at >= (now() - interval '14 days')
    AND updated_at < (now() - interval '7 days')
    AND (reviews->>0 = 'O' AND reviews->>1 = 'O' AND reviews->>2 = 'O')
  GROUP BY user_id
)
SELECT 
  p.id as user_id,
  split_part(p.email, '@', 1) as username,
  p.display_name,
  COALESCE(p.nickname, p.display_name) as nickname,
  COALESCE(t.count, 0) as weekly_total_count,
  COALESCE(c.count, 0) as weekly_completed_count,
  CASE 
    WHEN COALESCE(t.count, 0) > 0 THEN 
      ROUND((COALESCE(c.count, 0)::numeric / t.count::numeric), 2)
    ELSE 1.0
  END as completion_rate,
  (COALESCE(c.count, 0) * 15) as score
FROM public.profiles p
LEFT JOIN m_total t ON t.user_id = p.id
LEFT JOIN m_completed c ON c.user_id = p.id
WHERE (p.is_admin IS NOT TRUE)
  AND (COALESCE(p.email, '') NOT LIKE '8xnvekjq%')
  AND (COALESCE(p.email, '') NOT LIKE 'test%')
  AND (COALESCE(c.count, 0) > 0 OR COALESCE(t.count, 0) > 0);
