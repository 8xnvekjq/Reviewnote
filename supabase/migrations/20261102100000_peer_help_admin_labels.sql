-- 서로 도와주기 관리: 학생에게 보이는 익명 라벨(동물·칭호·학년)로, 오답으로 갈 수 있게 mistake_id, 질문한 날·대답한 날 둘 다.
create or replace function public.admin_list_help(p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_current_user_admin() then raise exception '관리자만 볼 수 있어요.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(x.item order by x.created_at desc), '[]'::jsonb) from (
    select coalesce(s.created_at, r.created_at) as created_at, jsonb_build_object(
      'solution_id', s.id, 'request_id', r.id, 'mistake_id', r.mistake_id,
      'created_at', coalesce(s.created_at, r.created_at), 'request_created_at', r.created_at, 'solution_created_at', s.created_at,
      'request_status', r.status,
      'image_url', m.image_url, 'mistake_title', m.title, 'storage_path', s.storage_path,
      'stroke_count', s.stroke_count, 'duration_ms', s.duration_ms, 'feedback', s.feedback,
      'helper_reward', coalesce(s.helper_reward, 0), 'requester_reward', coalesce(s.requester_reward, 0),
      'removed_at', s.removed_at, 'file_available', s.id is not null and s.file_deleted_at is null,
      'helper', case when s.id is null then null else private.help_label(s.helper_id) end,
      'requester', private.help_label(r.requester_id)
    ) as item
    from public.help_requests r left join public.help_solutions s on s.request_id = r.id
    left join public.mistakes m on m.id = r.mistake_id
    order by coalesce(s.created_at, r.created_at) desc limit least(greatest(coalesce(p_limit, 100), 1), 300)
  ) x);
end;
$$;
