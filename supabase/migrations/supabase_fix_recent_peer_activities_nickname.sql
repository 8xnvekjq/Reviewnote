-- ================================================
-- FIX: recent_peer_activities WAS IGNORING CHANGED NICKNAMES
-- Supabase 대시보드 SQL Editor에 복사하여 실행해 주세요.
-- ================================================
-- "실시간 복습현황"(App.tsx fetchPeerActivities)이 이 뷰를 그대로 쓰는데,
-- p.display_name(실제 이름)만 셀렉트하고 있어서 닉네임 변경권으로 바꾼 닉네임이
-- 전혀 반영되지 않고 있었다. 컬럼명은 클라이언트 코드(MistakeList.tsx의
-- act.display_name)와 호환되도록 display_name 그대로 유지하고, 값만
-- COALESCE(nickname, display_name)으로 바꾼다.
--
-- 참고: 명예의 전당(weekly_leaderboard), 최근활동(recent_activity_feed),
-- 럭키상점 실시간 전광판(gacha_logs 저장 로직)은 이미 전부 nickname을
-- 우선해서 쓰고 있었으므로 이 뷰만 고치면 된다. 어드민 패널은 반대로
-- display_name만 쓰도록 되어 있는 게 의도된 동작이라 그대로 둔다.

CREATE OR REPLACE VIEW public.recent_peer_activities AS
SELECT
  m.id AS mistake_id,
  m.user_id,
  COALESCE(p.nickname, p.display_name) AS display_name,
  split_part(p.email, '@', 1) AS username,
  p.last_seen_at,
  m.title,
  m.reviews,
  m.updated_at
FROM mistakes m
JOIN profiles p ON p.id = m.user_id
WHERE m.reviews IS NOT NULL
  AND ((m.reviews ->> 0) <> '' OR (m.reviews ->> 1) <> '' OR (m.reviews ->> 2) <> '')
  AND p.is_admin IS NOT TRUE
ORDER BY m.updated_at DESC;
