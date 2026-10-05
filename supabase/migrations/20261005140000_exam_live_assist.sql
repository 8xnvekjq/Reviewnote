-- 도와주기 전용 private 토픽: 학생 한 명의 진행 중 응시만 수신한다.
-- 기존 Live guard는 다른 토픽에서 true이므로 별도 restrictive guard로 넓은 정책도 차단한다.
create or replace function private.can_receive_exam_assist()
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select auth.uid()) is not null and
    case when (select realtime.topic()) ~ '^exam-assist:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then (select private.is_current_user_admin()) or exists (
      select 1 from public.exam_attempts a
      where a.id = substr((select realtime.topic()), 13)::uuid
        and a.student_id = (select auth.uid()) and a.status = 'in_progress'
    ) else false end;
$$;
revoke all on function private.can_receive_exam_assist() from public, anon;
grant execute on function private.can_receive_exam_assist() to authenticated;

create policy exam_assist_anon_guard on realtime.messages as restrictive
for all to anon using ((select realtime.topic()) not like 'exam-assist:%')
with check ((select realtime.topic()) not like 'exam-assist:%');
create policy exam_assist_receive_guard on realtime.messages as restrictive
for select to authenticated using (
  case when (select realtime.topic()) like 'exam-assist:%'
    then extension = 'broadcast' and (select private.can_receive_exam_assist())
    else true end
);
create policy exam_assist_send_guard on realtime.messages as restrictive
for insert to authenticated with check (
  case when (select realtime.topic()) like 'exam-assist:%'
    then extension = 'broadcast' and (select private.can_receive_exam_assist()) and (select private.is_current_user_admin())
    else true end
);
create policy exam_assist_receive on realtime.messages for select to authenticated using (
  (select realtime.topic()) like 'exam-assist:%' and extension = 'broadcast' and (select private.can_receive_exam_assist())
);
create policy exam_assist_send on realtime.messages for insert to authenticated with check (
  (select realtime.topic()) like 'exam-assist:%' and extension = 'broadcast' and
  (select private.can_receive_exam_assist()) and (select private.is_current_user_admin())
);
