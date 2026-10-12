-- 선생님 한 문제 다시 풀기. 운영 DB 적용은 통합 단계에서 한다.
begin;

alter table public.exam_attempts add column attempt_kind text not null default 'regular'
  check (attempt_kind in ('regular', 'single_redo'));

-- 기존 일반 응시와 별도로 진행할 수 있다. 기존 시작 RPC의 충돌 조건도 아래에서 함께 바꾼다.
drop index public.exam_attempts_one_in_progress;
create unique index exam_attempts_one_in_progress on public.exam_attempts(student_id, paper_id)
  where status = 'in_progress' and attempt_kind = 'regular';
create index exam_attempts_redo_progress on public.exam_attempts(student_id, paper_id)
  where status = 'in_progress' and attempt_kind = 'single_redo';

-- 집계 전용 내부 뷰. 직접 접근 권한은 없고, 기존 권한 검사를 하는 RPC에서만 사용한다.
create view private.exam_regular_attempts as
  select * from public.exam_attempts where attempt_kind = 'regular';
revoke all on private.exam_regular_attempts from public, anon, authenticated;

-- 최신 함수 정의를 유지한다(특히 20261012200000의 제출 비교 우선순위).
-- 명시한 읽기 함수만 일반 응시 뷰로 전환한다. 풀이·필기·음성 RPC는 원본 테이블을 사용한다.
do $$
declare sig text; def text;
begin
  foreach sig in array array[
    'private.exam_attempt_round(uuid)',
    'public.list_exam_papers_for_me()',
    'public.list_my_exam_results(text)',
    'public.list_my_paper_history(text,uuid)',
    'public.admin_list_student_exam_attempts(uuid,integer)',
    'public.admin_list_exam_paper_activity()',
    'public.admin_list_paper_submissions(text)',
    'public.admin_list_live_exam_papers()',
    'public.admin_get_live_exam(text)',
    'public.get_active_exam_attempt(text)',
    'private.exam_discord_message(uuid,text)'
  ] loop
    def := replace(pg_get_functiondef(sig::regprocedure), E'\r', '');
    if position('public.exam_attempts' in def) = 0 then
      raise exception '일반 응시 필터 적용 대상이 없습니다: %', sig;
    end if;
    def := replace(def, 'public.exam_attempts', 'private.exam_regular_attempts');
    -- 별칭 없는 제출 비교의 상관 하위 쿼리도 새 뷰 이름을 사용한다.
    def := replace(def, 'exam_attempts.id', 'exam_regular_attempts.id');
    execute def;
  end loop;
  foreach sig in array array['public.start_exam_attempt(text,text,text)', 'public.admin_start_elective_only_attempt(text,text,text)'] loop
    def := replace(pg_get_functiondef(sig::regprocedure), E'\r', '');
    if position('status = ''in_progress''' in def) = 0 then raise exception '시작 함수 조건이 없습니다: %', sig; end if;
    execute replace(def, 'status = ''in_progress''', 'status = ''in_progress'' and attempt_kind = ''regular''');
  end loop;
  def := replace(pg_get_functiondef('private.exam_attempt_payload(uuid)'::regprocedure), E'\r', '');
  if position('''id'', a.id,' in def) = 0 then raise exception '응시 응답 대상이 없습니다'; end if;
  execute replace(def, '''id'', a.id,', '''id'', a.id, ''attemptKind'', a.attempt_kind,');
end $$;

create function public.admin_start_single_redo(p_source_attempt_id uuid, p_question_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare source public.exam_attempts%rowtype; redo_id uuid;
begin
  if auth.uid() is null or not private.is_current_user_admin() then raise exception 'EXAM_ADMIN_REQUIRED'; end if;
  select a.* into source from public.exam_attempts a
    join public.exam_attempt_items i on i.attempt_id = a.id and i.question_id = p_question_id
    where a.id = p_source_attempt_id and a.student_id = auth.uid() and a.status = 'submitted';
  if not found then raise exception 'EXAM_REDO_SOURCE_REQUIRED'; end if;

  -- 같은 문제 중복 클릭·여러 탭도 한 진행 중 응시를 재사용한다.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || source.paper_id || ':' || p_question_id::text, 0));
  select a.id into redo_id from public.exam_attempts a
    join public.exam_attempt_items i on i.attempt_id = a.id and i.question_id = p_question_id
    where a.student_id = auth.uid() and a.paper_id = source.paper_id
      and a.attempt_kind = 'single_redo' and a.status = 'in_progress'
    order by a.started_at desc, a.id desc limit 1;
  if redo_id is null then
    insert into public.exam_attempts(student_id, paper_id, mode, elective, attempt_kind)
      values(auth.uid(), source.paper_id, 'free', source.elective, 'single_redo') returning id into redo_id;
    insert into public.exam_attempt_items(attempt_id, question_id) values(redo_id, p_question_id);
  end if;
  return private.exam_attempt_payload(redo_id);
end $$;
revoke all on function public.admin_start_single_redo(uuid,uuid) from public, anon, authenticated;
grant execute on function public.admin_start_single_redo(uuid,uuid) to authenticated;

-- 제출 RPC의 일반 채점 경로 전에 분기한다. 점수·등급·포인트·오답노트는 만들지 않는다.
do $$
declare def text; needle text := E'  if v_attempt.status = ''submitted'' then';
begin
  def := replace(pg_get_functiondef('public.submit_exam_attempt(uuid,jsonb,integer[])'::regprocedure), E'\r', '');
  if position(needle in def) = 0 then raise exception '제출 함수 분기 대상이 없습니다'; end if;
  execute replace(def, needle, $patch$
  if v_attempt.attempt_kind = 'single_redo' then
    if not private.is_current_user_admin() then raise exception 'EXAM_ADMIN_REQUIRED'; end if;
    if v_attempt.status = 'submitted' then return private.exam_result_payload(p_attempt_id); end if;
    perform private.exam_apply_items(p_attempt_id, p_items, p_visit_order);
    if (select count(*) from public.exam_attempt_items where attempt_id = p_attempt_id) <> 1
      or exists(select 1 from public.exam_attempt_items where attempt_id = p_attempt_id and nullif(btrim(answer),'') is null)
      then raise exception 'EXAM_REDO_ANSWER_REQUIRED'; end if;
    update public.exam_attempt_items i set is_correct = coalesce(
      private.exam_normalize_answer(i.answer) = private.exam_normalize_answer(k.answer), false), updated_at = now()
      from public.exam_answer_keys k where i.attempt_id = p_attempt_id and k.question_id = i.question_id;
    update public.exam_attempts set status = 'submitted', submitted_at = now(), updated_at = now(),
      total_count = 1, correct_count = (select count(*) from public.exam_attempt_items where attempt_id = p_attempt_id and is_correct),
      total_time_ms = (select sum(time_spent_ms) from public.exam_attempt_items where attempt_id = p_attempt_id)
      where id = p_attempt_id;
    return private.exam_result_payload(p_attempt_id);
  end if;
$patch$ || needle);

  -- 직접 RPC 호출로 제출 전에 공개하거나 오답노트·포인트 경로로 옮길 수 없게 한다.
  def := replace(pg_get_functiondef('public.check_exam_answer(uuid,uuid,text)'::regprocedure), E'\r', '');
  if position(E'begin\n' in def) = 0 then raise exception '채점 함수 분기 대상이 없습니다'; end if;
  execute replace(def, E'begin\n', E'begin\n  if exists(select 1 from public.exam_attempts where id = p_attempt_id and attempt_kind = ''single_redo'') then raise exception ''EXAM_REDO_SUBMIT_REQUIRED''; end if;\n');
  def := replace(pg_get_functiondef('public.add_exam_questions_to_mistakes(uuid,uuid[],text)'::regprocedure), E'\r', '');
  if position(E'begin\n' in def) = 0 then raise exception '오답노트 함수 분기 대상이 없습니다'; end if;
  execute replace(def, E'begin\n', E'begin\n  if exists(select 1 from public.exam_attempts where id = p_attempt_id and attempt_kind = ''single_redo'') then raise exception ''EXAM_REDO_SOURCE_REQUIRED''; end if;\n');
end $$;

-- 최신 관리자 검토/이전 본인 풀이 허용 규칙은 유지하며, 선생님도 반드시 정답이어야 한다.
create or replace function private.exam_peer_candidates(p_attempt_id uuid, p_question_id uuid)
returns table(peer_id uuid, author_id uuid, revision integer, teacher boolean, time_spent_ms bigint, sort_position bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_paper text; v_owner uuid;
begin
  select a.paper_id, a.student_id into v_paper, v_owner from public.exam_attempts a
    join public.exam_attempt_items i on i.attempt_id = a.id and i.question_id = p_question_id
    join public.exam_papers p on p.id = a.paper_id
    join public.exam_questions q on q.id = i.question_id
    join public.exam_papers qp on qp.id = q.paper_id
    where a.id = p_attempt_id
      and (a.student_id = auth.uid() or private.is_current_user_admin())
      and p.kind <> 'hanneung' and qp.kind <> 'hanneung'
      and (a.status = 'submitted' or (a.status = 'in_progress' and a.mode = 'free' and i.checked_at is not null));
  if auth.uid() is null or not found then raise exception 'EXAM_PEER_NOT_ALLOWED'; end if;
  return query
  with eligible as materialized (
    select a.id, a.student_id, k.revision, private.exam_solve_ms(i.time_spent_ms,k.first_input_at_ms,k.last_input_at_ms) as time_spent_ms,
      coalesce(a.submitted_at, i.checked_at) as activity,
      exists(select 1 from private.app_admins ad where ad.user_id = a.student_id) as teacher
    from public.exam_attempt_items i
    join public.exam_attempts a on a.id = i.attempt_id
    join public.exam_attempt_ink k on k.attempt_id = a.id and k.question_id = i.question_id
    left join public.exam_answer_keys ak on ak.question_id = i.question_id
    where i.question_id = p_question_id and a.paper_id = v_paper
      and (a.student_id <> v_owner or (a.id <> p_attempt_id and exists(select 1 from private.app_admins ad where ad.user_id = a.student_id)))
      and k.stroke_count >= 3 and k.point_count >= 60
      and nullif(btrim(i.answer), '') is not null
      and (a.attempt_kind = 'regular' or exists(select 1 from private.app_admins ad where ad.user_id = a.student_id))
      and ((a.status = 'submitted' and i.is_correct = true)
        or (a.attempt_kind = 'regular' and a.status = 'in_progress' and a.mode = 'free' and i.checked_at is not null
          and private.exam_normalize_answer(i.answer) = private.exam_normalize_answer(ak.answer)))
  ), students as materialized (
    select distinct on (e.student_id) e.* from eligible e where not e.teacher
    order by e.student_id, e.activity desc nulls last, md5(e.id::text), e.id
  ), ranked as (
    select s.*, c.completed from students s
    cross join lateral (select count(*) as completed from public.mistakes m where m.user_id = s.student_id
      and m.reviews->>0 = 'O' and m.reviews->>1 = 'O' and m.reviews->>2 = 'O') c
    order by c.completed desc, s.activity desc nulls last,
      md5(auth.uid()::text || ':' || p_question_id::text || ':' || s.id::text), s.id limit 4
  ), selected_teacher as (
    select e.* from eligible e where e.teacher
    order by e.activity desc nulls last, md5(e.id::text), e.id limit 1
  ), selected as (
    select r.id, r.student_id, r.revision, r.teacher, r.time_spent_ms,
      row_number() over (order by r.completed desc, r.activity desc nulls last,
        md5(auth.uid()::text || ':' || p_question_id::text || ':' || r.id::text), r.id) as pos from ranked r
    union all select t.id, t.student_id, t.revision, t.teacher, t.time_spent_ms, 5::bigint from selected_teacher t
  )
  select s.id, s.student_id, s.revision, s.teacher, s.time_spent_ms, s.pos from selected s order by s.pos;
end $$;

-- 음성 메타데이터와 비공개 저장 객체도 오답이면 학생이 직접 읽을 수 없다.
create or replace function private.exam_audio_can_read_question(p_attempt uuid,p_question uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (private.is_current_user_admin() or exists(
    select 1 from public.exam_attempts a
    join private.app_admins ad on ad.user_id = a.student_id
    join public.exam_attempt_items i on i.attempt_id = a.id and i.question_id = p_question
    left join public.exam_answer_keys k on k.question_id = i.question_id
    where a.id = p_attempt and nullif(btrim(i.answer),'') is not null
      and ((a.status = 'submitted' and i.is_correct = true)
        or (a.attempt_kind = 'regular' and a.status = 'in_progress' and a.mode = 'free' and i.checked_at is not null
          and private.exam_normalize_answer(i.answer) = private.exam_normalize_answer(k.answer)))));
$$;

commit;
