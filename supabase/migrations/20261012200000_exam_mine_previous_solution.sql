-- 실수로 실전 모드를 다시 풀어(1문제만 쓰고 제출) 기존 풀이가 안 보이던 문제(2026-10-12).
-- 1) 풀이 비교(admin_list_paper_submissions): 학생마다 가장 최근 제출을 쓰되, 거의 안 푼 제출(답 30% 미만)은
--    더 많이 푼 이전 제출이 있으면 뒤로 미룬다.
-- 2) 다른 학생 풀이(exam_peer_candidates): 관리자가 자기 시험지를 볼 때, 자기 다른 기록(지금 보는 기록 말고)도
--    선생님 풀이 후보에 넣는다. 학생에게는 바뀌는 것이 없다.
-- 정확히 그 부분만 바꾼다(못 찾으면 실패, 이미 바뀌었으면 그대로).
do $$
declare patch record; v_def text;
begin
  for patch in select * from (values
    ('public.admin_list_paper_submissions(text)',
     E'      order by student_id, submitted_at desc nulls last, id desc) a',
     E'      order by student_id,\n        ((select count(*) from public.exam_attempt_items x where x.attempt_id = exam_attempts.id and nullif(btrim(x.answer), '''') is not null) * 10\n          >= greatest(1, (select count(*) from public.exam_attempt_items x where x.attempt_id = exam_attempts.id)) * 3) desc,\n        submitted_at desc nulls last, id desc) a'),
    ('private.exam_peer_candidates(uuid,uuid)',
     E'where i.question_id = p_question_id and a.paper_id = v_paper and a.student_id <> v_owner',
     E'where i.question_id = p_question_id and a.paper_id = v_paper\n      and (a.student_id <> v_owner or (a.id <> p_attempt_id and exists(select 1 from private.app_admins ad where ad.user_id = a.student_id)))')
  ) as t(sig, find, repl) loop
    v_def := pg_get_functiondef(patch.sig::regprocedure);
    if position(patch.repl in v_def) > 0 then continue; end if;
    if position(patch.find in v_def) = 0 then raise exception 'exam patch: target not found in %', patch.sig; end if;
    execute replace(v_def, patch.find, patch.repl);
  end loop;
end $$;
