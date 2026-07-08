-- ====================================================
-- CALCULUS II PLAYLIST YOUTUBE DATA IMPORT SQL
-- Generated At: 2026. 7. 9. 오전 1:17:09
-- ====================================================

-- 5/16 고3 목토 미적분 (속도와 거리)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('rGsEmdmQsuQ', '5/16 고3 목토 미적분 (속도와 거리)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '속도, 가속도, 거리와 적분의 관계'
FROM public.youtube_lectures
WHERE video_id = 'rGsEmdmQsuQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 101, '등속 운동과 등가속도 운동에서의 위치 변화량'
FROM public.youtube_lectures
WHERE video_id = 'rGsEmdmQsuQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 202, '위치 변화량과 움직인 거리의 차이점'
FROM public.youtube_lectures
WHERE video_id = 'rGsEmdmQsuQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 303, '시작 위치가 포함된 위치 구하기 문제풀이'
FROM public.youtube_lectures
WHERE video_id = 'rGsEmdmQsuQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 606, '6분의 공식을 활용한 속도와 거리 계산'
FROM public.youtube_lectures
WHERE video_id = 'rGsEmdmQsuQ'
ON CONFLICT DO NOTHING;


-- 5/14 고3 목토 미적분 (부피)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('mw6WbbI0sro', '5/14 고3 목토 미적분 (부피)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '입체도형의 부피와 정적분의 관계'
FROM public.youtube_lectures
WHERE video_id = 'mw6WbbI0sro'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 100, '단면의 넓이가 주어진 입체도형의 부피 계산'
FROM public.youtube_lectures
WHERE video_id = 'mw6WbbI0sro'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 300, '입체의 부피를 구하기 위한 단면적 식 세우기'
FROM public.youtube_lectures
WHERE video_id = 'mw6WbbI0sro'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 503, '회전체 및 구의 부피 정적분 공식 유도'
FROM public.youtube_lectures
WHERE video_id = 'mw6WbbI0sro'
ON CONFLICT DO NOTHING;


-- 5/14 고3 목토 미적분 (역함수의 넓이)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('sYLwczdoQW8', '5/14 고3 목토 미적분 (역함수의 넓이)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '원래 함수와 역함수의 대칭성(y=x)과 넓이의 기초'
FROM public.youtube_lectures
WHERE video_id = 'sYLwczdoQW8'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 101, '역함수로 둘러싸인 도형의 넓이 기하학적 해석'
FROM public.youtube_lectures
WHERE video_id = 'sYLwczdoQW8'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 202, '유리함수 및 초월함수의 역함수 넓이 구하기 예제'
FROM public.youtube_lectures
WHERE video_id = 'sYLwczdoQW8'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 609, '역함수의 정적분 값과 원함수 정적분의 관계식 활용'
FROM public.youtube_lectures
WHERE video_id = 'sYLwczdoQW8'
ON CONFLICT DO NOTHING;


-- 5/9 고3 목토 미적분 (구분구적법)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('LPHjCbKroG0', '5/9 고3 목토 미적분 (구분구적법)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '구분구적법의 개념과 넓이 구하기 기본 원리'
FROM public.youtube_lectures
WHERE video_id = 'LPHjCbKroG0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 101, '다각형 분할을 통한 원과 포물선의 넓이 근사'
FROM public.youtube_lectures
WHERE video_id = 'LPHjCbKroG0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 301, '급수(Sigma)와 정적분(Integral)의 변환 관계 증명'
FROM public.youtube_lectures
WHERE video_id = 'LPHjCbKroG0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 501, '구분구적법 공식의 식 세우기 및 계산 과정'
FROM public.youtube_lectures
WHERE video_id = 'LPHjCbKroG0'
ON CONFLICT DO NOTHING;


-- 5/7 고3 목토 미적분 (정적분으로 정의된 함수)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('FqnD_IEU8wU', '5/7 고3 목토 미적분 (정적분으로 정의된 함수)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '적분 구간에 변수(x)가 포함된 함수의 특징'
FROM public.youtube_lectures
WHERE video_id = 'FqnD_IEU8wU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 100, '정적분으로 정의된 함수의 양변 미분법'
FROM public.youtube_lectures
WHERE video_id = 'FqnD_IEU8wU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 304, '적분 구간과 피적분 함수에 변수가 섞인 경우의 미분'
FROM public.youtube_lectures
WHERE video_id = 'FqnD_IEU8wU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 514, '정적분을 포함한 함수의 극대·극소 및 최대·최소'
FROM public.youtube_lectures
WHERE video_id = 'FqnD_IEU8wU'
ON CONFLICT DO NOTHING;


-- 3/14 고3 목토 미적분 (정적분)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('mgK7UJWK6ZQ', '3/14 고3 목토 미적분 (정적분)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '초월함수(지수, 로그, 삼각함수)의 정적분의 기초'
FROM public.youtube_lectures
WHERE video_id = 'mgK7UJWK6ZQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 102, '여러 가지 함수의 정적분 계산 기본 예제'
FROM public.youtube_lectures
WHERE video_id = 'mgK7UJWK6ZQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 306, '치환을 이용한 초월함수의 정적분 계산'
FROM public.youtube_lectures
WHERE video_id = 'mgK7UJWK6ZQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 712, '삼각함수 정적분 예제 및 성질 활용'
FROM public.youtube_lectures
WHERE video_id = 'mgK7UJWK6ZQ'
ON CONFLICT DO NOTHING;


-- 3/13 고3 목토 미적분 (부분적분)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('LVLNjLH6qEY', '3/13 고3 목토 미적분 (부분적분)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '부분적분법 공식과 곱의 미분법의 관계 (로다삼지)'
FROM public.youtube_lectures
WHERE video_id = 'LVLNjLH6qEY'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 101, '부분적분법을 이용한 지수함수와 다항함수의 곱의 적분'
FROM public.youtube_lectures
WHERE video_id = 'LVLNjLH6qEY'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 403, '로그함수(ln x)의 부분적분 계산 예제'
FROM public.youtube_lectures
WHERE video_id = 'LVLNjLH6qEY'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 708, '부분적분을 여러 번 반복해서 계산하는 심화 문제 풀이'
FROM public.youtube_lectures
WHERE video_id = 'LVLNjLH6qEY'
ON CONFLICT DO NOTHING;


-- 3/7 고3 목토 미적분 (치환적분)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('xkPYkEwv6CU', '3/7 고3 목토 미적분 (치환적분)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '치환적분법의 기본 원리 및 미분 관계식'
FROM public.youtube_lectures
WHERE video_id = 'xkPYkEwv6CU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 102, 'f(g(x))g''(x) 꼴의 치환적분 계산 예제'
FROM public.youtube_lectures
WHERE video_id = 'xkPYkEwv6CU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 507, 'f''(x)/f(x) 꼴의 분수식의 치환적분 (ln 적분)'
FROM public.youtube_lectures
WHERE video_id = 'xkPYkEwv6CU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 709, '삼각치환을 이용한 적분법 및 차수 낮추기'
FROM public.youtube_lectures
WHERE video_id = 'xkPYkEwv6CU'
ON CONFLICT DO NOTHING;


-- 3/7 고3 목토 미적분 (삼각함수 부정적분)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('pX65kyTj9WA', '3/7 고3 목토 미적분 (삼각함수 부정적분)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '삼각함수 부정적분의 기본 공식 (사인, 코사인, 탄젠트)'
FROM public.youtube_lectures
WHERE video_id = 'pX65kyTj9WA'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 101, '삼각함수 항등식을 이용한 부정적분 계산 식 변형'
FROM public.youtube_lectures
WHERE video_id = 'pX65kyTj9WA'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 506, 'sec^2 x 와 csc^2 x 등 삼각함수 역수 계열의 부정적분'
FROM public.youtube_lectures
WHERE video_id = 'pX65kyTj9WA'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 913, '삼각함수의 덧셈정리를 활용한 복잡한 부정적분 문제 풀이'
FROM public.youtube_lectures
WHERE video_id = 'pX65kyTj9WA'
ON CONFLICT DO NOTHING;


-- 3/5 고3 목토 미적분 (속도 가속도)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('LJ-ETdEySE0', '3/5 고3 목토 미적분 (속도 가속도)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '평면 위를 움직이는 점의 위치와 속도 벡터'
FROM public.youtube_lectures
WHERE video_id = 'LJ-ETdEySE0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 100, '매개변수 t로 나타내어진 위치 식의 미분과 속도'
FROM public.youtube_lectures
WHERE video_id = 'LJ-ETdEySE0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 200, '속도의 크기(속력)와 가속도의 크기 계산 공식 (피타고라스)'
FROM public.youtube_lectures
WHERE video_id = 'LJ-ETdEySE0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 402, '평면 위에서 점이 움직인 거리(곡선의 길이) 정적분 구하기'
FROM public.youtube_lectures
WHERE video_id = 'LJ-ETdEySE0'
ON CONFLICT DO NOTHING;


-- 3/5 고3 목토 미적분 (방부등식의 활용)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('9vxYJp-CO6Y', '3/5 고3 목토 미적분 (방부등식의 활용)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '도함수를 이용한 초월함수 방정식의 실근 개수 판정'
FROM public.youtube_lectures
WHERE video_id = '9vxYJp-CO6Y'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 101, '진수 조건과 정의역 범위에서의 그래프 개형 파악'
FROM public.youtube_lectures
WHERE video_id = '9vxYJp-CO6Y'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 606, '모든 실수 또는 특정 구간에서 부등식이 항상 성립할 조건'
FROM public.youtube_lectures
WHERE video_id = '9vxYJp-CO6Y'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 807, '지수·로그·삼각함수 부등식의 증명과 최소값 분석'
FROM public.youtube_lectures
WHERE video_id = '9vxYJp-CO6Y'
ON CONFLICT DO NOTHING;


-- 3/5 고3 목토 미적분 (y=x^n 부정적분)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('pUI_6RGpzRw', '3/5 고3 목토 미적분 (y=x^n 부정적분)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '실수 지수 범위로 확장된 다항함수(x^n)의 부정적분'
FROM public.youtube_lectures
WHERE video_id = 'pUI_6RGpzRw'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 101, 'n = -1인 경우의 특별한 부정적분 공식 (ln |x|)'
FROM public.youtube_lectures
WHERE video_id = 'pUI_6RGpzRw'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 201, '분수 지수 및 음수 지수를 가진 수식의 부정적분 계산 예제'
FROM public.youtube_lectures
WHERE video_id = 'pUI_6RGpzRw'
ON CONFLICT DO NOTHING;


-- 2/26 예비고3 목토 미적분 (함수의 그래프)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('tMi2BBIk6Hw', '2/26 예비고3 목토 미적분 (함수의 그래프)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '초월함수의 그래프 그리기의 7가지 기본 요소'
FROM public.youtube_lectures
WHERE video_id = 'tMi2BBIk6Hw'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 101, '도함수와 이계도함수를 이용한 증가·감소 및 오목·볼록 판정'
FROM public.youtube_lectures
WHERE video_id = 'tMi2BBIk6Hw'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 301, '무한대 및 음의 무한대에서의 극한값(점근선) 분석'
FROM public.youtube_lectures
WHERE video_id = 'tMi2BBIk6Hw'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 803, '대칭성과 주기성을 파악하여 실전 초월함수 그래프 완성하기'
FROM public.youtube_lectures
WHERE video_id = 'tMi2BBIk6Hw'
ON CONFLICT DO NOTHING;


-- 2/21 예비고3 목토 미적분 (함수의 극대극소)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('Bhvqvh2oQzM', '2/21 예비고3 목토 미적분 (함수의 극대극소)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '초월함수의 극대와 극소의 정의 및 판정 조건'
FROM public.youtube_lectures
WHERE video_id = 'Bhvqvh2oQzM'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 200, '도함수의 부호 변화를 통한 1계 도함수 극대·극소 판정'
FROM public.youtube_lectures
WHERE video_id = 'Bhvqvh2oQzM'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 402, '진수 조건 및 분모 조건 등 정의역 확인의 중요성'
FROM public.youtube_lectures
WHERE video_id = 'Bhvqvh2oQzM'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 618, '이계도함수의 부호를 이용한 2계 도함수 극대·극소 판정법'
FROM public.youtube_lectures
WHERE video_id = 'Bhvqvh2oQzM'
ON CONFLICT DO NOTHING;


-- 2/19 예비고3 목토 미적분 (접선의 방정식)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('BBzR0IczXKw', '2/19 예비고3 목토 미적분 (접선의 방정식)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '미적분에서의 접선의 방정식 기본 유형 소개'
FROM public.youtube_lectures
WHERE video_id = 'BBzR0IczXKw'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 105, '곡선 위의 점이 주어질 때의 접선의 방정식 구하기'
FROM public.youtube_lectures
WHERE video_id = 'BBzR0IczXKw'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 306, '접선의 기울기가 주어질 때의 접선의 방정식 구하기'
FROM public.youtube_lectures
WHERE video_id = 'BBzR0IczXKw'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 711, '곡선 밖의 한 점이 주어질 때의 접선의 방정식 (미지수 t 설정)'
FROM public.youtube_lectures
WHERE video_id = 'BBzR0IczXKw'
ON CONFLICT DO NOTHING;


-- 2/14 예비고3 목토 미적분 (음함수 미분법)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('H-8lrPdWIv0', '2/14 예비고3 목토 미적분 (음함수 미분법)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '음함수의 정의와 음함수 미분법의 기본 개념'
FROM public.youtube_lectures
WHERE video_id = 'H-8lrPdWIv0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 101, '음함수 미분법을 이용한 dy/dx 구하기 공식 유도'
FROM public.youtube_lectures
WHERE video_id = 'H-8lrPdWIv0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 501, '음함수 미분법을 활용한 접선의 기울기 계산 예제'
FROM public.youtube_lectures
WHERE video_id = 'H-8lrPdWIv0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1003, '로그미분법을 이용하여 복잡한 지수/분수식을 미분하는 법'
FROM public.youtube_lectures
WHERE video_id = 'H-8lrPdWIv0'
ON CONFLICT DO NOTHING;


-- 2/14 예비고3 목토 미적분 (역함수 미분법)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('AZPQ0WjJq-M', '2/14 예비고3 목토 미적분 (역함수 미분법)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '역함수의 정의 및 미분 가능성 조건'
FROM public.youtube_lectures
WHERE video_id = 'AZPQ0WjJq-M'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 103, '역함수 미분법 공식 (g''(x) = 1/f''(y))의 기하학적 의미와 유도'
FROM public.youtube_lectures
WHERE video_id = 'AZPQ0WjJq-M'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 403, '합성함수의 미분을 이용한 역함수 미분법 증명'
FROM public.youtube_lectures
WHERE video_id = 'AZPQ0WjJq-M'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 704, '역함수 미분법을 활용한 접선의 기울기 구하기 실전 문제 풀이'
FROM public.youtube_lectures
WHERE video_id = 'AZPQ0WjJq-M'
ON CONFLICT DO NOTHING;


-- 2/12 예비고3 목토 미적분 (매개변수를 포함한 함수의 미분)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('629zJKPJeu8', '2/12 예비고3 목토 미적분 (매개변수를 포함한 함수의 미분)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '매개변수 t로 나타내어진 함수의 정의'
FROM public.youtube_lectures
WHERE video_id = '629zJKPJeu8'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 204, '매개변수로 나타내어진 함수의 미분법 (dy/dx = (dy/dt) / (dx/dt))'
FROM public.youtube_lectures
WHERE video_id = '629zJKPJeu8'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 505, '매개변수를 소거하여 원의 방정식이나 타원 식으로 유도하는 법'
FROM public.youtube_lectures
WHERE video_id = '629zJKPJeu8'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 809, '매개변수 미분법을 활용한 특정 t 값에서의 접선의 방정식'
FROM public.youtube_lectures
WHERE video_id = '629zJKPJeu8'
ON CONFLICT DO NOTHING;


-- 1/31 예비고3 목토 미적분 (합성함수의 미분법 활용)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('PJ7es6nPq0k', '1/31 예비고3 목토 미적분 (합성함수의 미분법 활용)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '합성함수의 미분법 공식(겉미분, 속미분)의 개념'
FROM public.youtube_lectures
WHERE video_id = 'PJ7es6nPq0k'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 103, 'f(x)^n 꼴의 미분법 공식 유도 및 연습'
FROM public.youtube_lectures
WHERE video_id = 'PJ7es6nPq0k'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 303, '합성함수 미분법과 곱미분의 연계 문제 풀이'
FROM public.youtube_lectures
WHERE video_id = 'PJ7es6nPq0k'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 709, '삼각함수, 지수함수 등이 중첩된 여러 가지 합성함수의 미분법'
FROM public.youtube_lectures
WHERE video_id = 'PJ7es6nPq0k'
ON CONFLICT DO NOTHING;


-- 1/29 예비고3 목토 확통 (합성함수의 미분법)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('-HcYg3gptrI', '1/29 예비고3 목토 확통 (합성함수의 미분법)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '합성함수의 미분법 기초 개념 복습 및 미분계수 정의 활용'
FROM public.youtube_lectures
WHERE video_id = '-HcYg3gptrI'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 100, 'y = f(g(x))의 합성함수 도함수 증명 과정'
FROM public.youtube_lectures
WHERE video_id = '-HcYg3gptrI'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 202, '치환변수 u를 이용한 합성함수의 미분법의 체인 룰(Chain Rule) 이해'
FROM public.youtube_lectures
WHERE video_id = '-HcYg3gptrI'
ON CONFLICT DO NOTHING;


-- 1/29 예비고3 목토 미적분 (여러가지 미분법)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('NKa3G8pYvwA', '1/29 예비고3 목토 미적분 (여러가지 미분법)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '몫의 미분법(분수식의 미분)의 정의와 증명'
FROM public.youtube_lectures
WHERE video_id = 'NKa3G8pYvwA'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 101, '1/g(x) 꼴과 f(x)/g(x) 꼴의 몫의 미분법 계산 공식'
FROM public.youtube_lectures
WHERE video_id = 'NKa3G8pYvwA'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 604, '탄젠트(tan x) 및 시컨트, 코시컨트, 코탄젠트의 도함수 공식 유도'
FROM public.youtube_lectures
WHERE video_id = 'NKa3G8pYvwA'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1004, 'x^n (n이 정수) 범위에서의 몫의 미분법 확장 적용'
FROM public.youtube_lectures
WHERE video_id = 'NKa3G8pYvwA'
ON CONFLICT DO NOTHING;


-- 1/21 예비고3 목토 미적분 (삼각함수의 미분)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('aMSAEQY66us', '1/21 예비고3 목토 미적분 (삼각함수의 미분)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '삼각함수의 도함수(사인, 코사인) 공식 소개'
FROM public.youtube_lectures
WHERE video_id = 'aMSAEQY66us'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 100, '도함수의 정의를 이용한 sin x의 미분 공식 증명'
FROM public.youtube_lectures
WHERE video_id = 'aMSAEQY66us'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 301, '삼각함수의 극한값(lim h->0 sin h/h = 1) 성질 활용'
FROM public.youtube_lectures
WHERE video_id = 'aMSAEQY66us'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 503, '도함수의 정의를 이용한 cos x의 미분 공식 증명'
FROM public.youtube_lectures
WHERE video_id = 'aMSAEQY66us'
ON CONFLICT DO NOTHING;


-- 1/15 예비고3 목토 미적분 (삼각함수의 극한)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('W3ou8vgvCuM', '1/15 예비고3 목토 미적분 (삼각함수의 극한)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '호도법을 활용한 부채꼴의 삼각비와 넓이 비교'
FROM public.youtube_lectures
WHERE video_id = 'W3ou8vgvCuM'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 100, '삼각함수의 극한 기본 공식 lim x->0 sin x/x = 1 의 증명'
FROM public.youtube_lectures
WHERE video_id = 'W3ou8vgvCuM'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 300, 'lim x->0 tan x/x = 1 의 증명 및 변형 공식 이해'
FROM public.youtube_lectures
WHERE video_id = 'W3ou8vgvCuM'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 500, '삼각함수의 극한값 계산 기본 문제 풀이'
FROM public.youtube_lectures
WHERE video_id = 'W3ou8vgvCuM'
ON CONFLICT DO NOTHING;


-- 1/15 예비고3 목토 미적분 (삼각함수의 극한값의 계산)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('s5bVzo_Nua8', '1/15 예비고3 목토 미적분 (삼각함수의 극한값의 계산)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '삼각함수 극한값의 대수적 계산 기본 원칙'
FROM public.youtube_lectures
WHERE video_id = 's5bVzo_Nua8'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 101, '1 - cos x 꼴을 포함한 극한식 계산 요령'
FROM public.youtube_lectures
WHERE video_id = 's5bVzo_Nua8'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 301, '치환을 이용한 x -> a인 경우의 삼각함수 극한값 계산'
FROM public.youtube_lectures
WHERE video_id = 's5bVzo_Nua8'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 502, '삼각함수 극한의 도형에의 활용 예고'
FROM public.youtube_lectures
WHERE video_id = 's5bVzo_Nua8'
ON CONFLICT DO NOTHING;


-- 1/10 예비고3 목토 미적분 (삼각함수의 덧셈정리)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('5YHEZO0ilB0', '1/10 예비고3 목토 미적분 (삼각함수의 덧셈정리)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '시컨트, 코시컨트, 코탄젠트의 정의와 역수 관계'
FROM public.youtube_lectures
WHERE video_id = '5YHEZO0ilB0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 102, '삼각함수의 덧셈정리(사인, 코사인, 탄젠트 합차 공식) 개념'
FROM public.youtube_lectures
WHERE video_id = '5YHEZO0ilB0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 402, '두 동경과 단위원의 점을 이용한 코사인 덧셈정리 증명'
FROM public.youtube_lectures
WHERE video_id = '5YHEZO0ilB0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 705, '삼각함수의 덧셈정리 기본 예제 계산 및 부호 결정'
FROM public.youtube_lectures
WHERE video_id = '5YHEZO0ilB0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1008, '탄젠트 덧셈정리를 활용한 두 직선이 이루는 예각 구하기'
FROM public.youtube_lectures
WHERE video_id = '5YHEZO0ilB0'
ON CONFLICT DO NOTHING;


-- 1/10 예비고3 목토 미적분 (로그함수의 미분)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('4FSYTlbMoqY', '1/10 예비고3 목토 미적분 (로그함수의 미분)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '자연로그 ln x 와 무리수 e를 밑으로 하는 로그함수 정의'
FROM public.youtube_lectures
WHERE video_id = '4FSYTlbMoqY'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 103, '도함수의 정의를 이용한 y = ln x의 미분 공식 증명'
FROM public.youtube_lectures
WHERE video_id = '4FSYTlbMoqY'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 304, '일반 로그함수 y = log_a x의 미분 공식 증명'
FROM public.youtube_lectures
WHERE video_id = '4FSYTlbMoqY'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 605, '로그함수의 도함수 공식 적용 문제 풀이'
FROM public.youtube_lectures
WHERE video_id = '4FSYTlbMoqY'
ON CONFLICT DO NOTHING;


-- 1/8 예비고3 목토 미적분 (지수함수의 미분)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('iRYskwartbE', '1/8 예비고3 목토 미적분 (지수함수의 미분)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '자연상수 e의 정의를 이용한 지수함수 도함수 도입'
FROM public.youtube_lectures
WHERE video_id = 'iRYskwartbE'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 101, '도함수의 정의를 이용한 y = e^x의 미분 공식 증명'
FROM public.youtube_lectures
WHERE video_id = 'iRYskwartbE'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 305, '일반 지수함수 y = a^x의 미분 공식 증명'
FROM public.youtube_lectures
WHERE video_id = 'iRYskwartbE'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 605, '지수함수의 도함수 공식을 활용한 미분 계산'
FROM public.youtube_lectures
WHERE video_id = 'iRYskwartbE'
ON CONFLICT DO NOTHING;


-- 1/3 예비고3 목토 미적분 (지수와 로그의 극한,  자연상수 e)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('p3DL2bYXU70', '1/3 예비고3 목토 미적분 (지수와 로그의 극한,  자연상수 e)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '무리수 e(자연상수)의 엄밀한 수학적 정의'
FROM public.youtube_lectures
WHERE video_id = 'p3DL2bYXU70'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 102, 'e를 정의하는 두 가지 형태의 극한 변형'
FROM public.youtube_lectures
WHERE video_id = 'p3DL2bYXU70'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 304, '지수함수와 로그함수의 극한 기본 공식 계산'
FROM public.youtube_lectures
WHERE video_id = 'p3DL2bYXU70'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 706, '연속 복리 일화를 통한 자연상수 e의 직관적 이해'
FROM public.youtube_lectures
WHERE video_id = 'p3DL2bYXU70'
ON CONFLICT DO NOTHING;


-- 1/3 예비고3 목토 미적분 (등비급수의 활용)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('9-5MVJ-oxg8', '1/3 예비고3 목토 미적분 (등비급수의 활용)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '등비급수의 수렴 조건과 합 공식 복습'
FROM public.youtube_lectures
WHERE video_id = '9-5MVJ-oxg8'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 100, '순환소수를 등비급수로 표현하여 분수로 변환'
FROM public.youtube_lectures
WHERE video_id = '9-5MVJ-oxg8'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 200, '등비급수의 도형에의 활용: 프랙탈 도형 넓이 패턴'
FROM public.youtube_lectures
WHERE video_id = '9-5MVJ-oxg8'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 686, '첫째항과 닮음비를 구하기 위한 닮음 성질 활용'
FROM public.youtube_lectures
WHERE video_id = '9-5MVJ-oxg8'
ON CONFLICT DO NOTHING;


-- 1/1 예비고3 목토 미적분 (급수와 수열 사이의 관계)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('L15LfzX5IRs', '1/1 예비고3 목토 미적분 (급수와 수열 사이의 관계)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '급수의 정의와 부분합 수열의 극한값'
FROM public.youtube_lectures
WHERE video_id = 'L15LfzX5IRs'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 102, '급수가 수렴하면 일반항의 극한값은 0이다 증명'
FROM public.youtube_lectures
WHERE video_id = 'L15LfzX5IRs'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 202, '일반항의 극한값이 0이 아니면 급수는 발산한다 대우 활용'
FROM public.youtube_lectures
WHERE video_id = 'L15LfzX5IRs'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 406, '급수 수렴 판정을 위한 lim an 판정법 적용 및 조화급수 반례'
FROM public.youtube_lectures
WHERE video_id = 'L15LfzX5IRs'
ON CONFLICT DO NOTHING;


-- 1/1 예비고3 목토 미적분 (등비급수)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('dSNGXQz42uI', '1/1 예비고3 목토 미적분 (등비급수)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '등비급수의 정의와 첫째항, 공비'
FROM public.youtube_lectures
WHERE video_id = 'dSNGXQz42uI'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 104, '공비 r의 범위 조건에 따른 등비급수의 수렴 발산 판별'
FROM public.youtube_lectures
WHERE video_id = 'dSNGXQz42uI'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 305, '무한등비수열 수렴 조건과 무한등비급수 수렴 조건 차이'
FROM public.youtube_lectures
WHERE video_id = 'dSNGXQz42uI'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 505, '등비급수의 성질을 이용한 계산 문제 풀이'
FROM public.youtube_lectures
WHERE video_id = 'dSNGXQz42uI'
ON CONFLICT DO NOTHING;


-- 12/27 예비고3 목토 미적분 (급수)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('VXTOx4hphBU', '12/27 예비고3 목토 미적분 (급수)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '급수의 기본 개념 및 부분합의 정의'
FROM public.youtube_lectures
WHERE video_id = 'VXTOx4hphBU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 102, '여러 가지 수열의 급수 계산 (부분분수 소거형)'
FROM public.youtube_lectures
WHERE video_id = 'VXTOx4hphBU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 304, '무한대항까지의 합의 수렴과 발산의 직관적 해석'
FROM public.youtube_lectures
WHERE video_id = 'VXTOx4hphBU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 506, 'p-급수 판정법 맛보기 및 급수의 기본 성질'
FROM public.youtube_lectures
WHERE video_id = 'VXTOx4hphBU'
ON CONFLICT DO NOTHING;


-- 12/27 예비고3 목토 미적분 (등비수열의 극한)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('r1m7SkBiwko', '12/27 예비고3 목토 미적분 (등비수열의 극한)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '등비수열 r^n의 극한값의 성질 및 공비 r의 범위 나누기'
FROM public.youtube_lectures
WHERE video_id = 'r1m7SkBiwko'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 103, '공비의 절댓값 크기에 따른 극한값 계산'
FROM public.youtube_lectures
WHERE video_id = 'r1m7SkBiwko'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 304, '미지수 r을 포함한 등비수열 극한식의 수렴 조건'
FROM public.youtube_lectures
WHERE video_id = 'r1m7SkBiwko'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 505, '등비수열 극한을 활용한 함수의 구간별 정의와 그래프'
FROM public.youtube_lectures
WHERE video_id = 'r1m7SkBiwko'
ON CONFLICT DO NOTHING;


-- 12/20 예비고3 목토 미적분 (수열의 극한의 성질)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('TxHLEMGHjIE', '12/20 예비고3 목토 미적분 (수열의 극한의 성질)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '수열의 극한의 기본 성질 (사칙연산)'
FROM public.youtube_lectures
WHERE video_id = 'TxHLEMGHjIE'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 105, '수열의 극한의 대소 관계 (샌드위치 정리)'
FROM public.youtube_lectures
WHERE video_id = 'TxHLEMGHjIE'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 307, '무한대/무한대 꼴의 수열의 극한값 계산'
FROM public.youtube_lectures
WHERE video_id = 'TxHLEMGHjIE'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 507, '무한대-무한대 꼴의 수열의 극한값 계산'
FROM public.youtube_lectures
WHERE video_id = 'TxHLEMGHjIE'
ON CONFLICT DO NOTHING;


-- 12/18 예비고3 목토 미적분 맛보기 (수열의 극한)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('IO08IQ1qi38', '12/18 예비고3 목토 미적분 맛보기 (수열의 극한)', '선생님 추천 개념 강의영상 (미적분Ⅱ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '미적분 과목 전체 구성 및 수열의 극한 단원 목표'
FROM public.youtube_lectures
WHERE video_id = 'IO08IQ1qi38'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 103, '수열의 수렴과 발산의 정의 (무한대 발산, 진동)'
FROM public.youtube_lectures
WHERE video_id = 'IO08IQ1qi38'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 303, '직접 대입해 보며 극한 직관적으로 이해하기'
FROM public.youtube_lectures
WHERE video_id = 'IO08IQ1qi38'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 503, '수열의 극한값 정의와 수렴 시의 기하학적 해석'
FROM public.youtube_lectures
WHERE video_id = 'IO08IQ1qi38'
ON CONFLICT DO NOTHING;


