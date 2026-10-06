-- 선생님(관리자)이 자유 모드 응시 중 "채점해 보기"를 누른 문항은 시험 전체를 제출하지 않아도 그 문항의 풀이(필기+녹음)를 학생에게 연다.
-- 문항 단위다: 채점하지 않은 문항은 계속 비공개. 제출한 관리자 응시는 지금과 똑같이 모든 문항이 열린다.
-- 학생(비관리자) 풀이의 공개 규칙은 바뀌지 않는다.
begin;
-- 20261006110000_exam_solve_time.sql과 같고, eligible의 진행 중 조건만 "정답인 학생 문항 또는 관리자 문항"으로 바꿨다.
create or replace function private.exam_peer_candidates(p_attempt_id uuid, p_question_id uuid)
returns table(peer_id uuid, author_id uuid, revision integer, teacher boolean, time_spent_ms bigint, sort_position bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_paper text;
begin
  -- 제출된 오답·애매 문항 또는 채점한 자유 모드 문항만 연다. 정답은 서버에서 비교한다.
  select a.paper_id into v_paper from public.exam_attempts a
    join public.exam_attempt_items i on i.attempt_id = a.id and i.question_id = p_question_id
    join public.exam_papers p on p.id = a.paper_id
    join public.exam_questions q on q.id = i.question_id
    join public.exam_papers qp on qp.id = q.paper_id
    left join public.exam_answer_keys ak on ak.question_id = i.question_id
    where a.id = p_attempt_id and a.student_id = auth.uid()
      and p.kind <> 'hanneung' and qp.kind <> 'hanneung'
      and ((a.status = 'submitted' and (i.is_correct = false or i.unsure = true))
        or (a.status = 'in_progress' and a.mode = 'free' and i.checked_at is not null
          and (i.unsure = true or not coalesce(private.exam_normalize_answer(i.answer) = private.exam_normalize_answer(ak.answer), false))));
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
-- 문항 단위 음성 읽기 권한. 관리자는 전부, 학생은 제출한 관리자 응시이거나
-- 진행 중인 자유 모드 관리자 응시에서 그 문항을 채점(checked_at)했을 때만 읽는다.
-- private.exam_audio_can_read(uuid)는 그대로 둔다(제출 기준 동작 유지).
create or replace function private.exam_audio_can_read_question(p_attempt uuid,p_question uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (private.is_current_user_admin() or exists(
 select 1 from public.exam_attempts a join private.app_admins ad on ad.user_id=a.student_id
 where a.id=p_attempt and (a.status='submitted' or (a.status='in_progress' and a.mode='free' and exists(
 select 1 from public.exam_attempt_items i where i.attempt_id=a.id and i.question_id=p_question and i.checked_at is not null)))));
$$;
revoke all on function private.exam_audio_can_read_question(uuid,uuid) from public,anon,authenticated;
grant execute on function private.exam_audio_can_read_question(uuid,uuid) to authenticated;
-- 20261006120000_exam_teacher_audio.sql과 같고, exam_audio_can_read(c.attempt_id)만 문항 단위 함수로 바꿨다.
create or replace function private.exam_audio_object_read(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (private.is_current_user_admin() or exists(
 select 1 from public.exam_solution_audio c where c.storage_path=p_path and private.exam_audio_can_read_question(c.attempt_id,c.question_id)));
$$;
create or replace function private.exam_audio_clips(p_attempt uuid,p_question uuid,p_origin numeric) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'offsetMs',c.started_at_ms-coalesce(p_origin,(select min(x.started_at_ms) from public.exam_solution_audio x where x.attempt_id=p_attempt and x.question_id=p_question)),
 'durationMs',c.duration_ms,'mime',c.mime,'sizeBytes',c.size_bytes,'storagePath',c.storage_path) order by c.started_at_ms,c.id),'[]'::jsonb)
 from public.exam_solution_audio c where c.attempt_id=p_attempt and c.question_id=p_question
 and private.exam_audio_can_read_question(c.attempt_id,c.question_id);
$$;
revoke all on function private.exam_audio_clips(uuid,uuid,numeric) from public,anon,authenticated;
drop policy exam_audio_select on public.exam_solution_audio;
create policy exam_audio_select on public.exam_solution_audio for select to authenticated
 using (private.exam_audio_can_read_question(attempt_id,question_id));
commit;
