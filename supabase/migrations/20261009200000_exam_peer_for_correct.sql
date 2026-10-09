-- 다른 사람 풀이 보기를 맞힌 문항에도 연다. 예전에는 오답·애매 문항만 볼 수 있었다.
-- 20261006180000_exam_teacher_check_publish.sql과 같고, 보는 사람(내 응시) 조건만 바꿨다. 보여 주는 풀이(정답인 학생 풀이·선생님 풀이) 규칙은 그대로.
create or replace function private.exam_peer_candidates(p_attempt_id uuid, p_question_id uuid)
returns table(peer_id uuid, author_id uuid, revision integer, teacher boolean, time_spent_ms bigint, sort_position bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_paper text;
begin
  -- 제출한 시험의 모든 문항, 또는 자유 모드에서 채점해 본 문항이면 맞혔든 틀렸든 연다(이미 답을 확인한 뒤라 정답이 새지 않는다).
  select a.paper_id into v_paper from public.exam_attempts a
    join public.exam_attempt_items i on i.attempt_id = a.id and i.question_id = p_question_id
    join public.exam_papers p on p.id = a.paper_id
    join public.exam_questions q on q.id = i.question_id
    join public.exam_papers qp on qp.id = q.paper_id
    where a.id = p_attempt_id and a.student_id = auth.uid()
      and p.kind <> 'hanneung' and qp.kind <> 'hanneung'
      and (a.status = 'submitted'
        or (a.status = 'in_progress' and a.mode = 'free' and i.checked_at is not null));
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
    where i.question_id = p_question_id and a.paper_id = v_paper and a.student_id <> auth.uid()
      and k.stroke_count >= 3 and k.point_count >= 60
      and ((a.status = 'submitted' and (i.is_correct = true
        or exists(select 1 from private.app_admins ad where ad.user_id = a.student_id)))
        or (a.status = 'in_progress' and a.mode = 'free' and i.checked_at is not null
          -- 학생은 정답 문항만, 선생님(관리자)은 채점한 문항이면 정답 여부와 상관없이 연다.
          and (exists(select 1 from private.app_admins ad where ad.user_id = a.student_id)
            or private.exam_normalize_answer(i.answer) = private.exam_normalize_answer(ak.answer))))
  ), students as materialized (
    -- 학생당 가장 최근의 자격 있는 풀이 한 장만 남긴다.
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
end;
$$;
