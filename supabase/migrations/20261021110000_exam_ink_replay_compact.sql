begin;

-- 배치 경계와 모든 시각을 보존한다. 숫자 획 참조는 최종 필기의 0부터 시작하는 인덱스다.
create table public.exam_ink_replay_compact (
  attempt_id uuid not null,
  question_id uuid not null,
  format_version integer not null default 1 check (format_version = 1),
  payload jsonb not null check (jsonb_typeof(payload) = 'array'),
  primary key (attempt_id, question_id),
  foreign key (attempt_id, question_id) references public.exam_attempt_ink(attempt_id, question_id) on delete cascade
);
alter table public.exam_ink_replay_compact enable row level security;
revoke all on public.exam_ink_replay_compact from public, anon, authenticated;
grant select on public.exam_ink_replay_compact to authenticated;
create policy exam_ink_replay_compact_read on public.exam_ink_replay_compact for select to authenticated
using (exists (select 1 from public.exam_attempts a where a.id = attempt_id
  and (a.student_id = (select auth.uid()) or (select private.is_current_user_admin()))));

-- lz4가 없는 빌드는 기본 pglz를 유지한다. 기존 테이블은 재작성하지 않는다.
do $$ begin
  alter table public.exam_ink_replay_compact alter column payload set compression lz4;
exception when feature_not_supported then null;
end $$;

create function private.exam_replay_pack_stroke(p_stroke jsonb, p_final jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p_final->(p_stroke->>'id')->1 = p_stroke
    then p_final->(p_stroke->>'id')->0 else p_stroke end;
$$;
create function private.exam_replay_unpack_stroke(p_stroke jsonb, p_final jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_stroke) = 'number' then p_final->(p_stroke::text::integer) else p_stroke end;
$$;

-- 같은 ID라도 이동·색 변경 전 본문은 다르므로 완전히 같은 본문만 참조한다.
create function private.exam_replay_unpack(p_payload jsonb, p_final jsonb)
returns table(id uuid, base_revision integer, revision integer, baseline jsonb, events jsonb,
  strokes_hash text, created_at timestamptz)
language sql stable set search_path = '' as $$
  select (b->>0)::uuid, (b->>1)::integer, (b->>2)::integer,
    case when b->3 <> 'null'::jsonb then
      (select coalesce(jsonb_agg(private.exam_replay_unpack_stroke(s,p_final) order by n),'[]'::jsonb)
       from jsonb_array_elements(b->3) with ordinality x(s,n)) end,
    (select coalesce(jsonb_agg((e->5) || jsonb_build_object('id',e->0,'kind',e->1,'at',e->2,'removed',e->3,
      'added',(select coalesce(jsonb_agg((a->2) || jsonb_build_object('index',a->0,
        'stroke',private.exam_replay_unpack_stroke(a->1,p_final)) order by an),'[]'::jsonb)
        from jsonb_array_elements(e->4) with ordinality y(a,an))) order by en),'[]'::jsonb)
      from jsonb_array_elements(b->4) with ordinality x(e,en)),
    b->>5, (b->>6)::timestamptz
  from jsonb_array_elements(p_payload) b;
$$;

-- 이 비공개 뷰는 권한 검사한 RPC 내부에서만 읽는다. 클라이언트 계약은 그대로다.
create view private.exam_ink_replay_expanded as
select * from public.exam_ink_replay_batches
union all
select b.id,c.attempt_id,c.question_id,b.base_revision,b.revision,b.baseline,b.events,b.strokes_hash,b.created_at
from public.exam_ink_replay_compact c
join public.exam_attempt_ink i using(attempt_id,question_id)
cross join lateral private.exam_replay_unpack(c.payload,i.strokes) b;
revoke all on private.exam_ink_replay_expanded from public,anon,authenticated;

create function private.compact_exam_ink_replay_question(p_attempt uuid,p_question uuid)
returns table(questions_compacted integer, bytes_before bigint, bytes_after bigint)
language plpgsql security definer set search_path = '' as $$
declare v_final jsonb; v_map jsonb; v_payload jsonb; v_before bigint; v_after bigint;
begin
  -- 모든 저장 함수와 같은 순서: 응시 행을 먼저 잠근다.
  perform 1 from public.exam_attempts where id=p_attempt and status='submitted' for update;
  if not found then return; end if;
  select strokes into v_final from public.exam_attempt_ink where attempt_id=p_attempt and question_id=p_question for update;
  if not found or not exists(select 1 from public.exam_ink_replay_batches where attempt_id=p_attempt and question_id=p_question)
    then return; end if;
  if exists(select 1 from public.exam_ink_replay_compact where attempt_id=p_attempt and question_id=p_question)
    then raise exception 'EXAM_REPLAY_COMPACT_OVERLAP'; end if;
  select coalesce(jsonb_object_agg(s->>'id',jsonb_build_array(n-1,s)),'{}'::jsonb) into v_map
    from jsonb_array_elements(v_final) with ordinality x(s,n);
  select sum(pg_column_size(b)), jsonb_agg(jsonb_build_array(b.id,b.base_revision,b.revision,
    case when b.baseline is not null then (select coalesce(jsonb_agg(private.exam_replay_pack_stroke(s,v_map) order by n),'[]'::jsonb)
      from jsonb_array_elements(b.baseline) with ordinality x(s,n)) end,
    (select coalesce(jsonb_agg(jsonb_build_array(e->'id',e->'kind',e->'at',e->'removed',
      (select coalesce(jsonb_agg(jsonb_build_array(a->'index',private.exam_replay_pack_stroke(a->'stroke',v_map),
        a-array['index','stroke']) order by an),'[]'::jsonb) from jsonb_array_elements(e->'added') with ordinality y(a,an)),
      e-array['id','kind','at','removed','added']) order by en),'[]'::jsonb)
      from jsonb_array_elements(b.events) with ordinality x(e,en)), b.strokes_hash,b.created_at) order by b.revision)
    into v_before,v_payload from public.exam_ink_replay_batches b where attempt_id=p_attempt and question_id=p_question;
  insert into public.exam_ink_replay_compact(attempt_id,question_id,payload) values(p_attempt,p_question,v_payload);
  select pg_column_size(c) into v_after from public.exam_ink_replay_compact c where attempt_id=p_attempt and question_id=p_question;
  delete from public.exam_ink_replay_batches where attempt_id=p_attempt and question_id=p_question;
  return query select 1,v_before,v_after;
end;
$$;

-- 운영자 전용. 한 번의 상한은 문항 수이며 다른 저장·압축이 잠근 응시는 건너뛴다.
create function private.compact_exam_ink_replay(p_limit integer default 50)
returns table(questions_compacted integer, bytes_before bigint, bytes_after bigint)
language plpgsql security definer set search_path = '' as $$
declare r record; s record;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'EXAM_REPLAY_COMPACT_LIMIT'; end if;
  questions_compacted:=0; bytes_before:=0; bytes_after:=0;
  for r in select i.attempt_id,i.question_id from public.exam_attempt_ink i
    join public.exam_attempts a on a.id=i.attempt_id
    where a.status='submitted' and exists(select 1 from public.exam_ink_replay_batches b
      where b.attempt_id=i.attempt_id and b.question_id=i.question_id)
    order by i.attempt_id,i.question_id limit p_limit for update of a skip locked
  loop
    for s in select * from private.compact_exam_ink_replay_question(r.attempt_id,r.question_id) loop
      questions_compacted:=questions_compacted+s.questions_compacted;
      bytes_before:=bytes_before+s.bytes_before; bytes_after:=bytes_after+s.bytes_after;
    end loop;
  end loop;
  return next;
end;
$$;

-- 관리자 재편집 전에 옛 최종 획을 사용해 참조를 풀어 놓는다.
create function private.thaw_exam_ink_replay() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.exam_attempts where id=old.attempt_id for update;
  insert into public.exam_ink_replay_batches
    select b.id,old.attempt_id,old.question_id,b.base_revision,b.revision,b.baseline,b.events,b.strokes_hash,b.created_at
    from public.exam_ink_replay_compact c
    cross join lateral private.exam_replay_unpack(c.payload,old.strokes) b
    where c.attempt_id=old.attempt_id and c.question_id=old.question_id;
  delete from public.exam_ink_replay_compact where attempt_id=old.attempt_id and question_id=old.question_id;
  return new;
end;
$$;
create trigger exam_replay_thaw before update of strokes on public.exam_attempt_ink
for each row execute function private.thaw_exam_ink_replay();

-- 제출과 저장의 최종 상태에서만 압축한다. 허용된 옛 기기의 뒤늦은 가져오기도 처리한다.
create function private.auto_compact_exam_ink_replay() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if tg_table_name='exam_attempts' then
    for r in select question_id from public.exam_attempt_ink where attempt_id=new.id order by question_id loop
      perform private.compact_exam_ink_replay_question(new.id,r.question_id);
    end loop;
  else
    perform private.compact_exam_ink_replay_question(new.attempt_id,new.question_id);
  end if;
  return null;
end;
$$;
create trigger exam_replay_compact_submit after update of status on public.exam_attempts
for each row when (new.status='submitted' and old.status is distinct from new.status)
execute function private.auto_compact_exam_ink_replay();
create constraint trigger exam_replay_compact_save after insert or update on public.exam_attempt_ink
deferrable initially deferred for each row execute function private.auto_compact_exam_ink_replay();

-- 읽기 부분만 교체해 소유권·peer 익명화·음성의 기존 검사를 유지한다.
do $$
declare r record; v_def text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname = any(array[
      'get_exam_ink','get_exam_ink_v2','get_exam_ink_questions','get_exam_ink_questions_v2','get_exam_ink_index','get_exam_ink_index_v2',
      'get_exam_ink_replay','get_exam_ink_replay_v2','get_peer_solution_replay','get_peer_solution_replay_v2',
      'get_peer_solution_by_key','get_peer_solution_by_key_v2','admin_get_live_ink','admin_get_live_ink_v2',
      'save_exam_ink_replay','save_exam_ink_delta','save_exam_ink_delta_v2'])
  loop
    v_def:=pg_get_functiondef(r.oid);
    execute replace(v_def,'from public.exam_ink_replay_batches','from private.exam_ink_replay_expanded');
  end loop;
  -- 리셋은 압축 행도 먼저 지워서 thaw 트리거가 삭제한 기록을 되살리지 않게 한다.
  v_def:=pg_get_functiondef('public.reset_exam_question_solution(uuid,uuid)'::regprocedure);
  execute replace(v_def,'delete from public.exam_ink_replay_batches',
    'delete from public.exam_ink_replay_compact where attempt_id = p_attempt_id and question_id = p_question_id; delete from public.exam_ink_replay_batches');
end $$;

revoke all on function private.exam_replay_pack_stroke(jsonb,jsonb), private.exam_replay_unpack_stroke(jsonb,jsonb),
  private.exam_replay_unpack(jsonb,jsonb), private.compact_exam_ink_replay_question(uuid,uuid),
  private.compact_exam_ink_replay(integer), private.thaw_exam_ink_replay(), private.auto_compact_exam_ink_replay()
  from public,anon,authenticated;
grant execute on function private.compact_exam_ink_replay(integer) to service_role;
grant usage on schema private to service_role;
commit;
