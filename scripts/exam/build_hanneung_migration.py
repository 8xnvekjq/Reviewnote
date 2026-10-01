import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIG = ROOT / 'supabase/migrations'
source = (MIG / '20261002210000_exam_school_papers.sql').read_text(encoding='utf-8')


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


sql = """begin;
alter table public.exam_papers add column if not exists hanneung_level text
  check (hanneung_level in ('advanced', 'basic'));
alter table public.exam_papers drop constraint if exists exam_papers_hanneung_check;
alter table public.exam_papers add constraint exam_papers_hanneung_check check (
  (kind = 'hanneung') = (hanneung_level is not null));
alter table public.exam_questions drop constraint if exists exam_questions_number_check;
alter table public.exam_questions add constraint exam_questions_number_check check (number between 1 and 50);
alter table public.exam_questions drop constraint if exists exam_questions_check;
alter table public.exam_questions drop constraint if exists exam_questions_answer_type_check;
alter table public.exam_questions add constraint exam_questions_answer_type_check check (
  answer_type in ('choice4', 'choice5', 'digits', 'choice10') and is_choice = (answer_type <> 'digits')
  and case when answer_type = 'choice10' then
    choices is not null and jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) = 10
    else choices is null end);
create or replace function private.exam_validate_question()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_paper public.exam_papers%rowtype;
begin
  select * into v_paper from public.exam_papers where id = new.paper_id;
  if v_paper.kind = 'hanneung' then
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
drop trigger if exists exam_validate_question on public.exam_questions;
create trigger exam_validate_question before insert or update on public.exam_questions
  for each row execute function private.exam_validate_question();
create or replace function private.exam_valid_typed_answer(p_answer text, p_type text)
returns text language sql immutable security definer set search_path = '' as $function$
  select case
    when p_type = 'choice4' then case when private.exam_normalize_answer(p_answer) ~ '^[1-4]$' then private.exam_normalize_answer(p_answer) end
    when p_type = 'choice10' then case when private.exam_normalize_answer(p_answer) ~ '^([1-9]|10)$' then private.exam_normalize_answer(p_answer) end
    else private.exam_valid_answer(p_answer, p_type = 'choice5') end;
$function$;
revoke all on function private.exam_valid_typed_answer(text, text) from public, anon, authenticated;
create or replace function private.exam_hanneung_grade(p_score numeric, p_level text)
returns int language sql immutable security definer set search_path = '' as $function$
  select case when p_score >= 60 and p_level in ('advanced', 'basic') then
    (case when p_level = 'basic' then 3 else 0 end) +
    (case when p_score >= 80 then 1 when p_score >= 70 then 2 else 3 end) end;
$function$;
revoke all on function private.exam_hanneung_grade(numeric, text) from public, anon, authenticated;
"""

for name in ['private.exam_attempt_payload', 'private.exam_result_payload',
             'public.submit_exam_attempt', 'public.list_exam_papers_for_me',
             'public.list_my_exam_results', 'public.list_my_paper_history']:
    function = re.search(r'create or replace function ' + re.escape(name) + r'\(.*?\$function\$;', source, re.S)[0]
    function = re.sub(r'^\s*--.*$', '', function, flags=re.M)
    function = function.replace("'kind', p.kind,", "'kind', p.kind, 'hanneungLevel', p.hanneung_level,")
    function = function.replace("'gradeCut', case when p.kind = 'school'", "'gradeCut', case when p.kind <> 'csat'")
    if name == 'public.submit_exam_attempt':
        function = function.replace('v_kind text;', 'v_kind text;\n  v_level text;')
        function = function.replace('select p.kind, p.grade_cuts', 'select p.kind, p.hanneung_level, p.grade_cuts')
        function = function.replace('into v_kind, v_cuts', 'into v_kind, v_level, v_cuts')
        function = function.replace("case when v_kind = 'school' then null else", "case when v_kind = 'school' then null when v_kind = 'hanneung' then private.exam_hanneung_grade(v_score, v_level) else")
    sql += '\n' + function + '\n'

for level in ['advanced', 'basic']:
    paper = json.loads((ROOT / f'src/features/exam/data/2026-hanneung-79-{level}.json').read_text(encoding='utf-8'))
    paper_id = quote(paper['id'])
    sql += f"""
insert into public.exam_papers (id, title, exam_date, source, subject, school_grade,
  time_limit_minutes, electives, grade_cuts, published, kind, year, question_count, max_score, hanneung_level)
values ({paper_id}, {quote(paper['title'])}, {quote(paper['examDate'])}, '국사편찬위원회', '한국사', '전 학년',
  {paper['timeLimitMinutes']}, '{{}}'::text[], null, true, 'hanneung', 2026, 50, 100, {quote(level)})
on conflict do nothing;
"""
    for question in paper['questions']:
        sql += f"""insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ({paper_id}, {question['number']}, 'common', {quote(question['imageUrl'])}, true, {question['points']}, {quote(question['answerType'])}) on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, {quote(question['answer'])} from public.exam_questions where paper_id = {paper_id} and number = {question['number']} and section = 'common'
on conflict do nothing;
"""

sql += '\ncommit;\n'
(MIG / '20261003000000_exam_hanneung.sql').write_text(sql, encoding='utf-8')
