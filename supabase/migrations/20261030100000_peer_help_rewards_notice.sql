-- 서로 도와주기 조정(2026-10-16, 운영 적용: peer_help_6_rewards_notice)
-- - 최소 분량 5획·20초 → 5획·5초
-- - 보상: 도움 됐어요 = 도우미 지식의 조각 1개(knowledge_shard_wallets), 이해 못 했어요 = 도우미 5P, 피드백 남긴 요청자 3P
--   (한도는 그대로: 도우미 하루 3번·같은 두 학생 하루 1번·요청자 하루 5번, 3일·오답 5개 미만 계정 제외)
-- - 로그인 알림: help_new_arrivals() / mark_help_arrivals_notified() — 새로 온 풀이를 한 번만 알린다
-- - 선생님이 풀이를 지우면 지식의 조각도 회수
-- 함수 본문은 운영에 적용된 것과 같다(supabase MCP apply_migration 'peer_help_6_rewards_notice' 참고).
begin;
alter table public.help_solutions add column if not exists helper_shards numeric(4,2) not null default 0;
alter table public.help_solutions add column if not exists requester_notified_at timestamptz;
commit;
