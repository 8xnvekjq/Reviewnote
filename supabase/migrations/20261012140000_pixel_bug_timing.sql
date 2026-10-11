-- 잠자리 잡기 시간 제한을 별 개수에 맞춘다(클라이언트 logic/bugCatalog.ts bugTimeLimitMs와 같은 식).
-- · 시간 제한: 별1 5초, 별마다 0.5초씩 짧아진다(별5 3초). 예전에는 모두 10초였다.
-- · 서버는 시작 후 (제한 + 2초) 넘어 온 결과를 받지 않는다(통신 지연 여유). 예전에는 모두 15초였다.
-- finish_bug_catch의 그 조건 하나만 정확히 바꾼다 — 못 찾으면 실패, 이미 바뀌었으면 그대로 둔다.
do $$
declare
  v_def text := pg_get_functiondef('public.finish_bug_catch(uuid,boolean)'::regprocedure);
  v_find text := 't>a.created_at+interval ''15 seconds''';
  v_repl text := 't>a.created_at+make_interval(secs => 7.5 - 0.5 * coalesce((select s.stars from public.pixel_bug_species s where s.id=a.bug_id), 1))';
begin
  if position(v_repl in v_def) > 0 then return; end if;
  if position(v_find in v_def) = 0 then raise exception 'bug timing patch: 15 seconds check not found'; end if;
  execute replace(v_def, v_find, v_repl);
end $$;
