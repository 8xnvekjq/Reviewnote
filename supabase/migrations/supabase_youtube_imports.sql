-- ====================================================
-- REVIEWNOTE YOUTUBE LECTURES & TIMELINES MASTER IMPORT SQL
-- Consolidated Master Import Script for YouTube Deep Links
-- ====================================================

-- ── PART 1: Initial & Batch 1~4 Lectures ──────────────────────────────
-- (All lectures and timeline records are safely guarded with ON CONFLICT DO NOTHING)

-- ── PART 2: 7/18 Batch (Lectures 1~4) ─────────────────────────────────

-- 7/18 고1 화토 공수2 (내분점과 무게중심)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('nLiVDYCzVPs', '7/18 고1 화토 공수2 (내분점과 무게중심)', '공통수학2')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1, '내분점의 정의와 개념' FROM public.youtube_lectures WHERE video_id = 'nLiVDYCzVPs' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 232, '외분점에 대한 설명' FROM public.youtube_lectures WHERE video_id = 'nLiVDYCzVPs' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 400, '좌표평면에서의 내분점' FROM public.youtube_lectures WHERE video_id = 'nLiVDYCzVPs' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 614, '필수예제 7번 (내분점 응용)' FROM public.youtube_lectures WHERE video_id = 'nLiVDYCzVPs' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 786, '내분점을 활용한 좌표 범위 구하기 (3사분면)' FROM public.youtube_lectures WHERE video_id = 'nLiVDYCzVPs' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1042, '직선 위의 내분점 문제' FROM public.youtube_lectures WHERE video_id = 'nLiVDYCzVPs' ON CONFLICT DO NOTHING;

-- 7/18 고1 화토 공수2 (내분점과 무게중심)(2)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('8_WLmDwhbgM', '7/18 고1 화토 공수2 (내분점과 무게중심)(2)', '공통수학2')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1, '선분 AB의 연장선 위 점 C 구하기 (내분점/외분점)' FROM public.youtube_lectures WHERE video_id = '8_WLmDwhbgM' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 140, '평행사변형의 성질과 D 좌표 구하기' FROM public.youtube_lectures WHERE video_id = '8_WLmDwhbgM' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 422, '삼각형의 각의 이등분선과 내분점' FROM public.youtube_lectures WHERE video_id = '8_WLmDwhbgM' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 791, '무게중심의 정의와 좌표 구하는 법' FROM public.youtube_lectures WHERE video_id = '8_WLmDwhbgM' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1003, '무게중심 좌표를 이용한 미지수 구하기' FROM public.youtube_lectures WHERE video_id = '8_WLmDwhbgM' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1064, '삼각형 내 임의의 점 P와 거리의 최솟값' FROM public.youtube_lectures WHERE video_id = '8_WLmDwhbgM' ON CONFLICT DO NOTHING;

-- 7/18 고2 수토 미적분1 (함수의 극한의 응용)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('hxLLIywuYh8', '7/18 고2 수토 미적분1 (함수의 극한의 응용)', '미적분Ⅰ')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 38, '0/0 꼴의 극한값 계산과 미정계수 결정 방법' FROM public.youtube_lectures WHERE video_id = 'hxLLIywuYh8' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 786, '극한의 성질을 이용한 미정계수 구하기 (분자 수렴/발산 조건)' FROM public.youtube_lectures WHERE video_id = 'hxLLIywuYh8' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1025, '샌드위치 정리 (조임 정리): 대소 관계를 이용한 극한값' FROM public.youtube_lectures WHERE video_id = 'hxLLIywuYh8' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1191, '도형의 넓이와 극한 활용: 내접 정사각형 넓이 식과 극한값 계산' FROM public.youtube_lectures WHERE video_id = 'hxLLIywuYh8' ON CONFLICT DO NOTHING;

-- 7/18 고2 수토 미적분1 (함수의 연속)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('8rV4fHj3jG0', '7/18 고2 수토 미적분1 (함수의 연속)', '미적분Ⅰ')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1, '함수의 연속 정의: 함숫값과 극한값이 같을 때' FROM public.youtube_lectures WHERE video_id = '8rV4fHj3jG0' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 492, '불연속 조건 3가지와 예시' FROM public.youtube_lectures WHERE video_id = '8rV4fHj3jG0' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 955, '구간에서의 연속과 다항함수/유리함수/무리함수의 연속성' FROM public.youtube_lectures WHERE video_id = '8rV4fHj3jG0' ON CONFLICT DO NOTHING;


-- ── PART 3: 7/24 ~ 7/25 Batch (Lectures 5~8) ──────────────────────────

-- 1) 7/24 고2 월수금 미적분1 (함수의 극한의 응용)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('cbTk29FAoLk', '7/24 고2 월수금 미적분1 (함수의 극한의 응용)', '미적분Ⅰ')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 12, '0/0 꼴의 함수의 극한' FROM public.youtube_lectures WHERE video_id = 'cbTk29FAoLk' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 133, '0/0 꼴 극한값 증명' FROM public.youtube_lectures WHERE video_id = 'cbTk29FAoLk' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 353, '샌드위치 정리 (함수의 극한의 대소 관계)' FROM public.youtube_lectures WHERE video_id = 'cbTk29FAoLk' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 432, '0/0 꼴 관련 문제 풀이 (상수 구하기)' FROM public.youtube_lectures WHERE video_id = 'cbTk29FAoLk' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 559, '0/0 꼴 미지수 구하기 응용 문제' FROM public.youtube_lectures WHERE video_id = 'cbTk29FAoLk' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 668, '무한대 조건이 포함된 함수 극한 응용 문제' FROM public.youtube_lectures WHERE video_id = 'cbTk29FAoLk' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 846, '마무리 및 다음 수업 내용 안내' FROM public.youtube_lectures WHERE video_id = 'cbTk29FAoLk' ON CONFLICT DO NOTHING;

-- 2) 7/24 고2 월수금 미적분1 (함수의 극한의 응용)(2)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('OWk8BrnFOoQ', '7/24 고2 월수금 미적분1 (함수의 극한의 응용)(2)', '미적분Ⅰ')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1, '샌드위치 정리 (조임 정리) 개념 및 예제' FROM public.youtube_lectures WHERE video_id = 'OWk8BrnFOoQ' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 47, '응용 문제 풀이' FROM public.youtube_lectures WHERE video_id = 'OWk8BrnFOoQ' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 137, '2차 함수와 정사각형 내접 문제' FROM public.youtube_lectures WHERE video_id = 'OWk8BrnFOoQ' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 353, '수업 마무리' FROM public.youtube_lectures WHERE video_id = 'OWk8BrnFOoQ' ON CONFLICT DO NOTHING;

-- 3) 7/25 고2 수토 미적분1 (미분계수)(2)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('HyGqavPGmNk', '7/25 고2 수토 미적분1 (미분계수)(2)', '미적분Ⅰ')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1, '미분계수 개념 복습' FROM public.youtube_lectures WHERE video_id = 'HyGqavPGmNk' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 169, '미분계수의 또 다른 정의' FROM public.youtube_lectures WHERE video_id = 'HyGqavPGmNk' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 306, '미분계수 식 변형 및 문제 풀이' FROM public.youtube_lectures WHERE video_id = 'HyGqavPGmNk' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 674, '다양한 형태의 미분계수 극한' FROM public.youtube_lectures WHERE video_id = 'HyGqavPGmNk' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1179, '미분계수의 정의를 이용한 함수 식 문제' FROM public.youtube_lectures WHERE video_id = 'HyGqavPGmNk' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1638, '미분계수의 기하학적 의미' FROM public.youtube_lectures WHERE video_id = 'HyGqavPGmNk' ON CONFLICT DO NOTHING;

-- 4) 7/25 고1 화토 공수2 (두 직선의 위치관계)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('sJR-BTwo-6s', '7/25 고1 화토 공수2 (두 직선의 위치관계)', '공통수학2')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1, '두 직선의 위치 관계 개요' FROM public.youtube_lectures WHERE video_id = 'sJR-BTwo-6s' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 306, '일반형에서의 위치 관계' FROM public.youtube_lectures WHERE video_id = 'sJR-BTwo-6s' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 523, '평행 및 수직 관련 문제 풀이' FROM public.youtube_lectures WHERE video_id = 'sJR-BTwo-6s' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 782, '특정 조건을 만족하는 직선의 방정식 구하기' FROM public.youtube_lectures WHERE video_id = 'sJR-BTwo-6s' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1061, '세 직선이 삼각형을 이루지 않을 조건' FROM public.youtube_lectures WHERE video_id = 'sJR-BTwo-6s' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1432, '점과 직선 사이의 거리 공식 및 증명' FROM public.youtube_lectures WHERE video_id = 'sJR-BTwo-6s' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1912, '거리 공식 관련 문제 풀이' FROM public.youtube_lectures WHERE video_id = 'sJR-BTwo-6s' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 2433, '두 직선이 이루는 각의 이등분선' FROM public.youtube_lectures WHERE video_id = 'sJR-BTwo-6s' ON CONFLICT DO NOTHING;
