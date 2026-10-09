-- 관리자 시험지 카드의 "학생별 최근 점수"에 관리자 본인 응시도 넣는다(isMine=true, "내 풀이"로 표시). 다른 관리자 응시는 계속 뺀다.
create or replace function public.admin_list_exam_paper_activity()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.is_current_user_admin() then
    return null;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('paperId', per_paper.paper_id, 'students', per_paper.students) order by per_paper.paper_id)
      from (
        select latest.paper_id, jsonb_agg(latest.payload order by latest.sort_at desc, latest.id desc) as students
          from (
            select distinct on (a.paper_id, a.student_id)
                   a.paper_id, a.id, coalesce(a.submitted_at, a.started_at) as sort_at,
                   jsonb_build_object(
                     'attemptId', a.id,
                     'studentId', a.student_id,
                     'studentName', coalesce(nullif(btrim(pr.display_name), ''), nullif(btrim(pr.nickname), ''),
                                             nullif(split_part(coalesce(pr.email, u.email, ''), '@', 1), ''), left(a.student_id::text, 8)),
                     'paperId', a.paper_id,
                     'paperTitle', p.title,
                     'round', private.exam_attempt_round(a.id),
                     'status', a.status,
                     'mode', a.mode,
                     'elective', a.elective,
                     'startedAt', a.started_at,
                     'submittedAt', a.submitted_at,
                     'score', a.score,
                     'maxScore', p.max_score,
                     'answeredCount', (select count(*) from public.exam_attempt_items i where i.attempt_id = a.id and i.answer is not null),
                     'questionCount', (select count(*) from public.exam_attempt_items i where i.attempt_id = a.id),
                     'attemptCount', (select count(*) from public.exam_attempts c where c.student_id = a.student_id and c.paper_id = a.paper_id),
                     'inProgress', exists (select 1 from public.exam_attempts c
                                            where c.student_id = a.student_id and c.paper_id = a.paper_id and c.status = 'in_progress'),
                     'isMine', a.student_id = auth.uid()
                   ) as payload
              from public.exam_attempts a
              join public.exam_papers p on p.id = a.paper_id
              left join public.profiles pr on pr.id = a.student_id
              left join auth.users u on u.id = a.student_id
             where a.student_id = auth.uid()
                or not exists (select 1 from private.app_admins ad where ad.user_id = a.student_id)
             order by a.paper_id, a.student_id,
                      (a.status = 'submitted') desc, coalesce(a.submitted_at, a.started_at) desc, a.id desc
          ) latest
         group by latest.paper_id
      ) per_paper
  ), '[]'::jsonb);
end;
$function$;
