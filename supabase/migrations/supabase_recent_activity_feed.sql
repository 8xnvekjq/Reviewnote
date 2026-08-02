-- ================================================
-- RECENT ACTIVITY FEED (최근 활동기록) MIGRATION
-- Supabase 대시보드 SQL Editor에 복사하여 실행해 주세요.
-- ================================================
-- 전체메뉴 "최근 활동기록" 패널용 뷰. 최근 7일간 오답 등록 / 복습 수행 이벤트를
-- mistakes 테이블의 기존 date/updated_at/reviewDates만으로 만들어내므로, 새 로그
-- 테이블 없이도 지난 7일치를 그대로 소급 표시할 수 있다 (gacha_logs와 달리 별도
-- INSERT 로깅이 필요 없음 — 이미 존재하는 타임스탬프를 그대로 활용).

CREATE OR REPLACE VIEW public.recent_activity_feed AS
WITH register_events AS (
  SELECT
    m.id AS mistake_id,
    m.user_id,
    'register'::text AS event_type,
    COALESCE(m.chapter, '단원 미지정') AS chapter,
    m.date AS event_time
  FROM public.mistakes m
  WHERE m.date >= now() - interval '7 days'
),
review_events AS (
  SELECT m.id AS mistake_id, m.user_id, 'review'::text AS event_type, COALESCE(m.chapter, '단원 미지정') AS chapter,
    timezone('Asia/Seoul', COALESCE(parse_review_date_kst(m.analysis->'reviewDates'->>0), timezone('Asia/Seoul', m.updated_at), timezone('Asia/Seoul', m.date))) AS event_time
  FROM public.mistakes m
  WHERE m.reviews->>0 IN ('O','X','star')
  UNION ALL
  SELECT m.id, m.user_id, 'review', COALESCE(m.chapter, '단원 미지정'),
    timezone('Asia/Seoul', COALESCE(parse_review_date_kst(m.analysis->'reviewDates'->>1), timezone('Asia/Seoul', m.updated_at), timezone('Asia/Seoul', m.date)))
  FROM public.mistakes m
  WHERE m.reviews->>1 IN ('O','X','star')
  UNION ALL
  SELECT m.id, m.user_id, 'review', COALESCE(m.chapter, '단원 미지정'),
    timezone('Asia/Seoul', COALESCE(parse_review_date_kst(m.analysis->'reviewDates'->>2), timezone('Asia/Seoul', m.updated_at), timezone('Asia/Seoul', m.date)))
  FROM public.mistakes m
  WHERE m.reviews->>2 IN ('O','X','star')
),
all_events AS (
  SELECT mistake_id, user_id, event_type, chapter, event_time FROM register_events
  UNION ALL
  SELECT mistake_id, user_id, event_type, chapter, event_time FROM review_events WHERE event_time >= now() - interval '7 days'
)
SELECT
  ae.mistake_id,
  ae.user_id,
  ae.event_type,
  ae.chapter,
  ae.event_time,
  COALESCE(p.nickname, p.display_name, split_part(p.email, '@', 1)) AS name,
  p.equipped_title,
  p.equipped_theme,
  p.equipped_stamp
FROM all_events ae
JOIN public.profiles p ON p.id = ae.user_id
WHERE p.is_admin IS NOT TRUE
  AND COALESCE(p.email, '') NOT LIKE '8xnvekjq%'
  AND COALESCE(p.email, '') NOT LIKE 'test%'
ORDER BY ae.event_time DESC
LIMIT 100;

GRANT SELECT ON public.recent_activity_feed TO authenticated;

-- 실시간 갱신: mistakes 테이블에 변화가 생기면(오답 등록/복습 수행) 새로고침 없이 즉시 반영
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'mistakes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mistakes;
  END IF;
END $$;
