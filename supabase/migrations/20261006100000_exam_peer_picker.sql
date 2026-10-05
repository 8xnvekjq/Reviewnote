-- 익명 풀이 선택 목록. 후보 조회는 큰 필기 본문을 읽지 않는다.
begin;

alter table public.exam_attempt_ink
  add column stroke_count integer not null default 0 check (stroke_count >= 0),
  add column point_count integer not null default 0 check (point_count >= 0);

-- 기존 본문은 마이그레이션에서 한 번만 읽는다.
update public.exam_attempt_ink k set stroke_count = jsonb_array_length(k.strokes),
  point_count = (select coalesce(sum(case when s ? 'p' then split_part(s->>'p', '.', 2)::integer
    else jsonb_array_length(s->'points') end), 0) from jsonb_array_elements(k.strokes) s);

create index mistakes_exam_completed_user_idx on public.mistakes(user_id)
  where reviews->>0 = 'O' and reviews->>1 = 'O' and reviews->>2 = 'O';

create or replace function public.save_exam_ink_delta(p_attempt_id uuid, p_question_id uuid, p_revision integer,
  p_legacy_import boolean, p_events jsonb, p_batch_id uuid, p_ids_hash text) returns integer
language plpgsql security definer set search_path = '' set lock_timeout = '2s' as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_previous public.exam_ink_replay_batches%rowtype;
  v_before jsonb;
  v_result jsonb;
  v_text text;
  v_point_count integer;
  v_event jsonb;
  v_add jsonb;
  v_id text;
  v_removed text[];
  v_ids text[];    -- 현재 획 id(순서대로). 획 본문은 끝에서 한 번만 다시 모은다.
  v_src bigint[];  -- 같은 자리의 출처: 양수 = v_before의 몇 번째(1부터), 음수 = 이벤트 added 전체에서 몇 번째
  v_k bigint := 0;
  v_index integer;
  v_last_index integer;
  v_revision integer;
  v_last_revision integer;
begin
  -- 재시도도 소유권을 확인하고 제출·필기 저장과 같은 잠금을 쓴다.
  select * into v_attempt from public.exam_attempts where id = p_attempt_id and student_id = auth.uid() for update;
  if not found then raise exception 'EXAM_ATTEMPT_NOT_FOUND'; end if;
  if p_batch_id is null or p_ids_hash is null or p_ids_hash !~ '^[0-9a-f]{64}$' then raise exception 'EXAM_REPLAY_INVALID'; end if;
  select * into v_previous from public.exam_ink_replay_batches where id = p_batch_id;
  if found then
    if v_previous.attempt_id <> p_attempt_id or v_previous.question_id <> p_question_id
      or v_previous.base_revision is distinct from p_revision or v_previous.events is distinct from p_events then
      raise exception 'EXAM_REPLAY_BATCH_MISMATCH';
    end if;
    -- 그 batch가 아직 최신이면 결과 id 목록도 같아야 한다(옛 함수의 strokes_hash 대조에 해당).
    if exists(select 1 from public.exam_attempt_ink i where i.attempt_id = p_attempt_id and i.question_id = p_question_id
      and i.revision = v_previous.revision and encode(extensions.digest(coalesce((select string_agg(s->>'id', E'\n' order by n)
        from jsonb_array_elements(i.strokes) with ordinality x(s, n)), ''), 'sha256'), 'hex') <> p_ids_hash) then
      raise exception 'EXAM_REPLAY_BATCH_MISMATCH';
    end if;
    return v_previous.revision;
  end if;
  if not exists (select 1 from public.exam_attempt_items where attempt_id = p_attempt_id and question_id = p_question_id) then
    raise exception 'EXAM_QUESTION_NOT_FOUND';
  end if;
  select strokes, revision into v_before, v_revision from public.exam_attempt_ink
    where attempt_id = p_attempt_id and question_id = p_question_id;
  if p_revision is null or p_revision <> coalesce(v_revision, 0) then raise exception 'EXAM_INK_CONFLICT'; end if;
  if v_attempt.status = 'submitted' and not (coalesce(p_legacy_import, false) and v_revision is null and p_revision = 0) then
    raise exception 'EXAM_INK_SUBMITTED';
  end if;
  if jsonb_typeof(p_events) is distinct from 'array' then raise exception 'EXAM_REPLAY_INVALID'; end if;
  if jsonb_array_length(p_events) < 1 or jsonb_array_length(p_events) > 2000
    or octet_length(p_events::text) > 8388608 then raise exception 'EXAM_REPLAY_TOO_LARGE'; end if;
  if (select count(distinct e->>'id') from jsonb_array_elements(p_events) e) <> jsonb_array_length(p_events) then raise exception 'EXAM_REPLAY_INVALID'; end if;
  v_before := coalesce(v_before, '[]'::jsonb);
  -- 저장된 획은 한 번만 훑어 id와 자리만 꺼낸다.
  select coalesce(array_agg(s->>'id' order by n), '{}'), coalesce(array_agg(n order by n), '{}') into v_ids, v_src
    from jsonb_array_elements(v_before) with ordinality x(s, n);
  for v_event in select value from jsonb_array_elements(p_events) loop
    if jsonb_typeof(v_event) <> 'object' or jsonb_typeof(v_event->'id') is distinct from 'string'
      or length(v_event->>'id') not between 1 and 128
      or coalesce(v_event->>'kind','') not in ('draw','erase','undo','redo','clear','restore')
      or jsonb_typeof(v_event->'at') is distinct from 'number'
      or jsonb_typeof(v_event->'added') is distinct from 'array'
      or jsonb_typeof(v_event->'removed') is distinct from 'array' then raise exception 'EXAM_REPLAY_INVALID'; end if;
    if (v_event->>'at')::numeric not between 0 and 9007199254740991 then raise exception 'EXAM_REPLAY_INVALID'; end if;
    -- removed: 모두 문자열이고 지금 있는 획이어야 한다(applyInkEvent와 같이 같은 id는 전부 지운다).
    if exists (select 1 from jsonb_array_elements(v_event->'removed') r where jsonb_typeof(r) <> 'string') then raise exception 'EXAM_REPLAY_INVALID'; end if;
    select coalesce(array_agg(r), '{}') into v_removed from jsonb_array_elements_text(v_event->'removed') r;
    if cardinality(v_removed) > 0 then
      if exists (select 1 from unnest(v_removed) r where not r = any(v_ids)) then raise exception 'EXAM_REPLAY_INVALID'; end if;
      select coalesce(array_agg(id order by n), '{}'), coalesce(array_agg(src order by n), '{}') into v_ids, v_src
        from unnest(v_ids, v_src) with ordinality u(id, src, n) where not id = any(v_removed);
    end if;
    -- added: 새로 들어온 획만 검사한다(전체 재검증 없음).
    perform private.validate_exam_replay_strokes(coalesce((select jsonb_agg(a->'stroke') from jsonb_array_elements(v_event->'added') a), '[]'::jsonb));
    v_last_index := -1;
    for v_add in select value from jsonb_array_elements(v_event->'added') loop
      if jsonb_typeof(v_add->'index') is distinct from 'number' or coalesce(v_add->>'index','') !~ '^[0-9]{1,5}$' then raise exception 'EXAM_REPLAY_INVALID'; end if;
      v_index := (v_add->>'index')::integer;
      v_id := v_add->'stroke'->>'id';
      v_k := v_k + 1;
      if v_index <= v_last_index or v_index > cardinality(v_ids) or v_id = any(v_ids) then raise exception 'EXAM_REPLAY_INVALID'; end if;
      v_ids := v_ids[1:v_index] || v_id || v_ids[v_index + 1:];
      v_src := v_src[1:v_index] || (-v_k) || v_src[v_index + 1:];
      v_last_index := v_index;
    end loop;
    if cardinality(v_ids) > 2000 then raise exception 'EXAM_INK_TOO_LARGE'; end if;
  end loop;
  if encode(extensions.digest(array_to_string(v_ids, E'\n'), 'sha256'), 'hex') <> p_ids_hash then
    raise exception 'EXAM_REPLAY_FINAL_MISMATCH';
  end if;
  -- 결과 필기는 끝에서 한 번만 조립한다: 남은 옛 획은 v_before에서, 새 획은 이벤트에서.
  select coalesce(jsonb_agg(coalesce(b.s, a.stroke) order by m.pos), '[]'::jsonb) into v_result
    from unnest(v_src) with ordinality m(src, pos)
    left join jsonb_array_elements(v_before) with ordinality b(s, n) on b.n = m.src
    left join (select row_number() over (order by e.n, x.n) k, x.a->'stroke' stroke
      from jsonb_array_elements(p_events) with ordinality e(ev, n),
        jsonb_array_elements(e.ev->'added') with ordinality x(a, n)) a on a.k = -m.src;
  v_text := v_result::text;
  if octet_length(v_text) > 4194304 then raise exception 'EXAM_INK_TOO_LARGE'; end if;
  select max(revision) into v_last_revision from public.exam_ink_replay_batches
    where attempt_id = p_attempt_id and question_id = p_question_id;
  -- 최종 획 본문에서 헤더만 합산한다. 점별 순회는 하지 않는다.
  select coalesce(sum(case when s ? 'p' then split_part(s->>'p', '.', 2)::integer
    else jsonb_array_length(s->'points') end), 0) into v_point_count from jsonb_array_elements(v_result) s;
  insert into public.exam_attempt_ink(attempt_id, question_id, strokes, stroke_count, point_count)
    values (p_attempt_id, p_question_id, v_result, cardinality(v_ids), v_point_count)
  on conflict (attempt_id, question_id) do update set strokes = excluded.strokes,
    stroke_count = excluded.stroke_count, point_count = excluded.point_count,
    revision = public.exam_attempt_ink.revision + 1, updated_at = now()
  returning revision into v_revision;
  insert into public.exam_ink_replay_batches(id, attempt_id, question_id, base_revision, revision, baseline, events, strokes_hash)
    values(p_batch_id, p_attempt_id, p_question_id, p_revision, v_revision,
      case when v_last_revision is distinct from p_revision then v_before else null end, p_events, md5(v_text));
  return v_revision;
end;
$$;

-- 구형 전체 저장 RPC도 집계 열을 유지한다. 신형 저장은 위 delta 함수만 쓴다.
create or replace function public.save_exam_ink(p_attempt_id uuid, p_question_id uuid, p_strokes jsonb,
  p_revision integer, p_legacy_import boolean default false) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_revision integer;
  v_stroke jsonb;
  v_point jsonb;
  v_shape jsonb;
  v_field text;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id and student_id = auth.uid() for update;
  if not found then raise exception 'EXAM_ATTEMPT_NOT_FOUND'; end if;
  if not exists (select 1 from public.exam_attempt_items where attempt_id = p_attempt_id and question_id = p_question_id) then
    raise exception 'EXAM_QUESTION_NOT_FOUND';
  end if;
  select revision into v_revision from public.exam_attempt_ink where attempt_id = p_attempt_id and question_id = p_question_id;
  if p_revision is null or p_revision <> coalesce(v_revision, 0) then raise exception 'EXAM_INK_CONFLICT'; end if;
  if v_attempt.status = 'submitted' and not (coalesce(p_legacy_import, false) and v_revision is null and p_revision = 0) then
    raise exception 'EXAM_INK_SUBMITTED';
  end if;
  if p_strokes is null or jsonb_typeof(p_strokes) <> 'array' then raise exception 'EXAM_INK_INVALID'; end if;
  if jsonb_array_length(p_strokes) > 2000 or octet_length(p_strokes::text) > 2097152 then raise exception 'EXAM_INK_TOO_LARGE'; end if;
  for v_stroke in select value from jsonb_array_elements(p_strokes) loop
    if jsonb_typeof(v_stroke) <> 'object' or jsonb_typeof(v_stroke->'id') is distinct from 'string'
      or coalesce(v_stroke->>'tool', '') not in ('pen', 'highlighter')
      or coalesce(v_stroke->>'color', '') !~ '^#[0-9a-fA-F]{6}$'
      or jsonb_typeof(v_stroke->'size') is distinct from 'number'
      or jsonb_typeof(v_stroke->'points') is distinct from 'array' then raise exception 'EXAM_INK_INVALID'; end if;
    if (v_stroke->>'size')::numeric <= 0 or (v_stroke->>'size')::numeric > 50
      or jsonb_array_length(v_stroke->'points') > 100000 then raise exception 'EXAM_INK_INVALID'; end if;
    v_shape := v_stroke->'shape';
    if v_shape is not null then
      if jsonb_typeof(v_shape) <> 'object' or coalesce(v_shape->>'kind', '') not in ('line','ellipse') then raise exception 'EXAM_INK_INVALID'; end if;
      if v_shape->>'kind' = 'line' then
        foreach v_field in array array['from','to'] loop
          if jsonb_typeof(v_shape->v_field) is distinct from 'array' then raise exception 'EXAM_INK_INVALID'; end if;
          if jsonb_array_length(v_shape->v_field) <> 2 then raise exception 'EXAM_INK_INVALID'; end if;
          for v_point in select value from jsonb_array_elements(v_shape->v_field) loop
            if jsonb_typeof(v_point) <> 'number' then raise exception 'EXAM_INK_INVALID'; end if;
            if abs(v_point::text::numeric) > 100 then raise exception 'EXAM_INK_INVALID'; end if;
          end loop;
        end loop;
      else
        foreach v_field in array array['cx','cy','rx','ry','rotation'] loop
          if jsonb_typeof(v_shape->v_field) is distinct from 'number' then raise exception 'EXAM_INK_INVALID'; end if;
          if abs((v_shape->>v_field)::numeric) > 100 then raise exception 'EXAM_INK_INVALID'; end if;
        end loop;
        if (v_shape->>'rx')::numeric < 0 or (v_shape->>'ry')::numeric < 0 then raise exception 'EXAM_INK_INVALID'; end if;
      end if;
    end if;
    for v_point in select value from jsonb_array_elements(v_stroke->'points') loop
      if jsonb_typeof(v_point->'x') is distinct from 'number' or jsonb_typeof(v_point->'y') is distinct from 'number'
        or jsonb_typeof(v_point->'pressure') is distinct from 'number' or jsonb_typeof(v_point->'t') is distinct from 'number' then
        raise exception 'EXAM_INK_INVALID';
      end if;
      if abs((v_point->>'x')::numeric) > 100 or abs((v_point->>'y')::numeric) > 100
        or (v_point->>'pressure')::numeric not between 0 and 1
        or (v_point->>'t')::numeric not between 0 and 86400000 then raise exception 'EXAM_INK_INVALID'; end if;
    end loop;
  end loop;
  insert into public.exam_attempt_ink(attempt_id, question_id, strokes, stroke_count, point_count)
    values (p_attempt_id, p_question_id, p_strokes, jsonb_array_length(p_strokes),
      (select coalesce(sum(jsonb_array_length(s->'points')), 0) from jsonb_array_elements(p_strokes) s))
  on conflict (attempt_id, question_id) do update set strokes = excluded.strokes,
    stroke_count = excluded.stroke_count, point_count = excluded.point_count,
    revision = public.exam_attempt_ink.revision + 1, updated_at = now()
  returning revision into v_revision;
  return v_revision;
end;
$$;

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
    select a.id, a.student_id, k.revision, i.time_spent_ms,
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
          and private.exam_normalize_answer(i.answer) = private.exam_normalize_answer(ak.answer)
          and not exists(select 1 from private.app_admins ad where ad.user_id = a.student_id)))
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

create or replace function public.list_peer_solutions_v2(p_attempt_id uuid, p_question_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_faces constant text[] := array['🐶','🐱','🐰','🦊','🐼','🐨','🐯','🦁','🐻','🐹','🐧','🐥','🐸','🐵','🐷','🐮','🐙','🦄',
    '🐭','🦔','🦦','🦥','🐳','🐬','🦭','🐢','🦋','🐝','🐞','🦉','🦆','🐤','🐣'];
  v_scope text := auth.uid()::text || ':' || p_question_id::text || ':' || p_attempt_id::text;
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
    'solutionKey', md5(v_scope || ':' || c.peer_id::text || ':' || c.revision::text),
    'label', jsonb_build_object(
      'face', case when c.teacher then '🎓' else v_faces[1 + (('x' || substr(md5('exam-peer-face:' || c.author_id::text), 1, 8))::bit(32)::bigint % array_length(v_faces,1))::integer] end,
      'title', case when not c.teacher then nullif(btrim(p.equipped_title),'') end,
      'grade', case when not c.teacher then nullif(btrim(p.school_grade),'') end, 'isTeacher', c.teacher),
    'timeSpentMs', c.time_spent_ms) order by c.sort_position)
    from private.exam_peer_candidates(p_attempt_id, p_question_id) c
    left join public.profiles p on p.id = c.author_id), '[]'::jsonb);
end;
$$;

create or replace function public.get_peer_solution_by_key_v2(p_attempt_id uuid, p_question_id uuid, p_solution_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_peer uuid;
  v_scope text := auth.uid()::text || ':' || p_question_id::text || ':' || p_attempt_id::text;
  v_ink public.exam_attempt_ink%rowtype;
  v_origin numeric;
begin
  select c.peer_id into v_peer from private.exam_peer_candidates(p_attempt_id, p_question_id) c
    where p_solution_key = md5(v_scope || ':' || c.peer_id::text || ':' || c.revision::text);
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

-- 구형 탭은 첫 후보를 선택하고 기존 점 배열 복원 래퍼를 그대로 쓴다.
create or replace function private.pick_exam_peer_solution(p_attempt_id uuid, p_question_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.peer_id from private.exam_peer_candidates(p_attempt_id, p_question_id) c order by c.sort_position limit 1;
$$;
create or replace function public.get_peer_solution_v2(p_attempt_id uuid, p_question_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_row jsonb := public.list_peer_solutions_v2(p_attempt_id, p_question_id)->0;
begin
  if v_row is null then return null; end if;
  return v_row || jsonb_build_object('strokes', public.get_peer_solution_by_key_v2(p_attempt_id, p_question_id, v_row->>'solutionKey')->'strokes');
end;
$$;
create or replace function public.get_peer_solution_replay_v2(p_attempt_id uuid, p_question_id uuid, p_solution_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.get_peer_solution_by_key_v2(p_attempt_id, p_question_id, p_solution_key);
$$;

revoke all on function private.exam_peer_candidates(uuid, uuid), private.pick_exam_peer_solution(uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_peer_solutions_v2(uuid, uuid), public.get_peer_solution_by_key_v2(uuid, uuid, text),
  public.get_peer_solution_v2(uuid, uuid), public.get_peer_solution_replay_v2(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.list_peer_solutions_v2(uuid, uuid), public.get_peer_solution_by_key_v2(uuid, uuid, text),
  public.get_peer_solution_v2(uuid, uuid), public.get_peer_solution_replay_v2(uuid, uuid, text) to authenticated;
commit;
