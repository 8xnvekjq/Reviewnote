"""Generate only the new school's seed, using the existing school seed format."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = '20261003060000_exam_yeongpa_school_seed.sql'


def quote(value):
    return 'null' if value is None else "'" + str(value).replace("'", "''") + "'"


def main():
    data = json.loads((ROOT / 'src/features/exam/data/2024-yeongpa-g2-s2-mid-calc1.json').read_text(encoding='utf-8'))
    columns = ['id', 'title', 'exam_date', 'source', 'subject', 'school_grade', 'time_limit_minutes', 'electives', 'grade_cuts', 'published', 'kind', 'school_name', 'year', 'grade', 'semester', 'exam_term', 'question_count', 'max_score']
    values = [quote(data['id']), quote(data['title']), quote(data['examDate']), quote(data['source']), quote(data['subject']), quote(data['schoolGrade']), str(data['timeLimitMinutes']), "'{}'::text[]", 'null', 'false', quote(data['kind']), quote(data['schoolName']), str(data['year']), str(data['grade']), str(data['semester']), quote(data['examTerm']), str(data['questionCount']), str(data['maxScore'])]
    sql = '-- 생성: python scripts/exam/build_yeongpa_migration.py\n-- 기존 내신 스키마·RPC·RLS를 그대로 사용. 검토 전 비공개, 정확한 시행일 없음.\nbegin;\n'
    sql += 'insert into public.exam_papers (' + ', '.join(columns) + ')\nvalues (' + ', '.join(values) + ') on conflict do nothing;\n'
    sql += 'insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,curriculum_grade,curriculum_chapter,answer_type,choices)\nvalues\n'
    rows = []
    for q in data['questions']:
        rows.append('  (' + ', '.join([quote(data['id']), str(q['number']), quote(q['section']), quote(q['imageUrl']), 'true' if q['answerType'] != 'digits' else 'false', str(q['points']), quote(q['curriculumGrade']), quote(q['curriculumChapter']), quote(q['answerType']), quote(json.dumps(q['choices']))+'::jsonb' if 'choices' in q else 'null']) + ')')
    sql += ',\n'.join(rows) + '\non conflict do nothing;\n'
    sql += 'insert into public.exam_answer_keys (question_id,answer)\nselect q.id, v.answer from (values\n'
    sql += ',\n'.join(f"  ({q['number']}, {quote(q['answer'])})" for q in data['questions'])
    sql += ") v(number,answer) join public.exam_questions q on q.paper_id = " + quote(data['id']) + " and q.section = 'common' and q.number = v.number\non conflict do nothing;\ncommit;\n"
    (ROOT / 'supabase/migrations' / MIGRATION).write_text(sql, encoding='utf-8')


if __name__ == '__main__':
    main()
