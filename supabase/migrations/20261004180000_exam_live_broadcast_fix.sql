-- Realtime v2.139.0 gates private joins on broadcast.read OR presence.read,
-- not INSERT permission. Grant only empty presence reads to ink publishers;
-- never grant students access to other students' broadcast strokes.
-- Clients enable presence on ink topics but must never track presence here.
alter policy exam_live_receive_guard on realtime.messages using (
  case
    when (select realtime.topic()) like 'exam-live:%' then
      (extension = 'broadcast' and (select private.is_current_user_admin())) or
      (extension = 'presence' and (select private.can_use_exam_live_topic(false)))
    when (select realtime.topic()) like 'exam-live-watch:%' then
      extension = 'broadcast' and (select private.can_use_exam_live_topic(true))
    else true
  end
);

create policy exam_live_join_presence on realtime.messages
for select to authenticated using (
  extension = 'presence' and
  (select realtime.topic()) like 'exam-live:%' and
  (select private.can_use_exam_live_topic(false))
);
-- Existing INSERT guards still deny all exam presence writes (including admins),
-- so presence contains no student identity or ink. Anon/topic guards stay intact.
