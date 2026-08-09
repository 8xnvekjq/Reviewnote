-- ── 2026-08-09 Batch YouTube Lectures & Timelines Seed ──

-- 1. 8/7 고2 수토 미적분1 (롤의 정리, 평균값 정리)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('8pUrUySwMdA', '8/7 고2 수토 미적분1 (롤의 정리, 평균값 정리)', '미적분Ⅰ')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1, '롤의 정리와 평균값 정리의 정의' FROM public.youtube_lectures WHERE video_id = '8pUrUySwMdA' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 56, '롤의 정리 (Rolle''s Theorem)' FROM public.youtube_lectures WHERE video_id = '8pUrUySwMdA' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 149, '평균값 정리 (Mean Value Theorem)' FROM public.youtube_lectures WHERE video_id = '8pUrUySwMdA' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 232, '예제 풀이 (롤의 정리)' FROM public.youtube_lectures WHERE video_id = '8pUrUySwMdA' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 348, '예제 풀이 (평균값 정리)' FROM public.youtube_lectures WHERE video_id = '8pUrUySwMdA' ON CONFLICT DO NOTHING;

-- 2. 8/7 고2 수토 미적분1 (함수의 증가, 감소)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('hT_Cx3TAHCY', '8/7 고2 수토 미적분1 (함수의 증가, 감소)', '미적분Ⅰ')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '함수의 증가와 감소 개념 및 정의' FROM public.youtube_lectures WHERE video_id = 'hT_Cx3TAHCY' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 125, '도함수를 이용한 증가와 감소 판단' FROM public.youtube_lectures WHERE video_id = 'hT_Cx3TAHCY' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 501, '3차 함수의 그래프 그리기 및 조사' FROM public.youtube_lectures WHERE video_id = 'hT_Cx3TAHCY' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 646, '4차 함수의 그래프 그리기 및 조사' FROM public.youtube_lectures WHERE video_id = 'hT_Cx3TAHCY' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 779, '실수 전체 집합에서의 증가 조건 (문제 풀이)' FROM public.youtube_lectures WHERE video_id = 'hT_Cx3TAHCY' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 907, '주어진 구간에서의 감소 조건 (문제 풀이)' FROM public.youtube_lectures WHERE video_id = 'hT_Cx3TAHCY' ON CONFLICT DO NOTHING;

-- 3. 8/8 고1 화토 공수2 (평행이동, 대칭이동)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('iSq6GxvBs_Y', '8/8 고1 화토 공수2 (평행이동, 대칭이동)', '공통수학2')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1, '평행이동 (개념 개요)' FROM public.youtube_lectures WHERE video_id = 'iSq6GxvBs_Y' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 18, '점의 평행이동' FROM public.youtube_lectures WHERE video_id = 'iSq6GxvBs_Y' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 118, '도형의 평행이동' FROM public.youtube_lectures WHERE video_id = 'iSq6GxvBs_Y' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 327, '평행이동 응용 문제' FROM public.youtube_lectures WHERE video_id = 'iSq6GxvBs_Y' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 802, '기본 대칭 이동 (x축, y축, 원점, y=x 대칭)' FROM public.youtube_lectures WHERE video_id = 'iSq6GxvBs_Y' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1566, '대칭 이동 응용 문제' FROM public.youtube_lectures WHERE video_id = 'iSq6GxvBs_Y' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1953, '점과 직선에 대한 대칭 이동' FROM public.youtube_lectures WHERE video_id = 'iSq6GxvBs_Y' ON CONFLICT DO NOTHING;

-- 4. 8/8 고1 화토 공수2 (집합의 뜻)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('QW0v1DcEiwc', '8/8 고1 화토 공수2 (집합의 뜻)', '공통수학2')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 20, '집합의 정의' FROM public.youtube_lectures WHERE video_id = 'QW0v1DcEiwc' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 245, '원소와 표현법 (원소 나열법, 벤 다이어그램, 조건 제시법)' FROM public.youtube_lectures WHERE video_id = 'QW0v1DcEiwc' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 462, '원소의 개수와 유한 집합' FROM public.youtube_lectures WHERE video_id = 'QW0v1DcEiwc' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 546, '무한 집합과 힐베르트 호텔' FROM public.youtube_lectures WHERE video_id = 'QW0v1DcEiwc' ON CONFLICT DO NOTHING;
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 822, '공집합과 포함 관계' FROM public.youtube_lectures WHERE video_id = 'QW0v1DcEiwc' ON CONFLICT DO NOTHING;
