-- Authorization is evaluated on channel join/token refresh, not for every stroke.
-- Uses exam_attempts_in_progress_unique (student_id, paper_id), no new storage/write path.
create or replace function private.can_use_exam_live_topic(p_watch boolean)
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select auth.uid()) is not null and (
    (select private.is_current_user_admin()) or exists (
      select 1 from public.exam_attempts a
      where a.student_id = (select auth.uid()) and a.status = 'in_progress'
        and a.paper_id = substr((select realtime.topic()), case when p_watch then 17 else 11 end)
    )
  );
$$;
revoke all on function private.can_use_exam_live_topic(boolean) from public, anon;
grant execute on function private.can_use_exam_live_topic(boolean) to authenticated;

-- Restrictive guards prevent a pre-existing broad permissive policy from granting
-- students receive access to ink or send access to admin watch signals.
-- Non-exam topics always pass these guards, preserving existing public features.
create policy exam_live_anon_guard on realtime.messages as restrictive
for all to anon using (
  (select realtime.topic()) not like 'exam-live:%' and
  (select realtime.topic()) not like 'exam-live-watch:%'
) with check (
  (select realtime.topic()) not like 'exam-live:%' and
  (select realtime.topic()) not like 'exam-live-watch:%'
);
create policy exam_live_receive_guard on realtime.messages as restrictive
for select to authenticated using (
  case
    when (select realtime.topic()) like 'exam-live:%' then
      extension = 'broadcast' and (select private.is_current_user_admin())
    when (select realtime.topic()) like 'exam-live-watch:%' then
      extension = 'broadcast' and (select private.can_use_exam_live_topic(true))
    else true
  end
);
create policy exam_live_send_guard on realtime.messages as restrictive
for insert to authenticated with check (
  case
    when (select realtime.topic()) like 'exam-live:%' then
      extension = 'broadcast' and (select private.can_use_exam_live_topic(false))
    when (select realtime.topic()) like 'exam-live-watch:%' then
      extension = 'broadcast' and (select private.is_current_user_admin())
    else true
  end
);
create policy exam_live_receive on realtime.messages for select to authenticated using (
  extension = 'broadcast' and (
    ((select realtime.topic()) like 'exam-live:%' and (select private.is_current_user_admin())) or
    ((select realtime.topic()) like 'exam-live-watch:%' and (select private.can_use_exam_live_topic(true)))
  )
);
create policy exam_live_send on realtime.messages for insert to authenticated with check (
  extension = 'broadcast' and (
    ((select realtime.topic()) like 'exam-live:%' and (select private.can_use_exam_live_topic(false))) or
    ((select realtime.topic()) like 'exam-live-watch:%' and (select private.is_current_user_admin()))
  )
);
