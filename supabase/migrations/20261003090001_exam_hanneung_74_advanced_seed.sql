begin;
insert into public.exam_papers (id, title, exam_date, source, subject, school_grade,
  time_limit_minutes, electives, grade_cuts, published, kind, year, question_count, max_score, hanneung_level)
values ('2025-hanneung-74-advanced', '2025 제74회 한국사능력검정시험 심화', '2025-05-24', '국사편찬위원회', '한국사', '전 학년',
  80, '{}'::text[], null, false, 'hanneung', 2025, 50, 100, 'advanced')
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 1, 'common', '/exams/2025-hanneung-74-advanced/q-01.jpg', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 1 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 2, 'common', '/exams/2025-hanneung-74-advanced/q-02.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 2 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 3, 'common', '/exams/2025-hanneung-74-advanced/q-03.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 3 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 4, 'common', '/exams/2025-hanneung-74-advanced/q-04.jpg', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 4 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 5, 'common', '/exams/2025-hanneung-74-advanced/q-05.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 5 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 6, 'common', '/exams/2025-hanneung-74-advanced/q-06.jpg', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 6 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 7, 'common', '/exams/2025-hanneung-74-advanced/q-07.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 7 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 8, 'common', '/exams/2025-hanneung-74-advanced/q-08.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 8 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 9, 'common', '/exams/2025-hanneung-74-advanced/q-09.jpg', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 9 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 10, 'common', '/exams/2025-hanneung-74-advanced/q-10.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 10 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 11, 'common', '/exams/2025-hanneung-74-advanced/q-11.jpg', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 11 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 12, 'common', '/exams/2025-hanneung-74-advanced/q-12.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 12 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 13, 'common', '/exams/2025-hanneung-74-advanced/q-13.jpg', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 13 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 14, 'common', '/exams/2025-hanneung-74-advanced/q-14.jpg', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 14 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 15, 'common', '/exams/2025-hanneung-74-advanced/q-15.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 15 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 16, 'common', '/exams/2025-hanneung-74-advanced/q-16.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 16 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 17, 'common', '/exams/2025-hanneung-74-advanced/q-17.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 17 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 18, 'common', '/exams/2025-hanneung-74-advanced/q-18.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 18 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 19, 'common', '/exams/2025-hanneung-74-advanced/q-19.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 19 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 20, 'common', '/exams/2025-hanneung-74-advanced/q-20.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 20 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 21, 'common', '/exams/2025-hanneung-74-advanced/q-21.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 21 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 22, 'common', '/exams/2025-hanneung-74-advanced/q-22.jpg', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 22 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 23, 'common', '/exams/2025-hanneung-74-advanced/q-23.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 23 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 24, 'common', '/exams/2025-hanneung-74-advanced/q-24.jpg', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 24 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 25, 'common', '/exams/2025-hanneung-74-advanced/q-25.jpg', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 25 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 26, 'common', '/exams/2025-hanneung-74-advanced/q-26.jpg', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 26 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 27, 'common', '/exams/2025-hanneung-74-advanced/q-27.jpg', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 27 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 28, 'common', '/exams/2025-hanneung-74-advanced/q-28.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 28 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 29, 'common', '/exams/2025-hanneung-74-advanced/q-29.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 29 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 30, 'common', '/exams/2025-hanneung-74-advanced/q-30.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 30 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 31, 'common', '/exams/2025-hanneung-74-advanced/q-31.jpg', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 31 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 32, 'common', '/exams/2025-hanneung-74-advanced/q-32.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 32 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 33, 'common', '/exams/2025-hanneung-74-advanced/q-33.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 33 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 34, 'common', '/exams/2025-hanneung-74-advanced/q-34.jpg', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 34 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 35, 'common', '/exams/2025-hanneung-74-advanced/q-35.jpg', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 35 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 36, 'common', '/exams/2025-hanneung-74-advanced/q-36.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 36 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 37, 'common', '/exams/2025-hanneung-74-advanced/q-37.jpg', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 37 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 38, 'common', '/exams/2025-hanneung-74-advanced/q-38.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 38 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 39, 'common', '/exams/2025-hanneung-74-advanced/q-39.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '2' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 39 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 40, 'common', '/exams/2025-hanneung-74-advanced/q-40.jpg', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 40 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 41, 'common', '/exams/2025-hanneung-74-advanced/q-41.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 41 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 42, 'common', '/exams/2025-hanneung-74-advanced/q-42.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 42 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 43, 'common', '/exams/2025-hanneung-74-advanced/q-43.jpg', true, 1, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '4' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 43 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 44, 'common', '/exams/2025-hanneung-74-advanced/q-44.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 44 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 45, 'common', '/exams/2025-hanneung-74-advanced/q-45.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '1' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 45 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 46, 'common', '/exams/2025-hanneung-74-advanced/q-46.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 46 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 47, 'common', '/exams/2025-hanneung-74-advanced/q-47.jpg', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '3' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 47 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 48, 'common', '/exams/2025-hanneung-74-advanced/q-48.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 48 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 49, 'common', '/exams/2025-hanneung-74-advanced/q-49.jpg', true, 2, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 49 and section = 'common'
on conflict do nothing;
insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ('2025-hanneung-74-advanced', 50, 'common', '/exams/2025-hanneung-74-advanced/q-50.jpg', true, 3, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, '5' from public.exam_questions where paper_id = '2025-hanneung-74-advanced' and number = 50 and section = 'common'
on conflict do nothing;

commit;
