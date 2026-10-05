-- 점 인코딩 v1. 문항 4MiB/2000획. 기존 데이터 일괄 변환·RLS·인덱스 변경 없음.
begin;

create or replace function private.validate_exam_replay_strokes(p_strokes jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare v_stroke jsonb; v_point jsonb; v_shape jsonb; v_field text; v_count integer;
begin
  if p_strokes is null or jsonb_typeof(p_strokes) <> 'array' then raise exception 'EXAM_INK_INVALID'; end if;
  if jsonb_array_length(p_strokes) > 2000 or octet_length(p_strokes::text) > 4194304 then raise exception 'EXAM_INK_TOO_LARGE'; end if;
  for v_stroke in select value from jsonb_array_elements(p_strokes) loop
    if jsonb_typeof(v_stroke) <> 'object' or jsonb_typeof(v_stroke->'id') is distinct from 'string'
      or coalesce(v_stroke->>'tool', '') not in ('pen', 'highlighter')
      or coalesce(v_stroke->>'color', '') !~ '^#[0-9a-fA-F]{6}$'
      or jsonb_typeof(v_stroke->'size') is distinct from 'number' then raise exception 'EXAM_INK_INVALID'; end if;
    if (v_stroke->>'size')::numeric <= 0 or (v_stroke->>'size')::numeric > 50 then raise exception 'EXAM_INK_INVALID'; end if;
    -- 신형은 문자열 길이·문자 집합·헤더만 검사한다. 점별 검증 없음.
    if v_stroke ? 'p' then
      if v_stroke ? 'points' or jsonb_typeof(v_stroke->'p') is distinct from 'string' then raise exception 'EXAM_INK_INVALID'; end if;
      if length(v_stroke->>'p') > 2133344 then raise exception 'EXAM_INK_TOO_LARGE'; end if;
      if (v_stroke->>'p') !~ '^1\.(0|[1-9][0-9]{0,5})\.[A-Za-z0-9_-]*$' then raise exception 'EXAM_INK_INVALID'; end if;
      if split_part(v_stroke->>'p', '.', 2)::integer > 100000 then raise exception 'EXAM_INK_INVALID'; end if;
    else
      if jsonb_typeof(v_stroke->'points') is distinct from 'array' then raise exception 'EXAM_INK_INVALID'; end if;
      if jsonb_array_length(v_stroke->'points') > 100000 then raise exception 'EXAM_INK_INVALID'; end if;
    end if;
    v_shape := v_stroke->'shape';
    if v_shape is not null then
      if jsonb_typeof(v_shape) <> 'object' or coalesce(v_shape->>'kind', '') not in ('line','ellipse','polygon','curve') then raise exception 'EXAM_INK_INVALID'; end if;
      if v_shape->>'kind' = 'line' then
        foreach v_field in array array['from','to'] loop
          if jsonb_typeof(v_shape->v_field) is distinct from 'array' then raise exception 'EXAM_INK_INVALID'; end if;
          if jsonb_array_length(v_shape->v_field) <> 2 then raise exception 'EXAM_INK_INVALID'; end if;
          for v_point in select value from jsonb_array_elements(v_shape->v_field) loop
            if jsonb_typeof(v_point) <> 'number' then raise exception 'EXAM_INK_INVALID'; end if;
            if abs(v_point::text::numeric) > 100 then raise exception 'EXAM_INK_INVALID'; end if;
          end loop;
        end loop;
      elsif v_shape->>'kind' in ('polygon','curve') then
        if jsonb_typeof(v_shape->'points') is distinct from 'array' then raise exception 'EXAM_INK_INVALID'; end if;
        v_count := jsonb_array_length(v_shape->'points');
        if (v_shape->>'kind' = 'polygon' and v_count not between 3 and 32)
          or (v_shape->>'kind' = 'curve' and v_count not between 2 and 64) then raise exception 'EXAM_INK_INVALID'; end if;
        for v_point in select value from jsonb_array_elements(v_shape->'points') loop
          if jsonb_typeof(v_point) <> 'array' or jsonb_array_length(v_point) <> 2
            or jsonb_typeof(v_point->0) <> 'number' or jsonb_typeof(v_point->1) <> 'number' then raise exception 'EXAM_INK_INVALID'; end if;
          if abs((v_point->>0)::numeric) > 100 or abs((v_point->>1)::numeric) > 100 then raise exception 'EXAM_INK_INVALID'; end if;
        end loop;
      else
        foreach v_field in array array['cx','cy','rx','ry','rotation'] loop
          if jsonb_typeof(v_shape->v_field) is distinct from 'number' then raise exception 'EXAM_INK_INVALID'; end if;
          if abs((v_shape->>v_field)::numeric) > 100 then raise exception 'EXAM_INK_INVALID'; end if;
        end loop;
        if (v_shape->>'rx')::numeric < 0 or (v_shape->>'ry')::numeric < 0 then raise exception 'EXAM_INK_INVALID'; end if;
      end if;
    end if;
    if not (v_stroke ? 'p') then
    for v_point in select value from jsonb_array_elements(v_stroke->'points') loop
      if jsonb_typeof(v_point->'x') is distinct from 'number' or jsonb_typeof(v_point->'y') is distinct from 'number'
        or jsonb_typeof(v_point->'pressure') is distinct from 'number' or jsonb_typeof(v_point->'t') is distinct from 'number' then
        raise exception 'EXAM_INK_INVALID';
      end if;
      if abs((v_point->>'x')::numeric) > 100 or abs((v_point->>'y')::numeric) > 100
        or (v_point->>'pressure')::numeric not between 0 and 1
        or (v_point->>'t')::numeric not between 0 and 86400000 then raise exception 'EXAM_INK_INVALID'; end if;
    end loop;
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_strokes) s where length(s->>'id') not between 1 and 128)
    or (select count(distinct s->>'id') from jsonb_array_elements(p_strokes) s) <> jsonb_array_length(p_strokes) then
    raise exception 'EXAM_INK_INVALID';
  end if;
end;
$$;

create or replace function public.save_exam_ink_delta(p_attempt_id uuid, p_question_id uuid, p_revision integer,
  p_legacy_import boolean, p_events jsonb, p_batch_id uuid, p_ids_hash text) returns integer
language plpgsql security definer set search_path = '' set lock_timeout = '2s' as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_previous public.exam_ink_replay_batches%rowtype;
  v_before jsonb;
  v_result jsonb;
  v_text text;
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
  -- Ownership and the same lock as submission/ink saving, including duplicate requests.
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
  insert into public.exam_attempt_ink(attempt_id, question_id, strokes) values (p_attempt_id, p_question_id, v_result)
  on conflict (attempt_id, question_id) do update set strokes = excluded.strokes,
    revision = public.exam_attempt_ink.revision + 1, updated_at = now()
  returning revision into v_revision;
  insert into public.exam_ink_replay_batches(id, attempt_id, question_id, base_revision, revision, baseline, events, strokes_hash)
    values(p_batch_id, p_attempt_id, p_question_id, p_revision, v_revision,
      case when v_last_revision is distinct from p_revision then v_before else null end, p_events, md5(v_text));
  return v_revision;
end;
$$;

create or replace function private.peer_strokes(p_strokes jsonb, p_scope text) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', md5(p_scope || ':' || (s->>'id')), 'tool', s->'tool', 'color', s->'color', 'size', s->'size',
    -- 점은 저장 검증(validate_exam_replay_strokes)을 거친 x·y·pressure·t뿐이라 그대로 둔다 — 점마다 다시 만들면 2MB 필기에 ~0.3초.
    'points', s->'points', 'p', s->'p',
    'shape', case s->'shape'->>'kind'
      when 'line' then jsonb_build_object('kind','line','from',s->'shape'->'from','to',s->'shape'->'to')
      when 'ellipse' then jsonb_build_object('kind','ellipse','cx',s->'shape'->'cx','cy',s->'shape'->'cy',
        'rx',s->'shape'->'rx','ry',s->'shape'->'ry','rotation',s->'shape'->'rotation')
      when 'polygon' then jsonb_build_object('kind','polygon','points',s->'shape'->'points')
      when 'curve' then jsonb_build_object('kind','curve','points',s->'shape'->'points') end
  )) order by ordinal), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_strokes,'[]'::jsonb)) with ordinality as strokes(s,ordinal);
$$;

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
      (select coalesce(sum(case when s ? 'p' then split_part(s->>'p', '.', 2)::integer else jsonb_array_length(s->'points') end), 0) from jsonb_array_elements(k.strokes) s) as point_count
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

-- 구형 RPC 전용 복원. 신형 RPC는 이 점별 처리를 거치지 않는다.
create or replace function private.exam_ink_expand_points(p text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_data bytea; v_payload text; v_count integer; v_offset integer := 0;
  v_values bigint[] := array[0,0,0,0]; v_points jsonb[] := '{}';
  v_n bigint; v_factor bigint; v_byte integer; v_done boolean;
  i integer; j integer; k integer;
begin
  if p is null or length(p) > 2133344 or p !~ '^1\.(0|[1-9][0-9]{0,5})\.[A-Za-z0-9_-]*$' then return '[]'::jsonb; end if;
  v_count := split_part(p, '.', 2)::integer;
  if v_count > 100000 then return '[]'::jsonb; end if;
  v_payload := split_part(p, '.', 3);
  if length(v_payload) % 4 = 1 or (v_count = 0) <> (length(v_payload) = 0) then return '[]'::jsonb; end if;
  v_data := decode(translate(v_payload, '-_', '+/') || repeat('=', (4 - length(v_payload) % 4) % 4), 'base64');
  if replace(replace(translate(encode(v_data, 'base64'), '+/', '-_'), E'\n', ''), '=', '') <> v_payload
    or octet_length(v_data) < v_count * 4 or octet_length(v_data) > v_count * 16 then return '[]'::jsonb; end if;
  for i in 1..v_count loop
    for j in 1..4 loop
      v_n := 0; v_factor := 1; v_done := false;
      for k in 0..3 loop
        if v_offset >= octet_length(v_data) then return '[]'::jsonb; end if;
        v_byte := get_byte(v_data, v_offset); v_offset := v_offset + 1;
        v_n := v_n + (v_byte & 127) * v_factor;
        if v_byte < 128 then
          if k > 0 and v_byte = 0 then return '[]'::jsonb; end if;
          v_done := true; exit;
        end if;
        v_factor := v_factor * 128;
      end loop;
      if not v_done then return '[]'::jsonb; end if;
      v_values[j] := v_values[j] + case when v_n % 2 = 1 then -(v_n + 1) / 2 else v_n / 2 end;
    end loop;
    if abs(v_values[1]) > 2000000 or abs(v_values[2]) > 2000000 or v_values[3] not between 0 and 256
      or v_values[4] not between 0 and 86400000 then return '[]'::jsonb; end if;
    v_points := array_append(v_points, jsonb_build_object('x', v_values[1] / 20000.0, 'y', v_values[2] / 20000.0,
      'pressure', case when v_values[3] = 256 then 0.5 else v_values[3] / 255.0 end, 't', v_values[4]));
  end loop;
  if v_offset <> octet_length(v_data) then return '[]'::jsonb; end if;
  return to_jsonb(v_points);
exception when invalid_parameter_value or invalid_text_representation then return '[]'::jsonb;
end;
$$;

create or replace function private.exam_ink_expand_payload(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare v_result jsonb;
begin
  if jsonb_typeof(p) = 'array' then
    select coalesce(jsonb_agg(private.exam_ink_expand_payload(value) order by n), '[]'::jsonb) into v_result
      from jsonb_array_elements(p) with ordinality x(value,n);
    return v_result;
  elsif jsonb_typeof(p) = 'object' then
    if p ? 'tool' and p ? 'id' then
      if p ? 'p' then return (p - 'p') || jsonb_build_object('points', private.exam_ink_expand_points(p->>'p')); end if;
      return p;
    end if;
    select coalesce(jsonb_object_agg(key, private.exam_ink_expand_payload(value)), '{}'::jsonb) into v_result from jsonb_each(p);
    return v_result;
  end if;
  return p;
end;
$$;

create or replace function public.get_exam_ink_v2(p_attempt_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.exam_attempts a
    where a.id = p_attempt_id and (a.student_id = auth.uid() or private.is_current_user_admin())) then
    raise exception 'EXAM_ATTEMPT_NOT_FOUND';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('questionId', i.question_id,
    'strokes', i.strokes, 'revision', i.revision, 'updatedAt', i.updated_at,
    'lastBatchId', (select b.id from public.exam_ink_replay_batches b where b.attempt_id = i.attempt_id
      and b.question_id = i.question_id and b.revision = i.revision)) order by i.question_id)
    from public.exam_attempt_ink i where i.attempt_id = p_attempt_id), '[]'::jsonb);
end;
$$;

-- 열린 옛 탭은 항상 points를 받는다. 권한 검사는 v2의 기존 본문에 있다.
create or replace function public.get_exam_ink(p_attempt_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.exam_ink_expand_payload(public.get_exam_ink_v2(p_attempt_id));
$$;
revoke all on function public.get_exam_ink_v2(uuid), public.get_exam_ink(uuid) from public, anon, authenticated;
grant execute on function public.get_exam_ink_v2(uuid), public.get_exam_ink(uuid) to authenticated;

create or replace function public.get_exam_ink_questions_v2(p_attempt_id uuid, p_question_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.exam_attempts a
    where a.id = p_attempt_id and (a.student_id = auth.uid() or private.is_current_user_admin())) then
    raise exception 'EXAM_ATTEMPT_NOT_FOUND';
  end if;
  if p_question_ids is null or cardinality(p_question_ids) > 50 then raise exception 'EXAM_INK_INVALID'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('questionId', i.question_id,
    'strokes', i.strokes, 'revision', i.revision, 'updatedAt', i.updated_at,
    'lastBatchId', (select b.id from public.exam_ink_replay_batches b where b.attempt_id = i.attempt_id
      and b.question_id = i.question_id and b.revision = i.revision)) order by i.question_id)
    from public.exam_attempt_ink i where i.attempt_id = p_attempt_id and i.question_id = any(p_question_ids)), '[]'::jsonb);
end;
$$;

-- 열린 옛 탭은 항상 points를 받는다. 권한 검사는 v2의 기존 본문에 있다.
create or replace function public.get_exam_ink_questions(p_attempt_id uuid, p_question_ids uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.exam_ink_expand_payload(public.get_exam_ink_questions_v2(p_attempt_id, p_question_ids));
$$;
revoke all on function public.get_exam_ink_questions_v2(uuid, uuid[]), public.get_exam_ink_questions(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.get_exam_ink_questions_v2(uuid, uuid[]), public.get_exam_ink_questions(uuid, uuid[]) to authenticated;

create or replace function public.get_exam_ink_replay_v2(p_attempt_id uuid, p_question_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.exam_attempts a
    join public.exam_attempt_items i on i.attempt_id = a.id and i.question_id = p_question_id
    where a.id = p_attempt_id and (a.student_id = auth.uid() or private.is_current_user_admin())) then
    raise exception 'EXAM_ATTEMPT_NOT_FOUND';
  end if;
  return jsonb_build_object(
    'batches', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'revision', b.revision,
      'baseRevision', b.base_revision, 'baseline', b.baseline, 'events', b.events) order by b.revision)
      from public.exam_ink_replay_batches b where b.attempt_id = p_attempt_id and b.question_id = p_question_id), '[]'::jsonb),
    'strokes', coalesce((select strokes from public.exam_attempt_ink where attempt_id = p_attempt_id and question_id = p_question_id), '[]'::jsonb),
    'revision', coalesce((select revision from public.exam_attempt_ink where attempt_id = p_attempt_id and question_id = p_question_id), 0));
end;
$$;

-- 열린 옛 탭은 항상 points를 받는다. 권한 검사는 v2의 기존 본문에 있다.
create or replace function public.get_exam_ink_replay(p_attempt_id uuid, p_question_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.exam_ink_expand_payload(public.get_exam_ink_replay_v2(p_attempt_id, p_question_id));
$$;
revoke all on function public.get_exam_ink_replay_v2(uuid, uuid), public.get_exam_ink_replay(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_exam_ink_replay_v2(uuid, uuid), public.get_exam_ink_replay(uuid, uuid) to authenticated;

create or replace function public.get_peer_solution_v2(p_attempt_id uuid, p_question_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_peer uuid := private.pick_exam_peer_solution(p_attempt_id, p_question_id);
  v_names constant text[] := array['치이카와','하치와레','우사기','모몽가','쿠리만쥬','랏코','시사','후루혼'];
  v_faces constant text[] := array['🐶','🐱','🐰','🦊','🐼','🐨','🐯','🦁','🐻','🐹','🐧','🐥','🐸','🐵','🐷','🐮','🐙','🦄',
    '🐭','🦔','🦦','🦥','🐳','🐬','🦭','🐢','🦋','🐝','🐞','🦉','🦆','🐤','🐣'];
  v_scope text := auth.uid()::text || ':' || p_question_id::text;
begin
  if v_peer is null then return null; end if;
  return (select jsonb_build_object(
    'label', jsonb_build_object(
      'face', case when t.teacher then '🎓' else v_faces[1 + (('x' || substr(t.author_hash, 1, 8))::bit(32)::bigint % array_length(v_faces,1))::integer] end,
      'character', v_names[1 + (('x' || substr(t.author_hash, 9, 8))::bit(32)::bigint % array_length(v_names,1))::integer],
      'title', nullif(btrim(p.equipped_title),''), 'grade', nullif(btrim(p.school_grade),''),
      'isTeacher', t.teacher),
    -- A comparison fingerprint, not a credential or a source identifier. Replay reauthorizes and reselects.
    'solutionKey', md5(v_scope || ':' || v_peer::text || ':' || k.revision::text),
    'strokes', private.peer_strokes(k.strokes, v_scope))
    from public.exam_attempt_ink k join public.exam_attempts a on a.id = k.attempt_id
    left join public.profiles p on p.id = a.student_id
    cross join lateral (select md5('exam-peer-face:' || a.student_id::text) as author_hash,
      exists(select 1 from private.app_admins ad where ad.user_id = a.student_id) as teacher) t
    where k.attempt_id = v_peer and k.question_id = p_question_id);
end;
$$;

-- 열린 옛 탭은 항상 points를 받는다. 권한 검사는 v2의 기존 본문에 있다.
create or replace function public.get_peer_solution(p_attempt_id uuid, p_question_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.exam_ink_expand_payload(public.get_peer_solution_v2(p_attempt_id, p_question_id));
$$;
revoke all on function public.get_peer_solution_v2(uuid, uuid), public.get_peer_solution(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_peer_solution_v2(uuid, uuid), public.get_peer_solution(uuid, uuid) to authenticated;

create or replace function public.get_peer_solution_replay_v2(p_attempt_id uuid, p_question_id uuid, p_solution_key text) returns jsonb
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

-- 열린 옛 탭은 항상 points를 받는다. 권한 검사는 v2의 기존 본문에 있다.
create or replace function public.get_peer_solution_replay(p_attempt_id uuid, p_question_id uuid, p_solution_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.exam_ink_expand_payload(public.get_peer_solution_replay_v2(p_attempt_id, p_question_id, p_solution_key));
$$;
revoke all on function public.get_peer_solution_replay_v2(uuid, uuid, text), public.get_peer_solution_replay(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.get_peer_solution_replay_v2(uuid, uuid, text), public.get_peer_solution_replay(uuid, uuid, text) to authenticated;

create or replace function public.admin_get_live_ink_v2(p_attempt_id uuid, p_question_id uuid, p_since_revision integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_revision integer; v_count integer; v_first integer; v_last integer; v_batches jsonb;
begin
  if not private.is_current_user_admin() then raise exception 'EXAM_ADMIN_REQUIRED'; end if;
  if not exists(select 1 from public.exam_attempt_items where attempt_id = p_attempt_id and question_id = p_question_id) then
    raise exception 'EXAM_ATTEMPT_NOT_FOUND';
  end if;
  select revision into v_revision from public.exam_attempt_ink where attempt_id = p_attempt_id and question_id = p_question_id;
  v_revision := coalesce(v_revision, 0);
  if p_since_revision is not null and p_since_revision between 0 and v_revision and v_revision - p_since_revision <= 24 then
    select count(*), min(revision), max(revision), jsonb_agg(jsonb_build_object('revision', revision, 'events', events) order by revision)
      into v_count, v_first, v_last, v_batches from public.exam_ink_replay_batches
      where attempt_id = p_attempt_id and question_id = p_question_id and revision > p_since_revision and revision <= v_revision;
    if v_count = v_revision - p_since_revision and (v_count = 0 or (v_first = p_since_revision + 1 and v_last = v_revision)) then
      return jsonb_build_object('mode', 'delta', 'revision', v_revision, 'batches', coalesce(v_batches, '[]'::jsonb));
    end if;
  end if;
  return jsonb_build_object('mode', 'full', 'revision', v_revision, 'strokes', coalesce((select strokes
    from public.exam_attempt_ink where attempt_id = p_attempt_id and question_id = p_question_id), '[]'::jsonb));
end;
$$;

-- 열린 옛 탭은 항상 points를 받는다. 권한 검사는 v2의 기존 본문에 있다.
create or replace function public.admin_get_live_ink(p_attempt_id uuid, p_question_id uuid, p_since_revision integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.exam_ink_expand_payload(public.admin_get_live_ink_v2(p_attempt_id, p_question_id, p_since_revision));
$$;
revoke all on function public.admin_get_live_ink_v2(uuid, uuid, integer), public.admin_get_live_ink(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_get_live_ink_v2(uuid, uuid, integer), public.admin_get_live_ink(uuid, uuid, integer) to authenticated;

create or replace function public.get_exam_ink_index_v2(p_attempt_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$ select public.get_exam_ink_index(p_attempt_id); $$;
create or replace function public.save_exam_ink_delta_v2(p_attempt_id uuid, p_question_id uuid, p_revision integer,
  p_legacy_import boolean, p_events jsonb, p_batch_id uuid, p_ids_hash text) returns integer
language sql security definer set search_path = '' as $$
  select public.save_exam_ink_delta(p_attempt_id, p_question_id, p_revision, p_legacy_import, p_events, p_batch_id, p_ids_hash);
$$;
revoke all on function public.get_exam_ink_index_v2(uuid), public.save_exam_ink_delta_v2(uuid, uuid, integer, boolean, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.get_exam_ink_index_v2(uuid), public.save_exam_ink_delta_v2(uuid, uuid, integer, boolean, jsonb, uuid, text) to authenticated;
revoke all on function private.validate_exam_replay_strokes(jsonb), private.peer_strokes(jsonb, text), private.pick_exam_peer_solution(uuid, uuid),
  private.exam_ink_expand_points(text), private.exam_ink_expand_payload(jsonb) from public, anon, authenticated;
revoke all on function public.save_exam_ink_delta(uuid, uuid, integer, boolean, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.save_exam_ink_delta(uuid, uuid, integer, boolean, jsonb, uuid, text) to authenticated;
commit;
