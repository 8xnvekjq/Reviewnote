-- 잠자리 명인 기준을 별5 10마리 → 30마리로 올린다(2026-10-12, 첫날 한 학생이 2시간에 별5 7마리를 잡음).
-- check_bug_achievements의 그 조건 하나만 바꾼다 — 못 찾으면 실패, 이미 바뀌었으면 그대로.
do $$
declare
  v_def text := pg_get_functiondef('pixel_private.check_bug_achievements(uuid)'::regprocedure);
  v_find text := '(s->>''star5'')::int >= 10 then';
  v_repl text := '(s->>''star5'')::int >= 30 then';
begin
  if position(v_repl in v_def) > 0 then return; end if;
  if position(v_find in v_def) = 0 then raise exception 'bug master patch: 10 star5 check not found'; end if;
  execute replace(v_def, v_find, v_repl);
end $$;
