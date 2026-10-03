begin;

-- 다른 학생 풀이 라벨의 얼굴을 요청자+문항이 아니라 풀이 작성자 기준으로 고정한다.
-- 작성자 id의 해시로 한 글자짜리(ZWJ 결합 없음) 얼굴·동물 이모지 하나만 돌려준다 — 26개 중 하나라 작성자를 특정할 수 없다.
-- character는 구버전 클라이언트(label.face를 모름)용으로 같은 작성자 해시에서 고른다. 권한·후보 선택·solutionKey는 그대로.
create or replace function public.get_peer_solution(p_attempt_id uuid, p_question_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_peer uuid := private.pick_exam_peer_solution(p_attempt_id, p_question_id);
  v_names constant text[] := array['치이카와','하치와레','우사기','모몽가','쿠리만쥬','랏코','시사','후루혼'];
  v_faces constant text[] := array['🐶','🐱','🐰','🦊','🐼','🐨','🐯','🦁','🐻','🐹','🐧','🐥','🐸','🐵','🐷','🐮','🐙','🦄',
    '🧑','👩','👨','🧒','👧','👦','👱','🧔'];
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
