-- 풀이 시간: 첫 필기부터 마지막 필기까지 + 10초, 누적 시간 이내.
begin;
alter table public.exam_attempt_ink
 add column first_input_at_ms bigint,
 add column last_input_at_ms bigint;
-- 과거 이벤트 본문은 이 백필에서 한 번만 읽는다. 서버 updated_at은 기기 시각 대신 쓰지 않는다.
with bounds as (
 select b.attempt_id,b.question_id,min((e->>'at')::numeric)::bigint lo,max((e->>'at')::numeric)::bigint hi
 from public.exam_ink_replay_batches b cross join lateral jsonb_array_elements(b.events) e
 group by b.attempt_id,b.question_id
)
update public.exam_attempt_ink k set first_input_at_ms=b.lo,last_input_at_ms=b.hi
 from bounds b where k.attempt_id=b.attempt_id and k.question_id=b.question_id;
create or replace function private.exam_solve_ms(p_total bigint,p_first bigint,p_last bigint)
returns bigint language sql immutable set search_path='' as $$
 select greatest(0,least(p_total,case when p_first is null or p_last is null then p_total
   else greatest(0,p_last-p_first)+10000 end));
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
  v_point_count integer;
  v_first_ms bigint;
  v_last_ms bigint;
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
  -- 검증이 끝난 이벤트의 시각만 집계한다(같은 저장 한 번에 기록 — 행을 두 번 쓰지 않는다).
  select min((e->>'at')::numeric)::bigint, max((e->>'at')::numeric)::bigint into v_first_ms, v_last_ms
    from jsonb_array_elements(p_events) e;
  insert into public.exam_attempt_ink(attempt_id, question_id, strokes, stroke_count, point_count, first_input_at_ms, last_input_at_ms)
    values (p_attempt_id, p_question_id, v_result, cardinality(v_ids), v_point_count, v_first_ms, v_last_ms)
  on conflict (attempt_id, question_id) do update set strokes = excluded.strokes,
    stroke_count = excluded.stroke_count, point_count = excluded.point_count,
    first_input_at_ms = least(public.exam_attempt_ink.first_input_at_ms, excluded.first_input_at_ms),
    last_input_at_ms = greatest(public.exam_attempt_ink.last_input_at_ms, excluded.last_input_at_ms),
    revision = public.exam_attempt_ink.revision + 1, updated_at = now()
  returning revision into v_revision;
  insert into public.exam_ink_replay_batches(id, attempt_id, question_id, base_revision, revision, baseline, events, strokes_hash)
    values(p_batch_id, p_attempt_id, p_question_id, p_revision, v_revision,
      case when v_last_revision is distinct from p_revision then v_before else null end, p_events, md5(v_text));
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
revoke all on function private.exam_solve_ms(bigint,bigint,bigint) from public,anon,authenticated;
commit;
