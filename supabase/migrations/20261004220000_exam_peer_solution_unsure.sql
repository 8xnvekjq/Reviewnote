begin;

-- 다른 학생 풀이 보기를 틀린 문항뿐 아니라 애매(unsure) 표시한 문항에도 연다 — 맞았지만 애매한 문항 포함.
-- 20261004140000 정의를 그대로 옮기고 요청자 문항 조건 한 줄만 바꿨다. 후보 탐색·20장 제한·점 수 기준은 그대로.
-- Thresholds and ranking live only in this helper. No new tables or full-ink index.
-- Existing question_id index + ink/attempt primary keys serve these joins.
create or replace function private.pick_exam_peer_solution(p_attempt_id uuid, p_question_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  v_paper text;
  v_peer uuid;
  v_min_strokes constant integer := 3;
  v_min_points constant integer := 60; -- 전체 점 수(획마다 점 수의 합). 펜 한 획은 보통 수십~수백 점
  v_min_time_ms constant bigint := 20000;
  v_top_count constant integer := 5;
begin
  select a.paper_id into v_paper from public.exam_attempts a
    join public.exam_attempt_items i on i.attempt_id = a.id and i.question_id = p_question_id
    join public.exam_papers p on p.id = a.paper_id
    join public.exam_questions q on q.id = i.question_id
    join public.exam_papers qp on qp.id = q.paper_id
    where a.id = p_attempt_id and a.student_id = auth.uid() and a.status = 'submitted'
      and (i.is_correct = false or i.unsure = true) and p.kind <> 'hanneung' and qp.kind <> 'hanneung';
  if auth.uid() is null or not found then raise exception 'EXAM_PEER_NOT_ALLOWED'; end if;

  -- 먼저 이 문항을 맞힌 제출 응시만 좁힌 뒤(question_id 인덱스) 그 몇 장의 필기만 잰다.
  -- 필기 양은 획 수·점 수로 잰다 — strokes::text 직렬화는 장당 ~13ms라 표 전체를 훑으면 1초를 넘었다.
  -- 필기 한 장을 읽는 데(압축 풀기) ~13ms — 학생이 늘어도 클릭당 비용이 커지지 않게 학생 우선·최근 제출 20장만 잰다.
  with eligible as materialized (
    select a.id, exists(select 1 from private.app_admins ad where ad.user_id = a.student_id) as teacher
    from public.exam_attempt_items i
    join public.exam_attempts a on a.id = i.attempt_id
    where i.question_id = p_question_id and i.is_correct = true and i.time_spent_ms >= v_min_time_ms
      and a.paper_id = v_paper and a.status = 'submitted' and a.student_id <> auth.uid()
    order by 2, a.submitted_at desc nulls last, a.id limit 20
  ), measured as materialized (
    select e.id, e.teacher,
      jsonb_array_length(k.strokes) as stroke_count,
      (select coalesce(sum(jsonb_array_length(s->'points')), 0) from jsonb_array_elements(k.strokes) s) as point_count
    from eligible e
    join public.exam_attempt_ink k on k.attempt_id = e.id and k.question_id = p_question_id
  ), top_candidates as materialized (
    select id, teacher, stroke_count from measured
    where stroke_count >= v_min_strokes and point_count >= v_min_points
    order by teacher, stroke_count desc, id limit v_top_count
  )
  select id into v_peer from top_candidates
    where teacher = (select bool_and(teacher) from top_candidates)
    order by md5(auth.uid()::text || ':' || p_question_id::text || ':' || id::text), id limit 1;
  return v_peer;
end;
$$;

revoke all on function private.pick_exam_peer_solution(uuid, uuid) from public, anon, authenticated;
commit;
