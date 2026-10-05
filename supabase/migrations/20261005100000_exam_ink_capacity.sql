-- 2026-10-05 장애: 필기 저장 영구 거절 + get_exam_ink statement timeout + CPU 83%.
--  1) 한 문항 필기 한도 2MiB(텍스트) → 8MiB. 많이 쓰는 학생의 문항이 2MiB에 닿는 순간부터 save_exam_ink_delta가
--     EXAM_INK_TOO_LARGE로 매번 거절했고, 앱은 같은 batch를 계속 다시 보냈다(그 batch는 절대 통과할 수 없었다).
--     8MiB는 p_events 한도와 같다(한 이벤트가 문항 전체를 다시 담는 올가미 변환도 통과). 획 수 2000 한도는 그대로.
--  2) 응시 전체 필기를 한 응답에 담는 get_exam_ink(큰 응시 11~12MB)는 8초 statement timeout에 걸렸다.
--     목록(get_exam_ink_index: 본문 없음)과 문항 묶음(get_exam_ink_questions)으로 나눠, 앱은 바뀐 문항만 나눠 받는다.
--     옛 앱을 위해 get_exam_ink는 그대로 둔다.
--  3) 필기 본문 TOAST 압축을 pglz → lz4(새로 쓰는 값부터). 저장마다 문항 전체(수 MB)를 다시 압축하는 비용을 줄인다.
--     기존 값은 그대로 읽히고 다시 저장될 때 lz4가 된다(데이터 변환·손실 없음). lz4가 없는 서버면 건너뛴다.
-- 나머지 규칙은 20261003050000_exam_ink_delta.sql, 20261004010000_exam_ink_shapes.sql과 같다.
begin;

do $$
begin
  alter table public.exam_attempt_ink alter column strokes set compression lz4;
  alter table public.exam_ink_replay_batches alter column events set compression lz4;
  alter table public.exam_ink_replay_batches alter column baseline set compression lz4;
exception when feature_not_supported or invalid_parameter_value then
  raise notice 'lz4 compression unavailable; keeping pglz';
end;
$$;

create or replace function private.validate_exam_replay_strokes(p_strokes jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare v_stroke jsonb; v_point jsonb; v_shape jsonb; v_field text; v_count integer;
begin
  if p_strokes is null or jsonb_typeof(p_strokes) <> 'array' then raise exception 'EXAM_INK_INVALID'; end if;
  if jsonb_array_length(p_strokes) > 2000 or octet_length(p_strokes::text) > 8388608 then raise exception 'EXAM_INK_TOO_LARGE'; end if;
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
  if octet_length(v_text) > 8388608 then raise exception 'EXAM_INK_TOO_LARGE'; end if;
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

-- 응시의 필기 목록(본문 없음). size는 저장된(압축) 크기라 본문을 풀지 않는다 — 앱이 나눠 받을 묶음을 정하는 데 쓴다.
create function public.get_exam_ink_index(p_attempt_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.exam_attempts a
    where a.id = p_attempt_id and (a.student_id = auth.uid() or private.is_current_user_admin())) then
    raise exception 'EXAM_ATTEMPT_NOT_FOUND';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('questionId', i.question_id,
    'revision', i.revision, 'updatedAt', i.updated_at, 'size', pg_column_size(i.strokes),
    'lastBatchId', (select b.id from public.exam_ink_replay_batches b where b.attempt_id = i.attempt_id
      and b.question_id = i.question_id and b.revision = i.revision)) order by i.question_id)
    from public.exam_attempt_ink i where i.attempt_id = p_attempt_id), '[]'::jsonb);
end;
$$;

-- 고른 문항들의 필기(get_exam_ink와 같은 모양). 한 번에 최대 50문항.
create function public.get_exam_ink_questions(p_attempt_id uuid, p_question_ids uuid[]) returns jsonb
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

revoke all on function private.validate_exam_replay_strokes(jsonb) from public, anon, authenticated;
revoke all on function public.save_exam_ink_delta(uuid, uuid, integer, boolean, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.save_exam_ink_delta(uuid, uuid, integer, boolean, jsonb, uuid, text) to authenticated;
revoke all on function public.get_exam_ink_index(uuid), public.get_exam_ink_questions(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.get_exam_ink_index(uuid), public.get_exam_ink_questions(uuid, uuid[]) to authenticated;
commit;
