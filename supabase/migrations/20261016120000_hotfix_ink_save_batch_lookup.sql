-- Hotfix (2026-10-16 장애): 필기 저장의 배치 id 중복 확인이 압축 뷰(private.exam_ink_replay_expanded)를
-- id로 조회하면서, 계산 컬럼이라 조건이 내려가지 못해 압축된 모든 문항을 매번 풀었다(1회 3.8초, 임시 I/O 약 250MB).
-- 이 함수는 exam_attempts 행을 FOR UPDATE로 잠근 채 돌기 때문에 save_exam_progress까지 줄줄이 막혔다.
-- 수정: 원본 테이블을 PK(id)로 먼저 찾고, 없을 때만 해당 문항(attempt_id, question_id)으로 좁힌 뷰를 찾는다. (8ms)
-- 운영 DB에는 같은 내용이 마이그레이션 hotfix_ink_save_batch_lookup으로 적용되어 있다.
do $$
declare
  r record;
  v_old constant text := 'select * into v_previous from private.exam_ink_replay_expanded where id = p_batch_id;';
  v_new constant text := 'select * into v_previous from public.exam_ink_replay_batches where id = p_batch_id; '
    || 'if not found then select * into v_previous from private.exam_ink_replay_expanded '
    || 'where attempt_id = p_attempt_id and question_id = p_question_id and id = p_batch_id; end if;';
  v_def text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('save_exam_ink_delta', 'save_exam_ink_replay')
             and pg_get_functiondef(p.oid) like '%' || v_old || '%'
  loop
    v_def := replace(pg_get_functiondef(r.oid), v_old, v_new);
    execute v_def;
  end loop;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname in ('save_exam_ink_delta', 'save_exam_ink_replay')
               and pg_get_functiondef(p.oid) like '%' || v_old || '%') then
    raise exception 'hotfix not applied';
  end if;
end $$;
