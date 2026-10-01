-- ================================================
-- 기출문제 풀이(실전/자유 모드 + OMR 결과 + 오답노트 연동): 스키마 + RLS + RPC + 2025-06 시드
-- ================================================
-- 계약: src/features/exam/contract.ts, 클라이언트: src/features/exam/examClient.ts
--
-- 보안 모델
--   - 시험지·문항(정답 제외)은 로그인 사용자가 SELECT 가능(published 시험지만, 관리자는 전부).
--     문항 테이블은 컬럼 단위 GRANT로 해설 컬럼(solution_*)까지 막아 둔다 — 해설은 나중에
--     제출 후 결과 RPC로만 내려줄 예정.
--   - 정답(exam_answer_keys)과 전국 통계(exam_question_national_stats, 선지별 비율로 정답이 드러남)는
--     관리자만 SELECT. 학생에게는 채점/결과 RPC(SECURITY DEFINER)를 통해서만 노출된다.
--   - 시도(exam_attempts)·문항 상태(exam_attempt_items)는 본인 것만 SELECT(관리자는 전체).
--     INSERT/UPDATE/DELETE는 RLS 정책이 없고 권한도 회수 — 상태 전이는 전부 아래 RPC로만.
--   - 채점은 서버에서만(제출 RPC). 클라이언트가 보낸 is_correct/score 같은 값은 받지 않는다.
--
-- 적용 순서: 이 파일 하나를 그대로 실행하면 된다(트랜잭션으로 감쌈). private 스키마와
-- private.is_current_user_admin()(20260828182500_secure_admin_authorization.sql), public.mistakes가
-- 먼저 있어야 한다.

begin;

-- 1) 테이블 ---------------------------------------------------------------------------------------

create table public.exam_papers (
  id text primary key,                                   -- '2025-06-math'
  title text not null,                                   -- '2025학년도 6월 모의평가 수학'
  exam_date date not null,
  source text not null,
  subject text not null,
  school_grade text not null,
  time_limit_minutes int not null check (time_limit_minutes > 0),
  electives text[] not null,
  -- { source, rawByElective: { 선택과목: [1등급컷..8등급컷] }, standard: [..8], percentile: [..8] }
  grade_cuts jsonb,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.exam_papers is
  '기출 시험지. grade_cuts.rawByElective[선택과목]는 1~8등급 원점수 컷(내림차순) — 추정 등급 계산에 쓴다.';

create table public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  paper_id text not null references public.exam_papers(id) on delete cascade,
  number smallint not null check (number between 1 and 30),
  section text not null,                                  -- 'common' | 선택과목명('확률과 통계' 등)
  image_url text not null,                                -- '/exams/2025-06-math/c-01.png' (상대 경로)
  is_choice boolean not null,
  points smallint not null check (points between 1 and 4),
  curriculum_grade text,                                  -- 오답노트 grade (MATH_CURRICULUM 키)
  curriculum_chapter text,                                -- 오답노트 chapter
  solution_text text,                                     -- 해설(아직 없음, 자리만)
  solution_image_url text,
  created_at timestamptz not null default now(),
  unique (paper_id, section, number),
  check ((section = 'common') = (number <= 22))
);

create index exam_questions_paper_idx on public.exam_questions (paper_id, number);

create table public.exam_answer_keys (
  question_id uuid primary key references public.exam_questions(id) on delete cascade,
  answer text not null                                    -- 객관식 '1'~'5', 단답 '0'~'999'
);

comment on table public.exam_answer_keys is
  '정답. 관리자만 SELECT — 학생은 check/submit/result RPC로만 정답을 본다.';

create table public.exam_question_national_stats (
  question_id uuid not null references public.exam_questions(id) on delete cascade,
  elective text not null,                                 -- EBSi 오답률은 선택과목별 리스트(공통 문항도 과목마다 값이 다를 수 있음)
  wrong_rate numeric(5, 1) not null check (wrong_rate between 0 and 100),
  choice_rates jsonb,                                     -- 객관식 [①..⑤] %, 단답은 null
  rank smallint,
  source text,
  primary key (question_id, elective)
);

comment on table public.exam_question_national_stats is
  '전국 오답률(EBSi TOP15 등). 선지별 비율로 정답이 드러나므로 관리자만 SELECT — 학생은 결과 RPC로만 본다.';

create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  paper_id text not null references public.exam_papers(id) on delete cascade,
  mode text not null check (mode in ('real', 'free')),
  elective text not null,
  started_at timestamptz not null default now(),
  time_limit_minutes int check (time_limit_minutes is null or time_limit_minutes > 0),
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  submitted_at timestamptz,
  score int,
  correct_count int,
  total_count int,
  total_time_ms bigint,
  estimated_grade smallint check (estimated_grade is null or estimated_grade between 1 and 9),
  visit_order int[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((mode = 'real') = (time_limit_minutes is not null)),
  check ((status = 'submitted') = (submitted_at is not null))
);

-- 같은 학생·같은 시험지에 진행 중 시도는 하나만(이어 풀기 + start RPC 동시 호출 경쟁 방지).
create unique index exam_attempts_one_in_progress
  on public.exam_attempts (student_id, paper_id) where status = 'in_progress';
create index exam_attempts_student_idx on public.exam_attempts (student_id, submitted_at desc);

create table public.exam_attempt_items (
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  question_id uuid not null references public.exam_questions(id) on delete cascade,
  answer text,
  unsure boolean not null default false,
  time_spent_ms bigint not null default 0 check (time_spent_ms >= 0),
  visits int not null default 0 check (visits >= 0),
  is_correct boolean,                                     -- 제출(서버 채점) 후에만 채워짐
  added_mistake_id uuid references public.mistakes(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

create index exam_attempt_items_question_idx on public.exam_attempt_items (question_id);
create index exam_attempt_items_mistake_idx on public.exam_attempt_items (added_mistake_id)
  where added_mistake_id is not null;

-- 2) RLS / 권한 -----------------------------------------------------------------------------------
-- Supabase 기본 권한(새 테이블에 anon/authenticated ALL)을 먼저 전부 회수하고 필요한 SELECT만 연다.

alter table public.exam_papers enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_answer_keys enable row level security;
alter table public.exam_question_national_stats enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.exam_attempt_items enable row level security;

revoke all on public.exam_papers, public.exam_questions, public.exam_answer_keys,
  public.exam_question_national_stats, public.exam_attempts, public.exam_attempt_items
  from public, anon, authenticated;

grant select on public.exam_papers to authenticated;
grant select (id, paper_id, number, section, image_url, is_choice, points, curriculum_grade, curriculum_chapter)
  on public.exam_questions to authenticated;
grant select on public.exam_answer_keys to authenticated;
grant select on public.exam_question_national_stats to authenticated;
grant select on public.exam_attempts to authenticated;
grant select on public.exam_attempt_items to authenticated;

create policy "Exam papers are readable when published"
  on public.exam_papers for select to authenticated
  using (published or (select private.is_current_user_admin()));

create policy "Exam questions are readable when the paper is published"
  on public.exam_questions for select to authenticated
  using (
    exists (select 1 from public.exam_papers p where p.id = paper_id and p.published)
    or (select private.is_current_user_admin())
  );

create policy "Admins can read exam answer keys"
  on public.exam_answer_keys for select to authenticated
  using ((select private.is_current_user_admin()));

create policy "Admins can read exam national stats"
  on public.exam_question_national_stats for select to authenticated
  using ((select private.is_current_user_admin()));

create policy "Students read own exam attempts, admins read all"
  on public.exam_attempts for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_current_user_admin()));

create policy "Students read own exam attempt items, admins read all"
  on public.exam_attempt_items for select to authenticated
  using (
    exists (
      select 1 from public.exam_attempts a
       where a.id = attempt_id and a.student_id = (select auth.uid())
    )
    or (select private.is_current_user_admin())
  );

-- 3) 내부 헬퍼(private, 클라이언트 직접 호출 불가) -----------------------------------------------

-- 실전 모드 제한시간 이후 저장을 허용하는 유예(네트워크 지연·자동 제출 직전 저장 대비).
create or replace function private.exam_grace_interval()
returns interval
language sql
immutable
set search_path = ''
as $function$
  select interval '2 minutes';
$function$;

-- 답 정규화: 공백 제거, ①~⑤ → 1~5, 숫자만이면 앞자리 0 제거('007' → '7', '000' → '0').
create or replace function private.exam_normalize_answer(p_answer text)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v text := btrim(translate(coalesce(p_answer, ''), '①②③④⑤', '12345'));
begin
  if v = '' then
    return null;
  end if;
  if v ~ '^[0-9]+$' then
    v := ltrim(v, '0');
    if v = '' then
      v := '0';
    end if;
  end if;
  return v;
end;
$function$;

-- 저장 가능한 답만 통과: 객관식은 1~5, 단답은 0~999. 그 외는 null(미응답 취급).
create or replace function private.exam_valid_answer(p_answer text, p_is_choice boolean)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v text := private.exam_normalize_answer(p_answer);
begin
  if v is null then
    return null;
  end if;
  if p_is_choice then
    return case when v in ('1', '2', '3', '4', '5') then v else null end;
  end if;
  return case when v ~ '^[0-9]{1,3}$' then v else null end;
end;
$function$;

-- 원점수 → 추정 등급(1~9). p_cuts = [1등급컷, ..., 8등급컷](내림차순). 점수 >= k등급컷이면 k등급.
create or replace function private.exam_estimate_grade(p_cuts jsonb, p_score int)
returns smallint
language sql
immutable
set search_path = ''
as $function$
  select case
    when p_cuts is null or jsonb_typeof(p_cuts) <> 'array' or jsonb_array_length(p_cuts) = 0 then null
    else (1 + (select count(*) from jsonb_array_elements_text(p_cuts) c where p_score < c::numeric))::smallint
  end;
$function$;

-- 학생이 보낸 문항 상태를 이 시도의 문항에만 반영(정답·채점 컬럼은 건드리지 않음).
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
       set answer = private.exam_valid_answer(s.answer, q.is_choice),
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
               'visits', i.visits
             ) order by q.number)
        from public.exam_attempt_items i
        join public.exam_questions q on q.id = i.question_id
       where i.attempt_id = a.id
    ), '[]'::jsonb)
  )
  from public.exam_attempts a
  where a.id = p_attempt_id;
$function$;

-- contract의 ExamResult 모양(제출된 시도만 호출할 것 — 정답이 들어 있다).
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
      'standardByGrade', coalesce(p.grade_cuts->'standard', '[]'::jsonb),
      'percentileByGrade', coalesce(p.grade_cuts->'percentile', '[]'::jsonb),
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

revoke all on function private.exam_grace_interval() from public, anon, authenticated;
revoke all on function private.exam_normalize_answer(text) from public, anon, authenticated;
revoke all on function private.exam_valid_answer(text, boolean) from public, anon, authenticated;
revoke all on function private.exam_estimate_grade(jsonb, int) from public, anon, authenticated;
revoke all on function private.exam_apply_items(uuid, jsonb, int[]) from public, anon, authenticated;
revoke all on function private.exam_attempt_payload(uuid) from public, anon, authenticated;
revoke all on function private.exam_result_payload(uuid) from public, anon, authenticated;

-- 4) 공개 RPC -------------------------------------------------------------------------------------
-- 에러는 'EXAM_*' 토큰으로 raise — examClient.ts가 학생용 한국어 문구로 바꾼다.

-- 진행 중인 내 시도(이어 풀기). 없으면 null.
create or replace function public.get_active_exam_attempt(p_paper_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_attempt_id uuid;
begin
  if v_uid is null then
    raise exception 'EXAM_AUTH_REQUIRED';
  end if;

  select id into v_attempt_id
    from public.exam_attempts
   where student_id = v_uid and paper_id = p_paper_id and status = 'in_progress';

  if v_attempt_id is null then
    return null;
  end if;
  return private.exam_attempt_payload(v_attempt_id);
end;
$function$;

-- 시작: 같은 시험지에 진행 중 시도가 있으면 그대로 돌려준다(모드·선택과목도 기존 것 유지).
-- 없으면 새로 만들고 공통 1~22 + 선택과목 23~30 = 30문항 상태 행을 미리 만든다.
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
  if p_elective is null or not (p_elective = any (v_paper.electives)) then
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

-- 진행 상황 자동 저장. 진행 중이 아니거나 실전 모드 제한시간+유예가 지났으면 false(저장 안 함).
create or replace function public.save_exam_progress(p_attempt_id uuid, p_items jsonb, p_visit_order int[])
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_attempt public.exam_attempts%rowtype;
begin
  if v_uid is null then
    raise exception 'EXAM_AUTH_REQUIRED';
  end if;

  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if v_attempt.id is null or v_attempt.student_id <> v_uid then
    raise exception 'EXAM_ATTEMPT_NOT_FOUND';
  end if;
  if v_attempt.status <> 'in_progress' then
    return false;
  end if;
  if v_attempt.mode = 'real'
     and now() > v_attempt.started_at
                 + make_interval(mins => v_attempt.time_limit_minutes)
                 + private.exam_grace_interval() then
    return false;
  end if;

  perform private.exam_apply_items(p_attempt_id, p_items, p_visit_order);
  return true;
end;
$function$;

-- 자유 모드 전용: 한 문항 바로 채점(저장은 하지 않음).
create or replace function public.check_exam_answer(p_attempt_id uuid, p_question_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_attempt public.exam_attempts%rowtype;
  v_key text;
begin
  if v_uid is null then
    raise exception 'EXAM_AUTH_REQUIRED';
  end if;

  select * into v_attempt from public.exam_attempts where id = p_attempt_id;
  if v_attempt.id is null or v_attempt.student_id <> v_uid then
    raise exception 'EXAM_ATTEMPT_NOT_FOUND';
  end if;
  if v_attempt.mode <> 'free' then
    raise exception 'EXAM_REAL_MODE_LOCKED';
  end if;
  if v_attempt.status <> 'in_progress' then
    raise exception 'EXAM_NOT_IN_PROGRESS';
  end if;

  select k.answer into v_key
    from public.exam_attempt_items i
    join public.exam_answer_keys k on k.question_id = i.question_id
   where i.attempt_id = p_attempt_id and i.question_id = p_question_id;
  if v_key is null then
    raise exception 'EXAM_QUESTION_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'isCorrect', coalesce(private.exam_normalize_answer(p_answer) = private.exam_normalize_answer(v_key), false),
    'correctAnswer', v_key
  );
end;
$function$;

-- 제출 + 서버 채점. 이미 제출된 시도면 저장된 결과를 그대로 돌려준다(중복 제출·재시도에 안전).
-- 실전 모드는 시간이 지난 뒤에도 제출을 받는다(자동 제출용). 단, 제한시간+유예가 지난 뒤
-- 도착한 답안은 반영하지 않고 마지막으로 저장된 답안으로 채점한다(시간 초과 후 고친 답 방지).
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
  v_score int;
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

  select coalesce(sum(q.points) filter (where i.is_correct), 0)::int,
         count(*) filter (where i.is_correct)::int,
         count(*)::int,
         coalesce(sum(i.time_spent_ms), 0)::bigint
    into v_score, v_correct, v_total, v_time
    from public.exam_attempt_items i
    join public.exam_questions q on q.id = i.question_id
   where i.attempt_id = p_attempt_id;

  select p.grade_cuts->'rawByElective'->v_attempt.elective into v_cuts
    from public.exam_papers p where p.id = v_attempt.paper_id;

  update public.exam_attempts
     set status = 'submitted',
         submitted_at = now(),
         score = v_score,
         correct_count = v_correct,
         total_count = v_total,
         total_time_ms = v_time,
         estimated_grade = private.exam_estimate_grade(v_cuts, v_score),
         updated_at = now()
   where id = p_attempt_id;

  return private.exam_result_payload(p_attempt_id);
end;
$function$;

-- 제출된 시도 결과(정답·전국 통계 포함). 본인 또는 관리자.
create or replace function public.get_exam_result(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_attempt public.exam_attempts%rowtype;
begin
  if v_uid is null then
    raise exception 'EXAM_AUTH_REQUIRED';
  end if;

  select * into v_attempt from public.exam_attempts where id = p_attempt_id;
  if v_attempt.id is null or (v_attempt.student_id <> v_uid and not private.is_current_user_admin()) then
    raise exception 'EXAM_ATTEMPT_NOT_FOUND';
  end if;
  if v_attempt.status <> 'submitted' then
    raise exception 'EXAM_NOT_SUBMITTED';
  end if;

  return private.exam_result_payload(p_attempt_id);
end;
$function$;

-- 내가 제출한 시도 목록(최신순). p_paper_id가 null이면 전체.
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
             'mode', a.mode,
             'elective', a.elective,
             'score', a.score,
             'estimatedGrade', a.estimated_grade,
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

-- 고른 문항을 오답노트(mistakes)에 추가. 제출된 내 시도만, 이미 추가된 문항은 건너뛴다.
-- p_origin: 클라이언트의 window.location.origin(예 'https://reviewnote.app') — mistakes.image_url은
-- 오답노트 AI·이미지 다운로드가 그대로 fetch하므로 절대 URL이어야 한다.
-- 반환: 요청한 문항 중 이 시도에 속한 것 전부의 [{ questionId, mistakeId, created }]
-- (created=false는 이전에 이미 추가돼 있던 것).
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
    select i.question_id, i.added_mistake_id, q.number, q.section, q.image_url, q.is_choice,
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

    -- 객관식 정답은 카드에서 바로 알아보도록 ①~⑤로 저장(복습체크 AI 채점도 이 값을 정답으로 쓴다).
    v_final_answer := case
      when v_row.correct_answer is null then null
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

revoke all on function public.get_active_exam_attempt(text) from public, anon;
revoke all on function public.start_exam_attempt(text, text, text) from public, anon;
revoke all on function public.save_exam_progress(uuid, jsonb, int[]) from public, anon;
revoke all on function public.check_exam_answer(uuid, uuid, text) from public, anon;
revoke all on function public.submit_exam_attempt(uuid, jsonb, int[]) from public, anon;
revoke all on function public.get_exam_result(uuid) from public, anon;
revoke all on function public.list_my_exam_results(text) from public, anon;
revoke all on function public.add_exam_questions_to_mistakes(uuid, uuid[], text) from public, anon;

grant execute on function public.get_active_exam_attempt(text) to authenticated;
grant execute on function public.start_exam_attempt(text, text, text) to authenticated;
grant execute on function public.save_exam_progress(uuid, jsonb, int[]) to authenticated;
grant execute on function public.check_exam_answer(uuid, uuid, text) to authenticated;
grant execute on function public.submit_exam_attempt(uuid, jsonb, int[]) to authenticated;
grant execute on function public.get_exam_result(uuid) to authenticated;
grant execute on function public.list_my_exam_results(text) to authenticated;
grant execute on function public.add_exam_questions_to_mistakes(uuid, uuid[], text) to authenticated;

-- 5) 시드: 2025학년도 6월 모의평가 수학 --------------------------------------------------------
-- 원본: src/features/exam/data/2025-06-math.json, 2025-06-math.images.json
-- (scratchpad 생성 스크립트로 만든 값 — 손으로 고칠 때는 JSON과 같이 고칠 것)

insert into public.exam_papers (id, title, exam_date, source, subject, school_grade, time_limit_minutes, electives, grade_cuts, published)
values ('2025-06-math', '2025학년도 6월 모의평가 수학', '2024-06-04', '한국교육과정평가원', '수학', '고3', 100,
  array['확률과 통계', '미적분', '기하']::text[],
  '{"source":"종로학원 확정 등급컷 — 원점수는 추정, 표준점수·백분위는 EBSi와 일치. https://b.jongro.co.kr/exam/ex240604/go3_cut.asp","rawByElective":{"확률과 통계":[87,77,64,54,35,22,15,10],"미적분":[80,70,59,49,32,19,12,8],"기하":[82,72,60,50,33,21,14,10]},"standard":[135,126,116,107,92,81,75,71],"percentile":[96,89,76,61,40,22,12,4]}'::jsonb,
  true);

insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, curriculum_grade, curriculum_chapter)
values
  ('2025-06-math', 1, 'common', '/exams/2025-06-math/c-01.png', true, 2, '대수', '지수와 로그'),
  ('2025-06-math', 2, 'common', '/exams/2025-06-math/c-02.png', true, 2, '미적분Ⅰ', '미분계수와 도함수'),
  ('2025-06-math', 3, 'common', '/exams/2025-06-math/c-03.png', true, 3, '대수', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'),
  ('2025-06-math', 4, 'common', '/exams/2025-06-math/c-04.png', true, 3, '미적분Ⅰ', '함수의 극한'),
  ('2025-06-math', 5, 'common', '/exams/2025-06-math/c-05.png', true, 3, '미적분Ⅰ', '미분계수와 도함수'),
  ('2025-06-math', 6, 'common', '/exams/2025-06-math/c-06.png', true, 3, '대수', '삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)'),
  ('2025-06-math', 7, 'common', '/exams/2025-06-math/c-07.png', true, 3, '미적분Ⅰ', '방정식·부등식과 미분'),
  ('2025-06-math', 8, 'common', '/exams/2025-06-math/c-08.png', true, 3, '대수', '등차수열과 등비수열'),
  ('2025-06-math', 9, 'common', '/exams/2025-06-math/c-09.png', true, 4, '미적분Ⅰ', '함수의 연속'),
  ('2025-06-math', 10, 'common', '/exams/2025-06-math/c-10.png', true, 4, '대수', '삼각함수의 활용 (사인법칙, 코사인법칙 등)'),
  ('2025-06-math', 11, 'common', '/exams/2025-06-math/c-11.png', true, 4, '미적분Ⅰ', '접선의 방정식과 평균값 정리'),
  ('2025-06-math', 12, 'common', '/exams/2025-06-math/c-12.png', true, 4, '대수', '지수함수와 로그함수'),
  ('2025-06-math', 13, 'common', '/exams/2025-06-math/c-13.png', true, 4, '미적분Ⅰ', '정적분의 활용'),
  ('2025-06-math', 14, 'common', '/exams/2025-06-math/c-14.png', true, 4, '대수', '지수함수와 로그함수'),
  ('2025-06-math', 15, 'common', '/exams/2025-06-math/c-15.png', true, 4, '미적분Ⅰ', '부정적분과 정적분'),
  ('2025-06-math', 16, 'common', '/exams/2025-06-math/c-16.png', false, 3, '대수', '지수함수와 로그함수'),
  ('2025-06-math', 17, 'common', '/exams/2025-06-math/c-17.png', false, 3, '미적분Ⅰ', '부정적분과 정적분'),
  ('2025-06-math', 18, 'common', '/exams/2025-06-math/c-18.png', false, 3, '대수', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'),
  ('2025-06-math', 19, 'common', '/exams/2025-06-math/c-19.png', false, 3, '미적분Ⅰ', '정적분의 활용'),
  ('2025-06-math', 20, 'common', '/exams/2025-06-math/c-20.png', false, 4, '대수', '삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)'),
  ('2025-06-math', 21, 'common', '/exams/2025-06-math/c-21.png', false, 4, '미적분Ⅰ', '극대·극소와 그래프'),
  ('2025-06-math', 22, 'common', '/exams/2025-06-math/c-22.png', false, 4, '대수', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'),
  ('2025-06-math', 23, '확률과 통계', '/exams/2025-06-math/prob-23.png', true, 2, '확률과 통계', '여러 가지 순열과 조합'),
  ('2025-06-math', 24, '확률과 통계', '/exams/2025-06-math/prob-24.png', true, 3, '확률과 통계', '확률의 뜻과 성질'),
  ('2025-06-math', 25, '확률과 통계', '/exams/2025-06-math/prob-25.png', true, 3, '확률과 통계', '이항정리'),
  ('2025-06-math', 26, '확률과 통계', '/exams/2025-06-math/prob-26.png', true, 3, '확률과 통계', '확률의 뜻과 성질'),
  ('2025-06-math', 27, '확률과 통계', '/exams/2025-06-math/prob-27.png', true, 3, '확률과 통계', '여러 가지 순열과 조합'),
  ('2025-06-math', 28, '확률과 통계', '/exams/2025-06-math/prob-28.png', true, 4, '확률과 통계', '조건부확률'),
  ('2025-06-math', 29, '확률과 통계', '/exams/2025-06-math/prob-29.png', false, 4, '확률과 통계', '확률의 뜻과 성질'),
  ('2025-06-math', 30, '확률과 통계', '/exams/2025-06-math/prob-30.png', false, 4, '확률과 통계', '여러 가지 순열과 조합'),
  ('2025-06-math', 23, '미적분', '/exams/2025-06-math/calc-23.png', true, 2, '미적분Ⅱ', '수열의 극한'),
  ('2025-06-math', 24, '미적분', '/exams/2025-06-math/calc-24.png', true, 3, '미적분Ⅱ', '여러 가지 미분법'),
  ('2025-06-math', 25, '미적분', '/exams/2025-06-math/calc-25.png', true, 3, '미적분Ⅱ', '급수'),
  ('2025-06-math', 26, '미적분', '/exams/2025-06-math/calc-26.png', true, 3, '미적분Ⅱ', '지수함수와 로그함수의 미분'),
  ('2025-06-math', 27, '미적분', '/exams/2025-06-math/calc-27.png', true, 3, '미적분Ⅱ', '초월함수의 도함수 활용'),
  ('2025-06-math', 28, '미적분', '/exams/2025-06-math/calc-28.png', true, 4, '미적분Ⅱ', '여러 가지 미분법'),
  ('2025-06-math', 29, '미적분', '/exams/2025-06-math/calc-29.png', false, 4, '미적분Ⅱ', '초월함수의 도함수 활용'),
  ('2025-06-math', 30, '미적분', '/exams/2025-06-math/calc-30.png', false, 4, '미적분Ⅱ', '삼각함수의 미분'),
  ('2025-06-math', 23, '기하', '/exams/2025-06-math/geom-23.png', true, 2, '기하', '평면벡터의 연산과 성분'),
  ('2025-06-math', 24, '기하', '/exams/2025-06-math/geom-24.png', true, 3, '기하', '이차곡선'),
  ('2025-06-math', 25, '기하', '/exams/2025-06-math/geom-25.png', true, 3, '기하', '평면벡터의 연산과 성분'),
  ('2025-06-math', 26, '기하', '/exams/2025-06-math/geom-26.png', true, 3, '기하', '이차곡선'),
  ('2025-06-math', 27, '기하', '/exams/2025-06-math/geom-27.png', true, 3, '기하', '이차곡선'),
  ('2025-06-math', 28, '기하', '/exams/2025-06-math/geom-28.png', true, 4, '기하', '평면벡터의 내적'),
  ('2025-06-math', 29, '기하', '/exams/2025-06-math/geom-29.png', false, 4, '기하', '이차곡선'),
  ('2025-06-math', 30, '기하', '/exams/2025-06-math/geom-30.png', false, 4, '기하', '이차곡선');

insert into public.exam_answer_keys (question_id, answer)
select eq.id, v.answer
  from (values
  (1, 'common', '4'),
  (2, 'common', '5'),
  (3, 'common', '3'),
  (4, 'common', '3'),
  (5, 'common', '5'),
  (6, 'common', '1'),
  (7, 'common', '4'),
  (8, 'common', '1'),
  (9, 'common', '3'),
  (10, 'common', '5'),
  (11, 'common', '5'),
  (12, 'common', '3'),
  (13, 'common', '3'),
  (14, 'common', '4'),
  (15, 'common', '2'),
  (16, 'common', '7'),
  (17, 'common', '23'),
  (18, 'common', '2'),
  (19, 'common', '16'),
  (20, 'common', '24'),
  (21, 'common', '15'),
  (22, 'common', '231'),
  (23, '확률과 통계', '3'),
  (24, '확률과 통계', '2'),
  (25, '확률과 통계', '4'),
  (26, '확률과 통계', '3'),
  (27, '확률과 통계', '1'),
  (28, '확률과 통계', '1'),
  (29, '확률과 통계', '6'),
  (30, '확률과 통계', '108'),
  (23, '미적분', '2'),
  (24, '미적분', '3'),
  (25, '미적분', '3'),
  (26, '미적분', '2'),
  (27, '미적분', '2'),
  (28, '미적분', '4'),
  (29, '미적분', '55'),
  (30, '미적분', '25'),
  (23, '기하', '4'),
  (24, '기하', '2'),
  (25, '기하', '4'),
  (26, '기하', '3'),
  (27, '기하', '2'),
  (28, '기하', '3'),
  (29, '기하', '25'),
  (30, '기하', '10')
  ) as v(number, section, answer)
  join public.exam_questions eq
    on eq.paper_id = '2025-06-math' and eq.number = v.number and eq.section = v.section;

insert into public.exam_question_national_stats (question_id, elective, wrong_rate, choice_rates, rank, source)
select eq.id, v.elective, v.wrong_rate, v.choice_rates, v.rank, 'EBSi 역대 오답률 TOP15 (선지별 선택 비율 포함)'
  from (values
  (30, '확률과 통계', '확률과 통계', 95.2, null::jsonb, 1),
  (22, 'common', '확률과 통계', 92.0, null::jsonb, 2),
  (21, 'common', '확률과 통계', 82.3, null::jsonb, 3),
  (28, '확률과 통계', '확률과 통계', 81.4, '[18.6,16.7,20.5,17.9,26.3]'::jsonb, 4),
  (20, 'common', '확률과 통계', 79.3, null::jsonb, 5),
  (19, 'common', '확률과 통계', 69.9, null::jsonb, 6),
  (12, 'common', '확률과 통계', 64.3, '[9.9,30,35.7,15.8,8.6]'::jsonb, 7),
  (14, 'common', '확률과 통계', 64.1, '[12.1,27.3,14.7,35.9,9.9]'::jsonb, 8),
  (29, '확률과 통계', '확률과 통계', 63.7, null::jsonb, 9),
  (15, 'common', '확률과 통계', 59.0, '[13,41,16.7,19.9,9.4]'::jsonb, 10),
  (10, 'common', '확률과 통계', 58.0, '[9.6,20,14,14.4,42]'::jsonb, 11),
  (13, 'common', '확률과 통계', 48.9, '[9.1,16,51.1,15.9,7.8]'::jsonb, 12),
  (26, '확률과 통계', '확률과 통계', 46.1, '[7.5,11.8,53.9,14.3,12.5]'::jsonb, 13),
  (11, 'common', '확률과 통계', 42.3, '[7.9,11.4,11.5,11.5,57.7]'::jsonb, 14),
  (27, '확률과 통계', '확률과 통계', 40.4, '[59.6,6.1,10.3,9.2,14.7]'::jsonb, 15),
  (30, '미적분', '미적분', 94.8, null::jsonb, 1),
  (22, 'common', '미적분', 92.0, null::jsonb, 2),
  (29, '미적분', '미적분', 87.7, null::jsonb, 3),
  (21, 'common', '미적분', 82.3, null::jsonb, 4),
  (20, 'common', '미적분', 79.3, null::jsonb, 5),
  (19, 'common', '미적분', 69.9, null::jsonb, 6),
  (27, '미적분', '미적분', 65.1, '[11.3,34.9,7.2,28.6,18]'::jsonb, 7),
  (12, 'common', '미적분', 64.3, '[9.9,30,35.7,15.8,8.6]'::jsonb, 8),
  (14, 'common', '미적분', 64.1, '[12.1,27.3,14.7,35.9,9.9]'::jsonb, 9),
  (15, 'common', '미적분', 59.0, '[13,41,16.7,19.9,9.4]'::jsonb, 10),
  (10, 'common', '미적분', 58.0, '[9.6,20,14,14.4,42]'::jsonb, 11),
  (28, '미적분', '미적분', 50.3, '[14.9,10.5,12,49.7,12.9]'::jsonb, 12),
  (13, 'common', '미적분', 48.9, '[9.1,16,51.1,15.9,7.8]'::jsonb, 13),
  (11, 'common', '미적분', 42.3, '[7.9,11.4,11.5,11.5,57.7]'::jsonb, 14),
  (6, 'common', '미적분', 37.1, '[62.9,14,9.5,5.7,7.8]'::jsonb, 15),
  (22, 'common', '기하', 92.0, null::jsonb, 1),
  (30, '기하', '기하', 86.4, null::jsonb, 2),
  (29, '기하', '기하', 82.6, null::jsonb, 3),
  (21, 'common', '기하', 82.3, null::jsonb, 4),
  (20, 'common', '기하', 79.3, null::jsonb, 5),
  (28, '기하', '기하', 75.9, '[23.4,14.2,24.1,14.2,24]'::jsonb, 6),
  (19, 'common', '기하', 69.9, null::jsonb, 7),
  (12, 'common', '기하', 64.3, '[9.9,30,35.7,15.8,8.6]'::jsonb, 8),
  (14, 'common', '기하', 64.1, '[12.1,27.3,14.7,35.9,9.9]'::jsonb, 9),
  (15, 'common', '기하', 59.0, '[13,41,16.7,19.9,9.4]'::jsonb, 10),
  (10, 'common', '기하', 58.0, '[9.6,20,14,14.4,42]'::jsonb, 11),
  (13, 'common', '기하', 48.9, '[9.1,16,51.1,15.9,7.8]'::jsonb, 12),
  (11, 'common', '기하', 42.3, '[7.9,11.4,11.5,11.5,57.7]'::jsonb, 13),
  (6, 'common', '기하', 37.1, '[62.9,14,9.5,5.7,7.8]'::jsonb, 14),
  (27, '기하', '기하', 37.0, '[7.4,63,12.8,8.3,8.5]'::jsonb, 15)
  ) as v(number, section, elective, wrong_rate, choice_rates, rank)
  join public.exam_questions eq
    on eq.paper_id = '2025-06-math' and eq.number = v.number and eq.section = v.section;

commit;
