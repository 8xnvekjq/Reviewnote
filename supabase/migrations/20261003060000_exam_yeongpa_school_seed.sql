-- 생성: python scripts/exam/build_yeongpa_migration.py
-- 기존 내신 스키마·RPC·RLS를 그대로 사용. 검토 전 비공개, 정확한 시행일 없음.
begin;
insert into public.exam_papers (id, title, exam_date, source, subject, school_grade, time_limit_minutes, electives, grade_cuts, published, kind, school_name, year, grade, semester, exam_term, question_count, max_score)
values ('2024-yeongpa-g2-s2-mid-calc1', '2024 영파여고 2학년 2학기 중간 미적분1', null, '영파여고', '미적분1', '고2', 50, '{}'::text[], null, false, 'school', '영파여고', 2024, 2, 2, 'mid', 21, 100) on conflict do nothing;
insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,curriculum_grade,curriculum_chapter,answer_type,choices)
values
  ('2024-yeongpa-g2-s2-mid-calc1', 1, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-01.png', true, 2.8, '미적분Ⅰ', '함수의 극한', 'choice5', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 2, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-02.png', true, 2.8, '미적분Ⅰ', '미분계수와 도함수', 'choice5', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 3, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-03.png', true, 2.8, '미적분Ⅰ', '미분계수와 도함수', 'choice5', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 4, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-04.png', true, 3.2, '미적분Ⅰ', '함수의 극한', 'choice5', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 5, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-05.png', true, 3.2, '미적분Ⅰ', '함수의 극한', 'choice5', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 6, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-06.png', true, 3.6, '미적분Ⅰ', '함수의 극한', 'choice5', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 7, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-07.png', true, 3.6, '미적분Ⅰ', '극대·극소와 그래프', 'choice5', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 8, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-08.png', true, 4, '미적분Ⅰ', '함수의 연속', 'choice5', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 9, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-09.png', true, 4, '미적분Ⅰ', '함수의 극한', 'choice5', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 10, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-10.png', true, 4.4, '미적분Ⅰ', '미분계수와 도함수', 'choice5', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 11, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-11.png', true, 4.4, '미적분Ⅰ', '함수의 극한', 'choice5', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 12, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-12.png', true, 4.4, '미적분Ⅰ', '접선의 방정식과 평균값 정리', 'choice5', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 13, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-13.png', true, 4.8, '미적분Ⅰ', '미분계수와 도함수', 'choice5', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 14, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-14.png', true, 4.8, '미적분Ⅰ', '미분계수와 도함수', 'choice5', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 15, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-15.png', true, 5.2, '미적분Ⅰ', '함수의 연속', 'choice5', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 16, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-16.png', true, 5.6, '미적분Ⅰ', '함수의 연속', 'choice5', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 17, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-17.png', true, 6.0, '미적분Ⅰ', '미분계수와 도함수', 'choice5', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 18, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-18.png', true, 6.4, '미적분Ⅰ', '함수의 극한', 'choice5', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 19, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-19.png', true, 7.6, '미적분Ⅰ', '함수의 극한', 'choice10', '["\\begin{cases}2 & (t>1)\\\\1 & (t=1)\\\\0 & (-2\\le t<1)\\\\0 & (t<-2)\\end{cases}", "\\begin{cases}2 & (t>1)\\\\1 & (t=1)\\\\0 & (-3\\le t<1)\\\\1 & (t<-3)\\end{cases}", "\\begin{cases}2 & (t>1)\\\\1 & (t=1)\\\\0 & (-2\\le t<1)\\\\2 & (t<-2)\\end{cases}", "\\begin{cases}2 & (t>2)\\\\1 & (1\\le t\\le2)\\\\0 & (-2\\le t<1)\\\\1 & (t<-2)\\end{cases}", "\\begin{cases}1 & (t>1)\\\\1 & (t=1)\\\\0 & (-2\\le t<1)\\\\1 & (t<-2)\\end{cases}", "\\begin{cases}2 & (t>1)\\\\0 & (t=1)\\\\0 & (-2\\le t<1)\\\\1 & (t<-2)\\end{cases}", "\\begin{cases}2 & (t\\ge1)\\\\0 & (-2\\le t<1)\\\\1 & (t<-2)\\end{cases}", "\\begin{cases}2 & (t>1)\\\\1 & (t=1)\\\\0 & (-2<t<1)\\\\1 & (t\\le-2)\\end{cases}", "\\begin{cases}2 & (t>1)\\\\1 & (t=1)\\\\0 & (-2\\le t<1)\\\\1 & (t<-2)\\end{cases}", "\\begin{cases}2 & (t>1)\\\\2 & (t=1)\\\\0 & (-2\\le t<1)\\\\1 & (t<-2)\\end{cases}"]'::jsonb),
  ('2024-yeongpa-g2-s2-mid-calc1', 20, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-20.png', false, 4.4, '미적분Ⅰ', '함수의 연속', 'digits', null),
  ('2024-yeongpa-g2-s2-mid-calc1', 21, 'common', '/exams/2024-yeongpa-g2-s2-mid-calc1/q-21.png', true, 12, '미적분Ⅰ', '미분계수와 도함수', 'choice10', '["4x+10", "2x+14", "2x+5", "x+10", "2x+12", "2x+10", "2x+16", "2x-10", "2x", "2x+8"]'::jsonb)
on conflict do nothing;
insert into public.exam_answer_keys (question_id,answer)
select q.id, v.answer from (values
  (1, '1'),
  (2, '5'),
  (3, '3'),
  (4, '2'),
  (5, '4'),
  (6, '3'),
  (7, '2'),
  (8, '5'),
  (9, '2'),
  (10, '4'),
  (11, '1'),
  (12, '1'),
  (13, '3'),
  (14, '4'),
  (15, '5'),
  (16, '3'),
  (17, '2'),
  (18, '5'),
  (19, '9'),
  (20, '8'),
  (21, '6')) v(number,answer) join public.exam_questions q on q.paper_id = '2024-yeongpa-g2-s2-mid-calc1' and q.section = 'common' and q.number = v.number
on conflict do nothing;
commit;
