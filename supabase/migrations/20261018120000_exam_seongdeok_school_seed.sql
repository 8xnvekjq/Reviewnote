-- 생성: python scripts/exam/import_school.py
-- 기존 내신 스키마·RPC·RLS를 그대로 사용. 검토 전 비공개, 정확한 시행일 없음.
begin;
insert into public.exam_papers (id, title, exam_date, source, subject, school_grade, time_limit_minutes, electives, grade_cuts, published, kind, school_name, year, grade, semester, exam_term, question_count, max_score)
values ('2025-seongdeok-m3-s2-final', '2025 성덕여중 3학년 2학기 기말 중3-2', null, '성덕여중', '중3-2', '중3', 45, '{}'::text[], null, false, 'school', '성덕여중', 2025, 9, 2, 'final', 21, 100) on conflict do nothing;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,curriculum_grade,curriculum_chapter,answer_type,choices)
values
  ('2025-seongdeok-m3-s2-final', 1, 'common', '/exams/2025-seongdeok-m3-s2-final/q-01.png', true, 4.6, '중3-2', '삼각비', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 2, 'common', '/exams/2025-seongdeok-m3-s2-final/q-02.png', true, 4.6, '중3-2', '원과 직선', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 3, 'common', '/exams/2025-seongdeok-m3-s2-final/q-03.png', true, 4.6, '중3-2', '원주각', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 4, 'common', '/exams/2025-seongdeok-m3-s2-final/q-04.png', true, 4.6, '중3-2', '원과 직선', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 5, 'common', '/exams/2025-seongdeok-m3-s2-final/q-05.png', true, 4.6, '중3-2', '원주각', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 6, 'common', '/exams/2025-seongdeok-m3-s2-final/q-06.png', true, 4.6, '중3-2', '삼각비', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 7, 'common', '/exams/2025-seongdeok-m3-s2-final/q-07.png', true, 4.7, '중3-2', '원주각', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 8, 'common', '/exams/2025-seongdeok-m3-s2-final/q-08.png', true, 4.7, '중3-2', '원주각', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 9, 'common', '/exams/2025-seongdeok-m3-s2-final/q-09.png', true, 4.7, '중3-2', '삼각비', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 10, 'common', '/exams/2025-seongdeok-m3-s2-final/q-10.png', true, 4.7, '중3-2', '원과 직선', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 11, 'common', '/exams/2025-seongdeok-m3-s2-final/q-11.png', true, 4.8, '중3-2', '원과 직선', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 12, 'common', '/exams/2025-seongdeok-m3-s2-final/q-12.png', true, 4.8, '중3-2', '삼각비', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 13, 'common', '/exams/2025-seongdeok-m3-s2-final/q-13.png', true, 4.8, '중3-2', '삼각비', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 14, 'common', '/exams/2025-seongdeok-m3-s2-final/q-14.png', true, 4.8, '중3-2', '원과 직선', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 15, 'common', '/exams/2025-seongdeok-m3-s2-final/q-15.png', true, 4.8, '중3-2', '원주각', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 16, 'common', '/exams/2025-seongdeok-m3-s2-final/q-16.png', true, 4.9, '중3-2', '원과 직선', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 17, 'common', '/exams/2025-seongdeok-m3-s2-final/q-17.png', true, 4.9, '중3-2', '삼각비', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 18, 'common', '/exams/2025-seongdeok-m3-s2-final/q-18.png', true, 4.9, '중3-2', '원주각', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 19, 'common', '/exams/2025-seongdeok-m3-s2-final/q-19.png', true, 4.9, '중3-2', '원주각', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 20, 'common', '/exams/2025-seongdeok-m3-s2-final/q-20.png', true, 5, '중3-2', '원주각', 'choice5', null),
  ('2025-seongdeok-m3-s2-final', 21, 'common', '/exams/2025-seongdeok-m3-s2-final/q-21.png', true, 5.0, '중3-2', '원주각', 'choice5', null)
on conflict do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id, v.answer from (values
  (1, '3'),
  (2, '2'),
  (3, '1'),
  (4, '3'),
  (5, '5'),
  (6, '5'),
  (7, '3'),
  (8, '3'),
  (9, '2'),
  (10, '2'),
  (11, '2'),
  (12, '1'),
  (13, '1'),
  (14, '5'),
  (15, '4'),
  (16, '4'),
  (17, '4'),
  (18, '1'),
  (19, '4'),
  (20, '5'),
  (21, '5')) v(number,answer) join public.exam_questions q on q.paper_id = '2025-seongdeok-m3-s2-final' and q.section = 'common' and q.number = v.number
on conflict do nothing;
commit;
