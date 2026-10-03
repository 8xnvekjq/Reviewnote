-- 생성: python scripts/exam/import_school.py
-- 기존 내신 스키마·RPC·RLS를 그대로 사용. 검토 전 비공개, 정확한 시행일 없음.
begin;
insert into public.exam_papers (id, title, exam_date, source, subject, school_grade, time_limit_minutes, electives, grade_cuts, published, kind, school_name, year, grade, semester, exam_term, question_count, max_score)
values ('2025-daedong-g1-s2-mid-common2', '2025 대동세무고 1학년 2학기 중간 공통수학2', null, '대동세무고', '공통수학2', '고1', 50, '{}'::text[], null, false, 'school', '대동세무고', 2025, 1, 2, 'mid', 22, 100) on conflict do nothing;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,curriculum_grade,curriculum_chapter,answer_type,choices)
values
  ('2025-daedong-g1-s2-mid-common2', 1, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-01.png', true, 3.8, '공통수학2', '평면좌표', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 2, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-02.png', true, 3.8, '공통수학2', '직선의 방정식', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 3, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-03.png', true, 3.8, '공통수학2', '원의 방정식', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 4, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-04.png', true, 3.8, '공통수학2', '원의 방정식', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 5, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-05.png', true, 4.3, '공통수학2', '평면좌표', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 6, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-06.png', true, 4.3, '공통수학2', '직선의 방정식', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 7, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-07.png', true, 4.3, '공통수학2', '직선의 방정식', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 8, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-08.png', true, 4.2, '공통수학2', '원의 방정식', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 9, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-09.png', true, 4.3, '공통수학2', '원의 방정식', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 10, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-10.png', true, 4.5, '공통수학2', '원의 방정식', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 11, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-11.png', true, 3.8, '공통수학2', '집합', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 12, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-12.png', true, 3.8, '공통수학2', '집합', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 13, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-13.png', true, 4.2, '공통수학2', '집합', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 14, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-14.png', true, 4.3, '공통수학2', '집합', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 15, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-15.png', true, 4.3, '공통수학2', '집합', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 16, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-16.png', true, 4.6, '공통수학2', '집합', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 17, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-17.png', true, 4.6, '공통수학2', '집합', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 18, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-18.png', true, 4.4, '공통수학2', '도형의 이동', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 19, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-19.png', true, 4.9, '공통수학2', '도형의 이동', 'choice5', null),
  ('2025-daedong-g1-s2-mid-common2', 20, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-20.png', false, 6.0, '공통수학2', '집합', 'digits', null),
  ('2025-daedong-g1-s2-mid-common2', 21, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-21.png', false, 6.0, '공통수학2', '원의 방정식', 'digits', null),
  ('2025-daedong-g1-s2-mid-common2', 22, 'common', '/exams/2025-daedong-g1-s2-mid-common2/q-22.png', true, 8.0, '공통수학2', '도형의 이동', 'choice10', '["-\\frac{1}{3}", "\\frac{2}{3}", "2", "4", "-2", "-\\frac{10}{3}", "0", "\\frac{4}{3}", "-\\frac{2}{3}", "-1"]'::jsonb)
on conflict do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id, v.answer from (values
  (1, '2'),
  (2, '1'),
  (3, '1'),
  (4, '5'),
  (5, '3'),
  (6, '1'),
  (7, '4'),
  (8, '4'),
  (9, '3'),
  (10, '3'),
  (11, '2'),
  (12, '4'),
  (13, '1'),
  (14, '4'),
  (15, '5'),
  (16, '5'),
  (17, '2'),
  (18, '2'),
  (19, '3'),
  (20, '16'),
  (21, '4'),
  (22, '9')) v(number,answer) join public.exam_questions q on q.paper_id = '2025-daedong-g1-s2-mid-common2' and q.section = 'common' and q.number = v.number
on conflict do nothing;
commit;
