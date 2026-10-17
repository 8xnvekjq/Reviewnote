-- 서로 도와주기: 도와준 학생이 '내가 보낸 풀이'를 다시 보고, 마음에 안 들면 새 풀이로 바꿔 보낸다.
-- 바꿔 보내기는 친구가 아직 👍/🤔를 고르지 않았고 요청이 열려 있을 때만(보상이 정해진 풀이는 바꾸지 않는다).
-- 바꾸면 같은 줄의 파일 경로·통계를 새 것으로 갈고, 요청자에게 다시 '새 풀이' 알림이 가게 한다.
-- 예전 파일은 어떤 줄도 가리키지 않게 되므로 help_orphan_files가 하루 뒤 지운다.

create or replace function public.my_help_given(p_limit integer default 30) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.item order by x.created_at desc), '[]'::jsonb) from (
    select s.created_at, jsonb_build_object(
      'id', s.id, 'request_id', s.request_id, 'created_at', s.created_at, 'feedback', s.feedback,
      'feedback_at', s.feedback_at, 'reward', s.helper_reward, 'shards', s.helper_shards, 'image_url', m.image_url,
      'requester', private.help_label(r.requester_id),
      'storage_path', s.storage_path, 'file_available', s.file_deleted_at is null,
      'can_resubmit', s.feedback is null and r.status = 'open' and s.file_deleted_at is null
    ) as item
    from public.help_solutions s join public.help_requests r on r.id = s.request_id left join public.mistakes m on m.id = r.mistake_id
    where s.helper_id = (select auth.uid()) and s.removed_at is null
    order by s.created_at desc limit least(greatest(coalesce(p_limit, 30), 1), 100)
  ) x;
$$;

create or replace function public.resubmit_help_solution(p_solution_id uuid, p_storage_path text, p_stroke_count integer, p_duration_ms integer, p_bytes integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_sol public.help_solutions; v_req public.help_requests;
begin
  if v_uid is null then raise exception '로그인이 필요해요.' using errcode = '42501'; end if;
  -- give_help_feedback과 같은 순서(풀이 → 요청)로 잠근다.
  select * into v_sol from public.help_solutions where id = p_solution_id for update;
  if not found or v_sol.helper_id <> v_uid or v_sol.removed_at is not null then raise exception '풀이를 찾을 수 없어요.'; end if;
  select * into v_req from public.help_requests where id = v_sol.request_id for update;
  if v_sol.feedback is not null then raise exception '친구가 이미 답한 풀이는 바꿀 수 없어요.'; end if;
  if v_req.status <> 'open' then raise exception '이미 해결됐거나 취소된 요청이에요.'; end if;
  if v_sol.file_deleted_at is not null then raise exception '정리된 풀이는 바꿀 수 없어요.'; end if;
  if p_storage_path !~ ('^' || v_uid::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json\.gz$') then
    raise exception '풀이 파일 경로가 올바르지 않아요.';
  end if;
  if p_storage_path = v_sol.storage_path then raise exception '새 풀이 파일이 필요해요.'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'help-solutions' and o.name = p_storage_path) then
    raise exception '풀이 파일이 올라가지 않았어요. 다시 보내 주세요.';
  end if;
  if coalesce(p_stroke_count, 0) < 5 or coalesce(p_duration_ms, 0) < 5000 then
    raise exception '풀이가 너무 짧아요. 과정을 조금 더 자세히 써 주세요.';
  end if;
  update public.help_solutions set storage_path = p_storage_path, stroke_count = p_stroke_count, duration_ms = p_duration_ms,
    bytes = greatest(coalesce(p_bytes, 0), 0), created_at = now(), requester_notified_at = null
  where id = p_solution_id;
  return jsonb_build_object('id', p_solution_id);
end;
$$;

revoke all on function public.resubmit_help_solution(uuid, text, integer, integer, integer) from public, anon;
grant execute on function public.resubmit_help_solution(uuid, text, integer, integer, integer) to authenticated;
