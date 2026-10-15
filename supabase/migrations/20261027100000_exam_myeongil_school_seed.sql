-- 생성: python scripts/exam/import_school.py
-- 기존 내신 스키마·RPC·RLS를 그대로 사용. 검토 전 비공개, 정확한 시행일 없음.
begin;
insert into public.exam_papers (id, title, exam_date, source, subject, school_grade, time_limit_minutes, electives, grade_cuts, published, kind, school_name, year, grade, semester, exam_term, question_count, max_score)
values ('2024-myeongil-m3-s2-mid', '2024 명일중 3학년 2학기 중간 중3-2', null, '명일중', '중3-2', '중3', 50, '{}'::text[], null, false, 'school', '명일중', 2024, 9, 2, 'mid', 24, 100) on conflict do nothing;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,curriculum_grade,curriculum_chapter,answer_type,choices)
values
  ('2024-myeongil-m3-s2-mid', 1, 'common', '/exams/2024-myeongil-m3-s2-mid/q-01.png', true, 3.0, '중3-2', '삼각비', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 2, 'common', '/exams/2024-myeongil-m3-s2-mid/q-02.png', true, 3.0, '중3-2', '삼각비', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 3, 'common', '/exams/2024-myeongil-m3-s2-mid/q-03.png', true, 3.0, '중3-2', '원과 직선', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 4, 'common', '/exams/2024-myeongil-m3-s2-mid/q-04.png', true, 3.0, '중3-2', '원주각', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 5, 'common', '/exams/2024-myeongil-m3-s2-mid/q-05.png', true, 4.0, '중3-2', '삼각비', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 6, 'common', '/exams/2024-myeongil-m3-s2-mid/q-06.png', true, 4.0, '중3-2', '삼각비', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 7, 'common', '/exams/2024-myeongil-m3-s2-mid/q-07.png', true, 4.0, '중3-2', '삼각비', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 8, 'common', '/exams/2024-myeongil-m3-s2-mid/q-08.png', true, 4.0, '중3-2', '원과 직선', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 9, 'common', '/exams/2024-myeongil-m3-s2-mid/q-09.png', true, 4.0, '중3-2', '삼각비', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 10, 'common', '/exams/2024-myeongil-m3-s2-mid/q-10.png', true, 4.0, '중3-2', '삼각비의 활용', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 11, 'common', '/exams/2024-myeongil-m3-s2-mid/q-11.png', true, 4.0, '중3-2', '원과 직선', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 12, 'common', '/exams/2024-myeongil-m3-s2-mid/q-12.png', true, 4.0, '중3-2', '원과 직선', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 13, 'common', '/exams/2024-myeongil-m3-s2-mid/q-13.png', true, 4.0, '중3-2', '원과 직선', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 14, 'common', '/exams/2024-myeongil-m3-s2-mid/q-14.png', true, 4.0, '중3-2', '원과 직선', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 15, 'common', '/exams/2024-myeongil-m3-s2-mid/q-15.png', true, 4.0, '중3-2', '원주각', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 16, 'common', '/exams/2024-myeongil-m3-s2-mid/q-16.png', true, 4.0, '중3-2', '원주각', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 17, 'common', '/exams/2024-myeongil-m3-s2-mid/q-17.png', true, 5.0, '중3-2', '삼각비의 활용', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 18, 'common', '/exams/2024-myeongil-m3-s2-mid/q-18.png', true, 5.0, '중3-2', '삼각비의 활용', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 19, 'common', '/exams/2024-myeongil-m3-s2-mid/q-19.png', true, 5.0, '중3-2', '원과 직선', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 20, 'common', '/exams/2024-myeongil-m3-s2-mid/q-20.png', true, 5.0, '중3-2', '원과 직선', 'choice5', null),
  ('2024-myeongil-m3-s2-mid', 21, 'common', '/exams/2024-myeongil-m3-s2-mid/q-21.png', true, 3.0, '중3-2', '삼각비', 'choice10', '["\\left(\\frac{8}{17}, \\frac{15}{17}, \\frac{15}{8}\\right)", "\\left(\\frac{15}{17}, \\frac{8}{17}, \\frac{15}{8}\\right)", "\\left(\\frac{15}{17}, \\frac{15}{17}, \\frac{8}{15}\\right)", "\\left(\\frac{15}{17}, \\frac{15}{17}, \\frac{15}{8}\\right)", "\\left(\\frac{8}{17}, \\frac{8}{17}, \\frac{8}{15}\\right)", "\\left(\\frac{17}{15}, \\frac{15}{17}, \\frac{15}{8}\\right)", "\\left(\\frac{15}{17}, \\frac{17}{15}, \\frac{15}{8}\\right)", "\\left(\\frac{15}{8}, \\frac{15}{8}, \\frac{15}{17}\\right)", "\\left(\\frac{15}{17}, \\frac{15}{17}, \\frac{17}{8}\\right)", "\\left(\\frac{8}{15}, \\frac{8}{15}, \\frac{15}{8}\\right)"]'::jsonb),
  ('2024-myeongil-m3-s2-mid', 22, 'common', '/exams/2024-myeongil-m3-s2-mid/q-22.png', true, 4.0, '중3-2', '삼각비', 'choice10', '["\\sqrt{2}-1", "1-\\sqrt{2}", "\\sqrt{2}", "2\\sqrt{2}", "\\frac{\\sqrt{2}}{2}", "\\sqrt{2}+1", "2+\\sqrt{2}", "2-\\sqrt{2}", "\\frac{1+\\sqrt{2}}{2}", "\\frac{\\sqrt{2}-1}{2}"]'::jsonb),
  ('2024-myeongil-m3-s2-mid', 23, 'common', '/exams/2024-myeongil-m3-s2-mid/q-23.png', false, 5.0, '중3-2', '원과 직선', 'digits', null),
  ('2024-myeongil-m3-s2-mid', 24, 'common', '/exams/2024-myeongil-m3-s2-mid/q-24.png', true, 8.0, '중3-2', '원주각', 'choice10', '["\\frac{3}{7}", "\\frac{7}{4}", "\\frac{16}{3}", "\\frac{7}{3}", "\\frac{16}{7}", "\\frac{25}{3}", "1", "\\frac{9}{4}", "\\frac{4}{3}", "7"]'::jsonb)
on conflict do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id, v.answer from (values
  (1, '1'),
  (2, '4'),
  (3, '3'),
  (4, '1'),
  (5, '3'),
  (6, '3'),
  (7, '4'),
  (8, '2'),
  (9, '3'),
  (10, '5'),
  (11, '1'),
  (12, '4'),
  (13, '2'),
  (14, '1'),
  (15, '3'),
  (16, '5'),
  (17, '2'),
  (18, '5'),
  (19, '4'),
  (20, '4'),
  (21, '4'),
  (22, '6'),
  (23, '10'),
  (24, '4')) v(number,answer) join public.exam_questions q on q.paper_id = '2024-myeongil-m3-s2-mid' and q.section = 'common' and q.number = v.number
on conflict do nothing;
commit;
