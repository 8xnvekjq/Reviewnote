begin;

-- Expand the final document once, then resolve all v1 references in one join.
-- Materialization prevents a correlated rescan of the megabyte-sized JSONB.
create or replace function private.exam_replay_unpack(p_payload jsonb, p_final jsonb)
returns table(id uuid, base_revision integer, revision integer, baseline jsonb, events jsonb,
  strokes_hash text, created_at timestamptz)
language sql stable set search_path = '' as $$
  with final as materialized (
    select n-1 as idx, s from jsonb_array_elements(p_final) with ordinality x(s,n)
  ), batches as materialized (
    select b, bn from jsonb_array_elements(p_payload) with ordinality x(b,bn)
  ), ev as materialized (
    select bn, en, e from batches cross join lateral jsonb_array_elements(b->4) with ordinality x(e,en)
  ), slots as (
    select bn, null::bigint as en, sn, s, null::jsonb as a
      from batches cross join lateral jsonb_array_elements(nullif(b->3,'null'::jsonb)) with ordinality x(s,sn)
    union all
    select bn, en, sn, a->1, a from ev
      cross join lateral jsonb_array_elements(e->4) with ordinality x(a,sn)
  ), resolved as materialized (
    select bn, en, sn, a, case when jsonb_typeof(slots.s)='number' then final.s else slots.s end as s
    from slots left join final on final.idx = case when jsonb_typeof(slots.s)='number' then slots.s::text::integer end
  ), baselines as (
    select bn, jsonb_agg(s order by sn) as value from resolved where en is null group by bn
  ), additions as (
    select bn, en, jsonb_agg((a->2) || jsonb_build_object('index',a->0,'stroke',s) order by sn) as value
      from resolved where en is not null group by bn,en
  ), events as (
    select ev.bn, jsonb_agg((e->5) || jsonb_build_object('id',e->0,'kind',e->1,'at',e->2,
      'removed',e->3,'added',coalesce(additions.value,'[]'::jsonb)) order by ev.en) as value
      from ev left join additions using(bn,en) group by ev.bn
  )
  select (b->>0)::uuid, (b->>1)::integer, (b->>2)::integer,
    case when b->3 <> 'null'::jsonb then coalesce(baselines.value,'[]'::jsonb) end,
    coalesce(events.value,'[]'::jsonb), b->>5, (b->>6)::timestamptz
    from batches left join baselines using(bn) left join events using(bn) order by bn;
$$;

create or replace function private.compact_exam_ink_replay_question(p_attempt uuid,p_question uuid)
returns table(questions_compacted integer, bytes_before bigint, bytes_after bigint)
language plpgsql security definer set search_path = '' as $$
declare v_final jsonb; v_payload jsonb; v_before bigint; v_after bigint;
begin
  -- Retain the existing lock order, eligibility and overlap checks.
  perform 1 from public.exam_attempts where id=p_attempt and status='submitted' for update;
  if not found then return; end if;
  select strokes into v_final from public.exam_attempt_ink where attempt_id=p_attempt and question_id=p_question for update;
  if not found or not exists(select 1 from public.exam_ink_replay_batches where attempt_id=p_attempt and question_id=p_question)
    then return; end if;
  if exists(select 1 from public.exam_ink_replay_compact where attempt_id=p_attempt and question_id=p_question)
    then raise exception 'EXAM_REPLAY_COMPACT_OVERLAP'; end if;

  with final as materialized (
    -- Last occurrence wins, matching the original jsonb_object_agg map.
    select distinct on (s->>'id') s->>'id' as stroke_id, n-1 as idx, s
      from jsonb_array_elements(v_final) with ordinality x(s,n) order by s->>'id',n desc
  ), batches as materialized (
    select b.*, pg_column_size(b) as bytes from public.exam_ink_replay_batches b
      where attempt_id=p_attempt and question_id=p_question
  ), ev as materialized (
    select b.id as bid, en, e from batches b
      cross join lateral jsonb_array_elements(b.events) with ordinality x(e,en)
  ), slots as (
    select b.id as bid, null::bigint as en, sn, s, null::jsonb as a from batches b
      cross join lateral jsonb_array_elements(b.baseline) with ordinality x(s,sn)
    union all
    select bid, en, sn, a->'stroke', a from ev
      cross join lateral jsonb_array_elements(e->'added') with ordinality x(a,sn)
  ), resolved as materialized (
    select bid, en, sn, a, case when final.s=slots.s then to_jsonb(final.idx) else slots.s end as s
      from slots left join final on final.stroke_id=slots.s->>'id'
  ), baselines as (
    select bid, jsonb_agg(s order by sn) as value from resolved where en is null group by bid
  ), additions as (
    select bid, en, jsonb_agg(jsonb_build_array(a->'index',s,a-array['index','stroke']) order by sn) as value
      from resolved where en is not null group by bid,en
  ), events as (
    select ev.bid, jsonb_agg(jsonb_build_array(e->'id',e->'kind',e->'at',e->'removed',
      coalesce(additions.value,'[]'::jsonb),e-array['id','kind','at','removed','added']) order by ev.en) as value
      from ev left join additions using(bid,en) group by ev.bid
  )
  select sum(b.bytes), jsonb_agg(jsonb_build_array(b.id,b.base_revision,b.revision,
    case when b.baseline is not null then coalesce(baselines.value,'[]'::jsonb) end,
    coalesce(events.value,'[]'::jsonb),b.strokes_hash,b.created_at) order by b.revision)
    into v_before,v_payload from batches b left join baselines on baselines.bid=b.id left join events on events.bid=b.id;

  insert into public.exam_ink_replay_compact(attempt_id,question_id,payload) values(p_attempt,p_question,v_payload);
  select pg_column_size(c) into v_after from public.exam_ink_replay_compact c where attempt_id=p_attempt and question_id=p_question;
  delete from public.exam_ink_replay_batches where attempt_id=p_attempt and question_id=p_question;
  return query select 1,v_before,v_after;
end;
$$;

-- CREATE OR REPLACE retains function ownership and ACLs. No trigger changes.
commit;
