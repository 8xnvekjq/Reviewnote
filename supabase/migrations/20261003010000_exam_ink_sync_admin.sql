-- Follows 20261003000000_exam_hanneung.sql (existing migrations are future dated).
begin;

create table public.exam_attempt_ink (
  attempt_id uuid not null,
  question_id uuid not null,
  strokes jsonb not null default '[]'::jsonb check (jsonb_typeof(strokes) = 'array'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (attempt_id, question_id),
  foreign key (attempt_id, question_id) references public.exam_attempt_items(attempt_id, question_id) on delete cascade
);
alter table public.exam_attempt_ink enable row level security;
revoke all on public.exam_attempt_ink from public, anon, authenticated;
grant select on public.exam_attempt_ink to authenticated;
create policy exam_ink_read on public.exam_attempt_ink for select to authenticated
using (exists (select 1 from public.exam_attempts a where a.id = attempt_id
  and (a.student_id = (select auth.uid()) or (select private.is_current_user_admin()))));

create index exam_attempts_student_started_idx on public.exam_attempts(student_id, started_at desc, id desc);

create function public.get_exam_ink(p_attempt_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.exam_attempts a
    where a.id = p_attempt_id and (a.student_id = auth.uid() or private.is_current_user_admin())) then
    raise exception 'EXAM_ATTEMPT_NOT_FOUND';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('questionId', question_id,
    'strokes', strokes, 'revision', revision, 'updatedAt', updated_at) order by question_id)
    from public.exam_attempt_ink where attempt_id = p_attempt_id), '[]'::jsonb);
end;
$$;

-- Serialize against submission and concurrent devices; keep empty rows as deletion tombstones.
-- Old, already submitted attempts may import device-only ink ONCE, never replace saved ink.
create function public.save_exam_ink(p_attempt_id uuid, p_question_id uuid, p_strokes jsonb,
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
  insert into public.exam_attempt_ink(attempt_id, question_id, strokes) values (p_attempt_id, p_question_id, p_strokes)
  on conflict (attempt_id, question_id) do update set strokes = excluded.strokes,
    revision = public.exam_attempt_ink.revision + 1, updated_at = now()
  returning revision into v_revision;
  return v_revision;
end;
$$;

create function public.admin_list_student_exam_attempts(p_student_id uuid, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_current_user_admin() then raise exception 'EXAM_ADMIN_REQUIRED'; end if;
  return coalesce((select jsonb_agg(row.payload order by row.started_at desc, row.id desc) from (
    select a.id, a.started_at, jsonb_build_object('attemptId', a.id, 'paperTitle', p.title,
      'paperId', a.paper_id, 'round', private.exam_attempt_round(a.id), 'status', a.status,
      'mode', a.mode, 'elective', a.elective, 'startedAt', a.started_at, 'submittedAt', a.submitted_at,
      'score', a.score, 'maxScore', p.max_score,
      'answeredCount', (select count(*) from public.exam_attempt_items i where i.attempt_id = a.id and i.answer is not null),
      'questionCount', (select count(*) from public.exam_attempt_items i where i.attempt_id = a.id)) payload
    from public.exam_attempts a join public.exam_papers p on p.id = a.paper_id
    where a.student_id = p_student_id order by a.started_at desc, a.id desc
    limit 30 offset greatest(coalesce(p_offset, 0), 0)
  ) row), '[]'::jsonb);
end;
$$;

create function public.admin_get_exam_attempt(p_attempt_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_current_user_admin() then raise exception 'EXAM_ADMIN_REQUIRED'; end if;
  if not exists(select 1 from public.exam_attempts where id = p_attempt_id) then raise exception 'EXAM_ATTEMPT_NOT_FOUND'; end if;
  return private.exam_attempt_payload(p_attempt_id);
end;
$$;

revoke all on function public.get_exam_ink(uuid), public.save_exam_ink(uuid, uuid, jsonb, integer, boolean),
  public.admin_list_student_exam_attempts(uuid, integer), public.admin_get_exam_attempt(uuid) from public, anon, authenticated;
grant execute on function public.get_exam_ink(uuid), public.save_exam_ink(uuid, uuid, jsonb, integer, boolean),
  public.admin_list_student_exam_attempts(uuid, integer), public.admin_get_exam_attempt(uuid) to authenticated;
commit;
