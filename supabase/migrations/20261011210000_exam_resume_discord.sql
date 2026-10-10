-- 이어 풀기 디스코드 알림이 한 번도 안 가던 것: 앱의 "이어 풀기"는 start_exam_attempt가 아니라
-- get_active_exam_attempt로 시험을 연다. 여기서도 알림을 보낸다(3분 중복 막기·관리자 제외는 notify 쪽 그대로).
-- 알림 기록을 남기므로 stable → volatile.
begin;
create or replace function public.get_active_exam_attempt(p_paper_id text)
returns jsonb
language plpgsql
volatile security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_attempt_id uuid;
begin
  if v_uid is null then
    raise exception 'EXAM_AUTH_REQUIRED';
  end if;

  select id into v_attempt_id
    from public.exam_attempts
   where student_id = v_uid and paper_id = p_paper_id and status = 'in_progress';

  if v_attempt_id is null then
    return null;
  end if;
  perform private.exam_discord_notify(v_attempt_id, 'resume');
  return private.exam_attempt_payload(v_attempt_id);
end;
$function$;
commit;
