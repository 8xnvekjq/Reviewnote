begin;
alter table public.exam_papers add column practice_era text check (practice_era in ('prehistory','three-kingdoms','north-south','goryeo','joseon-early','joseon-late','opening','colonial','modern','cross'));
alter table public.exam_papers add constraint exam_papers_practice_era_kind_check check (practice_era is null or (kind='hanneung' and hanneung_level='advanced'));
alter table public.exam_questions drop constraint exam_questions_number_check;
alter table public.exam_questions add constraint exam_questions_number_check check (number > 0);
alter table public.exam_questions add column source_paper_id text references public.exam_papers(id), add column source_number integer, add column source_round integer;
alter table public.exam_questions add constraint exam_questions_source_check check ((source_paper_id is null and source_number is null and source_round is null) or (source_paper_id is not null and source_number is not null and source_round is not null and source_number between 1 and 50 and source_round > 0));
grant select (source_paper_id,source_number,source_round) on public.exam_questions to authenticated;
create or replace function private.exam_validate_question()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_paper public.exam_papers%rowtype;
begin
  select * into v_paper from public.exam_papers where id = new.paper_id;
  if new.number > 50 and v_paper.practice_era is null then raise exception 'EXAM_INVALID_QUESTION'; end if;
  if v_paper.practice_era is not null and (new.source_paper_id is null or new.number > v_paper.question_count) then raise exception 'EXAM_INVALID_QUESTION'; end if;
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
    'kind', p.kind, 'practiceEra', p.practice_era, 'hanneungLevel', p.hanneung_level, 'schoolName', p.school_name, 'year', p.year,
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
               'number', q.number, 'sourcePaperId', q.source_paper_id, 'sourceNumber', q.source_number, 'sourceRound', q.source_round,
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
    'kind', p.kind, 'practiceEra', p.practice_era, 'hanneungLevel', p.hanneung_level, 'schoolName', p.school_name, 'year', p.year,
    'grade', p.grade, 'semester', p.semester, 'examTerm', p.exam_term,
    'questionCount', p.question_count, 'maxScore', p.max_score, 'published', p.published,
    'mode', a.mode,
    'elective', a.elective,
    'score', a.score,
    'correctCount', a.correct_count,
    'totalCount', a.total_count,
    'totalTimeMs', a.total_time_ms,
    'estimatedGrade', case when p.kind = 'school' or p.practice_era is not null then null else a.estimated_grade end,
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
               'number', q.number, 'sourcePaperId', q.source_paper_id, 'sourceNumber', q.source_number, 'sourceRound', q.source_round,
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
create or replace function public.start_exam_attempt(p_paper_id text, p_mode text, p_elective text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_paper public.exam_papers%rowtype;
  v_attempt_id uuid;
begin
  if v_uid is null then
    raise exception 'EXAM_AUTH_REQUIRED';
  end if;

  select * into v_paper from public.exam_papers where id = p_paper_id;
  if v_paper.id is null or not (v_paper.published or private.is_current_user_admin()) then
    raise exception 'EXAM_PAPER_NOT_FOUND';
  end if;
  if v_paper.practice_era is not null and p_mode <> 'free' then raise exception 'EXAM_INVALID_MODE'; end if;
  if p_mode is null or p_mode not in ('real', 'free') then
    raise exception 'EXAM_INVALID_MODE';
  end if;
  if cardinality(v_paper.electives) = 0 then
    p_elective := null;
  elsif p_elective is null or not (p_elective = any (v_paper.electives)) then
    raise exception 'EXAM_INVALID_ELECTIVE';
  end if;

  insert into public.exam_attempts (student_id, paper_id, mode, elective, time_limit_minutes)
  values (
    v_uid, p_paper_id, p_mode, p_elective,
    case when p_mode = 'real' then v_paper.time_limit_minutes end
  )
  on conflict (student_id, paper_id) where status = 'in_progress' do nothing
  returning id into v_attempt_id;

  if v_attempt_id is null then
    -- 이미 진행 중인 시도가 있었다(이어 풀기).
    select id into v_attempt_id
      from public.exam_attempts
     where student_id = v_uid and paper_id = p_paper_id and status = 'in_progress';
    return private.exam_attempt_payload(v_attempt_id);
  end if;

  insert into public.exam_attempt_items (attempt_id, question_id)
  select v_attempt_id, q.id
    from public.exam_questions q
   where q.paper_id = p_paper_id
     and (q.section = 'common' or q.section = p_elective);

  return private.exam_attempt_payload(v_attempt_id);
end;
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
         estimated_grade = case when v_kind = 'school' or exists (select 1 from public.exam_papers p where p.id = v_attempt.paper_id and p.practice_era is not null) then null when v_kind = 'hanneung' then private.exam_hanneung_grade(v_score, v_level) else private.exam_estimate_grade(v_cuts, v_score::int) end,
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
             'kind', p.kind, 'practiceEra', p.practice_era, 'hanneungLevel', p.hanneung_level, 'schoolName', p.school_name, 'year', p.year,
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
                        'estimatedGrade', case when p.kind = 'school' or p.practice_era is not null then null else a.estimated_grade end,
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
             'kind', p.kind, 'practiceEra', p.practice_era, 'hanneungLevel', p.hanneung_level, 'schoolName', p.school_name, 'year', p.year,
    'grade', p.grade, 'semester', p.semester, 'examTerm', p.exam_term,
    'questionCount', p.question_count, 'maxScore', p.max_score, 'published', p.published,
             'mode', a.mode,
             'elective', a.elective,
             'score', a.score,
             'estimatedGrade', case when p.kind = 'school' or p.practice_era is not null then null else a.estimated_grade end,
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
      'kind', p.kind, 'practiceEra', p.practice_era, 'hanneungLevel', p.hanneung_level, 'schoolName', p.school_name, 'year', p.year,
    'grade', p.grade, 'semester', p.semester, 'examTerm', p.exam_term,
    'questionCount', p.question_count, 'maxScore', p.max_score, 'published', p.published,
      'startedAt', a.started_at, 'submittedAt', a.submitted_at, 'status', a.status,
      'mode', a.mode, 'elective', a.elective,
      'score', case when a.status = 'submitted' then a.score end,
      'estimatedGrade', case when a.status = 'submitted' and p.kind <> 'school' and p.practice_era is null then a.estimated_grade end,
      'totalTimeMs', (select coalesce(sum(i.time_spent_ms), 0)
        from public.exam_attempt_items i where i.attempt_id = a.id),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'number', q.number, 'sourcePaperId', q.source_paper_id, 'sourceNumber', q.source_number, 'sourceRound', q.source_round, 'section', q.section, 'answerType', q.answer_type, 'choices', q.choices,
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
commit;
