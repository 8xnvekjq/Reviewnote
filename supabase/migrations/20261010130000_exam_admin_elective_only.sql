-- 관리자 전용 "선택과목만 풀기": 공통 문항 없이 고른 선택과목 문항만으로 응시를 만든다.
-- start_exam_attempt(20261009150000 본문)와 같은 규칙이고, 관리자만·선택과목 필수·문항은 그 선택과목 구역만.
-- 이미 진행 중인 응시가 있으면(시험지당 하나) 그 응시를 이어 연다 — 시작 화면은 진행 중이면 이어 풀기만 보여 준다.
create or replace function public.admin_start_elective_only_attempt(p_paper_id text, p_mode text, p_elective text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_paper public.exam_papers%rowtype;
  v_attempt_id uuid;
begin
  if v_uid is null or not private.is_current_user_admin() then
    raise exception 'EXAM_ADMIN_REQUIRED';
  end if;

  select * into v_paper from public.exam_papers where id = p_paper_id;
  if v_paper.id is null then
    raise exception 'EXAM_PAPER_NOT_FOUND';
  end if;
  if (v_paper.practice_era is not null or v_paper.kind = 'worksheet') and p_mode <> 'free' then raise exception 'EXAM_INVALID_MODE'; end if;
  if p_mode is null or p_mode not in ('real', 'free') then
    raise exception 'EXAM_INVALID_MODE';
  end if;
  if cardinality(v_paper.electives) = 0 or p_elective is null or not (p_elective = any (v_paper.electives)) then
    raise exception 'EXAM_INVALID_ELECTIVE';
  end if;

  insert into public.exam_attempts (student_id, paper_id, mode, elective, time_limit_minutes)
  values (
    v_uid, p_paper_id, p_mode, p_elective,
    case when p_mode = 'real' then v_paper.time_limit_minutes end
  )
  on conflict (student_id, paper_id) where status = 'in_progress' do nothing
  returning id into v_attempt_id;

  if v_attempt_id is null then
    select id into v_attempt_id
      from public.exam_attempts
     where student_id = v_uid and paper_id = p_paper_id and status = 'in_progress';
    return private.exam_attempt_payload(v_attempt_id);
  end if;

  insert into public.exam_attempt_items (attempt_id, question_id)
  select v_attempt_id, q.id
    from public.exam_questions q
   where q.paper_id = p_paper_id
     and q.section = p_elective;

  return private.exam_attempt_payload(v_attempt_id);
end;
$function$;
revoke all on function public.admin_start_elective_only_attempt(text, text, text) from public, anon;
grant execute on function public.admin_start_elective_only_attempt(text, text, text) to authenticated;
