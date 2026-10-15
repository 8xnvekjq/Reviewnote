-- 서로 도와주기 탭의 '내가 도움 요청한 문제' 목록: 요청마다 문제 사진·제목을 함께 돌려준다(오답이 지워진 요청은 뺀다).
begin;
create or replace function public.my_help_requests() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'mistake_id', r.mistake_id, 'status', r.status, 'created_at', r.created_at,
    'image_url', m.image_url, 'title', m.title,
    'solution_count', (select count(*) from public.help_solutions s where s.request_id = r.id and s.removed_at is null),
    'unseen_count', (select count(*) from public.help_solutions s where s.request_id = r.id and s.removed_at is null and s.feedback is null)
  ) order by r.created_at desc), '[]'::jsonb)
  from public.help_requests r join public.mistakes m on m.id = r.mistake_id
  where r.requester_id = auth.uid()
    and (r.status = 'open' or r.closed_at > now() - interval '60 days');
$$;
revoke all on function public.my_help_requests() from public, anon, authenticated, service_role;
grant execute on function public.my_help_requests() to authenticated;
commit;
