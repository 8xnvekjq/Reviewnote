begin;

-- Thresholds and ranking live only in this helper. No new tables or full-ink index.
-- Existing question_id index + ink/attempt primary keys serve these joins.
create function private.pick_exam_peer_solution(p_attempt_id uuid, p_question_id uuid)
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
      and i.is_correct = false and p.kind <> 'hanneung' and qp.kind <> 'hanneung';
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

-- Project allowed drawing fields only. Source stroke ids are replaced with request/question-scoped ids.
create function private.peer_strokes(p_strokes jsonb, p_scope text) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', md5(p_scope || ':' || (s->>'id')), 'tool', s->'tool', 'color', s->'color', 'size', s->'size',
    -- 점은 저장 검증(validate_exam_replay_strokes)을 거친 x·y·pressure·t뿐이라 그대로 둔다 — 점마다 다시 만들면 2MB 필기에 ~0.3초.
    'points', s->'points',
    'shape', case s->'shape'->>'kind'
      when 'line' then jsonb_build_object('kind','line','from',s->'shape'->'from','to',s->'shape'->'to')
      when 'ellipse' then jsonb_build_object('kind','ellipse','cx',s->'shape'->'cx','cy',s->'shape'->'cy',
        'rx',s->'shape'->'rx','ry',s->'shape'->'ry','rotation',s->'shape'->'rotation')
      when 'polygon' then jsonb_build_object('kind','polygon','points',s->'shape'->'points')
      when 'curve' then jsonb_build_object('kind','curve','points',s->'shape'->'points') end
  )) order by ordinal), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_strokes,'[]'::jsonb)) with ordinality as strokes(s,ordinal);
$$;

create function public.get_peer_solution(p_attempt_id uuid, p_question_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_peer uuid := private.pick_exam_peer_solution(p_attempt_id, p_question_id);
  v_names constant text[] := array['치이카와','하치와레','우사기','모몽가','쿠리만쥬','랏코','시사','후루혼'];
  v_scope text := auth.uid()::text || ':' || p_question_id::text;
begin
  if v_peer is null then return null; end if;
  return (select jsonb_build_object(
    'label', jsonb_build_object('character', v_names[1 + get_byte(decode(md5(v_scope),'hex'),0) % array_length(v_names,1)],
      'title', nullif(btrim(p.equipped_title),''), 'grade', nullif(btrim(p.school_grade),''),
      'isTeacher', exists(select 1 from private.app_admins ad where ad.user_id = a.student_id)),
    -- A comparison fingerprint, not a credential or a source identifier. Replay reauthorizes and reselects.
    'solutionKey', md5(v_scope || ':' || v_peer::text || ':' || k.revision::text),
    'strokes', private.peer_strokes(k.strokes, v_scope))
    from public.exam_attempt_ink k join public.exam_attempts a on a.id = k.attempt_id
    left join public.profiles p on p.id = a.student_id
    where k.attempt_id = v_peer and k.question_id = p_question_id);
end;
$$;

create function public.get_peer_solution_replay(p_attempt_id uuid, p_question_id uuid, p_solution_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_peer uuid := private.pick_exam_peer_solution(p_attempt_id, p_question_id);
  v_scope text := auth.uid()::text || ':' || p_question_id::text;
  v_ink public.exam_attempt_ink%rowtype;
  v_origin numeric;
begin
  select * into v_ink from public.exam_attempt_ink where attempt_id = v_peer and question_id = p_question_id;
  if v_peer is null or p_solution_key is distinct from md5(v_scope || ':' || v_peer::text || ':' || v_ink.revision::text) then
    raise exception 'EXAM_PEER_CHANGED';
  end if;
  select min((e->>'at')::numeric) into v_origin from public.exam_ink_replay_batches b,
    lateral jsonb_array_elements(b.events) e where b.attempt_id = v_peer and b.question_id = p_question_id;
  return jsonb_build_object('revision', v_ink.revision, 'strokes', private.peer_strokes(v_ink.strokes, v_scope),
    'batches', coalesce((select jsonb_agg(jsonb_build_object(
      'id', 'peer-batch-' || b.revision::text, 'revision', b.revision, 'baseRevision', b.base_revision,
      'baseline', case when b.baseline is not null then private.peer_strokes(b.baseline, v_scope) end,
      'events', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', 'peer-event-' || b.revision::text || '-' || n::text, 'kind', e->'kind',
        'at', (e->>'at')::numeric - v_origin,
        'removed', (select coalesce(jsonb_agg(md5(v_scope || ':' || r)), '[]'::jsonb) from jsonb_array_elements_text(e->'removed') r),
        'added', (select coalesce(jsonb_agg(jsonb_build_object('index', a->'index',
          'stroke', private.peer_strokes(jsonb_build_array(a->'stroke'), v_scope)->0) order by ord), '[]'::jsonb)
          from jsonb_array_elements(e->'added') with ordinality as added(a,ord))
      ) order by n), '[]'::jsonb) from jsonb_array_elements(b.events) with ordinality as events(e,n))) order by b.revision)
      from public.exam_ink_replay_batches b where b.attempt_id = v_peer and b.question_id = p_question_id), '[]'::jsonb));
end;
$$;

revoke all on function private.pick_exam_peer_solution(uuid, uuid), private.peer_strokes(jsonb, text) from public, anon, authenticated;
revoke all on function public.get_peer_solution(uuid, uuid), public.get_peer_solution_replay(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.get_peer_solution(uuid, uuid), public.get_peer_solution_replay(uuid, uuid, text) to authenticated;
commit;
