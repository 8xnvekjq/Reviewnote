"""검토된 학력평가 JSON과 최신 함수 정의로 단일 마이그레이션을 만든다."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / 'supabase/migrations'


def latest(name):
    matches = []
    for path in sorted(MIGRATIONS.glob('20*.sql')):
        if path.name >= '20261010120000':
            continue
        for m in re.finditer(r'create or replace function\s+' + re.escape(name) + r'\([^;]*?\bas\s+(\$\w*\$).*?\1\s*;', path.read_text(encoding='utf8'), re.S | re.I):
            matches.append((path.name, m[0]))
    assert matches, name
    source, sql = matches[-1]
    return f'-- 최신 정의: {source}\n' + sql


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def main():
    parts = ['-- 학력평가: 선택과목 없이 30문항·100점·100분. 검토 후 별도로 공개한다.\nbegin;',
             "alter table public.exam_papers drop constraint if exists exam_papers_kind_check;\nalter table public.exam_papers add constraint exam_papers_kind_check check (kind in ('csat','mock','school','hanneung','worksheet'));",
             "alter table public.exam_papers drop constraint if exists exam_papers_mock_check;\nalter table public.exam_papers add constraint exam_papers_mock_check check (kind <> 'mock' or (grade in (1,2) and grade is not null and cardinality(electives)=0 and question_count=30 and max_score=100 and time_limit_minutes=100 and grade_cuts->'raw' is not null));"]
    sql = latest('private.exam_validate_question')
    sql = sql.replace("  elsif v_paper.kind = 'school' then", "  elsif v_paper.kind = 'mock' then\n    if new.section <> 'common' or new.number > 30 or new.answer_type <> (case when new.number <= 21 then 'choice5' else 'digits' end) then raise exception 'EXAM_INVALID_QUESTION'; end if;\n  elsif v_paper.kind = 'school' then")
    parts += [sql, 'revoke all on function private.exam_validate_question() from public, anon, authenticated;']
    sql = latest('private.exam_result_payload')
    sql = sql.replace("p.kind <> 'csat'", "p.kind not in ('csat','mock')")
    sql = sql.replace("p.grade_cuts->'rawByElective'->a.elective,", "p.grade_cuts->'rawByElective'->a.elective, case when a.elective is null then p.grade_cuts->'raw' end,")
    for key in ('standard', 'percentile'):
        sql = sql.replace(f"p.grade_cuts->'topByElective'->a.elective->'{key}',", f"p.grade_cuts->'topByElective'->a.elective->'{key}', case when a.elective is null then p.grade_cuts->'top'->'{key}' end,")
    parts += [sql, 'revoke all on function private.exam_result_payload(uuid) from public, anon, authenticated;']
    sql = latest('public.submit_exam_attempt')
    sql = sql.replace("p.grade_cuts->'rawByElective'->v_attempt.elective into", "coalesce(p.grade_cuts->'rawByElective'->v_attempt.elective, case when v_attempt.elective is null then p.grade_cuts->'raw' end) into")
    parts += [sql, 'revoke all on function public.submit_exam_attempt(uuid,jsonb,int[]) from public, anon;\ngrant execute on function public.submit_exam_attempt(uuid,jsonb,int[]) to authenticated;']
    for grade in (1, 2):
        data = json.loads((ROOT / f'src/features/exam/data/2025-10-g{grade}-math.json').read_text(encoding='utf8'))
        pid = quote(data['id'])
        parts.append('insert into public.exam_papers (id,title,exam_date,source,subject,school_grade,time_limit_minutes,electives,grade_cuts,published,kind,year,grade,question_count,max_score) values (' +
                     ','.join([pid, quote(data['title']), quote(data['examDate']), quote(data['source']), "'수학'", quote(data['schoolGrade']), '100', "'{}'::text[]", quote(json.dumps(data['gradeCuts'], ensure_ascii=False)) + '::jsonb', "false,'mock',2025", str(grade), '30,100']) + ') on conflict (id) do nothing;')
        rows = []
        keys = []
        for q in data['questions']:
            rows.append('(' + ','.join([pid, str(q['number']), "'common'", quote(q['imageUrl']), str(q['isChoice']).lower(), str(q['points']), quote(q['curriculumGrade']), quote(q['curriculumChapter']), quote(q['answerType'])]) + ')')
            keys.append(f"({q['number']},{quote(q['answer'])})")
        parts.append('insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,curriculum_grade,curriculum_chapter,answer_type) values\n' + ',\n'.join(rows) + '\non conflict (paper_id,section,number) do nothing;')
        parts.append('insert into public.exam_answer_keys (question_id,answer) select q.id,k.answer from (values\n' + ','.join(keys) + f') as k(number,answer) join public.exam_questions q on q.paper_id={pid} and q.section=\'common\' and q.number=k.number on conflict (question_id) do nothing;')
    parts.append('commit;')
    (MIGRATIONS / '20261010120000_exam_mock_2025_10.sql').write_text('\n\n'.join(parts) + '\n', encoding='utf8')


if __name__ == '__main__':
    main()
