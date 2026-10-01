-- 내신 시험지: 기존 운영 마이그레이션은 수정하지 않는다.
-- 생성: python scripts/exam/build_school_migration.py (검토된 JSON과 기존 RPC 기반).
begin;
alter table public.exam_papers
  add column if not exists kind text not null default 'csat' check (kind in ('csat', 'school', 'hanneung')),
  add column if not exists school_name text,
  add column if not exists year int check (year between 1900 and 2200),
  add column if not exists grade smallint check (grade between 1 and 12),
  add column if not exists semester smallint check (semester in (1, 2)),
  add column if not exists exam_term text check (exam_term in ('mid', 'final')),
  add column if not exists question_count int not null default 30 check (question_count > 0),
  add column if not exists max_score numeric not null default 100 check (max_score > 0);
-- 원본에 정확한 시행일이 없는 내신은 날짜를 만들지 않는다.
alter table public.exam_papers alter column exam_date drop not null;
alter table public.exam_questions drop constraint if exists exam_questions_points_check;
alter table public.exam_questions alter column points type numeric using points::numeric;
alter table public.exam_questions add constraint exam_questions_points_check check (points > 0);
-- 번호 제약(1~30, 22번까지 공통)은 그대로 둔다. 첫 내신 시험지(21문항·전부 공통)가 이미 만족한다.
alter table public.exam_questions
  add column if not exists answer_type text,
  add column if not exists choices jsonb;
update public.exam_questions set answer_type = case when is_choice then 'choice5' else 'digits' end where answer_type is null;
alter table public.exam_questions alter column answer_type set not null;
alter table public.exam_questions drop constraint if exists exam_questions_answer_type_check;
alter table public.exam_questions add constraint exam_questions_answer_type_check check (
  answer_type in ('choice5', 'digits', 'choice10') and is_choice = (answer_type <> 'digits')
  and case when answer_type = 'choice10' then
    choices is not null and jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) = 10
    else choices is null end);
-- 기존 시드처럼 answer_type을 생략한 INSERT도 기존 답 유형으로 받는다.
create or replace function private.exam_default_answer_type()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.answer_type is null then new.answer_type := case when new.is_choice then 'choice5' else 'digits' end; end if;
  return new;
end;
$function$;
drop trigger if exists exam_default_answer_type on public.exam_questions;
create trigger exam_default_answer_type before insert on public.exam_questions for each row execute function private.exam_default_answer_type();
revoke all on function private.exam_default_answer_type() from public, anon, authenticated;
grant select (answer_type, choices) on public.exam_questions to authenticated;
alter table public.exam_attempts alter column score type numeric using score::numeric;
alter table public.exam_attempts alter column elective drop not null;

create or replace function private.exam_valid_typed_answer(p_answer text, p_type text)
returns text language sql immutable security definer set search_path = '' as $function$
  select case when p_type = 'choice10' then
    case when private.exam_normalize_answer(p_answer) ~ '^([1-9]|10)$' then private.exam_normalize_answer(p_answer) end
    else private.exam_valid_answer(p_answer, p_type = 'choice5') end;
$function$;
revoke all on function private.exam_valid_typed_answer(text, text) from public, anon, authenticated;

create or replace function private.exam_apply_items(p_attempt_id uuid, p_items jsonb, p_visit_order int[])
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_items is not null and jsonb_typeof(p_items) = 'array' then
    update public.exam_attempt_items i
       set answer = case when i.checked_at is not null then i.answer
                         else private.exam_valid_typed_answer(s.answer, q.answer_type) end,
           unsure = s.unsure,
           time_spent_ms = s.time_spent_ms,
           visits = s.visits,
           updated_at = now()
      from (
        select distinct on (e->>'questionId')
               e->>'questionId' as question_id,
               case when jsonb_typeof(e->'answer') in ('string', 'number') then e->>'answer' end as answer,
               coalesce(case when jsonb_typeof(e->'unsure') = 'boolean' then (e->>'unsure')::boolean end, false) as unsure,
               case when jsonb_typeof(e->'timeSpentMs') = 'number'
                    then greatest(0, least(floor((e->>'timeSpentMs')::numeric), 86400000))::bigint
                    else 0 end as time_spent_ms,
               case when jsonb_typeof(e->'visits') = 'number'
                    then greatest(0, least(floor((e->>'visits')::numeric), 100000))::int
                    else 0 end as visits
          from jsonb_array_elements(p_items) e
         where jsonb_typeof(e) = 'object'
      ) s,
      public.exam_questions q
     where i.attempt_id = p_attempt_id
       and i.question_id::text = s.question_id
       and q.id = i.question_id;
  end if;

  if p_visit_order is not null then
    update public.exam_attempts
       set visit_order = array(
             select v from unnest(p_visit_order) with ordinality as t(v, ord)
              where exists (select 1 from public.exam_attempt_items i join public.exam_questions q on q.id = i.question_id where i.attempt_id = p_attempt_id and q.number = v)
              order by ord
              limit 5000
           ),
           updated_at = now()
     where id = p_attempt_id;
  end if;
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
    'kind', p.kind, 'schoolName', p.school_name, 'year', p.year,
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

create or replace function public.check_exam_answer(p_attempt_id uuid, p_question_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_attempt public.exam_attempts%rowtype;
  v_item record;
  v_answer text;
begin
  if v_uid is null then
    raise exception 'EXAM_AUTH_REQUIRED';
  end if;

  -- 제출(submit_exam_attempt)과 같은 행 잠금으로 직렬화한다.
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if v_attempt.id is null or v_attempt.student_id <> v_uid then
    raise exception 'EXAM_ATTEMPT_NOT_FOUND';
  end if;
  if v_attempt.mode <> 'free' then
    raise exception 'EXAM_REAL_MODE_LOCKED';
  end if;
  if v_attempt.status <> 'in_progress' then
    raise exception 'EXAM_NOT_IN_PROGRESS';
  end if;

  select i.answer, i.checked_at, q.answer_type, k.answer as correct_answer into v_item
    from public.exam_attempt_items i
    join public.exam_questions q on q.id = i.question_id
    join public.exam_answer_keys k on k.question_id = i.question_id
   where i.attempt_id = p_attempt_id and i.question_id = p_question_id;
  if v_item.correct_answer is null then
    raise exception 'EXAM_QUESTION_NOT_FOUND';
  end if;

  if v_item.checked_at is not null then
    v_answer := v_item.answer;
  else
    v_answer := private.exam_valid_typed_answer(p_answer, v_item.answer_type);
    if v_answer is null then
      raise exception 'EXAM_INVALID_ANSWER';
    end if;
    update public.exam_attempt_items
       set answer = v_answer, checked_at = now(), updated_at = now()
     where attempt_id = p_attempt_id and question_id = p_question_id;
  end if;

  return jsonb_build_object(
    'isCorrect', coalesce(private.exam_normalize_answer(v_answer) = private.exam_normalize_answer(v_item.correct_answer), false),
    'correctAnswer', v_item.correct_answer
  );
end;
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

  select p.kind, p.grade_cuts->'rawByElective'->v_attempt.elective into v_kind, v_cuts
    from public.exam_papers p where p.id = v_attempt.paper_id;

  update public.exam_attempts
     set status = 'submitted',
         submitted_at = now(),
         score = v_score,
         correct_count = v_correct,
         total_count = v_total,
         total_time_ms = v_time,
         estimated_grade = case when v_kind = 'school' then null else private.exam_estimate_grade(v_cuts, v_score::int) end,
         updated_at = now()
   where id = p_attempt_id;

  return private.exam_result_payload(p_attempt_id);
end;
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
    'kind', p.kind, 'schoolName', p.school_name, 'year', p.year,
    'grade', p.grade, 'semester', p.semester, 'examTerm', p.exam_term,
    'questionCount', p.question_count, 'maxScore', p.max_score, 'published', p.published,
    'mode', a.mode,
    'elective', a.elective,
    'score', a.score,
    'correctCount', a.correct_count,
    'totalCount', a.total_count,
    'totalTimeMs', a.total_time_ms,
    'estimatedGrade', case when p.kind = 'school' then null else a.estimated_grade end,
    'gradeCut', case when p.kind = 'school' then null else jsonb_build_object(
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
             'kind', p.kind, 'schoolName', p.school_name, 'year', p.year,
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
             'kind', p.kind, 'schoolName', p.school_name, 'year', p.year,
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
      'kind', p.kind, 'schoolName', p.school_name, 'year', p.year,
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

create or replace function public.add_exam_questions_to_mistakes(
  p_attempt_id uuid,
  p_question_ids uuid[],
  p_origin text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_attempt public.exam_attempts%rowtype;
  v_paper_title text;
  v_origin text := rtrim(btrim(coalesce(p_origin, '')), '/');
  v_row record;
  v_mistake_id uuid;
  v_final_answer text;
  v_out jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'EXAM_AUTH_REQUIRED';
  end if;
  if v_origin !~ '^https?://[A-Za-z0-9.:\[\]-]+$' then
    raise exception 'EXAM_INVALID_ORIGIN';
  end if;

  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if v_attempt.id is null or v_attempt.student_id <> v_uid then
    raise exception 'EXAM_ATTEMPT_NOT_FOUND';
  end if;
  if v_attempt.status <> 'submitted' then
    raise exception 'EXAM_NOT_SUBMITTED';
  end if;

  select title into v_paper_title from public.exam_papers where id = v_attempt.paper_id;

  for v_row in
    select i.question_id, i.added_mistake_id, q.number, q.section, q.image_url, q.is_choice, q.answer_type, q.choices,
           q.curriculum_grade, q.curriculum_chapter, k.answer as correct_answer
      from public.exam_attempt_items i
      join public.exam_questions q on q.id = i.question_id
      left join public.exam_answer_keys k on k.question_id = q.id
     where i.attempt_id = p_attempt_id
       and i.question_id = any (coalesce(p_question_ids, '{}'::uuid[]))
     order by q.number
  loop
    if v_row.added_mistake_id is not null then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'questionId', v_row.question_id, 'mistakeId', v_row.added_mistake_id, 'created', false));
      continue;
    end if;

    -- 원래 객관식은 번호, 변환한 10지선다는 실제 수식으로 저장(복습체크 AI 채점용).
    v_final_answer := case
      when v_row.correct_answer is null then null
      when v_row.answer_type = 'choice10' then '$' || (v_row.choices->>(v_row.correct_answer::int - 1)) || '$'
      when v_row.is_choice and v_row.correct_answer in ('1', '2', '3', '4', '5')
        then substr('①②③④⑤', v_row.correct_answer::int, 1)
      else v_row.correct_answer
    end;

    -- 한 번에 여러 문항을 넣으면 now()가 같아 목록(date 내림차순) 순서가 섞이므로, 번호가 작은
    -- 문항이 위에 오도록 1ms씩 당겨 둔다.
    insert into public.mistakes (user_id, title, image_url, analysis, reviews, grade, chapter, root_causes, date)
    values (
      v_uid,
      v_paper_title
        || case when v_row.section = 'common' then '' else '(' || v_row.section || ')' end
        || ' ' || v_row.number || '번',
      v_origin || v_row.image_url,
      case when v_final_answer is null then null else jsonb_build_object('finalAnswer', v_final_answer) end,
      '["", "", ""]'::jsonb,
      v_row.curriculum_grade,
      v_row.curriculum_chapter,
      '{}'::text[],
      now() - make_interval(secs => v_row.number / 1000.0)
    )
    returning id into v_mistake_id;

    update public.exam_attempt_items
       set added_mistake_id = v_mistake_id, updated_at = now()
     where attempt_id = p_attempt_id and question_id = v_row.question_id;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'questionId', v_row.question_id, 'mistakeId', v_mistake_id, 'created', true));
  end loop;

  return v_out;
end;
$function$;

revoke all on function private.exam_apply_items(uuid,jsonb,int[]) from public, anon, authenticated;

revoke all on function private.exam_attempt_payload(uuid) from public, anon, authenticated;

revoke all on function private.exam_result_payload(uuid) from public, anon, authenticated;

revoke all on function public.check_exam_answer(uuid,uuid,text) from public, anon;
grant execute on function public.check_exam_answer(uuid,uuid,text) to authenticated;

revoke all on function public.start_exam_attempt(text,text,text) from public, anon;
grant execute on function public.start_exam_attempt(text,text,text) to authenticated;

revoke all on function public.submit_exam_attempt(uuid,jsonb,int[]) from public, anon;
grant execute on function public.submit_exam_attempt(uuid,jsonb,int[]) to authenticated;

revoke all on function public.list_exam_papers_for_me() from public, anon;
grant execute on function public.list_exam_papers_for_me() to authenticated;

revoke all on function public.list_my_exam_results(text) from public, anon;
grant execute on function public.list_my_exam_results(text) to authenticated;

revoke all on function public.list_my_paper_history(text,uuid) from public, anon;
grant execute on function public.list_my_paper_history(text,uuid) to authenticated;

revoke all on function public.add_exam_questions_to_mistakes(uuid,uuid[],text) from public, anon;
grant execute on function public.add_exam_questions_to_mistakes(uuid,uuid[],text) to authenticated;

-- 시드: 정확한 시행일은 원본에 없어 null. 정답은 보호된 별도 테이블에만 저장.
insert into public.exam_papers (id, title, exam_date, source, subject, school_grade, time_limit_minutes, electives, grade_cuts, published, kind, school_name, year, grade, semester, exam_term, question_count, max_score)
values ('2026-dongbuk-g1-s2-mid-common2', '2026 동북고 1학년 2학기 중간 공통수학2', null, '동북고', '공통수학2', '고1', 50, '{}'::text[], null, false, 'school', '동북고', 2026, 1, 2, 'mid', 21, 100) on conflict do nothing;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,curriculum_grade,curriculum_chapter,answer_type,choices)
values
  ('2026-dongbuk-g1-s2-mid-common2', 1, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-01.png', true, 4.4, '공통수학2', '평면좌표', 'choice5', null),
  ('2026-dongbuk-g1-s2-mid-common2', 2, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-02.png', true, 4.4, '공통수학2', '평면좌표', 'choice5', null),
  ('2026-dongbuk-g1-s2-mid-common2', 3, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-03.png', true, 4.6, '공통수학2', '직선의 방정식', 'choice5', null),
  ('2026-dongbuk-g1-s2-mid-common2', 4, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-04.png', true, 4.5, '공통수학2', '직선의 방정식', 'choice5', null),
  ('2026-dongbuk-g1-s2-mid-common2', 5, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-05.png', true, 4.9, '공통수학2', '평면좌표', 'choice5', null),
  ('2026-dongbuk-g1-s2-mid-common2', 6, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-06.png', true, 4.6, '공통수학2', '원의 방정식', 'choice5', null),
  ('2026-dongbuk-g1-s2-mid-common2', 7, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-07.png', true, 4.6, '공통수학2', '원의 방정식', 'choice5', null),
  ('2026-dongbuk-g1-s2-mid-common2', 8, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-08.png', true, 4.5, '공통수학2', '원의 방정식', 'choice5', null),
  ('2026-dongbuk-g1-s2-mid-common2', 9, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-09.png', true, 4.5, '공통수학2', '도형의 이동', 'choice5', null),
  ('2026-dongbuk-g1-s2-mid-common2', 10, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-10.png', true, 4.6, '공통수학2', '도형의 이동', 'choice5', null),
  ('2026-dongbuk-g1-s2-mid-common2', 11, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-11.png', true, 4.6, '공통수학2', '원의 방정식', 'choice5', null),
  ('2026-dongbuk-g1-s2-mid-common2', 12, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-12.png', true, 4.6, '공통수학2', '원의 방정식', 'choice5', null),
  ('2026-dongbuk-g1-s2-mid-common2', 13, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-13.png', true, 4.8, '공통수학2', '원의 방정식', 'choice5', null),
  ('2026-dongbuk-g1-s2-mid-common2', 14, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-14.png', true, 4.6, '공통수학2', '집합', 'choice5', null),
  ('2026-dongbuk-g1-s2-mid-common2', 15, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-15.png', true, 4.6, '공통수학2', '집합', 'choice5', null),
  ('2026-dongbuk-g1-s2-mid-common2', 16, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-16.png', true, 4.4, '공통수학2', '집합', 'choice5', null),
  ('2026-dongbuk-g1-s2-mid-common2', 17, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-17.png', true, 4.8, '공통수학2', '집합', 'choice5', null),
  ('2026-dongbuk-g1-s2-mid-common2', 18, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-18.png', true, 5, '공통수학2', '원의 방정식', 'choice10', '["\\frac{\\sqrt{23}}{2}", "\\sqrt{41}", "\\sqrt{105}", "23", "\\sqrt{39}", "4\\sqrt{3}", "\\sqrt{23}", "2\\sqrt{23}", "\\frac{\\sqrt{23}}{4}", "8"]'::jsonb),
  ('2026-dongbuk-g1-s2-mid-common2', 19, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-19.png', false, 5, '공통수학2', '평면좌표', 'digits', null),
  ('2026-dongbuk-g1-s2-mid-common2', 20, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-20.png', false, 6, '공통수학2', '원의 방정식', 'digits', null),
  ('2026-dongbuk-g1-s2-mid-common2', 21, 'common', '/exams/2026-dongbuk-g1-s2-mid-common2/q-21.png', false, 6, '공통수학2', '집합', 'digits', null)
on conflict do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id, v.answer from (values
  (1, '5'),
  (2, '3'),
  (3, '5'),
  (4, '1'),
  (5, '5'),
  (6, '2'),
  (7, '5'),
  (8, '4'),
  (9, '1'),
  (10, '3'),
  (11, '3'),
  (12, '1'),
  (13, '4'),
  (14, '4'),
  (15, '4'),
  (16, '2'),
  (17, '2'),
  (18, '7'),
  (19, '10'),
  (20, '7'),
  (21, '15')) v(number,answer) join public.exam_questions q on q.paper_id = '2026-dongbuk-g1-s2-mid-common2' and q.section = 'common' and q.number = v.number
on conflict do nothing;
commit;
