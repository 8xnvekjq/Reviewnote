begin;

create table public.exam_ink_replay_batches (
  id uuid primary key,
  attempt_id uuid not null,
  question_id uuid not null,
  base_revision integer not null,
  revision integer not null,
  baseline jsonb,
  events jsonb not null,
  strokes_hash text not null,
  created_at timestamptz not null default now(),
  foreign key(attempt_id, question_id) references public.exam_attempt_ink(attempt_id, question_id) on delete cascade,
  unique(attempt_id, question_id, revision),
  check (base_revision >= 0 and revision = base_revision + 1),
  check (baseline is null or jsonb_typeof(baseline) = 'array'),
  check (jsonb_typeof(events) = 'array')
);
alter table public.exam_ink_replay_batches enable row level security;
revoke all on public.exam_ink_replay_batches from public, anon, authenticated;
grant select on public.exam_ink_replay_batches to authenticated;
create policy exam_ink_replay_read on public.exam_ink_replay_batches for select to authenticated
using (exists (select 1 from public.exam_attempts a where a.id = attempt_id
  and (a.student_id = (select auth.uid()) or (select private.is_current_user_admin()))));

create function private.validate_exam_replay_strokes(p_strokes jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare v_stroke jsonb; v_point jsonb; v_shape jsonb; v_field text;
begin
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
  if exists(select 1 from jsonb_array_elements(p_strokes) s where length(s->>'id') not between 1 and 128)
    or (select count(distinct s->>'id') from jsonb_array_elements(p_strokes) s) <> jsonb_array_length(p_strokes) then
    raise exception 'EXAM_INK_INVALID';
  end if;
end;
$$;

create function public.save_exam_ink_replay(p_attempt_id uuid, p_question_id uuid, p_strokes jsonb,
  p_revision integer, p_legacy_import boolean, p_events jsonb, p_batch_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_previous public.exam_ink_replay_batches%rowtype;
  v_before jsonb;
  v_current jsonb;
  v_event jsonb;
  v_add jsonb;
  v_stroke jsonb;
  v_index integer;
  v_last_index integer;
  v_revision integer;
  v_last_revision integer;
begin
  -- Ownership and the same lock as submission/ink saving, including duplicate requests.
  perform 1 from public.exam_attempts where id = p_attempt_id and student_id = auth.uid() for update;
  if not found then raise exception 'EXAM_ATTEMPT_NOT_FOUND'; end if;
  if p_batch_id is null then raise exception 'EXAM_REPLAY_INVALID'; end if;
  select * into v_previous from public.exam_ink_replay_batches where id = p_batch_id;
  if found then
    if v_previous.attempt_id <> p_attempt_id or v_previous.question_id <> p_question_id
      or v_previous.base_revision is distinct from p_revision or v_previous.events is distinct from p_events
      or v_previous.strokes_hash is distinct from md5(p_strokes::text) then raise exception 'EXAM_REPLAY_BATCH_MISMATCH'; end if;
    return v_previous.revision;
  end if;
  if jsonb_typeof(p_events) is distinct from 'array' then raise exception 'EXAM_REPLAY_INVALID'; end if;
  if jsonb_array_length(p_events) < 1 or jsonb_array_length(p_events) > 2000
    or octet_length(p_events::text) > 8388608 then raise exception 'EXAM_REPLAY_TOO_LARGE'; end if;
  select strokes, revision into v_before, v_revision from public.exam_attempt_ink
    where attempt_id = p_attempt_id and question_id = p_question_id;
  if p_revision is distinct from coalesce(v_revision, 0) then raise exception 'EXAM_INK_CONFLICT'; end if;
  v_before := coalesce(v_before, '[]'::jsonb);
  v_current := v_before;
  if (select count(distinct e->>'id') from jsonb_array_elements(p_events) e) <> jsonb_array_length(p_events) then raise exception 'EXAM_REPLAY_INVALID'; end if;
  for v_event in select value from jsonb_array_elements(p_events) loop
    if jsonb_typeof(v_event) <> 'object' or jsonb_typeof(v_event->'id') is distinct from 'string'
      or length(v_event->>'id') not between 1 and 128
      or coalesce(v_event->>'kind','') not in ('draw','erase','undo','redo','clear','restore')
      or jsonb_typeof(v_event->'at') is distinct from 'number'
      or jsonb_typeof(v_event->'added') is distinct from 'array'
      or jsonb_typeof(v_event->'removed') is distinct from 'array' then raise exception 'EXAM_REPLAY_INVALID'; end if;
    if (v_event->>'at')::numeric not between 0 and 9007199254740991 then raise exception 'EXAM_REPLAY_INVALID'; end if;
    if exists (select 1 from jsonb_array_elements(v_event->'removed') r where jsonb_typeof(r) <> 'string'
      or not exists(select 1 from jsonb_array_elements(v_current) s where s->'id' = r)) then raise exception 'EXAM_REPLAY_INVALID'; end if;
    select coalesce(jsonb_agg(s order by ordinal), '[]'::jsonb) into v_current
      from jsonb_array_elements(v_current) with ordinality as x(s, ordinal)
      where not exists(select 1 from jsonb_array_elements(v_event->'removed') r where s->'id' = r);
    perform private.validate_exam_replay_strokes(coalesce((select jsonb_agg(a->'stroke') from jsonb_array_elements(v_event->'added') a), '[]'::jsonb));
    v_last_index := -1;
    for v_add in select value from jsonb_array_elements(v_event->'added') loop
      if jsonb_typeof(v_add->'index') is distinct from 'number' or coalesce(v_add->>'index','') !~ '^[0-9]{1,5}$' then raise exception 'EXAM_REPLAY_INVALID'; end if;
      v_index := (v_add->>'index')::integer;
      v_stroke := v_add->'stroke';
      if v_index <= v_last_index or v_index > jsonb_array_length(v_current)
        or exists(select 1 from jsonb_array_elements(v_current) s where s->'id' = v_stroke->'id') then raise exception 'EXAM_REPLAY_INVALID'; end if;
      v_current := jsonb_insert(v_current, array[v_index::text], v_stroke);
      v_last_index := v_index;
    end loop;
    if jsonb_array_length(v_current) > 2000 then raise exception 'EXAM_INK_TOO_LARGE'; end if;
  end loop;
  if v_current is distinct from p_strokes then raise exception 'EXAM_REPLAY_FINAL_MISMATCH'; end if;
  -- Reuse full ink validation, submission lock and legacy-import rules. Both writes are atomic.
  v_revision := public.save_exam_ink(p_attempt_id, p_question_id, p_strokes, p_revision, p_legacy_import);
  select max(revision) into v_last_revision from public.exam_ink_replay_batches
    where attempt_id = p_attempt_id and question_id = p_question_id;
  insert into public.exam_ink_replay_batches(id, attempt_id, question_id, base_revision, revision, baseline, events, strokes_hash)
    values(p_batch_id, p_attempt_id, p_question_id, p_revision, v_revision,
      case when v_last_revision is distinct from p_revision then v_before else null end, p_events, md5(p_strokes::text));
  return v_revision;
end;
$$;

create function public.get_exam_ink_replay(p_attempt_id uuid, p_question_id uuid) returns jsonb
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

create or replace function public.get_exam_ink(p_attempt_id uuid) returns jsonb
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

revoke all on function private.validate_exam_replay_strokes(jsonb) from public, anon, authenticated;
revoke all on function public.get_exam_ink_replay(uuid, uuid),
  public.save_exam_ink_replay(uuid, uuid, jsonb, integer, boolean, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.get_exam_ink_replay(uuid, uuid),
  public.save_exam_ink_replay(uuid, uuid, jsonb, integer, boolean, jsonb, uuid) to authenticated;
commit;
