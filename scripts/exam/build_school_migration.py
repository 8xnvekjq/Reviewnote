"""Build the new migration from the unchanged deployed RPCs and reviewed school data."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIG = ROOT / 'supabase/migrations'
base = (MIG / '20261002120000_exam_practice.sql').read_text(encoding='utf-8')
v2 = (MIG / '20261002180000_exam_practice_v2.sql').read_text(encoding='utf-8')
rounds = (MIG / '20261002200000_exam_rounds.sql').read_text(encoding='utf-8')
data = json.loads((ROOT / 'src/features/exam/data/2026-dongbuk-g1-s2-mid-common2.json').read_text(encoding='utf-8'))

def fn(source, name):
    return re.search(r'create or replace function '+re.escape(name)+r'\(.*?\$function\$;', source, re.S)[0]

def quote(value):
    if value is None:
        return 'null'
    return "'" + str(value).replace("'", "''") + "'"

metadata = """'kind', p.kind, 'schoolName', p.school_name, 'year', p.year,
    'grade', p.grade, 'semester', p.semester, 'examTerm', p.exam_term,
    'questionCount', p.question_count, 'maxScore', p.max_score, 'published', p.published,"""
sql = """-- 내신 시험지: 기존 운영 마이그레이션은 수정하지 않는다.
-- 생성: python scripts/exam/build_school_migration.py (검토된 JSON과 기존 RPC 기반).
begin;
alter table public.exam_papers
  add column if not exists kind text not null default 'csat' check (kind in ('csat', 'school', 'hanneung')),
  add column if not exists school_name text,
  add column if not exists year int check (year between 1900 and 2200),
  add column if not exists grade smallint check (grade between 1 and 12),
  add column if not exists semester smallint check (semester in (1, 2)),
  add column if not exists exam_term text check (exam_term in ('mid', 'final')),
  add column if not exists question_count int not null default 30 check (question_count > 0),
  add column if not exists max_score numeric not null default 100 check (max_score > 0);
-- 원본에 정확한 시행일이 없는 내신은 날짜를 만들지 않는다.
alter table public.exam_papers alter column exam_date drop not null;
alter table public.exam_questions drop constraint if exists exam_questions_points_check;
alter table public.exam_questions alter column points type numeric using points::numeric;
alter table public.exam_questions add constraint exam_questions_points_check check (points > 0);
alter table public.exam_questions drop constraint if exists exam_questions_check;
alter table public.exam_questions drop constraint if exists exam_questions_number_check;
alter table public.exam_questions add constraint exam_questions_number_check check (number > 0);
alter table public.exam_questions
  add column if not exists answer_type text,
  add column if not exists choices jsonb;
update public.exam_questions set answer_type = case when is_choice then 'choice5' else 'digits' end where answer_type is null;
alter table public.exam_questions alter column answer_type set not null;
alter table public.exam_questions drop constraint if exists exam_questions_answer_type_check;
alter table public.exam_questions add constraint exam_questions_answer_type_check check (
  answer_type in ('choice5', 'digits', 'choice10') and is_choice = (answer_type <> 'digits')
  and case when answer_type = 'choice10' then
    choices is not null and jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) = 10
    else choices is null end);
-- 既存シード等の answer_type を省略した INSERT も以前どおり受け入れる。
create or replace function private.exam_default_answer_type()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.answer_type is null then new.answer_type := case when new.is_choice then 'choice5' else 'digits' end; end if;
  return new;
end;
$function$;
drop trigger if exists exam_default_answer_type on public.exam_questions;
create trigger exam_default_answer_type before insert on public.exam_questions for each row execute function private.exam_default_answer_type();
revoke all on function private.exam_default_answer_type() from public, anon, authenticated;
grant select (answer_type, choices) on public.exam_questions to authenticated;
alter table public.exam_attempts alter column score type numeric using score::numeric;
alter table public.exam_attempts alter column elective drop not null;

create or replace function private.exam_valid_typed_answer(p_answer text, p_type text)
returns text language sql immutable security definer set search_path = '' as $function$
  select case when p_type = 'choice10' then
    case when private.exam_normalize_answer(p_answer) ~ '^([1-9]|10)$' then private.exam_normalize_answer(p_answer) end
    else private.exam_valid_answer(p_answer, p_type = 'choice5') end;
$function$;
revoke all on function private.exam_valid_typed_answer(text, text) from public, anon, authenticated;
""".replace('既存シード等の answer_type を省略した INSERT も以前どおり受け入れる。', '기존 시드처럼 answer_type을 생략한 INSERT도 기존 답 유형으로 받는다.')

apply = fn(v2, 'private.exam_apply_items').replace('private.exam_valid_answer(s.answer, q.is_choice)', 'private.exam_valid_typed_answer(s.answer, q.answer_type)')
apply = apply.replace('where v between 1 and 30', "where exists (select 1 from public.exam_attempt_items i join public.exam_questions q on q.id = i.question_id where i.attempt_id = p_attempt_id and q.number = v)")
attempt = fn(v2, 'private.exam_attempt_payload').replace("'paperId', a.paper_id,", "'paperId', a.paper_id, 'paperTitle', p.title,\n    " + metadata)
attempt = attempt.replace("'isChoice', q.is_choice,", "'isChoice', q.is_choice, 'answerType', q.answer_type, 'choices', q.choices,")
attempt = attempt.replace('from public.exam_attempts a\n  where', 'from public.exam_attempts a join public.exam_papers p on p.id = a.paper_id\n  where')
check = fn(v2, 'public.check_exam_answer').replace('q.is_choice, k.answer', 'q.answer_type, k.answer').replace('private.exam_valid_answer(p_answer, v_item.is_choice)', 'private.exam_valid_typed_answer(p_answer, v_item.answer_type)')
start = fn(base, 'public.start_exam_attempt').replace("if p_elective is null or not (p_elective = any (v_paper.electives)) then", "if cardinality(v_paper.electives) = 0 then\n    p_elective := null;\n  elsif p_elective is null or not (p_elective = any (v_paper.electives)) then")
submit = fn(base, 'public.submit_exam_attempt').replace('v_score int;', 'v_score numeric;\n  v_kind text;').replace('filter (where i.is_correct), 0)::int', 'filter (where i.is_correct), 0)')
submit = submit.replace("select p.grade_cuts->'rawByElective'->v_attempt.elective into v_cuts", "select p.kind, p.grade_cuts->'rawByElective'->v_attempt.elective into v_kind, v_cuts")
submit = submit.replace('private.exam_estimate_grade(v_cuts, v_score)', "case when v_kind = 'school' then null else private.exam_estimate_grade(v_cuts, v_score::int) end")
result = fn(rounds, 'private.exam_result_payload').replace("'paperTitle', p.title,", "'paperTitle', p.title,\n    "+metadata)
result = result.replace("'estimatedGrade', a.estimated_grade,", "'estimatedGrade', case when p.kind = 'school' then null else a.estimated_grade end,")
result = result.replace("'gradeCut', jsonb_build_object(", "'gradeCut', case when p.kind = 'school' then null else jsonb_build_object(").replace("'source', coalesce(p.grade_cuts->>'source', '')\n    ),", "'source', coalesce(p.grade_cuts->>'source', '')\n    ) end,")
result = result.replace("'isChoice', q.is_choice,", "'isChoice', q.is_choice, 'answerType', q.answer_type, 'choices', q.choices,")
listing = fn(rounds, 'public.list_exam_papers_for_me').replace("'title', p.title,", "'title', p.title,\n             "+metadata).replace('where p.published', 'where p.published or private.is_current_user_admin()').replace('order by p.exam_date desc, p.id', 'order by p.exam_date desc nulls last, p.year desc nulls last, p.id')
listing = listing.replace("'estimatedGrade', a.estimated_grade,", "'estimatedGrade', case when p.kind = 'school' then null else a.estimated_grade end,")
past = fn(base, 'public.list_my_exam_results').replace("'paperTitle', p.title,", "'paperTitle', p.title,\n             "+metadata).replace("'estimatedGrade', a.estimated_grade,", "'estimatedGrade', case when p.kind = 'school' then null else a.estimated_grade end,")
history = fn(rounds, 'public.list_my_paper_history').replace("'attemptId', a.id, 'round', a.round,", "'attemptId', a.id, 'round', a.round, 'paperTitle', p.title,\n      "+metadata)
history = history.replace("a.status = 'submitted' then a.estimated_grade", "a.status = 'submitted' and p.kind <> 'school' then a.estimated_grade")
history = history.replace("'number', q.number, 'section', q.section,", "'number', q.number, 'section', q.section, 'answerType', q.answer_type, 'choices', q.choices,")
history = history.replace(") a\n  ), '[]'::jsonb)", ") a join public.exam_papers p on p.id = a.paper_id\n  ), '[]'::jsonb)")
mistakes = fn(base, 'public.add_exam_questions_to_mistakes')
mistakes = mistakes.replace('q.image_url, q.is_choice,', 'q.image_url, q.is_choice, q.answer_type, q.choices,')
mistakes = mistakes.replace('when v_row.correct_answer is null then null', "when v_row.correct_answer is null then null\n      when v_row.answer_type = 'choice10' then '$' || (v_row.choices->>(v_row.correct_answer::int - 1)) || '$'")
mistakes = mistakes.replace('-- 객관식 정답은 카드에서 바로 알아보도록 ①~⑤로 저장(복습체크 AI 채점도 이 값을 정답으로 쓴다).', '-- 원래 객관식은 번호, 변환한 10지선다는 실제 수식으로 저장(복습체크 AI 채점용).')
for function in [apply, attempt, check, start, submit, result, listing, past, history, mistakes]:
    sql += '\n' + function + '\n'
for name, args in [('private.exam_apply_items', 'uuid,jsonb,int[]'), ('private.exam_attempt_payload', 'uuid'), ('private.exam_result_payload', 'uuid'), ('public.check_exam_answer', 'uuid,uuid,text'), ('public.start_exam_attempt', 'text,text,text'), ('public.submit_exam_attempt', 'uuid,jsonb,int[]'), ('public.list_exam_papers_for_me', ''), ('public.list_my_exam_results', 'text'), ('public.list_my_paper_history', 'text,uuid'), ('public.add_exam_questions_to_mistakes', 'uuid,uuid[],text')]:
    sql += f'\nrevoke all on function {name}({args}) from public, anon' + (', authenticated' if name.startswith('private.') else '') + ';\n'
    if name.startswith('public.'):
        sql += f'grant execute on function {name}({args}) to authenticated;\n'

columns = ['id','title','exam_date','source','subject','school_grade','time_limit_minutes','electives','grade_cuts','published','kind','school_name','year','grade','semester','exam_term','question_count','max_score']
values = [quote(data['id']),quote(data['title']),'null',quote(data['source']),quote(data['subject']),quote(data['schoolGrade']),'50',"'{}'::text[]",'null','false',"'school'",quote(data['schoolName']),'2026','1','2',"'mid'",'21','100']
sql += '\n-- 시드: 정확한 시행일은 원본에 없어 null. 정답은 보호된 별도 테이블에만 저장.\n'
sql += 'insert into public.exam_papers ('+', '.join(columns)+')\nvalues ('+', '.join(values)+') on conflict do nothing;\n'
sql += 'insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,curriculum_grade,curriculum_chapter,answer_type,choices)\nvalues\n'
rows = []
for q in data['questions']:
    rows.append('  ('+', '.join([quote(data['id']),str(q['number']),"'common'",quote(q['imageUrl']),'true' if q['answerType'] != 'digits' else 'false',str(q['points']),quote(q['curriculumGrade']),quote(q['curriculumChapter']),quote(q['answerType']),quote(json.dumps(q['choices']))+'::jsonb' if 'choices' in q else 'null'])+')')
sql += ',\n'.join(rows)+'\non conflict do nothing;\n'
sql += 'insert into public.exam_answer_keys (question_id,answer)\nselect q.id, v.answer from (values\n'
sql += ',\n'.join(f"  ({q['number']}, {quote(q['answer'])})" for q in data['questions'])
sql += ") v(number,answer) join public.exam_questions q on q.paper_id = "+quote(data['id'])+" and q.section = 'common' and q.number = v.number\non conflict do nothing;\ncommit;\n"
(MIG / '20261002210000_exam_school_papers.sql').write_text(sql, encoding='utf-8')
