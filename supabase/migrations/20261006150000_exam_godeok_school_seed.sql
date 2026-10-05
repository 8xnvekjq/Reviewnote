-- 생성: python scripts/exam/import_school.py
-- 기존 내신 스키마·RPC·RLS를 그대로 사용. 검토 전 비공개, 정확한 시행일 없음.
begin;
insert into public.exam_papers (id, title, exam_date, source, subject, school_grade, time_limit_minutes, electives, grade_cuts, published, kind, school_name, year, grade, semester, exam_term, question_count, max_score)
values ('2025-godeok-m3-s2-final', '2025 고덕중 3학년 2학기 기말 중3-2', null, '고덕중', '중3-2', '중3', 45, '{}'::text[], null, false, 'school', '고덕중', 2025, 9, 2, 'final', 26, 100) on conflict do nothing;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,curriculum_grade,curriculum_chapter,answer_type,choices)
values
  ('2025-godeok-m3-s2-final', 1, 'common', '/exams/2025-godeok-m3-s2-final/q-01.png', true, 3.0, '중3-2', '삼각비', 'choice5', null),
  ('2025-godeok-m3-s2-final', 2, 'common', '/exams/2025-godeok-m3-s2-final/q-02.png', true, 3.0, '중3-2', '삼각비', 'choice5', null),
  ('2025-godeok-m3-s2-final', 3, 'common', '/exams/2025-godeok-m3-s2-final/q-03.png', true, 3.0, '중3-2', '삼각비', 'choice5', null),
  ('2025-godeok-m3-s2-final', 4, 'common', '/exams/2025-godeok-m3-s2-final/q-04.png', true, 4.0, '중3-2', '삼각비', 'choice5', null),
  ('2025-godeok-m3-s2-final', 5, 'common', '/exams/2025-godeok-m3-s2-final/q-05.png', true, 4.0, '중3-2', '삼각비', 'choice5', null),
  ('2025-godeok-m3-s2-final', 6, 'common', '/exams/2025-godeok-m3-s2-final/q-06.png', true, 4.0, '중3-2', '삼각비', 'choice5', null),
  ('2025-godeok-m3-s2-final', 7, 'common', '/exams/2025-godeok-m3-s2-final/q-07.png', true, 4.0, '중3-2', '삼각비', 'choice5', null),
  ('2025-godeok-m3-s2-final', 8, 'common', '/exams/2025-godeok-m3-s2-final/q-08.png', true, 4.0, '중3-2', '삼각비', 'choice5', null),
  ('2025-godeok-m3-s2-final', 9, 'common', '/exams/2025-godeok-m3-s2-final/q-09.png', true, 4.0, '중3-2', '삼각비', 'choice5', null),
  ('2025-godeok-m3-s2-final', 10, 'common', '/exams/2025-godeok-m3-s2-final/q-10.png', true, 4.0, '중3-2', '삼각비', 'choice5', null),
  ('2025-godeok-m3-s2-final', 11, 'common', '/exams/2025-godeok-m3-s2-final/q-11.png', true, 3.0, '중3-2', '삼각비', 'choice5', null),
  ('2025-godeok-m3-s2-final', 12, 'common', '/exams/2025-godeok-m3-s2-final/q-12.png', true, 5.0, '중3-2', '삼각비', 'choice5', null),
  ('2025-godeok-m3-s2-final', 13, 'common', '/exams/2025-godeok-m3-s2-final/q-13.png', true, 5.0, '중3-2', '삼각비', 'choice5', null),
  ('2025-godeok-m3-s2-final', 14, 'common', '/exams/2025-godeok-m3-s2-final/q-14.png', true, 3.0, '중3-2', '원과 직선', 'choice5', null),
  ('2025-godeok-m3-s2-final', 15, 'common', '/exams/2025-godeok-m3-s2-final/q-15.png', true, 4.0, '중3-2', '원과 직선', 'choice5', null),
  ('2025-godeok-m3-s2-final', 16, 'common', '/exams/2025-godeok-m3-s2-final/q-16.png', true, 4.0, '중3-2', '원주각', 'choice5', null),
  ('2025-godeok-m3-s2-final', 17, 'common', '/exams/2025-godeok-m3-s2-final/q-17.png', true, 4.0, '중3-2', '원과 직선', 'choice5', null),
  ('2025-godeok-m3-s2-final', 18, 'common', '/exams/2025-godeok-m3-s2-final/q-18.png', true, 3.0, '중3-2', '원과 직선', 'choice5', null),
  ('2025-godeok-m3-s2-final', 19, 'common', '/exams/2025-godeok-m3-s2-final/q-19.png', true, 4.0, '중3-2', '원주각', 'choice5', null),
  ('2025-godeok-m3-s2-final', 20, 'common', '/exams/2025-godeok-m3-s2-final/q-20.png', true, 4.0, '중3-2', '원과 직선', 'choice5', null),
  ('2025-godeok-m3-s2-final', 21, 'common', '/exams/2025-godeok-m3-s2-final/q-21.png', true, 3.0, '중3-2', '원주각', 'choice5', null),
  ('2025-godeok-m3-s2-final', 22, 'common', '/exams/2025-godeok-m3-s2-final/q-22.png', true, 3.0, '중3-2', '원주각', 'choice5', null),
  ('2025-godeok-m3-s2-final', 23, 'common', '/exams/2025-godeok-m3-s2-final/q-23.png', true, 4.0, '중3-2', '원주각', 'choice5', null),
  ('2025-godeok-m3-s2-final', 24, 'common', '/exams/2025-godeok-m3-s2-final/q-24.png', true, 4.0, '중3-2', '원주각', 'choice5', null),
  ('2025-godeok-m3-s2-final', 25, 'common', '/exams/2025-godeok-m3-s2-final/q-25.png', true, 5.0, '중3-2', '원주각', 'choice5', null),
  ('2025-godeok-m3-s2-final', 26, 'common', '/exams/2025-godeok-m3-s2-final/q-26.png', true, 5.0, '중3-2', '원주각', 'choice5', null)
on conflict do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id, v.answer from (values
  (1, '5'),
  (2, '2'),
  (3, '4'),
  (4, '1'),
  (5, '1'),
  (6, '3'),
  (7, '4'),
  (8, '1'),
  (9, '5'),
  (10, '4'),
  (11, '4'),
  (12, '1'),
  (13, '4'),
  (14, '3'),
  (15, '3'),
  (16, '3'),
  (17, '5'),
  (18, '3'),
  (19, '2'),
  (20, '3'),
  (21, '1'),
  (22, '1'),
  (23, '4'),
  (24, '2'),
  (25, '5'),
  (26, '2')) v(number,answer) join public.exam_questions q on q.paper_id = '2025-godeok-m3-s2-final' and q.section = 'common' and q.number = v.number
on conflict do nothing;
commit;
