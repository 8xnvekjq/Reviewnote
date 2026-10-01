-- 기출문제 회차 기록: 기존 테이블과 운영 마이그레이션을 유지한다.
-- v2·batch2 다음 적용. 정답 키를 읽지 않는 기록 RPC는 진행 중 정오도 숨긴다.
begin;

-- 같은 학생·시험지의 시작 순서. 동시각은 UUID로 안정적으로 정렬한다.
create or replace function private.exam_attempt_round(p_attempt_id uuid)
returns bigint
language sql stable security definer set search_path = ''
as $function$
  select ranked.round from (
    select a.id, row_number() over (order by a.started_at, a.id) as round
      from public.exam_attempts a
      join public.exam_attempts target
        on target.id = p_attempt_id
       and a.student_id = target.student_id and a.paper_id = target.paper_id
  ) ranked where ranked.id = p_attempt_id;
$function$;

create or replace function private.exam_result_payload(p_attempt_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'attemptId', a.id,
    'round', private.exam_attempt_round(a.id),
    'paperId', a.paper_id,
    'paperTitle', p.title,
    'mode', a.mode,
    'elective', a.elective,
    'score', a.score,
    'correctCount', a.correct_count,
    'totalCount', a.total_count,
    'totalTimeMs', a.total_time_ms,
    'estimatedGrade', a.estimated_grade,
    'gradeCut', jsonb_build_object(
      'rawByGrade', coalesce(p.grade_cuts->'rawByElective'->a.elective, '[]'::jsonb),
      'standardByGrade', coalesce(p.grade_cuts->'standardByElective'->a.elective, p.grade_cuts->'standard', '[]'::jsonb),
      'percentileByGrade', coalesce(p.grade_cuts->'percentileByElective'->a.elective, p.grade_cuts->'percentile', '[]'::jsonb),
      'topStandard', coalesce(p.grade_cuts->'topByElective'->a.elective->'standard', 'null'::jsonb),
      'topPercentile', coalesce(p.grade_cuts->'topByElective'->a.elective->'percentile', 'null'::jsonb),
      'source', coalesce(p.grade_cuts->>'source', '')
    ),
    'submittedAt', a.submitted_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'questionId', q.id,
               'number', q.number,
               'section', q.section,
               'imageUrl', q.image_url,
               'isChoice', q.is_choice,
               'points', q.points,
               'answer', i.answer,
               'correctAnswer', k.answer,
               'isCorrect', coalesce(i.is_correct, false),
               'unsure', i.unsure,
               'timeSpentMs', i.time_spent_ms,
               'nationalWrongRate', s.wrong_rate,
               'nationalChoiceRates', s.choice_rates,
               'addedMistakeId', i.added_mistake_id
             ) order by q.number)
        from public.exam_attempt_items i
        join public.exam_questions q on q.id = i.question_id
        left join public.exam_answer_keys k on k.question_id = q.id
        left join public.exam_question_national_stats s
          on s.question_id = q.id and s.elective = a.elective
       where i.attempt_id = a.id
    ), '[]'::jsonb)
  )
  from public.exam_attempts a
  join public.exam_papers p on p.id = a.paper_id
  where a.id = p_attempt_id;
$function$;

create or replace function public.list_exam_papers_for_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'EXAM_AUTH_REQUIRED';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id,
             'title', p.title,
             'examDate', p.exam_date,
             'source', p.source,
             'timeLimitMinutes', p.time_limit_minutes,
             'electives', to_jsonb(p.electives),
             'inProgress', (
               select jsonb_build_object(
                        'attemptId', a.id,
                        'round', private.exam_attempt_round(a.id),
                        'mode', a.mode,
                        'elective', a.elective,
                        'startedAt', a.started_at,
                        'timeLimitMinutes', a.time_limit_minutes,
                        'answeredCount', (select count(*) from public.exam_attempt_items i
                                           where i.attempt_id = a.id and i.answer is not null),
                        'elapsedMs', (select coalesce(sum(i.time_spent_ms), 0) from public.exam_attempt_items i
                                       where i.attempt_id = a.id)
                      )
                 from public.exam_attempts a
                where a.student_id = v_uid and a.paper_id = p.id and a.status = 'in_progress'
                limit 1
             ),
             'lastResult', (
               select jsonb_build_object(
                        'attemptId', a.id,
                        'round', private.exam_attempt_round(a.id),
                        'score', a.score,
                        'estimatedGrade', a.estimated_grade,
                        'submittedAt', a.submitted_at
                      )
                 from public.exam_attempts a
                where a.student_id = v_uid and a.paper_id = p.id and a.status = 'submitted'
                order by a.submitted_at desc
                limit 1
             ),
             'resultCount', (
               select count(*) from public.exam_attempts a
                where a.student_id = v_uid and a.paper_id = p.id and a.status = 'submitted'
             )
           ) order by p.exam_date desc, p.id)
      from public.exam_papers p
     where p.published
  ), '[]'::jsonb);
end;
$function$;

-- p_student_id는 관리자 조회에만 사용한다. 학생이 타인 ID를 지정하면 존재 여부도 숨긴다.
create or replace function public.list_my_paper_history(p_paper_id text, p_student_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_student uuid;
begin
  if v_uid is null then raise exception 'EXAM_AUTH_REQUIRED'; end if;
  v_student := coalesce(p_student_id, v_uid);
  if v_student <> v_uid and not private.is_current_user_admin() then
    raise exception 'EXAM_ATTEMPT_NOT_FOUND';
  end if;
  if not exists (select 1 from public.exam_papers p where p.id = p_paper_id and
    (p.published or private.is_current_user_admin() or exists (
      select 1 from public.exam_attempts a where a.paper_id = p.id and a.student_id = v_uid
    ))) then raise exception 'EXAM_PAPER_NOT_FOUND'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'attemptId', a.id, 'round', a.round,
      'startedAt', a.started_at, 'submittedAt', a.submitted_at, 'status', a.status,
      'mode', a.mode, 'elective', a.elective,
      'score', case when a.status = 'submitted' then a.score end,
      'estimatedGrade', case when a.status = 'submitted' then a.estimated_grade end,
      'totalTimeMs', (select coalesce(sum(i.time_spent_ms), 0)
        from public.exam_attempt_items i where i.attempt_id = a.id),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'number', q.number, 'section', q.section,
          'isCorrect', case when a.status = 'submitted' then coalesce(i.is_correct, false) end,
          'unsure', i.unsure, 'answered', i.answer is not null, 'timeSpentMs', i.time_spent_ms
        ) order by q.number)
        from public.exam_attempt_items i join public.exam_questions q on q.id = i.question_id
        where i.attempt_id = a.id
      ), '[]'::jsonb)
    ) order by a.round)
    from (
      select a.*, row_number() over (order by a.started_at, a.id) as round
        from public.exam_attempts a
       where a.student_id = v_student and a.paper_id = p_paper_id
    ) a
  ), '[]'::jsonb);
end;
$function$;

revoke all on function private.exam_attempt_round(uuid) from public, anon, authenticated;
revoke all on function private.exam_result_payload(uuid) from public, anon, authenticated;
revoke all on function public.list_exam_papers_for_me() from public, anon;
grant execute on function public.list_exam_papers_for_me() to authenticated;
revoke all on function public.list_my_paper_history(text, uuid) from public, anon;
grant execute on function public.list_my_paper_history(text, uuid) to authenticated;

commit;
