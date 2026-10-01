-- ================================================
-- 기출문제 풀이 v2: 채점해 보기 잠금 · 시험지별 진행 정도 · 최고점 기준값
-- ================================================
-- 계약: src/features/exam/contract.ts(v2 표시 부분), 클라이언트: src/features/exam/examClient.ts
-- 앞선 마이그레이션: 20261002120000_exam_practice.sql(운영 적용됨, 수정하지 않음).
--
-- 1) 채점해 보기 잠금(자유 모드)
--    - exam_attempt_items.checked_at: "채점해 보기"를 한 시각. 채점 당시 답은 기존 answer에 남는다.
--    - check_exam_answer: 잠기지 않은 문항이면 받은 답을 검증·저장하고 잠근다. 이미 잠긴 문항이면
--      새 답은 무시하고 저장된 답 기준 결과를 그대로 돌려준다.
--    - exam_apply_items(저장·제출 공용): 잠긴 문항의 answer는 덮어쓰지 않는다(🤔·시간·방문수는 갱신).
--    - exam_attempt_payload: items[].checked = 잠긴 문항만 { isCorrect, correctAnswer }, 나머지는 null.
-- 2) list_exam_papers_for_me(): 공개 시험지 + 내 진행 중 시도 + 최근 제출 결과 + 제출 횟수(시행일 최신순).
-- 3) grade_cuts.topByElective(원점수 100점일 때 표준점수·백분위) → 결과 gradeCut.topStandard/topPercentile.
--    grade_cuts.standardByElective/percentileByElective가 있으면 gradeCut.standardByGrade/percentileByGrade로 우선 사용.
--
-- 적용 순서: 20261002120000_exam_practice.sql 다음에 이 파일 하나를 그대로 실행(트랜잭션으로 감쌈).

begin;

-- 1) 채점해 보기 잠금 -----------------------------------------------------------------------------

alter table public.exam_attempt_items
  add column if not exists checked_at timestamptz;

comment on column public.exam_attempt_items.checked_at is
  '자유 모드 "채점해 보기"로 잠긴 시각. null이 아니면 answer는 채점 당시 답이고 더 이상 바뀌지 않는다.';

-- 학생이 보낸 문항 상태를 이 시도의 문항에만 반영(정답·채점 컬럼은 건드리지 않음).
-- 잠긴(checked_at) 문항의 answer는 그대로 둔다 — 🤔·시간·방문수만 갱신.
-- p_items: [{ questionId, answer, unsure, timeSpentMs, visits }, ...] (contract의 ExamItemState)
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
                         else private.exam_valid_answer(s.answer, q.is_choice) end,
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
              where v between 1 and 30
              order by ord
              limit 5000
           ),
           updated_at = now()
     where id = p_attempt_id;
  end if;
end;
$function$;

-- contract의 ExamAttempt 모양 + serverNow(클라이언트 시계 보정용).
-- items[].checked: 잠긴 문항만 { isCorrect, correctAnswer }(학생이 이미 본 정보). 잠기지 않은 문항은 null —
-- 정답이 새지 않도록 answer key는 checked_at이 있을 때만 읽는다.
create or replace function private.exam_attempt_payload(p_attempt_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', a.id,
    'paperId', a.paper_id,
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
               'isChoice', q.is_choice,
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
  from public.exam_attempts a
  where a.id = p_attempt_id;
$function$;

-- 자유 모드 전용: 한 문항 바로 채점 + 잠금.
--   - 아직 잠기지 않은 문항: 받은 답을 정규화·검증해 저장하고 잠근다(빈 답·형식이 틀린 답은 거부).
--   - 이미 잠긴 문항: 새 답은 무시하고 저장된 답 기준 결과를 그대로 돌려준다.
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

  select i.answer, i.checked_at, q.is_choice, k.answer as correct_answer into v_item
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
    v_answer := private.exam_valid_answer(p_answer, v_item.is_choice);
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

-- 2) 최고점 기준값 · 선택과목별 등급컷 ------------------------------------------------------------
-- grade_cuts.topByElective[선택과목] = { standard, percentile } — 원점수 100점일 때 값. 없으면 null.
-- grade_cuts.standardByElective / percentileByElective[선택과목] = [1등급..k등급] — 선택과목마다
-- 표준점수·백분위 컷이 다른 시험지(수능 등)용. 있으면 그것을, 없으면 공통 standard/percentile을 쓴다.
-- 등급컷 배열 길이는 8이 아닐 수 있다(하위 등급 미발표 시 7 등). exam_estimate_grade는 컷 개수를 세는
-- 방식이라 길이와 상관없이 동작한다(컷이 k개면 마지막 컷 미만은 k+1등급).

create or replace function private.exam_result_payload(p_attempt_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'attemptId', a.id,
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

-- 2025-06 종로학원 확정 등급컷의 '최고점' 행(원점수 100점).
update public.exam_papers
   set grade_cuts = coalesce(grade_cuts, '{}'::jsonb) || jsonb_build_object('topByElective', jsonb_build_object(
         '확률과 통계', jsonb_build_object('standard', 145, 'percentile', 99),
         '미적분', jsonb_build_object('standard', 152, 'percentile', 100),
         '기하', jsonb_build_object('standard', 151, 'percentile', 100)
       ))
 where id = '2025-06-math';

-- 3) 시험지 목록 + 내 진행 정도 --------------------------------------------------------------------
-- contract의 ExamPaperSummary[] 모양. 공개 시험지만, 시행일 최신순.
--   inProgress: 이 시험지의 내 진행 중 시도(시험지마다 따로 하나) — 답한 문항 수, 문항 스톱워치 합계.
--   lastResult: 가장 최근에 제출한 결과, resultCount: 제출 횟수.
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

revoke all on function public.list_exam_papers_for_me() from public, anon;
grant execute on function public.list_exam_papers_for_me() to authenticated;

-- create or replace는 기존 권한을 유지하지만, 다시 한 번 못 박아 둔다.
revoke all on function private.exam_apply_items(uuid, jsonb, int[]) from public, anon, authenticated;
revoke all on function private.exam_attempt_payload(uuid) from public, anon, authenticated;
revoke all on function private.exam_result_payload(uuid) from public, anon, authenticated;
revoke all on function public.check_exam_answer(uuid, uuid, text) from public, anon;
grant execute on function public.check_exam_answer(uuid, uuid, text) to authenticated;

commit;
