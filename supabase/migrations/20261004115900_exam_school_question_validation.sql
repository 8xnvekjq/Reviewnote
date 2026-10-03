-- School exams use their own question count, including common question 23.
begin;
create or replace function private.exam_validate_question()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_paper public.exam_papers%rowtype;
begin
  select * into v_paper from public.exam_papers where id = new.paper_id;
  if new.number > 50 and v_paper.practice_era is null and v_paper.kind <> 'worksheet' then raise exception 'EXAM_INVALID_QUESTION'; end if;
  if v_paper.practice_era is not null and (new.source_paper_id is null or new.number > v_paper.question_count) then raise exception 'EXAM_INVALID_QUESTION'; end if;
  if v_paper.kind = 'worksheet' then
    if new.section <> 'common' or new.answer_type not in ('choice5','digits') or new.number > v_paper.question_count then raise exception 'EXAM_INVALID_QUESTION'; end if;
  elsif v_paper.kind = 'school' then
    if new.section <> 'common' or new.number > v_paper.question_count or new.answer_type not in ('choice5','choice10','digits') then
      raise exception 'EXAM_INVALID_QUESTION';
    end if;
  elsif v_paper.kind = 'hanneung' then
    if new.section <> 'common' or new.answer_type <> (case when v_paper.hanneung_level = 'basic' then 'choice4' else 'choice5' end) then
      raise exception 'EXAM_INVALID_QUESTION';
    end if;
  elsif new.number > 30 or ((new.section = 'common') <> (new.number <= 22)) then
    raise exception 'EXAM_INVALID_QUESTION';
  end if;
  return new;
end;
$function$;
revoke all on function private.exam_validate_question() from public, anon, authenticated;
commit;
