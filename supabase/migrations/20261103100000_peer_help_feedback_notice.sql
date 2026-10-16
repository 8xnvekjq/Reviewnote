-- 서로 도와주기: 도와준 학생에게도 로그인 알림 — 내 풀이에 👍/🤔 피드백이 왔고 보상을 얼마 받았는지(한 번만).
alter table public.help_solutions add column if not exists helper_notified_at timestamptz;

create or replace function public.help_feedback_arrivals() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('solution_id', s.id, 'title', m.title, 'image_url', m.image_url,
      'feedback', s.feedback, 'reward', s.helper_reward, 'shards', s.helper_shards) order by s.feedback_at desc), '[]'::jsonb)
  from public.help_solutions s join public.help_requests r on r.id = s.request_id left join public.mistakes m on m.id = r.mistake_id
  where s.helper_id = (select auth.uid()) and s.feedback is not null and s.removed_at is null and s.helper_notified_at is null;
$$;

create or replace function public.mark_help_feedback_notified() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.help_solutions set helper_notified_at = now()
  where helper_id = (select auth.uid()) and feedback is not null and helper_notified_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.help_feedback_arrivals(), public.mark_help_feedback_notified() from public, anon;
grant execute on function public.help_feedback_arrivals(), public.mark_help_feedback_notified() to authenticated;
