-- 선생님 음성은 비공개 객체에 저장하고, 제출된 관리자 응시만 학생에게 공개한다.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('exam-solution-audio','exam-solution-audio',false,52428800,array['audio/webm','audio/mp4'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create table public.exam_solution_audio (
 id uuid primary key,
 attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
 question_id uuid not null,
 started_at_ms bigint not null check(started_at_ms between 0 and 9007199254740991),
 duration_ms bigint not null check(duration_ms>=0),
 mime text not null check(mime in ('audio/webm;codecs=opus','audio/webm','audio/mp4')),
 size_bytes bigint not null check(size_bytes>0 and size_bytes<=52428800),
 storage_path text not null unique,
 created_at timestamptz not null default now(),
 foreign key(attempt_id,question_id) references public.exam_attempt_items(attempt_id,question_id) on delete cascade,
 check(storage_path=attempt_id::text || '/' || question_id::text || '/' || id::text ||
   case when mime like 'audio/webm%' then '.webm' else '.m4a' end)
);
create index exam_solution_audio_question_idx on public.exam_solution_audio(attempt_id,question_id,started_at_ms);
alter table public.exam_solution_audio enable row level security;
create or replace function private.exam_audio_can_read(p_attempt uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (private.is_current_user_admin() or exists(
 select 1 from public.exam_attempts a join private.app_admins ad on ad.user_id=a.student_id
 where a.id=p_attempt and a.status='submitted'));
$$;
create or replace function private.exam_audio_can_write(p_attempt text,p_question text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.is_current_user_admin() and exists(
 select 1 from public.exam_attempts a join public.exam_attempt_items i on i.attempt_id=a.id
 where a.id::text=p_attempt and a.student_id=auth.uid() and i.question_id::text=p_question);
$$;
create or replace function private.exam_audio_object_read(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (private.is_current_user_admin() or exists(
 select 1 from public.exam_solution_audio c where c.storage_path=p_path and private.exam_audio_can_read(c.attempt_id)));
$$;
revoke all on function private.exam_audio_can_read(uuid),private.exam_audio_can_write(text,text),private.exam_audio_object_read(text) from public,anon,authenticated;
grant execute on function private.exam_audio_can_read(uuid),private.exam_audio_can_write(text,text),private.exam_audio_object_read(text) to authenticated;
grant usage on schema private to authenticated;
revoke all on public.exam_solution_audio from public,anon,authenticated;
grant select,insert on public.exam_solution_audio to authenticated;
create policy exam_audio_select on public.exam_solution_audio for select to authenticated
 using (private.exam_audio_can_read(attempt_id));
create policy exam_audio_insert on public.exam_solution_audio for insert to authenticated
 with check(private.exam_audio_can_write(attempt_id::text,question_id::text));
create policy exam_audio_storage_insert on storage.objects for insert to authenticated
 with check(bucket_id='exam-solution-audio' and
 name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webm|m4a)$' and
 private.exam_audio_can_write(split_part(name,'/',1),split_part(name,'/',2)));
create policy exam_audio_storage_select on storage.objects for select to authenticated
 using(bucket_id='exam-solution-audio' and private.exam_audio_object_read(name));
-- 덮어쓰기를 허용하지 않는다. 실패 후 같은 UUID 재시도는 기존 객체를 그대로 쓴다.
create or replace function private.exam_audio_clips(p_attempt uuid,p_question uuid,p_origin numeric) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'offsetMs',c.started_at_ms-coalesce(p_origin,(select min(x.started_at_ms) from public.exam_solution_audio x where x.attempt_id=p_attempt and x.question_id=p_question)),
 'durationMs',c.duration_ms,'mime',c.mime,'sizeBytes',c.size_bytes,'storagePath',c.storage_path) order by c.started_at_ms,c.id),'[]'::jsonb)
 from public.exam_solution_audio c where c.attempt_id=p_attempt and c.question_id=p_question
 and private.exam_audio_can_read(c.attempt_id);
$$;
revoke all on function private.exam_audio_clips(uuid,uuid,numeric) from public,anon,authenticated;

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
    'timeSpentMs', c.time_spent_ms,
    'hasAudio', c.teacher and exists(select 1 from public.exam_solution_audio ac
      where ac.attempt_id=c.peer_id and ac.question_id=p_question_id)) order by c.sort_position)
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
    'audioClips', private.exam_audio_clips(v_peer,p_question_id,v_origin),
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
create or replace function public.get_exam_ink_replay_v2(p_attempt_id uuid, p_question_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_origin numeric;
begin
  if auth.uid() is null or not exists(select 1 from public.exam_attempts a
    join public.exam_attempt_items i on i.attempt_id = a.id and i.question_id = p_question_id
    where a.id = p_attempt_id and (a.student_id = auth.uid() or private.is_current_user_admin())) then
    raise exception 'EXAM_ATTEMPT_NOT_FOUND';
  end if;
  select min((e->>'at')::numeric) into v_origin from public.exam_ink_replay_batches b
    cross join lateral jsonb_array_elements(b.events) e where b.attempt_id=p_attempt_id and b.question_id=p_question_id;
  v_origin:=coalesce(v_origin,(select min(started_at_ms) from public.exam_solution_audio where attempt_id=p_attempt_id and question_id=p_question_id));
  return jsonb_build_object('audioClips', private.exam_audio_clips(p_attempt_id,p_question_id,v_origin),
    'audioOriginMs', coalesce(v_origin,0),
    'batches', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'revision', b.revision,
      'baseRevision', b.base_revision, 'baseline', b.baseline, 'events', b.events) order by b.revision)
      from public.exam_ink_replay_batches b where b.attempt_id = p_attempt_id and b.question_id = p_question_id), '[]'::jsonb),
    'strokes', coalesce((select strokes from public.exam_attempt_ink where attempt_id = p_attempt_id and question_id = p_question_id), '[]'::jsonb),
    'revision', coalesce((select revision from public.exam_attempt_ink where attempt_id = p_attempt_id and question_id = p_question_id), 0));
end;
$$;
commit;
