-- 생성: python scripts/exam/import_school.py
-- 기존 내신 스키마·RPC·RLS를 그대로 사용. 검토 전 비공개, 정확한 시행일 없음.
begin;
insert into public.exam_papers (id, title, exam_date, source, subject, school_grade, time_limit_minutes, electives, grade_cuts, published, kind, school_name, year, grade, semester, exam_term, question_count, max_score)
values ('2026-sangil-g1-s2-mid-common2', '2026 상일여고 1학년 2학기 중간 공통수학2', null, '상일여고', '공통수학2', '고1', 50, '{}'::text[], null, false, 'school', '상일여고', 2026, 1, 2, 'mid', 23, 100) on conflict do nothing;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,curriculum_grade,curriculum_chapter,answer_type,choices)
values
  ('2026-sangil-g1-s2-mid-common2', 1, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-01.png', true, 2.7, '공통수학2', '집합', 'choice5', null),
  ('2026-sangil-g1-s2-mid-common2', 2, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-02.png', true, 2.7, '공통수학2', '직선의 방정식', 'choice5', null),
  ('2026-sangil-g1-s2-mid-common2', 3, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-03.png', true, 3.0, '공통수학2', '원의 방정식', 'choice5', null),
  ('2026-sangil-g1-s2-mid-common2', 4, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-04.png', true, 3.3, '공통수학2', '직선의 방정식', 'choice5', null),
  ('2026-sangil-g1-s2-mid-common2', 5, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-05.png', true, 3.3, '공통수학2', '도형의 이동', 'choice5', null),
  ('2026-sangil-g1-s2-mid-common2', 6, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-06.png', true, 3.7, '공통수학2', '집합', 'choice5', null),
  ('2026-sangil-g1-s2-mid-common2', 7, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-07.png', true, 3.7, '공통수학2', '평면좌표', 'choice5', null),
  ('2026-sangil-g1-s2-mid-common2', 8, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-08.png', true, 4.0, '공통수학2', '집합', 'choice5', null),
  ('2026-sangil-g1-s2-mid-common2', 9, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-09.png', true, 4.0, '공통수학2', '도형의 이동', 'choice5', null),
  ('2026-sangil-g1-s2-mid-common2', 10, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-10.png', true, 4.3, '공통수학2', '평면좌표', 'choice5', null),
  ('2026-sangil-g1-s2-mid-common2', 11, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-11.png', true, 4.3, '공통수학2', '집합', 'choice5', null),
  ('2026-sangil-g1-s2-mid-common2', 12, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-12.png', true, 4.3, '공통수학2', '원의 방정식', 'choice5', null),
  ('2026-sangil-g1-s2-mid-common2', 13, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-13.png', true, 4.7, '공통수학2', '원의 방정식', 'choice5', null),
  ('2026-sangil-g1-s2-mid-common2', 14, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-14.png', true, 4.7, '공통수학2', '원의 방정식', 'choice5', null),
  ('2026-sangil-g1-s2-mid-common2', 15, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-15.png', true, 4.7, '공통수학2', '직선의 방정식', 'choice5', null),
  ('2026-sangil-g1-s2-mid-common2', 16, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-16.png', true, 5.0, '공통수학2', '원의 방정식', 'choice5', null),
  ('2026-sangil-g1-s2-mid-common2', 17, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-17.png', true, 5.3, '공통수학2', '직선의 방정식', 'choice5', null),
  ('2026-sangil-g1-s2-mid-common2', 18, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-18.png', true, 5.7, '공통수학2', '집합', 'choice5', null),
  ('2026-sangil-g1-s2-mid-common2', 19, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-19.png', true, 3.3, '공통수학2', '직선의 방정식', 'choice10', '["4", "-1", "-4", "2", "-2", "0", "3", "-3", "-7", "-10"]'::jsonb),
  ('2026-sangil-g1-s2-mid-common2', 20, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-20.png', true, 3.3, '공통수학2', '원의 방정식', 'choice10', '["-16", "\\frac{16}{5}", "-\\frac{8}{5}", "\\frac{12}{5}", "-2", "-\\frac{6}{5}", "-\\frac{16}{5}", "-\\frac{32}{5}", "-\\frac{16}{3}", "-\\frac{4}{5}"]'::jsonb),
  ('2026-sangil-g1-s2-mid-common2', 21, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-21.png', false, 3.3, '공통수학2', '집합', 'digits', null),
  ('2026-sangil-g1-s2-mid-common2', 22, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-22.png', true, 6.7, '공통수학2', '원의 방정식', 'choice10', '["\\frac{\\sqrt{10}}{2}\\pi", "\\frac{5}{2}\\pi", "\\frac{5}{4}\\pi", "5\\pi", "10\\pi", "\\frac{9}{4}\\pi", "\\frac{1}{4}\\pi", "\\frac{25}{4}\\pi", "\\frac{13}{4}\\pi", "\\frac{29}{2}\\pi"]'::jsonb),
  ('2026-sangil-g1-s2-mid-common2', 23, 'common', '/exams/2026-sangil-g1-s2-mid-common2/q-23.png', true, 10.0, '공통수학2', '직선의 방정식', 'choice10', '["y=\\frac{7}{6}x-\\frac{7}{3}", "y=\\frac{6}{7}x+\\frac{12}{7}", "y=\\frac{7}{6}x", "y=\\frac{7}{2}x+7", "y=\\frac{7}{6}x+7", "y=\\frac{1}{8}x+\\frac{1}{4}", "y=2x-1", "y=-\\frac{7}{6}x-\\frac{7}{3}", "y=\\frac{7}{6}x+\\frac{7}{3}", "y=\\frac{7}{3}x+\\frac{14}{3}"]'::jsonb)
on conflict do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id, v.answer from (values
  (1, '5'),
  (2, '3'),
  (3, '2'),
  (4, '5'),
  (5, '4'),
  (6, '4'),
  (7, '4'),
  (8, '1'),
  (9, '2'),
  (10, '2'),
  (11, '3'),
  (12, '1'),
  (13, '2'),
  (14, '3'),
  (15, '5'),
  (16, '1'),
  (17, '4'),
  (18, '2'),
  (19, '3'),
  (20, '7'),
  (21, '10'),
  (22, '2'),
  (23, '9')) v(number,answer) join public.exam_questions q on q.paper_id = '2026-sangil-g1-s2-mid-common2' and q.section = 'common' and q.number = v.number
on conflict do nothing;
commit;
