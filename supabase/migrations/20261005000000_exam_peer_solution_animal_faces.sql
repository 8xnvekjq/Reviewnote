begin;

-- 다른 학생 풀이 라벨 얼굴에서 사람 얼굴을 모두 뺀다 — 앱은 성별·나이를 모르니 고1 여학생에게 성인 남자 얼굴이 붙는 일이 생겼다.
-- 이제 작성자 id 해시로 한 글자짜리(ZWJ·FE0F 없는 단일 코드포인트) 귀여운 동물 이모지 33개 중 하나만 돌려준다.
-- 작성자 기준 고정·선생님 🎓·character(구버전 클라이언트용)·권한·후보 선택·solutionKey는 20261004200000과 그대로.
create or replace function public.get_peer_solution(p_attempt_id uuid, p_question_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_peer uuid := private.pick_exam_peer_solution(p_attempt_id, p_question_id);
  v_names constant text[] := array['치이카와','하치와레','우사기','모몽가','쿠리만쥬','랏코','시사','후루혼'];
  v_faces constant text[] := array['🐶','🐱','🐰','🦊','🐼','🐨','🐯','🦁','🐻','🐹','🐧','🐥','🐸','🐵','🐷','🐮','🐙','🦄',
    '🐭','🦔','🦦','🦥','🐳','🐬','🦭','🐢','🦋','🐝','🐞','🦉','🦆','🐤','🐣'];
  v_scope text := auth.uid()::text || ':' || p_question_id::text;
begin
  if v_peer is null then return null; end if;
  return (select jsonb_build_object(
    'label', jsonb_build_object(
      'face', case when t.teacher then '🎓' else v_faces[1 + (('x' || substr(t.author_hash, 1, 8))::bit(32)::bigint % array_length(v_faces,1))::integer] end,
      'character', v_names[1 + (('x' || substr(t.author_hash, 9, 8))::bit(32)::bigint % array_length(v_names,1))::integer],
      'title', nullif(btrim(p.equipped_title),''), 'grade', nullif(btrim(p.school_grade),''),
      'isTeacher', t.teacher),
    -- A comparison fingerprint, not a credential or a source identifier. Replay reauthorizes and reselects.
    'solutionKey', md5(v_scope || ':' || v_peer::text || ':' || k.revision::text),
    'strokes', private.peer_strokes(k.strokes, v_scope))
    from public.exam_attempt_ink k join public.exam_attempts a on a.id = k.attempt_id
    left join public.profiles p on p.id = a.student_id
    cross join lateral (select md5('exam-peer-face:' || a.student_id::text) as author_hash,
      exists(select 1 from private.app_admins ad where ad.user_id = a.student_id) as teacher) t
    where k.attempt_id = v_peer and k.question_id = p_question_id);
end;
$$;

revoke all on function public.get_peer_solution(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_peer_solution(uuid, uuid) to authenticated;
commit;
