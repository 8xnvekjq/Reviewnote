-- 생성: python scripts/exam/import_school.py
-- 기존 내신 스키마·RPC·RLS를 그대로 사용. 검토 전 비공개, 정확한 시행일 없음.
begin;
insert into public.exam_papers (id, title, exam_date, source, subject, school_grade, time_limit_minutes, electives, grade_cuts, published, kind, school_name, year, grade, semester, exam_term, question_count, max_score)
values ('2026-dunchon-g1-s2-mid-common2', '2026 둔촌고 1학년 2학기 중간 공통수학2', null, '둔촌고', '공통수학2', '고1', 50, '{}'::text[], null, false, 'school', '둔촌고', 2026, 1, 2, 'mid', 22, 100) on conflict do nothing;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,curriculum_grade,curriculum_chapter,answer_type,choices)
values
  ('2026-dunchon-g1-s2-mid-common2', 1, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-01.png', true, 3.8, '공통수학2', '직선의 방정식', 'choice5', null),
  ('2026-dunchon-g1-s2-mid-common2', 2, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-02.png', true, 3.9, '공통수학2', '직선의 방정식', 'choice5', null),
  ('2026-dunchon-g1-s2-mid-common2', 3, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-03.png', true, 4.0, '공통수학2', '평면좌표', 'choice5', null),
  ('2026-dunchon-g1-s2-mid-common2', 4, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-04.png', true, 4.5, '공통수학2', '평면좌표', 'choice5', null),
  ('2026-dunchon-g1-s2-mid-common2', 5, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-05.png', true, 4.6, '공통수학2', '평면좌표', 'choice5', null),
  ('2026-dunchon-g1-s2-mid-common2', 6, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-06.png', true, 4.4, '공통수학2', '직선의 방정식', 'choice5', null),
  ('2026-dunchon-g1-s2-mid-common2', 7, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-07.png', true, 4.5, '공통수학2', '직선의 방정식', 'choice5', null),
  ('2026-dunchon-g1-s2-mid-common2', 8, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-08.png', true, 4.7, '공통수학2', '직선의 방정식', 'choice5', null),
  ('2026-dunchon-g1-s2-mid-common2', 9, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-09.png', true, 4.1, '공통수학2', '원의 방정식', 'choice5', null),
  ('2026-dunchon-g1-s2-mid-common2', 10, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-10.png', true, 4.2, '공통수학2', '도형의 이동', 'choice5', null),
  ('2026-dunchon-g1-s2-mid-common2', 11, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-11.png', true, 4.4, '공통수학2', '도형의 이동', 'choice5', null),
  ('2026-dunchon-g1-s2-mid-common2', 12, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-12.png', true, 4.3, '공통수학2', '원의 방정식', 'choice5', null),
  ('2026-dunchon-g1-s2-mid-common2', 13, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-13.png', true, 4.6, '공통수학2', '원의 방정식', 'choice5', null),
  ('2026-dunchon-g1-s2-mid-common2', 14, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-14.png', true, 4.4, '공통수학2', '원의 방정식', 'choice5', null),
  ('2026-dunchon-g1-s2-mid-common2', 15, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-15.png', true, 4.9, '공통수학2', '원의 방정식', 'choice5', null),
  ('2026-dunchon-g1-s2-mid-common2', 16, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-16.png', true, 4.7, '공통수학2', '도형의 이동', 'choice5', null),
  ('2026-dunchon-g1-s2-mid-common2', 17, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-17.png', true, 4.8, '공통수학2', '원의 방정식', 'choice5', null),
  ('2026-dunchon-g1-s2-mid-common2', 18, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-18.png', true, 5.2, '공통수학2', '도형의 이동', 'choice5', null),
  ('2026-dunchon-g1-s2-mid-common2', 19, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-19.png', true, 4.0, '공통수학2', '직선의 방정식', 'choice10', '["2x-y+1=0", "x+3y+11=0", "34x-23y-1=0", "3x-y+3=0", "3x+y+9=0", "x-3y-7=0", "3x-y+18=0", "3x-y-3=0", "3x+4y+18=0", "3x+4y+3=0"]'::jsonb),
  ('2026-dunchon-g1-s2-mid-common2', 20, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-20.png', true, 5.0, '공통수학2', '직선의 방정식', 'choice10', '["y=x+3", "y=\\frac{8}{5}x+\\frac{18}{5}", "y=\\frac{5}{2}x-\\frac{1}{2}", "y=\\frac{2}{5}x+\\frac{12}{5}", "y=\\frac{22}{7}x+\\frac{36}{7}", "y=-\\frac{5}{2}x-\\frac{1}{2}", "y=\\frac{5}{2}x+\\frac{9}{2}", "y=7x+9", "y=\\frac{5}{2}x+2", "y=\\frac{1}{4}x+\\frac{9}{4}"]'::jsonb),
  ('2026-dunchon-g1-s2-mid-common2', 21, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-21.png', true, 5.0, '공통수학2', '원의 방정식', 'choice10', '["\\sqrt{3}-1", "1+\\sqrt{3}", "2+\\sqrt{3}", "2+2\\sqrt{3}", "\\frac{1+\\sqrt{3}}{2}", "1", "\\frac{\\sqrt{3}}{2}", "2", "\\frac{2+\\sqrt{3}}{2}", "\\frac{2\\sqrt{3}+1}{2}"]'::jsonb),
  ('2026-dunchon-g1-s2-mid-common2', 22, 'common', '/exams/2026-dunchon-g1-s2-mid-common2/q-22.png', true, 6.0, '공통수학2', '도형의 이동', 'choice10', '["(5,\\ 11)", "(-7,\\ -13)", "(11,\\ 5),\\allowbreak\\ (-13,\\ -7)", "(6,\\ 13),\\allowbreak\\ (-6,\\ -11)", "(2,\\ 5),\\allowbreak\\ (-4,\\ -7)", "(7,\\ 15),\\allowbreak\\ (-5,\\ -9)", "(-1+3\\sqrt{2},\\ -1+6\\sqrt{2}),\\allowbreak\\ (-1-3\\sqrt{2},\\ -1-6\\sqrt{2})", "(5,\\ 11),\\allowbreak\\ (-7,\\ 13)", "(5,\\ 11),\\allowbreak\\ (-7,\\ -13)", "(5,\\ 11),\\allowbreak\\ (-7,\\ -13),\\allowbreak\\ (-1,\\ -1)"]'::jsonb)
on conflict do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id, v.answer from (values
  (1, '2'),
  (2, '1'),
  (3, '4'),
  (4, '3'),
  (5, '1'),
  (6, '5'),
  (7, '4'),
  (8, '2'),
  (9, '5'),
  (10, '3'),
  (11, '2'),
  (12, '3'),
  (13, '1'),
  (14, '4'),
  (15, '5'),
  (16, '2'),
  (17, '4'),
  (18, '5'),
  (19, '4'),
  (20, '7'),
  (21, '2'),
  (22, '9')) v(number,answer) join public.exam_questions q on q.paper_id = '2026-dunchon-g1-s2-mid-common2' and q.section = 'common' and q.number = v.number
on conflict do nothing;
commit;
