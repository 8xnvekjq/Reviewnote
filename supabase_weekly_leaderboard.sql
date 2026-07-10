-- ================================================
-- WEEKLY & LAST WEEKLY LEADERBOARD VIEW MIGRATION
-- 이 SQL 구문을 Supabase 대시보드의 SQL Editor에 복사하여 실행(Run)해 주세요.
-- ================================================

-- 1. 이번주 리더보드 뷰
DROP VIEW IF EXISTS public.weekly_leaderboard;

CREATE OR REPLACE VIEW public.weekly_leaderboard AS
WITH m_total AS (
  -- 이번주(한국시간 월요일 00:00:00 기준) 등록된 신규 오답 총합
  SELECT user_id, count(*) as count 
  FROM public.mistakes 
  WHERE date >= date_trunc('week', timezone('Asia/Seoul', now()))
  GROUP BY user_id
),
m_completed AS (
  -- 이번주에 복습이 완전히 완료(reviews O 3개)된 오답 수 (이전 등록 오답의 이번주 완료건 포함)
  SELECT user_id, count(*) as count 
  FROM public.mistakes 
  WHERE updated_at >= date_trunc('week', timezone('Asia/Seoul', now()))
    AND (reviews->>0 = 'O' AND reviews->>1 = 'O' AND reviews->>2 = 'O')
  GROUP BY user_id
)
SELECT 
  p.id as user_id,
  split_part(p.email, '@', 1) as username,
  p.display_name,
  COALESCE(t.count, 0) as weekly_total_count,
  COALESCE(c.count, 0) as weekly_completed_count,
  CASE 
    WHEN COALESCE(t.count, 0) > 0 THEN 
      (COALESCE(c.count, 0)::float / t.count::float)
    ELSE 1.0 -- 신규 등록이 없지만 완료 건이 있는 경우 완료율 100% 보너스
  END as completion_rate,
  (COALESCE(c.count, 0) * 10) + 
  (CASE 
    WHEN COALESCE(t.count, 0) > 0 THEN 
      (COALESCE(c.count, 0)::float / t.count::float) * 100
    ELSE 100.0 -- 신규 등록 없이 복습을 완료해낸 학생에게 추가 가점 부여
  END) as score
FROM public.profiles p
LEFT JOIN m_total t ON t.user_id = p.id
LEFT JOIN m_completed c ON c.user_id = p.id
WHERE (p.is_admin IS NOT TRUE)
  AND (COALESCE(p.email, '') NOT LIKE '8xnvekjq%')
  AND (COALESCE(p.email, '') NOT LIKE 'test%')
  AND (COALESCE(t.count, 0) > 0 OR COALESCE(c.count, 0) > 0);

-- 2. 지난주 리더보드 뷰 (RLS 우회 조회용)
DROP VIEW IF EXISTS public.last_weekly_leaderboard;

CREATE OR REPLACE VIEW public.last_weekly_leaderboard AS
WITH m_total AS (
  -- 지난주(한국시간 지난주 월요일 ~ 이번주 월요일 KST) 등록된 신규 오답 총합
  SELECT user_id, count(*) as count 
  FROM public.mistakes 
  WHERE date >= date_trunc('week', timezone('Asia/Seoul', now())) - interval '1 week'
    AND date < date_trunc('week', timezone('Asia/Seoul', now()))
  GROUP BY user_id
),
m_completed AS (
  -- 지난주에 복습이 완전히 완료(reviews O 3개)된 오답 수
  SELECT user_id, count(*) as count 
  FROM public.mistakes 
  WHERE updated_at >= date_trunc('week', timezone('Asia/Seoul', now())) - interval '1 week'
    AND updated_at < date_trunc('week', timezone('Asia/Seoul', now()))
    AND (reviews->>0 = 'O' AND reviews->>1 = 'O' AND reviews->>2 = 'O')
  GROUP BY user_id
)
SELECT 
  p.id as user_id,
  split_part(p.email, '@', 1) as username,
  p.display_name,
  COALESCE(t.count, 0) as weekly_total_count,
  COALESCE(c.count, 0) as weekly_completed_count,
  CASE 
    WHEN COALESCE(t.count, 0) > 0 THEN 
      (COALESCE(c.count, 0)::float / t.count::float)
    ELSE 1.0
  END as completion_rate,
  (COALESCE(c.count, 0) * 10) + 
  (CASE 
    WHEN COALESCE(t.count, 0) > 0 THEN 
      (COALESCE(c.count, 0)::float / t.count::float) * 100
    ELSE 100.0
  END) as score
FROM public.profiles p
LEFT JOIN m_total t ON t.user_id = p.id
LEFT JOIN m_completed c ON c.user_id = p.id
WHERE (p.is_admin IS NOT TRUE)
  AND (COALESCE(p.email, '') NOT LIKE '8xnvekjq%')
  AND (COALESCE(p.email, '') NOT LIKE 'test%')
  AND (COALESCE(t.count, 0) > 0 OR COALESCE(c.count, 0) > 0);
