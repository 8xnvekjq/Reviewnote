begin;
alter table public.exam_papers add column if not exists hanneung_level text
  check (hanneung_level in ('advanced', 'basic'));
alter table public.exam_papers drop constraint if exists exam_papers_hanneung_check;
alter table public.exam_papers add constraint exam_papers_hanneung_check check (
  (kind = 'hanneung') = (hanneung_level is not null));
alter table public.exam_questions drop constraint if exists exam_questions_number_check;
alter table public.exam_questions add constraint exam_questions_number_check check (number between 1 and 50);
alter table public.exam_questions drop constraint if exists exam_questions_check;
alter table public.exam_questions drop constraint if exists exam_questions_answer_type_check;
alter table public.exam_questions add constraint exam_questions_answer_type_check check (
  answer_type in ('choice4', 'choice5', 'digits', 'choice10') and is_choice = (answer_type <> 'digits')
  and case when answer_type = 'choice10' then
    choices is not null and jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) = 10
    else choices is null end);
create or replace function private.exam_validate_question()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_paper public.exam_papers%rowtype;
begin
  select * into v_paper from public.exam_papers where id = new.paper_id;
  if v_paper.kind = 'hanneung' then
    if new.section <> 'common' or new.answer_type <> (case when v_paper.hanneung_level = 'basic' then 'choice4' else 'choice5' end) then
      raise exception 'EXAM_INVALID_QUESTION';
    end if;
  elsif new.number > 30 or ((new.section = 'common') <> (new.number <= 22)) then
    raise exception 'EXAM_INVALID_QUESTION';
  end if;
  return new;
end;
$function$;
revoke all on function private.exam_validate_question() from public, anon, authenticated;
drop trigger if exists exam_validate_question on public.exam_questions;
create trigger exam_validate_question before insert or update on public.exam_questions
  for each row execute function private.exam_validate_question();
create or replace function private.exam_valid_typed_answer(p_answer text, p_type text)
returns text language sql immutable security definer set search_path = '' as $function$
  select case
    when p_type = 'choice4' then case when private.exam_normalize_answer(p_answer) ~ '^[1-4]$' then private.exam_normalize_answer(p_answer) end
    when p_type = 'choice10' then case when private.exam_normalize_answer(p_answer) ~ '^([1-9]|10)$' then private.exam_normalize_answer(p_answer) end
    else private.exam_valid_answer(p_answer, p_type = 'choice5') end;
$function$;
revoke all on function private.exam_valid_typed_answer(text, text) from public, anon, authenticated;
create or replace function private.exam_hanneung_grade(p_score numeric, p_level text)
returns int language sql immutable security definer set search_path = '' as $function$
  select case when p_score >= 60 and p_level in ('advanced', 'basic') then
    (case when p_level = 'basic' then 3 else 0 end) +
    (case when p_score >= 80 then 1 when p_score >= 70 then 2 else 3 end) end;
$function$;
revoke all on function private.exam_hanneung_grade(numeric, text) from public, anon, authenticated;

create or replace function private.exam_attempt_payload(p_attempt_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', a.id,
    'paperId', a.paper_id, 'paperTitle', p.title,
    'kind', p.kind, 'hanneungLevel', p.hanneung_level, 'schoolName', p.school_name, 'year', p.year,
    'grade', p.grade, 'semester', p.semester, 'examTerm', p.exam_term,
    'questionCount', p.question_count, 'maxScore', p.max_score, 'published', p.published,
    'mode', a.mode,
    'elective', a.elective,
    'startedAt', a.started_at,
    'timeLimitMinutes', a.time_limit_minutes,
    'status', a.status,
    'visitOrder', to_jsonb(a.visit_order),
    'serverNow', now(),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id,
               'number', q.number,
               'section', q.section,
               'imageUrl', q.image_url,
               'isChoice', q.is_choice, 'answerType', q.answer_type, 'choices', q.choices,
               'points', q.points
             ) order by q.number)
        from public.exam_attempt_items i
        join public.exam_questions q on q.id = i.question_id
       where i.attempt_id = a.id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'questionId', i.question_id,
               'answer', i.answer,
               'unsure', i.unsure,
               'timeSpentMs', i.time_spent_ms,
               'visits', i.visits,
               'checked', case when i.checked_at is not null and k.answer is not null then jsonb_build_object(
                 'isCorrect', coalesce(private.exam_normalize_answer(i.answer) = private.exam_normalize_answer(k.answer), false),
                 'correctAnswer', k.answer
               ) end
             ) order by q.number)
        from public.exam_attempt_items i
        join public.exam_questions q on q.id = i.question_id
        left join public.exam_answer_keys k on k.question_id = i.question_id and i.checked_at is not null
       where i.attempt_id = a.id
    ), '[]'::jsonb)
  )
  from public.exam_attempts a join public.exam_papers p on p.id = a.paper_id
  where a.id = p_attempt_id;
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
    'kind', p.kind, 'hanneungLevel', p.hanneung_level, 'schoolName', p.school_name, 'year', p.year,
    'grade', p.grade, 'semester', p.semester, 'examTerm', p.exam_term,
    'questionCount', p.question_count, 'maxScore', p.max_score, 'published', p.published,
    'mode', a.mode,
    'elective', a.elective,
    'score', a.score,
    'correctCount', a.correct_count,
    'totalCount', a.total_count,
    'totalTimeMs', a.total_time_ms,
    'estimatedGrade', case when p.kind = 'school' then null else a.estimated_grade end,
    'gradeCut', case when p.kind <> 'csat' then null else jsonb_build_object(
      'rawByGrade', coalesce(p.grade_cuts->'rawByElective'->a.elective, '[]'::jsonb),
      'standardByGrade', coalesce(p.grade_cuts->'standardByElective'->a.elective, p.grade_cuts->'standard', '[]'::jsonb),
      'percentileByGrade', coalesce(p.grade_cuts->'percentileByElective'->a.elective, p.grade_cuts->'percentile', '[]'::jsonb),
      'topStandard', coalesce(p.grade_cuts->'topByElective'->a.elective->'standard', 'null'::jsonb),
      'topPercentile', coalesce(p.grade_cuts->'topByElective'->a.elective->'percentile', 'null'::jsonb),
      'source', coalesce(p.grade_cuts->>'source', '')
    ) end,
    'submittedAt', a.submitted_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'questionId', q.id,
               'number', q.number,
               'section', q.section,
               'imageUrl', q.image_url,
               'isChoice', q.is_choice, 'answerType', q.answer_type, 'choices', q.choices,
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

create or replace function public.submit_exam_attempt(p_attempt_id uuid, p_items jsonb, p_visit_order int[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_attempt public.exam_attempts%rowtype;
  v_cuts jsonb;
  v_score numeric;
  v_kind text;
  v_level text;
  v_correct int;
  v_total int;
  v_time bigint;
begin
  if v_uid is null then
    raise exception 'EXAM_AUTH_REQUIRED';
  end if;

  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if v_attempt.id is null or v_attempt.student_id <> v_uid then
    raise exception 'EXAM_ATTEMPT_NOT_FOUND';
  end if;
  if v_attempt.status = 'submitted' then
    return private.exam_result_payload(p_attempt_id);
  end if;

  if v_attempt.mode = 'free'
     or now() <= v_attempt.started_at
                 + make_interval(mins => v_attempt.time_limit_minutes)
                 + private.exam_grace_interval() then
    perform private.exam_apply_items(p_attempt_id, p_items, p_visit_order);
  end if;

  update public.exam_attempt_items i
     set is_correct = coalesce(
           private.exam_normalize_answer(i.answer) = private.exam_normalize_answer(k.answer), false),
         updated_at = now()
    from public.exam_answer_keys k
   where i.attempt_id = p_attempt_id and k.question_id = i.question_id;

  select coalesce(sum(q.points) filter (where i.is_correct), 0),
         count(*) filter (where i.is_correct)::int,
         count(*)::int,
         coalesce(sum(i.time_spent_ms), 0)::bigint
    into v_score, v_correct, v_total, v_time
    from public.exam_attempt_items i
    join public.exam_questions q on q.id = i.question_id
   where i.attempt_id = p_attempt_id;

  select p.kind, p.hanneung_level, p.grade_cuts->'rawByElective'->v_attempt.elective into v_kind, v_level, v_cuts
    from public.exam_papers p where p.id = v_attempt.paper_id;

  update public.exam_attempts
     set status = 'submitted',
         submitted_at = now(),
         score = v_score,
         correct_count = v_correct,
         total_count = v_total,
         total_time_ms = v_time,
         estimated_grade = case when v_kind = 'school' then null when v_kind = 'hanneung' then private.exam_hanneung_grade(v_score, v_level) else private.exam_estimate_grade(v_cuts, v_score::int) end,
         updated_at = now()
   where id = p_attempt_id;

  return private.exam_result_payload(p_attempt_id);
end;
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
             'kind', p.kind, 'hanneungLevel', p.hanneung_level, 'schoolName', p.school_name, 'year', p.year,
    'grade', p.grade, 'semester', p.semester, 'examTerm', p.exam_term,
    'questionCount', p.question_count, 'maxScore', p.max_score, 'published', p.published,
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
                        'estimatedGrade', case when p.kind = 'school' then null else a.estimated_grade end,
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
           ) order by p.exam_date desc nulls last, p.year desc nulls last, p.id)
      from public.exam_papers p
     where p.published or private.is_current_user_admin()
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.list_my_exam_results(p_paper_id text default null)
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
             'attemptId', a.id,
             'paperId', a.paper_id,
             'paperTitle', p.title,
             'kind', p.kind, 'hanneungLevel', p.hanneung_level, 'schoolName', p.school_name, 'year', p.year,
    'grade', p.grade, 'semester', p.semester, 'examTerm', p.exam_term,
    'questionCount', p.question_count, 'maxScore', p.max_score, 'published', p.published,
             'mode', a.mode,
             'elective', a.elective,
             'score', a.score,
             'estimatedGrade', case when p.kind = 'school' then null else a.estimated_grade end,
             'submittedAt', a.submitted_at
           ) order by a.submitted_at desc)
      from public.exam_attempts a
      join public.exam_papers p on p.id = a.paper_id
     where a.student_id = v_uid
       and a.status = 'submitted'
       and (p_paper_id is null or a.paper_id = p_paper_id)
  ), '[]'::jsonb);
end;
$function$;

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
      'attemptId', a.id, 'round', a.round, 'paperTitle', p.title,
      'kind', p.kind, 'hanneungLevel', p.hanneung_level, 'schoolName', p.school_name, 'year', p.year,
    'grade', p.grade, 'semester', p.semester, 'examTerm', p.exam_term,
    'questionCount', p.question_count, 'maxScore', p.max_score, 'published', p.published,
      'startedAt', a.started_at, 'submittedAt', a.submitted_at, 'status', a.status,
      'mode', a.mode, 'elective', a.elective,
      'score', case when a.status = 'submitted' then a.score end,
      'estimatedGrade', case when a.status = 'submitted' and p.kind <> 'school' then a.estimated_grade end,
      'totalTimeMs', (select coalesce(sum(i.time_spent_ms), 0)
        from public.exam_attempt_items i where i.attempt_id = a.id),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'number', q.number, 'section', q.section, 'answerType', q.answer_type, 'choices', q.choices,
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
    ) a join public.exam_papers p on p.id = a.paper_id
  ), '[]'::jsonb);
end;
$function$;

insert into public.exam_papers (id, title, exam_date, source, subject, school_grade,
  time_limit_minutes, electives, grade_cuts, published, kind, year, question_count, max_score, hanneung_level)
values ('2026-hanneung-79-advanced', '2026 제79회 한국사능력검정시험 심화', '2026-08-09', '국사편찬위원회', '한국사', '전 학년',
  80, '{}'::text[], null, true, 'hanneung', 2026, 50, 100, 'advanced')
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 1, 'common', '/exams/2026-hanneung-79-advanced/page-01.png', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 1 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 2, 'common', '/exams/2026-hanneung-79-advanced/page-01.png', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 2 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 3, 'common', '/exams/2026-hanneung-79-advanced/page-01.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 3 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 4, 'common', '/exams/2026-hanneung-79-advanced/page-01.png', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 4 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 5, 'common', '/exams/2026-hanneung-79-advanced/page-02.png', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 5 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 6, 'common', '/exams/2026-hanneung-79-advanced/page-02.png', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 6 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 7, 'common', '/exams/2026-hanneung-79-advanced/page-02.png', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 7 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 8, 'common', '/exams/2026-hanneung-79-advanced/page-02.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 8 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 9, 'common', '/exams/2026-hanneung-79-advanced/page-02.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 9 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 10, 'common', '/exams/2026-hanneung-79-advanced/page-03.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 10 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 11, 'common', '/exams/2026-hanneung-79-advanced/page-03.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 11 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 12, 'common', '/exams/2026-hanneung-79-advanced/page-03.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 12 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 13, 'common', '/exams/2026-hanneung-79-advanced/page-03.png', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 13 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 14, 'common', '/exams/2026-hanneung-79-advanced/page-04.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 14 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 15, 'common', '/exams/2026-hanneung-79-advanced/page-04.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 15 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 16, 'common', '/exams/2026-hanneung-79-advanced/page-04.png', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 16 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 17, 'common', '/exams/2026-hanneung-79-advanced/page-04.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 17 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 18, 'common', '/exams/2026-hanneung-79-advanced/page-05.png', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 18 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 19, 'common', '/exams/2026-hanneung-79-advanced/page-05.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 19 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 20, 'common', '/exams/2026-hanneung-79-advanced/page-05.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 20 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 21, 'common', '/exams/2026-hanneung-79-advanced/page-05.png', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 21 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 22, 'common', '/exams/2026-hanneung-79-advanced/page-06.png', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 22 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 23, 'common', '/exams/2026-hanneung-79-advanced/page-06.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 23 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 24, 'common', '/exams/2026-hanneung-79-advanced/page-06.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 24 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 25, 'common', '/exams/2026-hanneung-79-advanced/page-06.png', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 25 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 26, 'common', '/exams/2026-hanneung-79-advanced/page-07.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 26 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 27, 'common', '/exams/2026-hanneung-79-advanced/page-07.png', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 27 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 28, 'common', '/exams/2026-hanneung-79-advanced/page-07.png', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 28 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 29, 'common', '/exams/2026-hanneung-79-advanced/page-07.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 29 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 30, 'common', '/exams/2026-hanneung-79-advanced/page-08.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 30 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 31, 'common', '/exams/2026-hanneung-79-advanced/page-08.png', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 31 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 32, 'common', '/exams/2026-hanneung-79-advanced/page-08.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 32 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 33, 'common', '/exams/2026-hanneung-79-advanced/page-08.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 33 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 34, 'common', '/exams/2026-hanneung-79-advanced/page-08.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 34 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 35, 'common', '/exams/2026-hanneung-79-advanced/page-09.png', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 35 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 36, 'common', '/exams/2026-hanneung-79-advanced/page-09.png', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 36 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 37, 'common', '/exams/2026-hanneung-79-advanced/page-09.png', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 37 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 38, 'common', '/exams/2026-hanneung-79-advanced/page-09.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 38 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 39, 'common', '/exams/2026-hanneung-79-advanced/page-10.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 39 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 40, 'common', '/exams/2026-hanneung-79-advanced/page-10.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 40 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 41, 'common', '/exams/2026-hanneung-79-advanced/page-10.png', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 41 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 42, 'common', '/exams/2026-hanneung-79-advanced/page-10.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 42 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 43, 'common', '/exams/2026-hanneung-79-advanced/page-11.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 43 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 44, 'common', '/exams/2026-hanneung-79-advanced/page-11.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 44 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 45, 'common', '/exams/2026-hanneung-79-advanced/page-11.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 45 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 46, 'common', '/exams/2026-hanneung-79-advanced/page-11.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 46 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 47, 'common', '/exams/2026-hanneung-79-advanced/page-12.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 47 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 48, 'common', '/exams/2026-hanneung-79-advanced/page-12.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 48 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 49, 'common', '/exams/2026-hanneung-79-advanced/page-12.png', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 49 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-advanced', 50, 'common', '/exams/2026-hanneung-79-advanced/page-12.png', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-advanced' and number = 50 and section = 'common'
on conflict do nothing;

insert into public.exam_papers (id, title, exam_date, source, subject, school_grade,
  time_limit_minutes, electives, grade_cuts, published, kind, year, question_count, max_score, hanneung_level)
values ('2026-hanneung-79-basic', '2026 제79회 한국사능력검정시험 기본', '2026-08-09', '국사편찬위원회', '한국사', '전 학년',
  70, '{}'::text[], null, true, 'hanneung', 2026, 50, 100, 'basic')
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 1, 'common', '/exams/2026-hanneung-79-basic/page-01.png', true, 1, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 1 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 2, 'common', '/exams/2026-hanneung-79-basic/page-01.png', true, 1, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 2 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 3, 'common', '/exams/2026-hanneung-79-basic/page-01.png', true, 3, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 3 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 4, 'common', '/exams/2026-hanneung-79-basic/page-01.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 4 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 5, 'common', '/exams/2026-hanneung-79-basic/page-02.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 5 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 6, 'common', '/exams/2026-hanneung-79-basic/page-02.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 6 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 7, 'common', '/exams/2026-hanneung-79-basic/page-02.png', true, 3, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 7 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 8, 'common', '/exams/2026-hanneung-79-basic/page-02.png', true, 1, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 8 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 9, 'common', '/exams/2026-hanneung-79-basic/page-03.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 9 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 10, 'common', '/exams/2026-hanneung-79-basic/page-03.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 10 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 11, 'common', '/exams/2026-hanneung-79-basic/page-03.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 11 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 12, 'common', '/exams/2026-hanneung-79-basic/page-03.png', true, 1, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 12 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 13, 'common', '/exams/2026-hanneung-79-basic/page-03.png', true, 3, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 13 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 14, 'common', '/exams/2026-hanneung-79-basic/page-04.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 14 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 15, 'common', '/exams/2026-hanneung-79-basic/page-04.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 15 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 16, 'common', '/exams/2026-hanneung-79-basic/page-04.png', true, 3, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 16 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 17, 'common', '/exams/2026-hanneung-79-basic/page-04.png', true, 1, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 17 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 18, 'common', '/exams/2026-hanneung-79-basic/page-05.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 18 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 19, 'common', '/exams/2026-hanneung-79-basic/page-05.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 19 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 20, 'common', '/exams/2026-hanneung-79-basic/page-05.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 20 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 21, 'common', '/exams/2026-hanneung-79-basic/page-05.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 21 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 22, 'common', '/exams/2026-hanneung-79-basic/page-05.png', true, 3, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 22 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 23, 'common', '/exams/2026-hanneung-79-basic/page-06.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 23 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 24, 'common', '/exams/2026-hanneung-79-basic/page-06.png', true, 1, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 24 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 25, 'common', '/exams/2026-hanneung-79-basic/page-06.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 25 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 26, 'common', '/exams/2026-hanneung-79-basic/page-06.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 26 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 27, 'common', '/exams/2026-hanneung-79-basic/page-07.png', true, 1, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 27 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 28, 'common', '/exams/2026-hanneung-79-basic/page-07.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 28 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 29, 'common', '/exams/2026-hanneung-79-basic/page-07.png', true, 3, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 29 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 30, 'common', '/exams/2026-hanneung-79-basic/page-07.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 30 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 31, 'common', '/exams/2026-hanneung-79-basic/page-08.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 31 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 32, 'common', '/exams/2026-hanneung-79-basic/page-08.png', true, 1, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 32 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 33, 'common', '/exams/2026-hanneung-79-basic/page-08.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 33 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 34, 'common', '/exams/2026-hanneung-79-basic/page-08.png', true, 3, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 34 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 35, 'common', '/exams/2026-hanneung-79-basic/page-09.png', true, 1, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 35 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 36, 'common', '/exams/2026-hanneung-79-basic/page-09.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 36 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 37, 'common', '/exams/2026-hanneung-79-basic/page-09.png', true, 3, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 37 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 38, 'common', '/exams/2026-hanneung-79-basic/page-09.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 38 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 39, 'common', '/exams/2026-hanneung-79-basic/page-10.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 39 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 40, 'common', '/exams/2026-hanneung-79-basic/page-10.png', true, 1, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 40 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 41, 'common', '/exams/2026-hanneung-79-basic/page-10.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 41 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 42, 'common', '/exams/2026-hanneung-79-basic/page-10.png', true, 3, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 42 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 43, 'common', '/exams/2026-hanneung-79-basic/page-11.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 43 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 44, 'common', '/exams/2026-hanneung-79-basic/page-11.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 44 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 45, 'common', '/exams/2026-hanneung-79-basic/page-11.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 45 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 46, 'common', '/exams/2026-hanneung-79-basic/page-11.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 46 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 47, 'common', '/exams/2026-hanneung-79-basic/page-12.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 47 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 48, 'common', '/exams/2026-hanneung-79-basic/page-12.png', true, 3, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 48 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 49, 'common', '/exams/2026-hanneung-79-basic/page-12.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 49 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2026-hanneung-79-basic', 50, 'common', '/exams/2026-hanneung-79-basic/page-12.png', true, 2, 'choice4') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2026-hanneung-79-basic' and number = 50 and section = 'common'
on conflict do nothing;

commit;
