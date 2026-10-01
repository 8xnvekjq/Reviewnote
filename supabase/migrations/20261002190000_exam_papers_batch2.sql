-- ================================================
-- 기출문제 풀이: 시험지 5개 추가(2025학년도 9월·수능, 2026학년도 6월·9월·수능 수학)
-- ================================================
-- 생성: scratchpad 파이프라인(PDF 문항 자르기 + 정답표 + 종로학원 확정 등급컷 + EBSi 오답률 TOP15, 교차 검증).
-- 원본 데이터: src/features/exam/data/<paper>.json. 단원(curriculum_*)은 문항 글자로 추정한 값(오답노트 분류용).
-- v2 마이그레이션(20261002180000_exam_practice_v2.sql) 다음에 적용. 다시 적용해도 안전하도록 이미 있으면 건너뛴다.

-- 2025학년도 9월 모의평가 수학 (2024-09-04 시행)
insert into public.exam_papers (id, title, exam_date, source, subject, school_grade, time_limit_minutes, electives, grade_cuts, published)
values ('2025-09-math', '2025학년도 9월 모의평가 수학', '2024-09-04', '한국교육과정평가원', '수학', '고3', 100, array['확률과 통계', '미적분', '기하']::text[],
  '{"source":"종로학원 확정 등급컷 — 원점수는 추정, 표준점수·백분위는 평가원 채점 결과 기준. https://b.jongro.co.kr/exam/ex240904/go3_cut.asp","rawByElective":{"확률과 통계":[94,90,79,63,45,23,14,7],"미적분":[92,88,77,61,43,20,11,4],"기하":[91,87,76,60,43,21,12,6]},"standard":[130,127,119,108,95,79,73,68],"percentile":[95,91,78,60,40,23,11,3],"standardByElective":{"확률과 통계":[130,127,119,108,95,79,73,68],"미적분":[130,127,119,108,95,79,73,68],"기하":[130,127,119,108,95,79,73,68]},"percentileByElective":{"확률과 통계":[95,91,78,60,40,23,11,3],"미적분":[95,91,78,60,40,23,11,3],"기하":[95,91,78,60,40,23,11,3]},"topByElective":{"확률과 통계":{"standard":134,"percentile":99},"미적분":{"standard":135,"percentile":99},"기하":{"standard":136,"percentile":100}}}'::jsonb, true)
on conflict (id) do nothing;

insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, curriculum_grade, curriculum_chapter)
values
  ('2025-09-math', 1, 'common', '/exams/2025-09-math/c-01.png', true, 2, '대수', '지수와 로그'),
  ('2025-09-math', 2, 'common', '/exams/2025-09-math/c-02.png', true, 2, '미적분Ⅰ', '함수의 극한'),
  ('2025-09-math', 3, 'common', '/exams/2025-09-math/c-03.png', true, 3, '대수', '등차수열과 등비수열'),
  ('2025-09-math', 4, 'common', '/exams/2025-09-math/c-04.png', true, 3, '미적분Ⅰ', '함수의 극한'),
  ('2025-09-math', 5, 'common', '/exams/2025-09-math/c-05.png', true, 3, '미적분Ⅰ', '미분계수와 도함수'),
  ('2025-09-math', 6, 'common', '/exams/2025-09-math/c-06.png', true, 3, '대수', '삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)'),
  ('2025-09-math', 7, 'common', '/exams/2025-09-math/c-07.png', true, 3, '미적분Ⅰ', '함수의 연속'),
  ('2025-09-math', 8, 'common', '/exams/2025-09-math/c-08.png', true, 3, '대수', '지수와 로그'),
  ('2025-09-math', 9, 'common', '/exams/2025-09-math/c-09.png', true, 4, '미적분Ⅰ', '극대·극소와 그래프'),
  ('2025-09-math', 10, 'common', '/exams/2025-09-math/c-10.png', true, 4, '대수', '삼각함수의 활용 (사인법칙, 코사인법칙 등)'),
  ('2025-09-math', 11, 'common', '/exams/2025-09-math/c-11.png', true, 4, '미적분Ⅰ', '정적분의 활용'),
  ('2025-09-math', 12, 'common', '/exams/2025-09-math/c-12.png', true, 4, '대수', '등차수열과 등비수열'),
  ('2025-09-math', 13, 'common', '/exams/2025-09-math/c-13.png', true, 4, '미적분Ⅰ', '정적분의 활용'),
  ('2025-09-math', 14, 'common', '/exams/2025-09-math/c-14.png', true, 4, '대수', '지수함수와 로그함수'),
  ('2025-09-math', 15, 'common', '/exams/2025-09-math/c-15.png', true, 4, '미적분Ⅰ', '미분계수와 도함수'),
  ('2025-09-math', 16, 'common', '/exams/2025-09-math/c-16.png', false, 3, '대수', '지수와 로그'),
  ('2025-09-math', 17, 'common', '/exams/2025-09-math/c-17.png', false, 3, '미적분Ⅰ', '미분계수와 도함수'),
  ('2025-09-math', 18, 'common', '/exams/2025-09-math/c-18.png', false, 3, '대수', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'),
  ('2025-09-math', 19, 'common', '/exams/2025-09-math/c-19.png', false, 3, '미적분Ⅰ', '극대·극소와 그래프'),
  ('2025-09-math', 20, 'common', '/exams/2025-09-math/c-20.png', false, 4, '대수', '삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)'),
  ('2025-09-math', 21, 'common', '/exams/2025-09-math/c-21.png', false, 4, '미적분Ⅰ', '미분계수와 도함수'),
  ('2025-09-math', 22, 'common', '/exams/2025-09-math/c-22.png', false, 4, '대수', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'),
  ('2025-09-math', 23, '확률과 통계', '/exams/2025-09-math/prob-23.png', true, 2, '확률과 통계', '여러 가지 순열과 조합'),
  ('2025-09-math', 24, '확률과 통계', '/exams/2025-09-math/prob-24.png', true, 3, '확률과 통계', '조건부확률'),
  ('2025-09-math', 25, '확률과 통계', '/exams/2025-09-math/prob-25.png', true, 3, '확률과 통계', '확률의 뜻과 성질'),
  ('2025-09-math', 26, '확률과 통계', '/exams/2025-09-math/prob-26.png', true, 3, '확률과 통계', '통계적 추정'),
  ('2025-09-math', 27, '확률과 통계', '/exams/2025-09-math/prob-27.png', true, 3, '확률과 통계', '확률분포'),
  ('2025-09-math', 28, '확률과 통계', '/exams/2025-09-math/prob-28.png', true, 4, '확률과 통계', '확률의 뜻과 성질'),
  ('2025-09-math', 29, '확률과 통계', '/exams/2025-09-math/prob-29.png', false, 4, '확률과 통계', '확률분포'),
  ('2025-09-math', 30, '확률과 통계', '/exams/2025-09-math/prob-30.png', false, 4, '확률과 통계', '여러 가지 순열과 조합'),
  ('2025-09-math', 23, '미적분', '/exams/2025-09-math/calc-23.png', true, 2, '미적분Ⅱ', '삼각함수의 미분'),
  ('2025-09-math', 24, '미적분', '/exams/2025-09-math/calc-24.png', true, 3, '미적분Ⅱ', '초월함수의 도함수 활용'),
  ('2025-09-math', 25, '미적분', '/exams/2025-09-math/calc-25.png', true, 3, '미적분Ⅱ', '수열의 극한'),
  ('2025-09-math', 26, '미적분', '/exams/2025-09-math/calc-26.png', true, 3, '미적분Ⅱ', '초월함수 정적분의 활용'),
  ('2025-09-math', 27, '미적분', '/exams/2025-09-math/calc-27.png', true, 3, '미적분Ⅱ', '삼각함수의 미분'),
  ('2025-09-math', 28, '미적분', '/exams/2025-09-math/calc-28.png', true, 4, '미적분Ⅱ', '여러 가지 미분법'),
  ('2025-09-math', 29, '미적분', '/exams/2025-09-math/calc-29.png', false, 4, '미적분Ⅱ', '수열의 극한'),
  ('2025-09-math', 30, '미적분', '/exams/2025-09-math/calc-30.png', false, 4, '미적분Ⅱ', '초월함수의 도함수 활용'),
  ('2025-09-math', 23, '기하', '/exams/2025-09-math/geom-23.png', true, 2, '기하', '평면벡터의 연산과 성분'),
  ('2025-09-math', 24, '기하', '/exams/2025-09-math/geom-24.png', true, 3, '기하', '이차곡선'),
  ('2025-09-math', 25, '기하', '/exams/2025-09-math/geom-25.png', true, 3, '기하', '공간도형과 공간좌표'),
  ('2025-09-math', 26, '기하', '/exams/2025-09-math/geom-26.png', true, 3, '기하', '이차곡선'),
  ('2025-09-math', 27, '기하', '/exams/2025-09-math/geom-27.png', true, 3, '기하', '공간도형과 공간좌표'),
  ('2025-09-math', 28, '기하', '/exams/2025-09-math/geom-28.png', true, 4, '기하', '공간도형과 공간좌표'),
  ('2025-09-math', 29, '기하', '/exams/2025-09-math/geom-29.png', false, 4, '기하', '이차곡선'),
  ('2025-09-math', 30, '기하', '/exams/2025-09-math/geom-30.png', false, 4, '기하', '평면벡터의 내적')
on conflict (paper_id, section, number) do nothing;

insert into public.exam_answer_keys (question_id, answer)
select eq.id, v.answer from (values (1, 'common', '2'), (2, 'common', '5'), (3, 'common', '4'), (4, 'common', '2'), (5, 'common', '2'), (6, 'common', '2'), (7, 'common', '3'), (8, 'common', '1'), (9, 'common', '5'), (10, 'common', '1'), (11, 'common', '1'), (12, 'common', '2'), (13, 'common', '4'), (14, 'common', '5'), (15, 'common', '1'), (16, 'common', '7'), (17, 'common', '5'), (18, 'common', '29'), (19, 'common', '4'), (20, 'common', '15'), (21, 'common', '31'), (22, 'common', '8'), (23, '확률과 통계', '5'), (24, '확률과 통계', '1'), (25, '확률과 통계', '5'), (26, '확률과 통계', '3'), (27, '확률과 통계', '4'), (28, '확률과 통계', '4'), (29, '확률과 통계', '994'), (30, '확률과 통계', '93'), (23, '미적분', '5'), (24, '미적분', '4'), (25, '미적분', '4'), (26, '미적분', '3'), (27, '미적분', '2'), (28, '미적분', '3'), (29, '미적분', '57'), (30, '미적분', '25'), (23, '기하', '3'), (24, '기하', '4'), (25, '기하', '5'), (26, '기하', '3'), (27, '기하', '4'), (28, '기하', '1'), (29, '기하', '63'), (30, '기하', '54')) as v(number, section, answer)
  join public.exam_questions eq on eq.paper_id = '2025-09-math' and eq.number = v.number and eq.section = v.section
on conflict (question_id) do nothing;

insert into public.exam_question_national_stats (question_id, elective, wrong_rate, choice_rates, rank, source)
select eq.id, v.elective, v.wrong_rate, v.choice_rates, v.rank, 'EBSi 역대 오답률 TOP15 (선지별 선택 비율 포함)' from (values
  (30, '확률과 통계', '확률과 통계', 92.6, null::jsonb, 1),
  (21, 'common', '확률과 통계', 89.2, null::jsonb, 2),
  (29, '확률과 통계', '확률과 통계', 86.7, null::jsonb, 3),
  (22, 'common', '확률과 통계', 84.4, null::jsonb, 4),
  (14, 'common', '확률과 통계', 68.7, '[6.9, 8.0, 30.7, 23.1, 31.3]'::jsonb, 5),
  (20, 'common', '확률과 통계', 66.1, null::jsonb, 6),
  (28, '확률과 통계', '확률과 통계', 63.5, '[8.7, 23.3, 23.4, 36.5, 8.1]'::jsonb, 7),
  (15, 'common', '확률과 통계', 58.0, '[42.0, 7.2, 22.1, 20.3, 8.5]'::jsonb, 8),
  (10, 'common', '확률과 통계', 57.3, '[42.7, 10.9, 21.4, 20.5, 4.6]'::jsonb, 9),
  (24, '확률과 통계', '확률과 통계', 49.3, '[50.7, 4.6, 27.1, 8.6, 9.0]'::jsonb, 10),
  (12, 'common', '확률과 통계', 45.6, '[5.7, 54.4, 17.7, 16.1, 6.1]'::jsonb, 11),
  (26, '확률과 통계', '확률과 통계', 43.7, '[6.0, 13.2, 56.3, 19.0, 5.5]'::jsonb, 12),
  (13, 'common', '확률과 통계', 42.3, '[6.5, 5.2, 21.9, 57.7, 8.8]'::jsonb, 13),
  (27, '확률과 통계', '확률과 통계', 41.0, '[6.6, 10.9, 15.9, 59.0, 7.6]'::jsonb, 14),
  (25, '확률과 통계', '확률과 통계', 38.5, '[4.0, 10.4, 12.9, 11.2, 61.5]'::jsonb, 15),
  (30, '미적분', '미적분', 90.5, null::jsonb, 1),
  (21, 'common', '미적분', 89.2, null::jsonb, 2),
  (22, 'common', '미적분', 84.4, null::jsonb, 3),
  (29, '미적분', '미적분', 69.2, null::jsonb, 4),
  (14, 'common', '미적분', 68.7, '[6.9, 8.0, 30.7, 23.1, 31.3]'::jsonb, 5),
  (20, 'common', '미적분', 66.1, null::jsonb, 6),
  (15, 'common', '미적분', 58.0, '[42.0, 7.2, 22.1, 20.3, 8.5]'::jsonb, 7),
  (10, 'common', '미적분', 57.3, '[42.7, 10.9, 21.4, 20.5, 4.6]'::jsonb, 8),
  (28, '미적분', '미적분', 54.4, '[19.7, 13.4, 45.6, 14.8, 6.5]'::jsonb, 9),
  (12, 'common', '미적분', 45.6, '[5.7, 54.4, 17.7, 16.1, 6.1]'::jsonb, 10),
  (13, 'common', '미적분', 42.3, '[6.5, 5.2, 21.9, 57.7, 8.8]'::jsonb, 11),
  (27, '미적분', '미적분', 37.9, '[6.0, 62.1, 19.8, 8.6, 3.6]'::jsonb, 12),
  (11, 'common', '미적분', 35.0, '[65.0, 5.9, 12.1, 11.3, 5.8]'::jsonb, 13),
  (18, 'common', '미적분', 32.0, null::jsonb, 14),
  (26, '미적분', '미적분', 31.4, '[5.3, 9.2, 68.6, 9.7, 7.2]'::jsonb, 15),
  (30, '기하', '기하', 89.8, null::jsonb, 1),
  (21, 'common', '기하', 89.2, null::jsonb, 2),
  (22, 'common', '기하', 84.4, null::jsonb, 3),
  (14, 'common', '기하', 68.7, '[6.9, 8.0, 30.7, 23.1, 31.3]'::jsonb, 4),
  (20, 'common', '기하', 66.1, null::jsonb, 5),
  (29, '기하', '기하', 62.7, null::jsonb, 6),
  (28, '기하', '기하', 61.8, '[38.2, 20.6, 17.9, 15.5, 7.9]'::jsonb, 7),
  (15, 'common', '기하', 58.0, '[42.0, 7.2, 22.1, 20.3, 8.5]'::jsonb, 8),
  (10, 'common', '기하', 57.3, '[42.7, 10.9, 21.4, 20.5, 4.6]'::jsonb, 9),
  (27, '기하', '기하', 47.1, '[14.0, 9.8, 11.9, 52.9, 11.4]'::jsonb, 10),
  (12, 'common', '기하', 45.6, '[5.7, 54.4, 17.7, 16.1, 6.1]'::jsonb, 11),
  (26, '기하', '기하', 42.3, '[9.6, 15.7, 57.7, 12.7, 4.2]'::jsonb, 12),
  (13, 'common', '기하', 42.3, '[6.5, 5.2, 21.9, 57.7, 8.8]'::jsonb, 13),
  (11, 'common', '기하', 35.0, '[65.0, 5.9, 12.1, 11.3, 5.8]'::jsonb, 14),
  (18, 'common', '기하', 32.0, null::jsonb, 15)
) as v(number, section, elective, wrong_rate, choice_rates, rank)
  join public.exam_questions eq on eq.paper_id = '2025-09-math' and eq.number = v.number and eq.section = v.section
on conflict (question_id, elective) do nothing;

-- 2025학년도 대학수학능력시험 수학 (2024-11-14 시행)
insert into public.exam_papers (id, title, exam_date, source, subject, school_grade, time_limit_minutes, electives, grade_cuts, published)
values ('2025-11-math', '2025학년도 대학수학능력시험 수학', '2024-11-14', '한국교육과정평가원', '수학', '고3', 100, array['확률과 통계', '미적분', '기하']::text[],
  '{"source":"종로학원 확정 등급컷 — 원점수는 추정, 표준점수·백분위는 평가원 채점 결과 기준. https://b.jongro.co.kr/exam/ex241114/go3_cut.asp","rawByElective":{"확률과 통계":[94,84,75,65,47,22,14,10],"미적분":[88,77,69,61,42,18,10,6],"기하":[90,79,72,63,45,22,14,10]},"standard":[131,124,117,110,96,78,72,70],"percentile":[97,90,76,59,40,23,11,5],"standardByElective":{"확률과 통계":[131,124,117,110,96,78,72,70],"미적분":[131,123,117,110,96,78,72,69],"기하":[131,123,117,110,96,78,72,69]},"percentileByElective":{"확률과 통계":[97,90,76,59,40,23,11,5],"미적분":[97,89,76,59,40,23,11,4],"기하":[97,89,76,59,40,23,11,4]},"topByElective":{"확률과 통계":{"standard":135,"percentile":99},"미적분":{"standard":140,"percentile":100},"기하":{"standard":139,"percentile":100}}}'::jsonb, true)
on conflict (id) do nothing;

insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, curriculum_grade, curriculum_chapter)
values
  ('2025-11-math', 1, 'common', '/exams/2025-11-math/c-01.png', true, 2, '대수', '지수와 로그'),
  ('2025-11-math', 2, 'common', '/exams/2025-11-math/c-02.png', true, 2, '미적분Ⅰ', '함수의 극한'),
  ('2025-11-math', 3, 'common', '/exams/2025-11-math/c-03.png', true, 3, '대수', '등차수열과 등비수열'),
  ('2025-11-math', 4, 'common', '/exams/2025-11-math/c-04.png', true, 3, '미적분Ⅰ', '함수의 연속'),
  ('2025-11-math', 5, 'common', '/exams/2025-11-math/c-05.png', true, 3, '미적분Ⅰ', '미분계수와 도함수'),
  ('2025-11-math', 6, 'common', '/exams/2025-11-math/c-06.png', true, 3, '대수', '삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)'),
  ('2025-11-math', 7, 'common', '/exams/2025-11-math/c-07.png', true, 3, '미적분Ⅰ', '미분계수와 도함수'),
  ('2025-11-math', 8, 'common', '/exams/2025-11-math/c-08.png', true, 3, '대수', '지수와 로그'),
  ('2025-11-math', 9, 'common', '/exams/2025-11-math/c-09.png', true, 4, '미적분Ⅰ', '극대·극소와 그래프'),
  ('2025-11-math', 10, 'common', '/exams/2025-11-math/c-10.png', true, 4, '대수', '삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)'),
  ('2025-11-math', 11, 'common', '/exams/2025-11-math/c-11.png', true, 4, '미적분Ⅰ', '정적분의 활용'),
  ('2025-11-math', 12, 'common', '/exams/2025-11-math/c-12.png', true, 4, '대수', '등차수열과 등비수열'),
  ('2025-11-math', 13, 'common', '/exams/2025-11-math/c-13.png', true, 4, '미적분Ⅰ', '정적분의 활용'),
  ('2025-11-math', 14, 'common', '/exams/2025-11-math/c-14.png', true, 4, '대수', '삼각함수의 활용 (사인법칙, 코사인법칙 등)'),
  ('2025-11-math', 15, 'common', '/exams/2025-11-math/c-15.png', true, 4, '미적분Ⅰ', '미분계수와 도함수'),
  ('2025-11-math', 16, 'common', '/exams/2025-11-math/c-16.png', false, 3, '대수', '지수와 로그'),
  ('2025-11-math', 17, 'common', '/exams/2025-11-math/c-17.png', false, 3, '미적분Ⅰ', '미분계수와 도함수'),
  ('2025-11-math', 18, 'common', '/exams/2025-11-math/c-18.png', false, 3, '대수', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'),
  ('2025-11-math', 19, 'common', '/exams/2025-11-math/c-19.png', false, 3, '미적분Ⅰ', '극대·극소와 그래프'),
  ('2025-11-math', 20, 'common', '/exams/2025-11-math/c-20.png', false, 4, '미적분Ⅰ', '극대·극소와 그래프'),
  ('2025-11-math', 21, 'common', '/exams/2025-11-math/c-21.png', false, 4, '미적분Ⅰ', '극대·극소와 그래프'),
  ('2025-11-math', 22, 'common', '/exams/2025-11-math/c-22.png', false, 4, '대수', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'),
  ('2025-11-math', 23, '확률과 통계', '/exams/2025-11-math/prob-23.png', true, 2, '확률과 통계', '이항정리'),
  ('2025-11-math', 24, '확률과 통계', '/exams/2025-11-math/prob-24.png', true, 3, '확률과 통계', '확률의 뜻과 성질'),
  ('2025-11-math', 25, '확률과 통계', '/exams/2025-11-math/prob-25.png', true, 3, '확률과 통계', '통계적 추정'),
  ('2025-11-math', 26, '확률과 통계', '/exams/2025-11-math/prob-26.png', true, 3, '확률과 통계', '확률의 뜻과 성질'),
  ('2025-11-math', 27, '확률과 통계', '/exams/2025-11-math/prob-27.png', true, 3, '확률과 통계', '확률분포'),
  ('2025-11-math', 28, '확률과 통계', '/exams/2025-11-math/prob-28.png', true, 4, '확률과 통계', '여러 가지 순열과 조합'),
  ('2025-11-math', 29, '확률과 통계', '/exams/2025-11-math/prob-29.png', false, 4, '확률과 통계', '확률분포'),
  ('2025-11-math', 30, '확률과 통계', '/exams/2025-11-math/prob-30.png', false, 4, '확률과 통계', '확률의 뜻과 성질'),
  ('2025-11-math', 23, '미적분', '/exams/2025-11-math/calc-23.png', true, 2, '미적분Ⅱ', '삼각함수의 미분'),
  ('2025-11-math', 24, '미적분', '/exams/2025-11-math/calc-24.png', true, 3, '미적분Ⅱ', '지수함수와 로그함수의 미분'),
  ('2025-11-math', 25, '미적분', '/exams/2025-11-math/calc-25.png', true, 3, '미적분Ⅱ', '수열의 극한'),
  ('2025-11-math', 26, '미적분', '/exams/2025-11-math/calc-26.png', true, 3, '미적분Ⅱ', '초월함수 정적분의 활용'),
  ('2025-11-math', 27, '미적분', '/exams/2025-11-math/calc-27.png', true, 3, '미적분Ⅱ', '여러 가지 미분법'),
  ('2025-11-math', 28, '미적분', '/exams/2025-11-math/calc-28.png', true, 4, '미적분Ⅱ', '초월함수 정적분의 활용'),
  ('2025-11-math', 29, '미적분', '/exams/2025-11-math/calc-29.png', false, 4, '미적분Ⅱ', '수열의 극한'),
  ('2025-11-math', 30, '미적분', '/exams/2025-11-math/calc-30.png', false, 4, '미적분Ⅱ', '초월함수의 도함수 활용'),
  ('2025-11-math', 23, '기하', '/exams/2025-11-math/geom-23.png', true, 2, '기하', '평면벡터의 연산과 성분'),
  ('2025-11-math', 24, '기하', '/exams/2025-11-math/geom-24.png', true, 3, '기하', '이차곡선'),
  ('2025-11-math', 25, '기하', '/exams/2025-11-math/geom-25.png', true, 3, '기하', '공간도형과 공간좌표'),
  ('2025-11-math', 26, '기하', '/exams/2025-11-math/geom-26.png', true, 3, '기하', '이차곡선'),
  ('2025-11-math', 27, '기하', '/exams/2025-11-math/geom-27.png', true, 3, '기하', '공간도형과 공간좌표'),
  ('2025-11-math', 28, '기하', '/exams/2025-11-math/geom-28.png', true, 4, '기하', '공간도형과 공간좌표'),
  ('2025-11-math', 29, '기하', '/exams/2025-11-math/geom-29.png', false, 4, '기하', '이차곡선'),
  ('2025-11-math', 30, '기하', '/exams/2025-11-math/geom-30.png', false, 4, '기하', '평면벡터의 내적')
on conflict (paper_id, section, number) do nothing;

insert into public.exam_answer_keys (question_id, answer)
select eq.id, v.answer from (values (1, 'common', '5'), (2, 'common', '4'), (3, 'common', '5'), (4, 'common', '2'), (5, 'common', '4'), (6, 'common', '5'), (7, 'common', '3'), (8, 'common', '1'), (9, 'common', '4'), (10, 'common', '3'), (11, 'common', '2'), (12, 'common', '1'), (13, 'common', '5'), (14, 'common', '4'), (15, 'common', '2'), (16, 'common', '7'), (17, 'common', '33'), (18, 'common', '96'), (19, 'common', '41'), (20, 'common', '36'), (21, 'common', '16'), (22, 'common', '64'), (23, '확률과 통계', '5'), (24, '확률과 통계', '3'), (25, '확률과 통계', '1'), (26, '확률과 통계', '3'), (27, '확률과 통계', '3'), (28, '확률과 통계', '2'), (29, '확률과 통계', '25'), (30, '확률과 통계', '19'), (23, '미적분', '3'), (24, '미적분', '4'), (25, '미적분', '2'), (26, '미적분', '1'), (27, '미적분', '1'), (28, '미적분', '2'), (29, '미적분', '25'), (30, '미적분', '17'), (23, '기하', '3'), (24, '기하', '4'), (25, '기하', '3'), (26, '기하', '1'), (27, '기하', '1'), (28, '기하', '4'), (29, '기하', '107'), (30, '기하', '316')) as v(number, section, answer)
  join public.exam_questions eq on eq.paper_id = '2025-11-math' and eq.number = v.number and eq.section = v.section
on conflict (question_id) do nothing;

insert into public.exam_question_national_stats (question_id, elective, wrong_rate, choice_rates, rank, source)
select eq.id, v.elective, v.wrong_rate, v.choice_rates, v.rank, 'EBSi 역대 오답률 TOP15 (선지별 선택 비율 포함)' from (values
  (22, 'common', '확률과 통계', 94.4, null::jsonb, 1),
  (21, 'common', '확률과 통계', 87.6, null::jsonb, 2),
  (20, 'common', '확률과 통계', 86.4, null::jsonb, 3),
  (30, '확률과 통계', '확률과 통계', 79.8, null::jsonb, 4),
  (29, '확률과 통계', '확률과 통계', 76.8, null::jsonb, 5),
  (27, '확률과 통계', '확률과 통계', 71.4, '[6.3, 25.0, 28.6, 29.7, 10.4]'::jsonb, 6),
  (15, 'common', '확률과 통계', 63.4, '[12.8, 36.6, 25.6, 16.7, 8.2]'::jsonb, 7),
  (14, 'common', '확률과 통계', 61.8, '[10.5, 17.1, 24.8, 38.2, 9.4]'::jsonb, 8),
  (28, '확률과 통계', '확률과 통계', 57.5, '[8.6, 42.5, 16.6, 22.9, 9.4]'::jsonb, 9),
  (25, '확률과 통계', '확률과 통계', 52.1, '[47.9, 14.0, 14.0, 18.9, 5.1]'::jsonb, 10),
  (13, 'common', '확률과 통계', 46.2, '[8.3, 9.7, 16.4, 11.8, 53.8]'::jsonb, 11),
  (12, 'common', '확률과 통계', 40.7, '[59.3, 11.0, 14.3, 10.2, 5.2]'::jsonb, 12),
  (18, 'common', '확률과 통계', 36.0, null::jsonb, 13),
  (24, '확률과 통계', '확률과 통계', 35.9, '[4.2, 9.1, 64.1, 16.2, 6.3]'::jsonb, 14),
  (19, 'common', '확률과 통계', 33.1, null::jsonb, 15),
  (22, 'common', '미적분', 94.4, null::jsonb, 1),
  (21, 'common', '미적분', 87.6, null::jsonb, 2),
  (29, '미적분', '미적분', 86.7, null::jsonb, 3),
  (20, 'common', '미적분', 86.4, null::jsonb, 4),
  (30, '미적분', '미적분', 86.3, null::jsonb, 5),
  (28, '미적분', '미적분', 72.5, '[10.4, 27.5, 19.7, 15.8, 26.6]'::jsonb, 6),
  (27, '미적분', '미적분', 64.9, '[35.1, 15.0, 17.2, 13.3, 19.4]'::jsonb, 7),
  (15, 'common', '미적분', 63.4, '[12.8, 36.6, 25.6, 16.7, 8.2]'::jsonb, 8),
  (14, 'common', '미적분', 61.8, '[10.5, 17.1, 24.8, 38.2, 9.4]'::jsonb, 9),
  (13, 'common', '미적분', 46.2, '[8.3, 9.7, 16.4, 11.8, 53.8]'::jsonb, 10),
  (12, 'common', '미적분', 40.7, '[59.3, 11.0, 14.3, 10.2, 5.2]'::jsonb, 11),
  (18, 'common', '미적분', 36.0, null::jsonb, 12),
  (19, 'common', '미적분', 33.1, null::jsonb, 13),
  (26, '미적분', '미적분', 32.2, '[67.8, 7.7, 7.4, 10.5, 6.7]'::jsonb, 14),
  (6, 'common', '미적분', 32.0, '[11.7, 6.4, 5.4, 8.5, 68.0]'::jsonb, 15),
  (22, 'common', '기하', 94.4, null::jsonb, 1),
  (30, '기하', '기하', 91.2, null::jsonb, 2),
  (21, 'common', '기하', 87.6, null::jsonb, 3),
  (20, 'common', '기하', 86.4, null::jsonb, 4),
  (28, '기하', '기하', 63.6, '[9.0, 24.2, 10.6, 36.4, 19.8]'::jsonb, 5),
  (15, 'common', '기하', 63.4, '[12.8, 36.6, 25.6, 16.7, 8.2]'::jsonb, 6),
  (29, '기하', '기하', 62.4, null::jsonb, 7),
  (14, 'common', '기하', 61.8, '[10.5, 17.1, 24.8, 38.2, 9.4]'::jsonb, 8),
  (27, '기하', '기하', 57.7, '[42.3, 21.1, 12.6, 11.8, 12.3]'::jsonb, 9),
  (13, 'common', '기하', 46.2, '[8.3, 9.7, 16.4, 11.8, 53.8]'::jsonb, 10),
  (26, '기하', '기하', 43.8, '[56.2, 19.9, 8.0, 8.2, 7.7]'::jsonb, 11),
  (12, 'common', '기하', 40.7, '[59.3, 11.0, 14.3, 10.2, 5.2]'::jsonb, 12),
  (18, 'common', '기하', 36.0, null::jsonb, 13),
  (19, 'common', '기하', 33.1, null::jsonb, 14),
  (6, 'common', '기하', 32.0, '[11.7, 6.4, 5.4, 8.5, 68.0]'::jsonb, 15)
) as v(number, section, elective, wrong_rate, choice_rates, rank)
  join public.exam_questions eq on eq.paper_id = '2025-11-math' and eq.number = v.number and eq.section = v.section
on conflict (question_id, elective) do nothing;

-- 2026학년도 6월 모의평가 수학 (2025-06-04 시행)
insert into public.exam_papers (id, title, exam_date, source, subject, school_grade, time_limit_minutes, electives, grade_cuts, published)
values ('2026-06-math', '2026학년도 6월 모의평가 수학', '2025-06-04', '한국교육과정평가원', '수학', '고3', 100, array['확률과 통계', '미적분', '기하']::text[],
  '{"source":"종로학원 확정 등급컷 — 원점수는 추정, 표준점수·백분위는 평가원 채점 결과 기준. https://b.jongro.co.kr/exam/ex250604/go3_cut.asp","rawByElective":{"확률과 통계":[92,83,76,62,39,18,11,10],"미적분":[84,75,69,56,34,13,6,5],"기하":[86,78,72,58,36,17,9,8]},"standard":[130,124,119,109,93,78,73,72],"percentile":[96,87,78,60,40,23,11,8],"standardByElective":{"확률과 통계":[130,124,119,109,93,78,73,72],"미적분":[130,124,119,109,93,78,73,72],"기하":[130,124,119,109,93,78,73,72]},"percentileByElective":{"확률과 통계":[96,87,78,60,40,23,11,8],"미적분":[96,87,78,60,40,23,11,8],"기하":[96,87,78,60,40,23,11,8]},"topByElective":{"확률과 통계":{"standard":136,"percentile":99},"미적분":{"standard":143,"percentile":100},"기하":{"standard":140,"percentile":100}}}'::jsonb, true)
on conflict (id) do nothing;

insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, curriculum_grade, curriculum_chapter)
values
  ('2026-06-math', 1, 'common', '/exams/2026-06-math/c-01.png', true, 2, '대수', '지수와 로그'),
  ('2026-06-math', 2, 'common', '/exams/2026-06-math/c-02.png', true, 2, '미적분Ⅰ', '함수의 극한'),
  ('2026-06-math', 3, 'common', '/exams/2026-06-math/c-03.png', true, 3, '대수', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'),
  ('2026-06-math', 4, 'common', '/exams/2026-06-math/c-04.png', true, 3, '미적분Ⅰ', '함수의 연속'),
  ('2026-06-math', 5, 'common', '/exams/2026-06-math/c-05.png', true, 3, '미적분Ⅰ', '극대·극소와 그래프'),
  ('2026-06-math', 6, 'common', '/exams/2026-06-math/c-06.png', true, 3, '대수', '삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)'),
  ('2026-06-math', 7, 'common', '/exams/2026-06-math/c-07.png', true, 3, '미적분Ⅰ', '미분계수와 도함수'),
  ('2026-06-math', 8, 'common', '/exams/2026-06-math/c-08.png', true, 3, '대수', '삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)'),
  ('2026-06-math', 9, 'common', '/exams/2026-06-math/c-09.png', true, 4, '미적분Ⅰ', '극대·극소와 그래프'),
  ('2026-06-math', 10, 'common', '/exams/2026-06-math/c-10.png', true, 4, '대수', '삼각함수의 활용 (사인법칙, 코사인법칙 등)'),
  ('2026-06-math', 11, 'common', '/exams/2026-06-math/c-11.png', true, 4, '미적분Ⅰ', '정적분의 활용'),
  ('2026-06-math', 12, 'common', '/exams/2026-06-math/c-12.png', true, 4, '대수', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'),
  ('2026-06-math', 13, 'common', '/exams/2026-06-math/c-13.png', true, 4, '미적분Ⅰ', '정적분의 활용'),
  ('2026-06-math', 14, 'common', '/exams/2026-06-math/c-14.png', true, 4, '대수', '삼각함수의 활용 (사인법칙, 코사인법칙 등)'),
  ('2026-06-math', 15, 'common', '/exams/2026-06-math/c-15.png', true, 4, '미적분Ⅰ', '극대·극소와 그래프'),
  ('2026-06-math', 16, 'common', '/exams/2026-06-math/c-16.png', false, 3, '대수', '지수와 로그'),
  ('2026-06-math', 17, 'common', '/exams/2026-06-math/c-17.png', false, 3, '미적분Ⅰ', '미분계수와 도함수'),
  ('2026-06-math', 18, 'common', '/exams/2026-06-math/c-18.png', false, 3, '미적분Ⅰ', '극대·극소와 그래프'),
  ('2026-06-math', 19, 'common', '/exams/2026-06-math/c-19.png', false, 3, '미적분Ⅰ', '극대·극소와 그래프'),
  ('2026-06-math', 20, 'common', '/exams/2026-06-math/c-20.png', false, 4, '대수', '등차수열과 등비수열'),
  ('2026-06-math', 21, 'common', '/exams/2026-06-math/c-21.png', false, 4, '미적분Ⅰ', '함수의 극한'),
  ('2026-06-math', 22, 'common', '/exams/2026-06-math/c-22.png', false, 4, '대수', '삼각함수의 활용 (사인법칙, 코사인법칙 등)'),
  ('2026-06-math', 23, '확률과 통계', '/exams/2026-06-math/prob-23.png', true, 2, '확률과 통계', '여러 가지 순열과 조합'),
  ('2026-06-math', 24, '확률과 통계', '/exams/2026-06-math/prob-24.png', true, 3, '확률과 통계', '확률의 뜻과 성질'),
  ('2026-06-math', 25, '확률과 통계', '/exams/2026-06-math/prob-25.png', true, 3, '확률과 통계', '이항정리'),
  ('2026-06-math', 26, '확률과 통계', '/exams/2026-06-math/prob-26.png', true, 3, '확률과 통계', '확률의 뜻과 성질'),
  ('2026-06-math', 27, '확률과 통계', '/exams/2026-06-math/prob-27.png', true, 3, '확률과 통계', '여러 가지 순열과 조합'),
  ('2026-06-math', 28, '확률과 통계', '/exams/2026-06-math/prob-28.png', true, 4, '확률과 통계', '확률의 뜻과 성질'),
  ('2026-06-math', 29, '확률과 통계', '/exams/2026-06-math/prob-29.png', false, 4, '확률과 통계', '확률의 뜻과 성질'),
  ('2026-06-math', 30, '확률과 통계', '/exams/2026-06-math/prob-30.png', false, 4, '확률과 통계', '여러 가지 순열과 조합'),
  ('2026-06-math', 23, '미적분', '/exams/2026-06-math/calc-23.png', true, 2, '미적분Ⅱ', '수열의 극한'),
  ('2026-06-math', 24, '미적분', '/exams/2026-06-math/calc-24.png', true, 3, '미적분Ⅱ', '초월함수의 도함수 활용'),
  ('2026-06-math', 25, '미적분', '/exams/2026-06-math/calc-25.png', true, 3, '미적분Ⅱ', '급수'),
  ('2026-06-math', 26, '미적분', '/exams/2026-06-math/calc-26.png', true, 3, '미적분Ⅱ', '여러 가지 미분법'),
  ('2026-06-math', 27, '미적분', '/exams/2026-06-math/calc-27.png', true, 3, '미적분Ⅱ', '초월함수 정적분의 활용'),
  ('2026-06-math', 28, '미적분', '/exams/2026-06-math/calc-28.png', true, 4, '미적분Ⅱ', '지수함수와 로그함수의 미분'),
  ('2026-06-math', 29, '미적분', '/exams/2026-06-math/calc-29.png', false, 4, '미적분Ⅱ', '삼각함수의 미분'),
  ('2026-06-math', 30, '미적분', '/exams/2026-06-math/calc-30.png', false, 4, '미적분Ⅱ', '초월함수의 도함수 활용'),
  ('2026-06-math', 23, '기하', '/exams/2026-06-math/geom-23.png', true, 2, '기하', '평면벡터의 연산과 성분'),
  ('2026-06-math', 24, '기하', '/exams/2026-06-math/geom-24.png', true, 3, '기하', '이차곡선'),
  ('2026-06-math', 25, '기하', '/exams/2026-06-math/geom-25.png', true, 3, '기하', '평면벡터의 연산과 성분'),
  ('2026-06-math', 26, '기하', '/exams/2026-06-math/geom-26.png', true, 3, '기하', '이차곡선'),
  ('2026-06-math', 27, '기하', '/exams/2026-06-math/geom-27.png', true, 3, '기하', '평면벡터의 내적'),
  ('2026-06-math', 28, '기하', '/exams/2026-06-math/geom-28.png', true, 4, '기하', '이차곡선'),
  ('2026-06-math', 29, '기하', '/exams/2026-06-math/geom-29.png', false, 4, '기하', '이차곡선'),
  ('2026-06-math', 30, '기하', '/exams/2026-06-math/geom-30.png', false, 4, '기하', '평면벡터의 내적')
on conflict (paper_id, section, number) do nothing;

insert into public.exam_answer_keys (question_id, answer)
select eq.id, v.answer from (values (1, 'common', '2'), (2, 'common', '1'), (3, 'common', '3'), (4, 'common', '3'), (5, 'common', '2'), (6, 'common', '4'), (7, 'common', '5'), (8, 'common', '5'), (9, 'common', '2'), (10, 'common', '1'), (11, 'common', '5'), (12, 'common', '2'), (13, 'common', '4'), (14, 'common', '2'), (15, 'common', '1'), (16, 'common', '2'), (17, 'common', '6'), (18, 'common', '133'), (19, 'common', '8'), (20, 'common', '85'), (21, 'common', '42'), (22, 'common', '38'), (23, '확률과 통계', '3'), (24, '확률과 통계', '4'), (25, '확률과 통계', '3'), (26, '확률과 통계', '5'), (27, '확률과 통계', '1'), (28, '확률과 통계', '5'), (29, '확률과 통계', '44'), (30, '확률과 통계', '115'), (23, '미적분', '1'), (24, '미적분', '2'), (25, '미적분', '4'), (26, '미적분', '2'), (27, '미적분', '3'), (28, '미적분', '1'), (29, '미적분', '109'), (30, '미적분', '25'), (23, '기하', '2'), (24, '기하', '4'), (25, '기하', '2'), (26, '기하', '1'), (27, '기하', '3'), (28, '기하', '4'), (29, '기하', '20'), (30, '기하', '36')) as v(number, section, answer)
  join public.exam_questions eq on eq.paper_id = '2026-06-math' and eq.number = v.number and eq.section = v.section
on conflict (question_id) do nothing;

insert into public.exam_question_national_stats (question_id, elective, wrong_rate, choice_rates, rank, source)
select eq.id, v.elective, v.wrong_rate, v.choice_rates, v.rank, 'EBSi 역대 오답률 TOP15 (선지별 선택 비율 포함)' from (values
  (22, 'common', '확률과 통계', 96.9, null::jsonb, 1),
  (30, '확률과 통계', '확률과 통계', 91.5, null::jsonb, 2),
  (21, 'common', '확률과 통계', 87.8, null::jsonb, 3),
  (29, '확률과 통계', '확률과 통계', 83.6, null::jsonb, 4),
  (15, 'common', '확률과 통계', 80.6, '[19.4, 12.6, 26.6, 29.2, 12.2]'::jsonb, 5),
  (20, 'common', '확률과 통계', 73.1, null::jsonb, 6),
  (14, 'common', '확률과 통계', 60.1, '[8.0, 39.9, 21.4, 22.9, 7.8]'::jsonb, 7),
  (28, '확률과 통계', '확률과 통계', 57.8, '[7.2, 20.0, 10.7, 19.8, 42.2]'::jsonb, 8),
  (12, 'common', '확률과 통계', 47.1, '[7.1, 52.9, 12.8, 21.7, 5.4]'::jsonb, 9),
  (10, 'common', '확률과 통계', 40.2, '[59.8, 6.8, 13.6, 12.3, 7.6]'::jsonb, 10),
  (8, 'common', '확률과 통계', 40.2, '[16.1, 7.0, 5.2, 11.9, 59.8]'::jsonb, 11),
  (26, '확률과 통계', '확률과 통계', 38.7, '[13.4, 3.9, 10.2, 11.3, 61.3]'::jsonb, 12),
  (27, '확률과 통계', '확률과 통계', 36.6, '[63.4, 4.6, 8.1, 11.2, 12.7]'::jsonb, 13),
  (13, 'common', '확률과 통계', 30.4, '[5.7, 5.6, 12.2, 69.6, 6.9]'::jsonb, 14),
  (9, 'common', '확률과 통계', 30.4, '[4.6, 69.6, 9.9, 12.2, 3.8]'::jsonb, 15),
  (22, 'common', '미적분', 96.9, null::jsonb, 1),
  (30, '미적분', '미적분', 94.7, null::jsonb, 2),
  (28, '미적분', '미적분', 91.0, '[9.0, 12.0, 30.0, 17.6, 31.3]'::jsonb, 3),
  (21, 'common', '미적분', 87.8, null::jsonb, 4),
  (29, '미적분', '미적분', 85.6, null::jsonb, 5),
  (15, 'common', '미적분', 80.6, '[19.4, 12.6, 26.6, 29.2, 12.2]'::jsonb, 6),
  (20, 'common', '미적분', 73.1, null::jsonb, 7),
  (14, 'common', '미적분', 60.1, '[8.0, 39.9, 21.4, 22.9, 7.8]'::jsonb, 8),
  (12, 'common', '미적분', 47.1, '[7.1, 52.9, 12.8, 21.7, 5.4]'::jsonb, 9),
  (27, '미적분', '미적분', 41.6, '[7.7, 5.6, 58.4, 15.2, 13.1]'::jsonb, 10),
  (10, 'common', '미적분', 40.2, '[59.8, 6.8, 13.6, 12.3, 7.6]'::jsonb, 11),
  (8, 'common', '미적분', 40.2, '[16.1, 7.0, 5.2, 11.9, 59.8]'::jsonb, 12),
  (26, '미적분', '미적분', 32.0, '[3.2, 68.0, 12.1, 10.6, 6.1]'::jsonb, 13),
  (13, 'common', '미적분', 30.4, '[5.7, 5.6, 12.2, 69.6, 6.9]'::jsonb, 14),
  (9, 'common', '미적분', 30.4, '[4.6, 69.6, 9.9, 12.2, 3.8]'::jsonb, 15),
  (22, 'common', '기하', 96.9, null::jsonb, 1),
  (30, '기하', '기하', 90.8, null::jsonb, 2),
  (21, 'common', '기하', 87.8, null::jsonb, 3),
  (15, 'common', '기하', 80.6, '[19.4, 12.6, 26.6, 29.2, 12.2]'::jsonb, 4),
  (20, 'common', '기하', 73.1, null::jsonb, 5),
  (29, '기하', '기하', 69.1, null::jsonb, 6),
  (28, '기하', '기하', 61.2, '[8.5, 20.8, 16.4, 38.8, 15.5]'::jsonb, 7),
  (14, 'common', '기하', 60.1, '[8.0, 39.9, 21.4, 22.9, 7.8]'::jsonb, 8),
  (12, 'common', '기하', 47.1, '[7.1, 52.9, 12.8, 21.7, 5.4]'::jsonb, 9),
  (26, '기하', '기하', 43.2, '[56.8, 3.9, 16.6, 11.1, 11.5]'::jsonb, 10),
  (10, 'common', '기하', 40.2, '[59.8, 6.8, 13.6, 12.3, 7.6]'::jsonb, 11),
  (8, 'common', '기하', 40.2, '[16.1, 7.0, 5.2, 11.9, 59.8]'::jsonb, 12),
  (27, '기하', '기하', 39.3, '[6.9, 8.1, 60.7, 11.3, 12.9]'::jsonb, 13),
  (25, '기하', '기하', 31.6, '[2.8, 68.4, 10.4, 13.6, 4.8]'::jsonb, 14),
  (13, 'common', '기하', 30.4, '[5.7, 5.6, 12.2, 69.6, 6.9]'::jsonb, 15)
) as v(number, section, elective, wrong_rate, choice_rates, rank)
  join public.exam_questions eq on eq.paper_id = '2026-06-math' and eq.number = v.number and eq.section = v.section
on conflict (question_id, elective) do nothing;

-- 2026학년도 9월 모의평가 수학 (2025-09-03 시행)
insert into public.exam_papers (id, title, exam_date, source, subject, school_grade, time_limit_minutes, electives, grade_cuts, published)
values ('2026-09-math', '2026학년도 9월 모의평가 수학', '2025-09-03', '한국교육과정평가원', '수학', '고3', 100, array['확률과 통계', '미적분', '기하']::text[],
  '{"source":"종로학원 확정 등급컷 — 원점수는 추정, 표준점수·백분위는 평가원 채점 결과 기준. https://b.jongro.co.kr/exam/ex250903/go3_cut.asp","rawByElective":{"확률과 통계":[91,84,76,63,43,23,14],"미적분":[87,80,72,58,38,20,12],"기하":[89,80,73,60,39,21,13]},"standard":[131,125,119,109,94,79,72],"percentile":[97,90,78,60,40,23,10],"standardByElective":{"확률과 통계":[131,125,119,109,94,79,72],"미적분":[131,125,119,109,94,79,72],"기하":[131,125,119,109,94,79,72]},"percentileByElective":{"확률과 통계":[97,90,78,60,40,23,10],"미적분":[97,90,78,60,40,23,10],"기하":[97,90,78,60,40,23,10]},"topByElective":{"확률과 통계":{"standard":137,"percentile":100},"미적분":{"standard":140,"percentile":100},"기하":{"standard":140,"percentile":100}}}'::jsonb, true)
on conflict (id) do nothing;

insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, curriculum_grade, curriculum_chapter)
values
  ('2026-09-math', 1, 'common', '/exams/2026-09-math/c-01.png', true, 2, '대수', '지수와 로그'),
  ('2026-09-math', 2, 'common', '/exams/2026-09-math/c-02.png', true, 2, '미적분Ⅰ', '함수의 극한'),
  ('2026-09-math', 3, 'common', '/exams/2026-09-math/c-03.png', true, 3, '대수', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'),
  ('2026-09-math', 4, 'common', '/exams/2026-09-math/c-04.png', true, 3, '미적분Ⅰ', '함수의 극한'),
  ('2026-09-math', 5, 'common', '/exams/2026-09-math/c-05.png', true, 3, '미적분Ⅰ', '미분계수와 도함수'),
  ('2026-09-math', 6, 'common', '/exams/2026-09-math/c-06.png', true, 3, '대수', '삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)'),
  ('2026-09-math', 7, 'common', '/exams/2026-09-math/c-07.png', true, 3, '미적분Ⅰ', '접선의 방정식과 평균값 정리'),
  ('2026-09-math', 8, 'common', '/exams/2026-09-math/c-08.png', true, 3, '대수', '지수와 로그'),
  ('2026-09-math', 9, 'common', '/exams/2026-09-math/c-09.png', true, 4, '미적분Ⅰ', '부정적분과 정적분'),
  ('2026-09-math', 10, 'common', '/exams/2026-09-math/c-10.png', true, 4, '대수', '등차수열과 등비수열'),
  ('2026-09-math', 11, 'common', '/exams/2026-09-math/c-11.png', true, 4, '미적분Ⅰ', '정적분의 활용'),
  ('2026-09-math', 12, 'common', '/exams/2026-09-math/c-12.png', true, 4, '대수', '삼각함수의 활용 (사인법칙, 코사인법칙 등)'),
  ('2026-09-math', 13, 'common', '/exams/2026-09-math/c-13.png', true, 4, '미적분Ⅰ', '함수의 극한'),
  ('2026-09-math', 14, 'common', '/exams/2026-09-math/c-14.png', true, 4, '대수', '삼각함수의 활용 (사인법칙, 코사인법칙 등)'),
  ('2026-09-math', 15, 'common', '/exams/2026-09-math/c-15.png', true, 4, '미적분Ⅰ', '미분계수와 도함수'),
  ('2026-09-math', 16, 'common', '/exams/2026-09-math/c-16.png', false, 3, '대수', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'),
  ('2026-09-math', 17, 'common', '/exams/2026-09-math/c-17.png', false, 3, '미적분Ⅰ', '미분계수와 도함수'),
  ('2026-09-math', 18, 'common', '/exams/2026-09-math/c-18.png', false, 3, '대수', '등차수열과 등비수열'),
  ('2026-09-math', 19, 'common', '/exams/2026-09-math/c-19.png', false, 3, '미적분Ⅰ', '극대·극소와 그래프'),
  ('2026-09-math', 20, 'common', '/exams/2026-09-math/c-20.png', false, 4, '대수', '삼각함수의 활용 (사인법칙, 코사인법칙 등)'),
  ('2026-09-math', 21, 'common', '/exams/2026-09-math/c-21.png', false, 4, '미적분Ⅰ', '미분계수와 도함수'),
  ('2026-09-math', 22, 'common', '/exams/2026-09-math/c-22.png', false, 4, '대수', '지수함수와 로그함수'),
  ('2026-09-math', 23, '확률과 통계', '/exams/2026-09-math/prob-23.png', true, 2, '확률과 통계', '여러 가지 순열과 조합'),
  ('2026-09-math', 24, '확률과 통계', '/exams/2026-09-math/prob-24.png', true, 3, '확률과 통계', '확률의 뜻과 성질'),
  ('2026-09-math', 25, '확률과 통계', '/exams/2026-09-math/prob-25.png', true, 3, '확률과 통계', '확률의 뜻과 성질'),
  ('2026-09-math', 26, '확률과 통계', '/exams/2026-09-math/prob-26.png', true, 3, '확률과 통계', '통계적 추정'),
  ('2026-09-math', 27, '확률과 통계', '/exams/2026-09-math/prob-27.png', true, 3, '확률과 통계', '확률분포'),
  ('2026-09-math', 28, '확률과 통계', '/exams/2026-09-math/prob-28.png', true, 4, '확률과 통계', '여러 가지 순열과 조합'),
  ('2026-09-math', 29, '확률과 통계', '/exams/2026-09-math/prob-29.png', false, 4, '확률과 통계', '확률분포'),
  ('2026-09-math', 30, '확률과 통계', '/exams/2026-09-math/prob-30.png', false, 4, '확률과 통계', '확률의 뜻과 성질'),
  ('2026-09-math', 23, '미적분', '/exams/2026-09-math/calc-23.png', true, 2, '미적분Ⅱ', '수열의 극한'),
  ('2026-09-math', 24, '미적분', '/exams/2026-09-math/calc-24.png', true, 3, '미적분Ⅱ', '삼각함수의 미분'),
  ('2026-09-math', 25, '미적분', '/exams/2026-09-math/calc-25.png', true, 3, '미적분Ⅱ', '수열의 극한'),
  ('2026-09-math', 26, '미적분', '/exams/2026-09-math/calc-26.png', true, 3, '미적분Ⅱ', '초월함수 정적분의 활용'),
  ('2026-09-math', 27, '미적분', '/exams/2026-09-math/calc-27.png', true, 3, '미적분Ⅱ', '여러 가지 미분법'),
  ('2026-09-math', 28, '미적분', '/exams/2026-09-math/calc-28.png', true, 4, '미적분Ⅱ', '삼각함수의 미분'),
  ('2026-09-math', 29, '미적분', '/exams/2026-09-math/calc-29.png', false, 4, '미적분Ⅱ', '급수'),
  ('2026-09-math', 30, '미적분', '/exams/2026-09-math/calc-30.png', false, 4, '미적분Ⅱ', '지수함수와 로그함수의 미분'),
  ('2026-09-math', 23, '기하', '/exams/2026-09-math/geom-23.png', true, 2, '기하', '이차곡선'),
  ('2026-09-math', 24, '기하', '/exams/2026-09-math/geom-24.png', true, 3, '기하', '평면벡터의 내적'),
  ('2026-09-math', 25, '기하', '/exams/2026-09-math/geom-25.png', true, 3, '기하', '공간도형과 공간좌표'),
  ('2026-09-math', 26, '기하', '/exams/2026-09-math/geom-26.png', true, 3, '기하', '공간도형과 공간좌표'),
  ('2026-09-math', 27, '기하', '/exams/2026-09-math/geom-27.png', true, 3, '기하', '이차곡선'),
  ('2026-09-math', 28, '기하', '/exams/2026-09-math/geom-28.png', true, 4, '기하', '공간도형과 공간좌표'),
  ('2026-09-math', 29, '기하', '/exams/2026-09-math/geom-29.png', false, 4, '기하', '이차곡선'),
  ('2026-09-math', 30, '기하', '/exams/2026-09-math/geom-30.png', false, 4, '기하', '평면벡터의 내적')
on conflict (paper_id, section, number) do nothing;

insert into public.exam_answer_keys (question_id, answer)
select eq.id, v.answer from (values (1, 'common', '4'), (2, 'common', '4'), (3, 'common', '5'), (4, 'common', '1'), (5, 'common', '2'), (6, 'common', '5'), (7, 'common', '1'), (8, 'common', '3'), (9, 'common', '2'), (10, 'common', '3'), (11, 'common', '5'), (12, 'common', '1'), (13, 'common', '4'), (14, 'common', '3'), (15, 'common', '5'), (16, 'common', '8'), (17, 'common', '17'), (18, 'common', '30'), (19, 'common', '10'), (20, 'common', '12'), (21, 'common', '296'), (22, 'common', '73'), (23, '확률과 통계', '4'), (24, '확률과 통계', '3'), (25, '확률과 통계', '5'), (26, '확률과 통계', '2'), (27, '확률과 통계', '4'), (28, '확률과 통계', '2'), (29, '확률과 통계', '23'), (30, '확률과 통계', '80'), (23, '미적분', '1'), (24, '미적분', '4'), (25, '미적분', '2'), (26, '미적분', '1'), (27, '미적분', '1'), (28, '미적분', '2'), (29, '미적분', '91'), (30, '미적분', '31'), (23, '기하', '2'), (24, '기하', '4'), (25, '기하', '1'), (26, '기하', '1'), (27, '기하', '2'), (28, '기하', '4'), (29, '기하', '396'), (30, '기하', '69')) as v(number, section, answer)
  join public.exam_questions eq on eq.paper_id = '2026-09-math' and eq.number = v.number and eq.section = v.section
on conflict (question_id) do nothing;

insert into public.exam_question_national_stats (question_id, elective, wrong_rate, choice_rates, rank, source)
select eq.id, v.elective, v.wrong_rate, v.choice_rates, v.rank, 'EBSi 역대 오답률 TOP15 (선지별 선택 비율 포함)' from (values
  (21, 'common', '확률과 통계', 94.3, null::jsonb, 1),
  (22, 'common', '확률과 통계', 92.0, null::jsonb, 2),
  (30, '확률과 통계', '확률과 통계', 90.4, null::jsonb, 3),
  (29, '확률과 통계', '확률과 통계', 83.3, null::jsonb, 4),
  (15, 'common', '확률과 통계', 77.1, '[9.3, 20.4, 23.6, 23.9, 22.9]'::jsonb, 5),
  (28, '확률과 통계', '확률과 통계', 73.1, '[19.6, 26.9, 22.8, 20.1, 10.7]'::jsonb, 6),
  (13, 'common', '확률과 통계', 61.6, '[5.5, 15.9, 28.7, 38.4, 11.5]'::jsonb, 7),
  (27, '확률과 통계', '확률과 통계', 50.1, '[11.6, 13.2, 15.2, 49.9, 10.0]'::jsonb, 8),
  (11, 'common', '확률과 통계', 50.1, '[6.6, 28.4, 8.8, 6.3, 49.9]'::jsonb, 9),
  (20, 'common', '확률과 통계', 49.5, null::jsonb, 10),
  (12, 'common', '확률과 통계', 45.6, '[54.4, 9.9, 16.0, 12.9, 6.8]'::jsonb, 11),
  (14, 'common', '확률과 통계', 44.4, '[4.5, 11.3, 55.6, 17.9, 10.7]'::jsonb, 12),
  (9, 'common', '확률과 통계', 42.3, '[6.3, 57.7, 13.1, 11.5, 11.3]'::jsonb, 13),
  (26, '확률과 통계', '확률과 통계', 40.4, '[7.5, 59.6, 13.5, 13.2, 6.1]'::jsonb, 14),
  (6, 'common', '확률과 통계', 35.1, '[16.4, 6.1, 5.7, 6.9, 64.9]'::jsonb, 15),
  (21, 'common', '미적분', 94.3, null::jsonb, 1),
  (22, 'common', '미적분', 92.0, null::jsonb, 2),
  (30, '미적분', '미적분', 90.6, null::jsonb, 3),
  (29, '미적분', '미적분', 80.3, null::jsonb, 4),
  (28, '미적분', '미적분', 80.3, '[4.8, 19.7, 32.2, 15.9, 27.4]'::jsonb, 5),
  (15, 'common', '미적분', 77.1, '[9.3, 20.4, 23.6, 23.9, 22.9]'::jsonb, 6),
  (13, 'common', '미적분', 61.6, '[5.5, 15.9, 28.7, 38.4, 11.5]'::jsonb, 7),
  (11, 'common', '미적분', 50.1, '[6.6, 28.4, 8.8, 6.3, 49.9]'::jsonb, 8),
  (20, 'common', '미적분', 49.5, null::jsonb, 9),
  (12, 'common', '미적분', 45.6, '[54.4, 9.9, 16.0, 12.9, 6.8]'::jsonb, 10),
  (14, 'common', '미적분', 44.4, '[4.5, 11.3, 55.6, 17.9, 10.7]'::jsonb, 11),
  (27, '미적분', '미적분', 44.2, '[55.8, 7.2, 13.2, 12.7, 11.2]'::jsonb, 12),
  (9, 'common', '미적분', 42.3, '[6.3, 57.7, 13.1, 11.5, 11.3]'::jsonb, 13),
  (6, 'common', '미적분', 35.1, '[16.4, 6.1, 5.7, 6.9, 64.9]'::jsonb, 14),
  (19, 'common', '미적분', 30.8, null::jsonb, 15),
  (21, 'common', '기하', 94.3, null::jsonb, 1),
  (30, '기하', '기하', 92.7, null::jsonb, 2),
  (22, 'common', '기하', 92.0, null::jsonb, 3),
  (15, 'common', '기하', 77.1, '[9.3, 20.4, 23.6, 23.9, 22.9]'::jsonb, 4),
  (28, '기하', '기하', 74.8, '[5.5, 6.6, 29.8, 25.2, 32.9]'::jsonb, 5),
  (29, '기하', '기하', 72.2, null::jsonb, 6),
  (13, 'common', '기하', 61.6, '[5.5, 15.9, 28.7, 38.4, 11.5]'::jsonb, 7),
  (11, 'common', '기하', 50.1, '[6.6, 28.4, 8.8, 6.3, 49.9]'::jsonb, 8),
  (20, 'common', '기하', 49.5, null::jsonb, 9),
  (12, 'common', '기하', 45.6, '[54.4, 9.9, 16.0, 12.9, 6.8]'::jsonb, 10),
  (14, 'common', '기하', 44.4, '[4.5, 11.3, 55.6, 17.9, 10.7]'::jsonb, 11),
  (9, 'common', '기하', 42.3, '[6.3, 57.7, 13.1, 11.5, 11.3]'::jsonb, 12),
  (27, '기하', '기하', 39.7, '[4.9, 60.3, 16.8, 8.8, 9.3]'::jsonb, 13),
  (6, 'common', '기하', 35.1, '[16.4, 6.1, 5.7, 6.9, 64.9]'::jsonb, 14),
  (19, 'common', '기하', 30.8, null::jsonb, 15)
) as v(number, section, elective, wrong_rate, choice_rates, rank)
  join public.exam_questions eq on eq.paper_id = '2026-09-math' and eq.number = v.number and eq.section = v.section
on conflict (question_id, elective) do nothing;

-- 2026학년도 대학수학능력시험 수학 (2025-11-13 시행)
insert into public.exam_papers (id, title, exam_date, source, subject, school_grade, time_limit_minutes, electives, grade_cuts, published)
values ('2026-11-math', '2026학년도 대학수학능력시험 수학', '2025-11-13', '한국교육과정평가원', '수학', '고3', 100, array['확률과 통계', '미적분', '기하']::text[],
  '{"source":"종로학원 확정 등급컷 — 원점수는 추정, 표준점수·백분위는 평가원 채점 결과 기준. https://b.jongro.co.kr/exam/ex251113/go3_cut.asp","rawByElective":{"확률과 통계":[87,82,76,65,41,24,17,13],"미적분":[85,80,73,62,37,20,14,10],"기하":[85,81,74,63,37,20,14,10]},"standard":[128,124,119,111,92,79,74,71],"percentile":[96,88,76,60,40,23,12,5],"standardByElective":{"확률과 통계":[128,124,119,111,92,79,74,71],"미적분":[128,124,119,111,92,79,74,71],"기하":[128,124,119,111,92,79,74,71]},"percentileByElective":{"확률과 통계":[96,88,76,60,40,23,12,5],"미적분":[96,88,76,60,40,23,12,5],"기하":[96,88,76,60,40,23,12,5]},"topByElective":{"확률과 통계":{"standard":137,"percentile":100},"미적분":{"standard":139,"percentile":100},"기하":{"standard":139,"percentile":100}}}'::jsonb, true)
on conflict (id) do nothing;

insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, curriculum_grade, curriculum_chapter)
values
  ('2026-11-math', 1, 'common', '/exams/2026-11-math/c-01.png', true, 2, '대수', '지수와 로그'),
  ('2026-11-math', 2, 'common', '/exams/2026-11-math/c-02.png', true, 2, '미적분Ⅰ', '함수의 극한'),
  ('2026-11-math', 3, 'common', '/exams/2026-11-math/c-03.png', true, 3, '대수', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'),
  ('2026-11-math', 4, 'common', '/exams/2026-11-math/c-04.png', true, 3, '미적분Ⅰ', '함수의 연속'),
  ('2026-11-math', 5, 'common', '/exams/2026-11-math/c-05.png', true, 3, '미적분Ⅰ', '미분계수와 도함수'),
  ('2026-11-math', 6, 'common', '/exams/2026-11-math/c-06.png', true, 3, '대수', '지수와 로그'),
  ('2026-11-math', 7, 'common', '/exams/2026-11-math/c-07.png', true, 3, '미적분Ⅰ', '정적분의 활용'),
  ('2026-11-math', 8, 'common', '/exams/2026-11-math/c-08.png', true, 3, '대수', '삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)'),
  ('2026-11-math', 9, 'common', '/exams/2026-11-math/c-09.png', true, 4, '미적분Ⅰ', '접선의 방정식과 평균값 정리'),
  ('2026-11-math', 10, 'common', '/exams/2026-11-math/c-10.png', true, 4, '대수', '삼각함수의 활용 (사인법칙, 코사인법칙 등)'),
  ('2026-11-math', 11, 'common', '/exams/2026-11-math/c-11.png', true, 4, '미적분Ⅰ', '정적분의 활용'),
  ('2026-11-math', 12, 'common', '/exams/2026-11-math/c-12.png', true, 4, '대수', '등차수열과 등비수열'),
  ('2026-11-math', 13, 'common', '/exams/2026-11-math/c-13.png', true, 4, '미적분Ⅰ', '정적분의 활용'),
  ('2026-11-math', 14, 'common', '/exams/2026-11-math/c-14.png', true, 4, '대수', '삼각함수의 활용 (사인법칙, 코사인법칙 등)'),
  ('2026-11-math', 15, 'common', '/exams/2026-11-math/c-15.png', true, 4, '미적분Ⅰ', '극대·극소와 그래프'),
  ('2026-11-math', 16, 'common', '/exams/2026-11-math/c-16.png', false, 3, '대수', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'),
  ('2026-11-math', 17, 'common', '/exams/2026-11-math/c-17.png', false, 3, '미적분Ⅰ', '부정적분과 정적분'),
  ('2026-11-math', 18, 'common', '/exams/2026-11-math/c-18.png', false, 3, '대수', '삼각함수의 활용 (사인법칙, 코사인법칙 등)'),
  ('2026-11-math', 19, 'common', '/exams/2026-11-math/c-19.png', false, 3, '미적분Ⅰ', '극대·극소와 그래프'),
  ('2026-11-math', 20, 'common', '/exams/2026-11-math/c-20.png', false, 4, '대수', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'),
  ('2026-11-math', 21, 'common', '/exams/2026-11-math/c-21.png', false, 4, '미적분Ⅰ', '함수의 연속'),
  ('2026-11-math', 22, 'common', '/exams/2026-11-math/c-22.png', false, 4, '대수', '지수함수와 로그함수'),
  ('2026-11-math', 23, '확률과 통계', '/exams/2026-11-math/prob-23.png', true, 2, '확률과 통계', '여러 가지 순열과 조합'),
  ('2026-11-math', 24, '확률과 통계', '/exams/2026-11-math/prob-24.png', true, 3, '확률과 통계', '확률의 뜻과 성질'),
  ('2026-11-math', 25, '확률과 통계', '/exams/2026-11-math/prob-25.png', true, 3, '확률과 통계', '확률의 뜻과 성질'),
  ('2026-11-math', 26, '확률과 통계', '/exams/2026-11-math/prob-26.png', true, 3, '확률과 통계', '통계적 추정'),
  ('2026-11-math', 27, '확률과 통계', '/exams/2026-11-math/prob-27.png', true, 3, '확률과 통계', '확률분포'),
  ('2026-11-math', 28, '확률과 통계', '/exams/2026-11-math/prob-28.png', true, 4, '확률과 통계', '확률의 뜻과 성질'),
  ('2026-11-math', 29, '확률과 통계', '/exams/2026-11-math/prob-29.png', false, 4, '확률과 통계', '확률분포'),
  ('2026-11-math', 30, '확률과 통계', '/exams/2026-11-math/prob-30.png', false, 4, '확률과 통계', '여러 가지 순열과 조합'),
  ('2026-11-math', 23, '미적분', '/exams/2026-11-math/calc-23.png', true, 2, '미적분Ⅱ', '삼각함수의 미분'),
  ('2026-11-math', 24, '미적분', '/exams/2026-11-math/calc-24.png', true, 3, '미적분Ⅱ', '삼각함수의 미분'),
  ('2026-11-math', 25, '미적분', '/exams/2026-11-math/calc-25.png', true, 3, '미적분Ⅱ', '수열의 극한'),
  ('2026-11-math', 26, '미적분', '/exams/2026-11-math/calc-26.png', true, 3, '미적분Ⅱ', '초월함수 정적분의 활용'),
  ('2026-11-math', 27, '미적분', '/exams/2026-11-math/calc-27.png', true, 3, '미적분Ⅱ', '여러 가지 미분법'),
  ('2026-11-math', 28, '미적분', '/exams/2026-11-math/calc-28.png', true, 4, '미적분Ⅱ', '초월함수의 도함수 활용'),
  ('2026-11-math', 29, '미적분', '/exams/2026-11-math/calc-29.png', false, 4, '미적분Ⅱ', '수열의 극한'),
  ('2026-11-math', 30, '미적분', '/exams/2026-11-math/calc-30.png', false, 4, '미적분Ⅱ', '여러 가지 미분법'),
  ('2026-11-math', 23, '기하', '/exams/2026-11-math/geom-23.png', true, 2, '기하', '평면벡터의 연산과 성분'),
  ('2026-11-math', 24, '기하', '/exams/2026-11-math/geom-24.png', true, 3, '기하', '이차곡선'),
  ('2026-11-math', 25, '기하', '/exams/2026-11-math/geom-25.png', true, 3, '기하', '공간도형과 공간좌표'),
  ('2026-11-math', 26, '기하', '/exams/2026-11-math/geom-26.png', true, 3, '기하', '이차곡선'),
  ('2026-11-math', 27, '기하', '/exams/2026-11-math/geom-27.png', true, 3, '기하', '공간도형과 공간좌표'),
  ('2026-11-math', 28, '기하', '/exams/2026-11-math/geom-28.png', true, 4, '기하', '공간도형과 공간좌표'),
  ('2026-11-math', 29, '기하', '/exams/2026-11-math/geom-29.png', false, 4, '기하', '이차곡선'),
  ('2026-11-math', 30, '기하', '/exams/2026-11-math/geom-30.png', false, 4, '기하', '평면벡터의 내적')
on conflict (paper_id, section, number) do nothing;

insert into public.exam_answer_keys (question_id, answer)
select eq.id, v.answer from (values (1, 'common', '1'), (2, 'common', '4'), (3, 'common', '5'), (4, 'common', '3'), (5, 'common', '3'), (6, 'common', '2'), (7, 'common', '5'), (8, 'common', '1'), (9, 'common', '4'), (10, 'common', '3'), (11, 'common', '3'), (12, 'common', '2'), (13, 'common', '5'), (14, 'common', '4'), (15, 'common', '4'), (16, 'common', '9'), (17, 'common', '16'), (18, 'common', '12'), (19, 'common', '15'), (20, 'common', '130'), (21, 'common', '65'), (22, 'common', '457'), (23, '확률과 통계', '3'), (24, '확률과 통계', '1'), (25, '확률과 통계', '2'), (26, '확률과 통계', '5'), (27, '확률과 통계', '4'), (28, '확률과 통계', '2'), (29, '확률과 통계', '977'), (30, '확률과 통계', '262'), (23, '미적분', '3'), (24, '미적분', '4'), (25, '미적분', '3'), (26, '미적분', '1'), (27, '미적분', '2'), (28, '미적분', '5'), (29, '미적분', '97'), (30, '미적분', '11'), (23, '기하', '3'), (24, '기하', '1'), (25, '기하', '5'), (26, '기하', '2'), (27, '기하', '4'), (28, '기하', '4'), (29, '기하', '360'), (30, '기하', '221')) as v(number, section, answer)
  join public.exam_questions eq on eq.paper_id = '2026-11-math' and eq.number = v.number and eq.section = v.section
on conflict (question_id) do nothing;

insert into public.exam_question_national_stats (question_id, elective, wrong_rate, choice_rates, rank, source)
select eq.id, v.elective, v.wrong_rate, v.choice_rates, v.rank, 'EBSi 역대 오답률 TOP15 (선지별 선택 비율 포함)' from (values
  (30, '확률과 통계', '확률과 통계', 98.5, null::jsonb, 1),
  (21, 'common', '확률과 통계', 97.6, null::jsonb, 2),
  (22, 'common', '확률과 통계', 96.7, null::jsonb, 3),
  (29, '확률과 통계', '확률과 통계', 81.3, null::jsonb, 4),
  (20, 'common', '확률과 통계', 70.1, null::jsonb, 5),
  (28, '확률과 통계', '확률과 통계', 69.4, '[9.8, 30.6, 15.2, 28.6, 15.8]'::jsonb, 6),
  (15, 'common', '확률과 통계', 61.9, '[14.8, 23.7, 12.4, 38.1, 11.1]'::jsonb, 7),
  (14, 'common', '확률과 통계', 53.0, '[12.4, 14.5, 14.6, 47.0, 11.5]'::jsonb, 8),
  (19, 'common', '확률과 통계', 51.3, null::jsonb, 9),
  (11, 'common', '확률과 통계', 50.0, '[16.8, 13.4, 50.0, 8.6, 11.2]'::jsonb, 10),
  (26, '확률과 통계', '확률과 통계', 47.6, '[5.1, 11.1, 11.8, 19.6, 52.4]'::jsonb, 11),
  (24, '확률과 통계', '확률과 통계', 44.8, '[55.2, 9.5, 12.0, 17.6, 5.7]'::jsonb, 12),
  (13, 'common', '확률과 통계', 42.6, '[5.2, 9.4, 9.7, 18.3, 57.4]'::jsonb, 13),
  (27, '확률과 통계', '확률과 통계', 39.1, '[7.7, 10.1, 11.0, 60.9, 10.3]'::jsonb, 14),
  (10, 'common', '확률과 통계', 38.9, '[4.4, 11.4, 61.1, 16.2, 6.8]'::jsonb, 15),
  (21, 'common', '미적분', 97.6, null::jsonb, 1),
  (30, '미적분', '미적분', 96.9, null::jsonb, 2),
  (22, 'common', '미적분', 96.7, null::jsonb, 3),
  (29, '미적분', '미적분', 81.6, null::jsonb, 4),
  (28, '미적분', '미적분', 72.0, '[10.5, 33.7, 8.5, 19.3, 28.0]'::jsonb, 5),
  (20, 'common', '미적분', 70.1, null::jsonb, 6),
  (15, 'common', '미적분', 61.9, '[14.8, 23.7, 12.4, 38.1, 11.1]'::jsonb, 7),
  (14, 'common', '미적분', 53.0, '[12.4, 14.5, 14.6, 47.0, 11.5]'::jsonb, 8),
  (19, 'common', '미적분', 51.3, null::jsonb, 9),
  (11, 'common', '미적분', 50.0, '[16.8, 13.4, 50.0, 8.6, 11.2]'::jsonb, 10),
  (13, 'common', '미적분', 42.6, '[5.2, 9.4, 9.7, 18.3, 57.4]'::jsonb, 11),
  (10, 'common', '미적분', 38.9, '[4.4, 11.4, 61.1, 16.2, 6.8]'::jsonb, 12),
  (18, 'common', '미적분', 38.3, null::jsonb, 13),
  (8, 'common', '미적분', 37.0, '[63.0, 7.2, 4.9, 9.9, 15.0]'::jsonb, 14),
  (27, '미적분', '미적분', 36.8, '[6.6, 63.2, 7.6, 12.7, 10.0]'::jsonb, 15),
  (21, 'common', '기하', 97.6, null::jsonb, 1),
  (22, 'common', '기하', 96.7, null::jsonb, 2),
  (30, '기하', '기하', 96.0, null::jsonb, 3),
  (29, '기하', '기하', 86.9, null::jsonb, 4),
  (20, 'common', '기하', 70.1, null::jsonb, 5),
  (15, 'common', '기하', 61.9, '[14.8, 23.7, 12.4, 38.1, 11.1]'::jsonb, 6),
  (28, '기하', '기하', 58.1, '[11.4, 22.5, 10.1, 41.9, 14.1]'::jsonb, 7),
  (14, 'common', '기하', 53.0, '[12.4, 14.5, 14.6, 47.0, 11.5]'::jsonb, 8),
  (19, 'common', '기하', 51.3, null::jsonb, 9),
  (11, 'common', '기하', 50.0, '[16.8, 13.4, 50.0, 8.6, 11.2]'::jsonb, 10),
  (13, 'common', '기하', 42.6, '[5.2, 9.4, 9.7, 18.3, 57.4]'::jsonb, 11),
  (10, 'common', '기하', 38.9, '[4.4, 11.4, 61.1, 16.2, 6.8]'::jsonb, 12),
  (18, 'common', '기하', 38.3, null::jsonb, 13),
  (8, 'common', '기하', 37.0, '[63.0, 7.2, 4.9, 9.9, 15.0]'::jsonb, 14),
  (27, '기하', '기하', 36.6, '[5.0, 10.1, 15.4, 63.4, 6.0]'::jsonb, 15)
) as v(number, section, elective, wrong_rate, choice_rates, rank)
  join public.exam_questions eq on eq.paper_id = '2026-11-math' and eq.number = v.number and eq.section = v.section
on conflict (question_id, elective) do nothing;

