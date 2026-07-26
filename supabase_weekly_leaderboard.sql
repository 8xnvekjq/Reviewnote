-- ================================================
-- WEEKLY & LAST WEEKLY LEADERBOARD VIEW MIGRATION
-- 이 SQL 구문을 Supabase 대시보드의 SQL Editor에 복사하여 실행(Run)해 주세요.
-- ================================================
-- 명예의전당(weekly_leaderboard/last_weekly_leaderboard) 점수 공식을 콤보 포인트와
-- 완전히 동일한 단계별 점수제로 통일한다: 1차 O=3, 2차 O=7, 3차 O(최종완료)=15,
-- X/★=참여점수 1점 (모두 "이번 주 안에 그 단계를 표시했을 때만" 카운트).
--
-- 예전엔 "이번주 등록 대비 완료율"에 보너스를 줬는데, 새 오답을 등록하기만 해도
-- 분모가 커져서 오히려 점수가 깎이는 역설이 있어서 폐지했다. 또한 예전엔 오답을
-- 3단계까지 "완전히" 끝내야만 점수가 잡혔는데, 이제는 1·2차 복습이나 X/★ 표시만
-- 해도 그만큼 점수가 잡혀서 더 많은 학생의 활동이 명예의전당에 반영된다.
--
-- reviewDates(각 복습 단계를 실제로 표시한 시각)는 "7/20 08:31" 같은 연도 없는 문자열로
-- 저장돼 있어서, 이를 KST 기준 timestamp로 정확히 파싱하는 parse_review_date_kst() 함수를
-- 사용한다 (없다면 updated_at, 그마저 없으면 date로 폴백).
--
-- ⚠️ 타임존 버그 수정: parse_review_date_kst()/timezone(...)의 결과는 naive timestamp인데,
-- 이걸 timestamptz인 week_start와 곧바로 비교하면 세션 타임존(UTC)으로 잘못 캐스팅되어
-- KST 밤 11시대 기록이 실제로는 지난주인데도 이번 주로 새는 문제가 있었다 (예: 한 학생의
-- 점수가 실제 7점이어야 하는데 버그로 54점까지 부풀려짐). COALESCE 전체를 다시
-- timezone('Asia/Seoul', ...)로 한 번 더 감싸서 timestamptz로 정확히 변환한 뒤 비교한다.

-- 1. 이번주 리더보드 뷰
DROP VIEW IF EXISTS public.weekly_leaderboard;

CREATE VIEW public.weekly_leaderboard AS
WITH week_start AS (
  SELECT timezone('Asia/Seoul', date_trunc('week', timezone('Asia/Seoul', now()))) as ts
),
stage_scores AS (
  SELECT
    m.user_id,
    (CASE WHEN timezone('Asia/Seoul', COALESCE(parse_review_date_kst(m.analysis->'reviewDates'->>0), timezone('Asia/Seoul', m.updated_at), timezone('Asia/Seoul', m.date))) >= week_start.ts
          THEN CASE m.reviews->>0 WHEN 'O' THEN 3 WHEN 'X' THEN 1 WHEN 'star' THEN 1 ELSE 0 END ELSE 0 END
    +
     CASE WHEN timezone('Asia/Seoul', COALESCE(parse_review_date_kst(m.analysis->'reviewDates'->>1), timezone('Asia/Seoul', m.updated_at), timezone('Asia/Seoul', m.date))) >= week_start.ts
          THEN CASE m.reviews->>1 WHEN 'O' THEN 7 WHEN 'X' THEN 1 WHEN 'star' THEN 1 ELSE 0 END ELSE 0 END
    +
     CASE WHEN timezone('Asia/Seoul', COALESCE(parse_review_date_kst(m.analysis->'reviewDates'->>2), timezone('Asia/Seoul', m.updated_at), timezone('Asia/Seoul', m.date))) >= week_start.ts
          THEN CASE m.reviews->>2 WHEN 'O' THEN 15 WHEN 'X' THEN 1 WHEN 'star' THEN 1 ELSE 0 END ELSE 0 END
    ) AS mistake_score
  FROM public.mistakes m, week_start
),
m_total AS (
  -- 이번주(한국시간 월요일 00:00:00 기준) 등록된 신규 오답 총합
  SELECT user_id, count(*) AS count FROM public.mistakes, week_start WHERE date >= week_start.ts GROUP BY user_id
),
m_completed AS (
  -- 이번주에 복습이 완전히 완료(reviews O 3개)된 오답 수 (이전 등록 오답의 이번주 완료건 포함)
  SELECT user_id, count(*) AS count FROM public.mistakes, week_start
  WHERE updated_at >= week_start.ts AND (reviews->>0 = 'O' AND reviews->>1 = 'O' AND reviews->>2 = 'O')
  GROUP BY user_id
),
user_scores AS (
  SELECT user_id, SUM(mistake_score) AS score FROM stage_scores GROUP BY user_id
)
SELECT
  p.id as user_id,
  split_part(p.email, '@', 1) as username,
  p.display_name,
  COALESCE(p.nickname, p.display_name) as nickname,
  p.equipped_title as title,
  COALESCE(t.count, 0) as weekly_total_count,
  COALESCE(c.count, 0) as weekly_completed_count,
  COALESCE(s.score, 0) as score
FROM public.profiles p
LEFT JOIN m_total t ON t.user_id = p.id
LEFT JOIN m_completed c ON c.user_id = p.id
LEFT JOIN user_scores s ON s.user_id = p.id
WHERE (p.is_admin IS NOT TRUE)
  AND (COALESCE(p.email, '') NOT LIKE '8xnvekjq%')
  AND (COALESCE(p.email, '') NOT LIKE 'test%')
  AND COALESCE(s.score, 0) > 0;

GRANT SELECT ON public.weekly_leaderboard TO authenticated, anon;

-- 2. 지난주 리더보드 뷰 (동일 공식, 지난주 구간으로 이동)
DROP VIEW IF EXISTS public.last_weekly_leaderboard;

CREATE VIEW public.last_weekly_leaderboard AS
WITH week_start AS (
  SELECT timezone('Asia/Seoul', date_trunc('week', timezone('Asia/Seoul', now()))) as ts
),
last_week_start AS (
  SELECT timezone('Asia/Seoul', date_trunc('week', timezone('Asia/Seoul', now())) - interval '1 week') as ts
),
stage_scores AS (
  SELECT
    m.user_id,
    (CASE WHEN timezone('Asia/Seoul', COALESCE(parse_review_date_kst(m.analysis->'reviewDates'->>0), timezone('Asia/Seoul', m.updated_at), timezone('Asia/Seoul', m.date))) >= last_week_start.ts
           AND timezone('Asia/Seoul', COALESCE(parse_review_date_kst(m.analysis->'reviewDates'->>0), timezone('Asia/Seoul', m.updated_at), timezone('Asia/Seoul', m.date))) < week_start.ts
          THEN CASE m.reviews->>0 WHEN 'O' THEN 3 WHEN 'X' THEN 1 WHEN 'star' THEN 1 ELSE 0 END ELSE 0 END
    +
     CASE WHEN timezone('Asia/Seoul', COALESCE(parse_review_date_kst(m.analysis->'reviewDates'->>1), timezone('Asia/Seoul', m.updated_at), timezone('Asia/Seoul', m.date))) >= last_week_start.ts
           AND timezone('Asia/Seoul', COALESCE(parse_review_date_kst(m.analysis->'reviewDates'->>1), timezone('Asia/Seoul', m.updated_at), timezone('Asia/Seoul', m.date))) < week_start.ts
          THEN CASE m.reviews->>1 WHEN 'O' THEN 7 WHEN 'X' THEN 1 WHEN 'star' THEN 1 ELSE 0 END ELSE 0 END
    +
     CASE WHEN timezone('Asia/Seoul', COALESCE(parse_review_date_kst(m.analysis->'reviewDates'->>2), timezone('Asia/Seoul', m.updated_at), timezone('Asia/Seoul', m.date))) >= last_week_start.ts
           AND timezone('Asia/Seoul', COALESCE(parse_review_date_kst(m.analysis->'reviewDates'->>2), timezone('Asia/Seoul', m.updated_at), timezone('Asia/Seoul', m.date))) < week_start.ts
          THEN CASE m.reviews->>2 WHEN 'O' THEN 15 WHEN 'X' THEN 1 WHEN 'star' THEN 1 ELSE 0 END ELSE 0 END
    ) AS mistake_score
  FROM public.mistakes m, week_start, last_week_start
),
m_total AS (
  -- 지난주(한국시간 지난주 월요일 ~ 이번주 월요일 KST) 등록된 신규 오답 총합
  SELECT user_id, count(*) AS count FROM public.mistakes, last_week_start, week_start
  WHERE date >= last_week_start.ts AND date < week_start.ts GROUP BY user_id
),
m_completed AS (
  -- 지난주에 복습이 완전히 완료(reviews O 3개)된 오답 수
  SELECT user_id, count(*) AS count FROM public.mistakes, last_week_start, week_start
  WHERE updated_at >= last_week_start.ts AND updated_at < week_start.ts
    AND (reviews->>0 = 'O' AND reviews->>1 = 'O' AND reviews->>2 = 'O')
  GROUP BY user_id
),
user_scores AS (
  SELECT user_id, SUM(mistake_score) AS score FROM stage_scores GROUP BY user_id
)
SELECT
  p.id as user_id,
  split_part(p.email, '@', 1) as username,
  p.display_name,
  COALESCE(p.nickname, p.display_name) as nickname,
  p.equipped_title as title,
  COALESCE(t.count, 0) as weekly_total_count,
  COALESCE(c.count, 0) as weekly_completed_count,
  COALESCE(s.score, 0) as score
FROM public.profiles p
LEFT JOIN m_total t ON t.user_id = p.id
LEFT JOIN m_completed c ON c.user_id = p.id
LEFT JOIN user_scores s ON s.user_id = p.id
WHERE (p.is_admin IS NOT TRUE)
  AND (COALESCE(p.email, '') NOT LIKE '8xnvekjq%')
  AND (COALESCE(p.email, '') NOT LIKE 'test%')
  AND COALESCE(s.score, 0) > 0;

GRANT SELECT ON public.last_weekly_leaderboard TO authenticated, anon;
