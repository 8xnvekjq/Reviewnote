-- 관리자 본인의 원래 응시에만 문항별 다시 풀기 요약을 붙인다.
-- 운영 최신 함수 정의를 유지하며 점수·등급·학생 응답은 변경하지 않는다.
begin;
do $patch$
declare
  def text := replace(pg_get_functiondef('private.exam_result_payload(uuid)'::regprocedure), E'\r', '');
  needle text := ') order by q.number)';
  replacement text := $sql$
             ) || case when a.student_id = auth.uid()
                 and private.is_current_user_admin() and a.attempt_kind = 'regular'
               then jsonb_build_object('singleRedo', jsonb_build_object(
                 'inProgress', exists (
                   select 1 from public.exam_attempts r
                   join public.exam_attempt_items ri on ri.attempt_id = r.id
                   where r.source_attempt_id = a.id and r.student_id = a.student_id
                     and r.paper_id = a.paper_id and r.attempt_kind = 'single_redo'
                     and r.status = 'in_progress' and ri.question_id = q.id
                 ),
                 'latestSubmitted', (
                   select jsonb_build_object('submittedAt', r.submitted_at,
                     'isCorrect', coalesce(ri.is_correct, false))
                   from public.exam_attempts r
                   join public.exam_attempt_items ri on ri.attempt_id = r.id
                   where r.source_attempt_id = a.id and r.student_id = a.student_id
                     and r.paper_id = a.paper_id and r.attempt_kind = 'single_redo'
                     and r.status = 'submitted' and ri.question_id = q.id
                   order by r.submitted_at desc nulls last, r.id desc limit 1
                 )
               )) else '{}'::jsonb end order by q.number)$sql$;
begin
  if position(needle in def) = 0 then
    raise exception '다시 풀기 요약 수정 대상이 없습니다';
  end if;
  execute replace(def, needle, replacement);
end $patch$;
commit;
