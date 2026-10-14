-- 필기 리플레이 압축을 제출 트랜잭션 밖으로 옮긴다(2026-10-15).
-- · 제출 때 바로 압축하면 필기가 많은 시험은 몇 초가 걸려 authenticated의 statement_timeout(8s)에 제출이 실패할 수 있다.
--   그래서 제출/저장 트리거는 끄고, pg_cron이 10분마다 '제출 5분 뒤' 문항을 조금씩 압축한다.
-- · 선생님 결정: 이미 쌓인 기록(약 1,400문항)은 그대로 두고, 이 시점 이후 제출된 시험만 압축한다.
-- · 한 번에 최대 10문항, 그리고 3초를 넘기면 그 회차는 멈춘다(작은 무료 DB 보호).
create extension if not exists pg_cron;

alter table public.exam_attempts disable trigger exam_replay_compact_submit;
alter table public.exam_attempt_ink disable trigger exam_replay_compact_save;

create or replace function private.compact_recent_exam_ink_replay(p_limit integer default 10)
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; v_done integer := 0; v_start timestamptz := clock_timestamp();
begin
  for r in select i.attempt_id, i.question_id from public.exam_attempt_ink i
      join public.exam_attempts a on a.id = i.attempt_id
      where a.status = 'submitted'
        and a.submitted_at >= timestamptz '2026-10-14 17:00:00+00'
        and a.submitted_at < now() - interval '5 minutes'
        and exists (select 1 from public.exam_ink_replay_batches b where b.attempt_id = i.attempt_id and b.question_id = i.question_id)
      order by a.submitted_at, i.question_id
      limit greatest(1, least(p_limit, 50))
      for update of a skip locked
  loop
    exit when clock_timestamp() - v_start > interval '3 seconds';
    perform private.compact_exam_ink_replay_question(r.attempt_id, r.question_id);
    v_done := v_done + 1;
  end loop;
  return v_done;
end $$;
revoke all on function private.compact_recent_exam_ink_replay(integer) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'compact-exam-ink-replay';
select cron.schedule('compact-exam-ink-replay', '*/10 * * * *', $$set statement_timeout = '20s'; select private.compact_recent_exam_ink_replay(10);$$);
