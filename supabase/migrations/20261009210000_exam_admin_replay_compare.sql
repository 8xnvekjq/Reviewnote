begin;

-- 관리자 자신의 응시도 포함하여 학생별 가장 최근 제출을 비교한다.
create function public.admin_list_paper_submissions(p_paper_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_current_user_admin() then
    raise exception 'EXAM_ADMIN_REQUIRED';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'attemptId', a.id, 'studentId', a.student_id,
      'studentName', coalesce(nullif(btrim(pr.display_name), ''), nullif(btrim(pr.nickname), ''),
        nullif(split_part(coalesce(pr.email, u.email, ''), '@', 1), ''), left(a.student_id::text, 8)),
      'submittedAt', a.submitted_at, 'isMine', a.student_id = auth.uid(),
      'questions', coalesce((select jsonb_agg(jsonb_build_object(
        'questionId', q.id, 'number', q.number, 'imageUrl', q.image_url,
        'answer', i.answer, 'isCorrect', coalesce(i.is_correct, false)) order by q.number, q.id)
        from public.exam_attempt_items i join public.exam_questions q on q.id = i.question_id
        where i.attempt_id = a.id), '[]'::jsonb)
    ) order by a.submitted_at desc, a.id desc)
    from (select distinct on (student_id) id, student_id, submitted_at
      from public.exam_attempts where paper_id = p_paper_id and status = 'submitted'
      order by student_id, submitted_at desc nulls last, id desc) a
    left join public.profiles pr on pr.id = a.student_id
    left join auth.users u on u.id = a.student_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_list_paper_submissions(text) from public, anon, authenticated;
grant execute on function public.admin_list_paper_submissions(text) to authenticated;
commit;
