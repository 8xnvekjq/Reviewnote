begin;

create index if not exists exam_attempt_ink_updated_at_idx on public.exam_attempt_ink(updated_at desc);

create function public.admin_list_live_exam_papers() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_current_user_admin() then raise exception 'EXAM_ADMIN_REQUIRED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('paperId', x.paper_id, 'liveCount', x.n) order by x.paper_id)
    from (select a.paper_id, count(distinct a.id) n from public.exam_attempt_ink k
      join public.exam_attempts a on a.id = k.attempt_id
      where k.updated_at >= now() - interval '10 minutes' and a.status = 'in_progress'
        and not exists(select 1 from private.app_admins ad where ad.user_id = a.student_id)
      group by a.paper_id) x), '[]'::jsonb);
end;
$$;

create function public.admin_get_live_exam(p_paper_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_current_user_admin() then raise exception 'EXAM_ADMIN_REQUIRED'; end if;
  return coalesce((select jsonb_agg(x.payload order by x.updated_at desc, x.id) from (
    select a.id, k.updated_at, jsonb_build_object(
      'attemptId', a.id, 'studentId', a.student_id,
      'studentName', coalesce(nullif(btrim(pr.display_name), ''), nullif(btrim(pr.nickname), ''),
        nullif(split_part(coalesce(pr.email, u.email, ''), '@', 1), ''), left(a.student_id::text, 8)),
      'questionId', k.question_id, 'number', q.number, 'imageUrl', q.image_url,
      'revision', k.revision, 'updatedAt', k.updated_at,
      'answeredCount', (select count(*) from public.exam_attempt_items i where i.attempt_id = a.id and i.answer is not null)
    ) payload
    from public.exam_attempts a
    join lateral (select i.question_id, i.revision, i.updated_at from public.exam_attempt_ink i
      where i.attempt_id = a.id and i.updated_at >= now() - interval '10 minutes'
      order by i.updated_at desc, i.question_id limit 1) k on true
    join public.exam_attempt_items ai on ai.attempt_id = a.id and ai.question_id = k.question_id
    join public.exam_questions q on q.id = k.question_id
    left join public.profiles pr on pr.id = a.student_id
    left join auth.users u on u.id = a.student_id
    where a.paper_id = p_paper_id and a.status = 'in_progress'
      and not exists(select 1 from private.app_admins ad where ad.user_id = a.student_id)
    order by k.updated_at desc, a.id limit 12
  ) x), '[]'::jsonb);
end;
$$;

create function public.admin_get_live_ink(p_attempt_id uuid, p_question_id uuid, p_since_revision integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_revision integer; v_count integer; v_first integer; v_last integer; v_batches jsonb;
begin
  if not private.is_current_user_admin() then raise exception 'EXAM_ADMIN_REQUIRED'; end if;
  if not exists(select 1 from public.exam_attempt_items where attempt_id = p_attempt_id and question_id = p_question_id) then
    raise exception 'EXAM_ATTEMPT_NOT_FOUND';
  end if;
  select revision into v_revision from public.exam_attempt_ink where attempt_id = p_attempt_id and question_id = p_question_id;
  v_revision := coalesce(v_revision, 0);
  if p_since_revision is not null and p_since_revision between 0 and v_revision and v_revision - p_since_revision <= 24 then
    select count(*), min(revision), max(revision), jsonb_agg(jsonb_build_object('revision', revision, 'events', events) order by revision)
      into v_count, v_first, v_last, v_batches from public.exam_ink_replay_batches
      where attempt_id = p_attempt_id and question_id = p_question_id and revision > p_since_revision and revision <= v_revision;
    if v_count = v_revision - p_since_revision and (v_count = 0 or (v_first = p_since_revision + 1 and v_last = v_revision)) then
      return jsonb_build_object('mode', 'delta', 'revision', v_revision, 'batches', coalesce(v_batches, '[]'::jsonb));
    end if;
  end if;
  return jsonb_build_object('mode', 'full', 'revision', v_revision, 'strokes', coalesce((select strokes
    from public.exam_attempt_ink where attempt_id = p_attempt_id and question_id = p_question_id), '[]'::jsonb));
end;
$$;

revoke all on function public.admin_list_live_exam_papers(), public.admin_get_live_exam(text), public.admin_get_live_ink(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_list_live_exam_papers(), public.admin_get_live_exam(text), public.admin_get_live_ink(uuid, uuid, integer) to authenticated;
commit;
