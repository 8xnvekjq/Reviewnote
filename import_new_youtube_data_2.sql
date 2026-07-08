-- ====================================================
-- CALCULUS I (SU2) PLAYLIST YOUTUBE DATA IMPORT SQL
-- Generated At: 2026. 7. 9. 오전 1:09:34
-- ====================================================

-- 11/8 고2 목토 (속도와 거리 정적분)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('Jv7Dkb9JHoQ', '11/8 고2 목토 (속도와 거리 정적분)', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '속도, 가속도, 거리와 적분의 관계'
FROM public.youtube_lectures
WHERE video_id = 'Jv7Dkb9JHoQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 116, '등속 운동과 등가속도 운동에서의 위치 변화량'
FROM public.youtube_lectures
WHERE video_id = 'Jv7Dkb9JHoQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 265, '위치 변화량과 움직인 거리의 차이점'
FROM public.youtube_lectures
WHERE video_id = 'Jv7Dkb9JHoQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 425, '시작 위치가 포함된 위치 구하기 문제풀이'
FROM public.youtube_lectures
WHERE video_id = 'Jv7Dkb9JHoQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 654, '6분의 공식을 활용한 속도와 거리 계산'
FROM public.youtube_lectures
WHERE video_id = 'Jv7Dkb9JHoQ'
ON CONFLICT DO NOTHING;


-- 11/8 고2 목토 (역함수의 넓이)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('9EAUXEip4Y0', '11/8 고2 목토 (역함수의 넓이)', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '원래 함수와 역함수로 둘러싸인 부분의 넓이의 기본 개념'
FROM public.youtube_lectures
WHERE video_id = '9EAUXEip4Y0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 68, '역함수 정적분의 기하학적 해석'
FROM public.youtube_lectures
WHERE video_id = '9EAUXEip4Y0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 108, '원래 함수와 역함수의 차를 이용한 넓이 문제풀이'
FROM public.youtube_lectures
WHERE video_id = '9EAUXEip4Y0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 335, '역함수의 정적분 공식과 기하학적 의미'
FROM public.youtube_lectures
WHERE video_id = '9EAUXEip4Y0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 578, '역함수 정적분 공식을 활용한 실전 문제풀이'
FROM public.youtube_lectures
WHERE video_id = '9EAUXEip4Y0'
ON CONFLICT DO NOTHING;


-- 11/6 고2 목토 (6분의 공식, 12분의 공식)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('qqjEcC7669E', '11/6 고2 목토 (6분의 공식, 12분의 공식)', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '2차 함수 넓이 공식 (6분의 공식) 도입 및 증명 시작'
FROM public.youtube_lectures
WHERE video_id = 'qqjEcC7669E'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 113, '길이 관계를 이용한 함수값 계산 팁'
FROM public.youtube_lectures
WHERE video_id = 'qqjEcC7669E'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 439, '6분의 공식을 활용한 이차함수 넓이 문제풀이'
FROM public.youtube_lectures
WHERE video_id = 'qqjEcC7669E'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 708, '포물선과 직선이 만나는 경우의 넓이 공식 적용'
FROM public.youtube_lectures
WHERE video_id = 'qqjEcC7669E'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 775, '포물선과 접선으로 이루어진 삼각형의 넓이비 성질 및 증명'
FROM public.youtube_lectures
WHERE video_id = 'qqjEcC7669E'
ON CONFLICT DO NOTHING;


-- 11/1 고2 목토 (정적분의 활용)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('oW5W-KlzC3I', '11/1 고2 목토 (정적분의 활용)', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '정적분의 정의와 기하학적 의미 (넓이)'
FROM public.youtube_lectures
WHERE video_id = 'oW5W-KlzC3I'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 51, '곡선과 x축 사이의 넓이 구하기 개념 및 예제'
FROM public.youtube_lectures
WHERE video_id = 'oW5W-KlzC3I'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 181, '길이비와 자르기 잡기술을 이용한 정적분의 암산 팁'
FROM public.youtube_lectures
WHERE video_id = 'oW5W-KlzC3I'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 255, '절댓값 기호를 포함한 함수의 정적분과 넓이 계산'
FROM public.youtube_lectures
WHERE video_id = 'oW5W-KlzC3I'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 713, '두 곡선 사이의 넓이 구하기 개념 및 부호 판단'
FROM public.youtube_lectures
WHERE video_id = 'oW5W-KlzC3I'
ON CONFLICT DO NOTHING;


-- 10/30 고2 목토 (대칭함수, 주기함수의 정적분)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('XlDaJ96JuDQ', '10/30 고2 목토 (대칭함수, 주기함수의 정적분)', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '대칭함수(홀함수, 짝함수)의 정적분 개념 및 성질'
FROM public.youtube_lectures
WHERE video_id = 'XlDaJ96JuDQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 169, '홀함수와 짝함수의 정적분 성질을 활용한식 정리 및 계산 예제'
FROM public.youtube_lectures
WHERE video_id = 'XlDaJ96JuDQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 490, '주기함수의 정적분 개념 및 주기 표현식 해석 방법'
FROM public.youtube_lectures
WHERE video_id = 'XlDaJ96JuDQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 596, '선대칭 및 점대칭 관계를 나타내는 함수식 해석법'
FROM public.youtube_lectures
WHERE video_id = 'XlDaJ96JuDQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 913, '주기함수의 성질을 활용한 정적분 문제풀이'
FROM public.youtube_lectures
WHERE video_id = 'XlDaJ96JuDQ'
ON CONFLICT DO NOTHING;


-- 10/30 고2 목토 (정적분이 포함된 함수)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('XpeWnkM1AmQ', '10/30 고2 목토 (정적분이 포함된 함수)', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '정적분이 상수 범위를 가질 때의 f(x) 결정 방법'
FROM public.youtube_lectures
WHERE video_id = 'XpeWnkM1AmQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 165, '적분 구간에 변수 x가 포함되어 있을 때의 미분 성질'
FROM public.youtube_lectures
WHERE video_id = 'XpeWnkM1AmQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 450, '적분 구간과 우변 식에 변수가 섞인 함수식 해결 및 대입 팁'
FROM public.youtube_lectures
WHERE video_id = 'XpeWnkM1AmQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 556, '피적분 함수에 변수 x와 t가 섞여 있을 때 분배 법칙 및 미분법'
FROM public.youtube_lectures
WHERE video_id = 'XpeWnkM1AmQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 723, '정적분을 포함한 함수의 극한과 미분계수의 관계'
FROM public.youtube_lectures
WHERE video_id = 'XpeWnkM1AmQ'
ON CONFLICT DO NOTHING;


-- 10/25 고2 목토 (정적분)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('TQIR4sVjDZ4', '10/25 고2 목토 (정적분)', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '부정적분과 정적분의 관계 및 정적분의 역사적 기원'
FROM public.youtube_lectures
WHERE video_id = 'TQIR4sVjDZ4'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 113, '구분구적법의 기본 개념 및 사각형 분할을 통한 곡선 넓이 근사'
FROM public.youtube_lectures
WHERE video_id = 'TQIR4sVjDZ4'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 379, '함숫값의 부호에 따른 정적분 값의 부호와 기하학적 의미'
FROM public.youtube_lectures
WHERE video_id = 'TQIR4sVjDZ4'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 721, '구분구적법 수식의 기하학적 해석 및 정적분 기호의 유래'
FROM public.youtube_lectures
WHERE video_id = 'TQIR4sVjDZ4'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 915, '미적분학의 기본 정리(FTC) 소개 및 부정적분을 이용한 정적분 계산법'
FROM public.youtube_lectures
WHERE video_id = 'TQIR4sVjDZ4'
ON CONFLICT DO NOTHING;


-- 10/25 고2 목토 (정적분-2)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('fyo9_vA_TKk', '10/25 고2 목토 (정적분-2)', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '구간에 따라 다르게 정의된 함수의 정적분 개념 및 대칭성 활용 팁'
FROM public.youtube_lectures
WHERE video_id = 'fyo9_vA_TKk'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 185, '경계값을 기준으로 구간을 나누어 계산하는 정적분 문제풀이'
FROM public.youtube_lectures
WHERE video_id = 'fyo9_vA_TKk'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 270, '절댓값 기호를 포함한 1차 함수의 정적분과 기하학적 해결법'
FROM public.youtube_lectures
WHERE video_id = 'fyo9_vA_TKk'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 499, '2차 함수 정적분에서 6분의 공식을 활용한 빠른 계산법 및 부호 주의점'
FROM public.youtube_lectures
WHERE video_id = 'fyo9_vA_TKk'
ON CONFLICT DO NOTHING;


-- 10/23 고2 목토 (부정적분의 계산과 성질)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('jR4jePqMoMU', '10/23 고2 목토 (부정적분의 계산과 성질)', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '부정적분의 기본 계산 개념 및 역추적 방법'
FROM public.youtube_lectures
WHERE video_id = 'jR4jePqMoMU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 75, '부정적분의 평행이동 기하학적 의미 및 적분 상수 C의 기원'
FROM public.youtube_lectures
WHERE video_id = 'jR4jePqMoMU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 96, '부정적분의 성질의 이론적 배경 및 시그마/리미트와의 연관성'
FROM public.youtube_lectures
WHERE video_id = 'jR4jePqMoMU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 368, '곱의 형태 및 분수 형태의 식을 정리하여 부정적분 계산하기'
FROM public.youtube_lectures
WHERE video_id = 'jR4jePqMoMU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 559, '수학적 약분에서의 전제 조건과 부정적분 성질의 종합 적용'
FROM public.youtube_lectures
WHERE video_id = 'jR4jePqMoMU'
ON CONFLICT DO NOTHING;


-- 10/23 고2 목토 (부정적분)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('3bQFw8otrgs', '10/23 고2 목토 (부정적분)', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '부정적분의 기본 개념 및 다항함수의 부정적분 도입'
FROM public.youtube_lectures
WHERE video_id = '3bQFw8otrgs'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 173, '상수항 미분의 특성으로 인한 적분 상수 C의 필요성'
FROM public.youtube_lectures
WHERE video_id = '3bQFw8otrgs'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 395, '부정적분과 정적분의 차이 (미분의 역과정 vs 넓이)'
FROM public.youtube_lectures
WHERE video_id = '3bQFw8otrgs'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 524, '원시함수와 적분 기호의 유래 및 용어 정리'
FROM public.youtube_lectures
WHERE video_id = '3bQFw8otrgs'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 786, '부정적분과 미분의 상쇄 관계 및 미분을 통한 피적분함수 구하기'
FROM public.youtube_lectures
WHERE video_id = '3bQFw8otrgs'
ON CONFLICT DO NOTHING;


-- 10/18 고2 목토 (속도와 가속도)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('ee0zwSdxKzs', '10/18 고2 목토 (속도와 가속도)', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '위치, 속도, 가속도의 개념 및 정의'
FROM public.youtube_lectures
WHERE video_id = 'ee0zwSdxKzs'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 270, '변위와 이동 거리의 차이 이해'
FROM public.youtube_lectures
WHERE video_id = 'ee0zwSdxKzs'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 541, '속도와 가속도의 계산 및 운동 방향의 변화'
FROM public.youtube_lectures
WHERE video_id = 'ee0zwSdxKzs'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 812, '속도 그래프 분석 및 운동 방향 판단'
FROM public.youtube_lectures
WHERE video_id = 'ee0zwSdxKzs'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 948, '시각에 대한 변화율 (길이, 넓이, 부피의 변화율)'
FROM public.youtube_lectures
WHERE video_id = 'ee0zwSdxKzs'
ON CONFLICT DO NOTHING;


-- 10/18 고2 목토 (부등식의 활용)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('1yWLnBQqG8Q', '10/18 고2 목토 (부등식의 활용)', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '도함수를 이용한 부등식 증명의 기본 개념'
FROM public.youtube_lectures
WHERE video_id = '1yWLnBQqG8Q'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 55, '주어진 구간에서 부등식이 성립할 조건 (최솟값 이용)'
FROM public.youtube_lectures
WHERE video_id = '1yWLnBQqG8Q'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 110, '모든 실수에 대해 성립하는 부등식의 증명'
FROM public.youtube_lectures
WHERE video_id = '1yWLnBQqG8Q'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 260, '경계값이 포함되지 않는 구간에서의 부등식의 증명'
FROM public.youtube_lectures
WHERE video_id = '1yWLnBQqG8Q'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 320, '증가함수의 성질을 이용한 부등식의 증명'
FROM public.youtube_lectures
WHERE video_id = '1yWLnBQqG8Q'
ON CONFLICT DO NOTHING;


-- 10/18 고2 목토 (방정식의 실근개수)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('iNtdZ5ndpiM', '10/18 고2 목토 (방정식의 실근개수)', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '방정식의 실근의 개수와 함수의 그래프 교점'
FROM public.youtube_lectures
WHERE video_id = 'iNtdZ5ndpiM'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 50, '극댓값과 극솟값의 곱을 이용한 3차방정식의 실근 개수 판정'
FROM public.youtube_lectures
WHERE video_id = 'iNtdZ5ndpiM'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 245, '상수항에 미지수가 포함된 방정식의 실근의 개수 (f(x)=a)'
FROM public.youtube_lectures
WHERE video_id = 'iNtdZ5ndpiM'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 303, '제한된 범위에서의 방정식의 실근의 개수'
FROM public.youtube_lectures
WHERE video_id = 'iNtdZ5ndpiM'
ON CONFLICT DO NOTHING;


-- 10/16 고2 목토 (함수의 최대,최소)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('hAM5shJqN6Y', '10/16 고2 목토 (함수의 최대,최소)', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '함수의 최댓값과 최솟값의 정의 및 구하는 방법'
FROM public.youtube_lectures
WHERE video_id = 'hAM5shJqN6Y'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 115, '닫힌구간에서의 다항함수의 최댓값과 최솟값'
FROM public.youtube_lectures
WHERE video_id = 'hAM5shJqN6Y'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 460, '최대·최소의 활용: 입체도형의 부피 최댓값'
FROM public.youtube_lectures
WHERE video_id = 'hAM5shJqN6Y'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 805, '최대·최소의 활용: 평면도형의 넓이 최댓값'
FROM public.youtube_lectures
WHERE video_id = 'hAM5shJqN6Y'
ON CONFLICT DO NOTHING;


-- 8/21 고2 목토 (함수의 극대,극소)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('HaDLPhY6Vwc', '8/21 고2 목토 (함수의 극대,극소)', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '극대와 극소의 엄밀한 정의 (로컬 맥시멈 / 미니멈)'
FROM public.youtube_lectures
WHERE video_id = 'HaDLPhY6Vwc'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 821, '연속성 및 미분 가능성과 극대·극소의 관계'
FROM public.youtube_lectures
WHERE video_id = 'HaDLPhY6Vwc'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 2053, '도함수를 이용한 극대·극소의 판정'
FROM public.youtube_lectures
WHERE video_id = 'HaDLPhY6Vwc'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 2464, '이계도함수를 이용한 극대·극소의 판정'
FROM public.youtube_lectures
WHERE video_id = 'HaDLPhY6Vwc'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 4106, '다항함수의 대칭성 및 극대·극소의 대칭 이동'
FROM public.youtube_lectures
WHERE video_id = 'HaDLPhY6Vwc'
ON CONFLICT DO NOTHING;


-- 8/16 고2 목토 (롤의 정리, 평균값 정리(문제풀이포함))
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('pzUYJiG6QlU', '8/16 고2 목토 (롤의 정리, 평균값 정리(문제풀이포함))', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '롤의 정리의 정의와 성립 조건'
FROM public.youtube_lectures
WHERE video_id = 'pzUYJiG6QlU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 345, '최대·최소 정리를 이용한 롤의 정리 증명'
FROM public.youtube_lectures
WHERE video_id = 'pzUYJiG6QlU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1037, '평균값 정리의 정의와 기하학적 의미'
FROM public.youtube_lectures
WHERE video_id = 'pzUYJiG6QlU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1555, '롤의 정리를 활용한 평균값 정리 증명'
FROM public.youtube_lectures
WHERE video_id = 'pzUYJiG6QlU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1728, '평균값 정리를 만족하는 상수 c 구하기 문제 풀이'
FROM public.youtube_lectures
WHERE video_id = 'pzUYJiG6QlU'
ON CONFLICT DO NOTHING;


-- 8/16 고2 목토 (함수의 증가 감소)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('-gV62TRqZLk', '8/16 고2 목토 (함수의 증가 감소)', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '함수의 증가와 감소의 수학적 정의'
FROM public.youtube_lectures
WHERE video_id = '-gV62TRqZLk'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 644, '정의를 이용한 함수의 증가와 감소 증명'
FROM public.youtube_lectures
WHERE video_id = '-gV62TRqZLk'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 967, '도함수의 부호와 함수의 증가·감소 판정'
FROM public.youtube_lectures
WHERE video_id = '-gV62TRqZLk'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1934, '주어진 구간에서 함수가 증가 또는 감소할 조건'
FROM public.youtube_lectures
WHERE video_id = '-gV62TRqZLk'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 2579, '도함수의 그래프를 통한 원함수의 증가·감소 구간 판정'
FROM public.youtube_lectures
WHERE video_id = '-gV62TRqZLk'
ON CONFLICT DO NOTHING;


-- 8/14 고2 목토 (접선의 방정식)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('lBa_424RF7w', '8/14 고2 목토 (접선의 방정식)', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '접선의 방정식의 기본 개념 및 접점이 주어질 때'
FROM public.youtube_lectures
WHERE video_id = 'lBa_424RF7w'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1167, '접선에 수직인 직선(법선)의 방정식 구하기'
FROM public.youtube_lectures
WHERE video_id = 'lBa_424RF7w'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1556, '기울기가 주어질 때의 접선의 방정식'
FROM public.youtube_lectures
WHERE video_id = 'lBa_424RF7w'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 2723, '곡선 밖의 한 점이 주어질 때의 접선의 방정식'
FROM public.youtube_lectures
WHERE video_id = 'lBa_424RF7w'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 3890, '접선을 통한 곡선의 선형 근사적 의미'
FROM public.youtube_lectures
WHERE video_id = 'lBa_424RF7w'
ON CONFLICT DO NOTHING;


-- 8/14 고2 목토 (롤의 정리, 평균값 정리)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('kO7tVfE0q8w', '8/14 고2 목토 (롤의 정리, 평균값 정리)', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '롤의 정리와 평균값 정리 도입 및 관련 정리 복습'
FROM public.youtube_lectures
WHERE video_id = 'kO7tVfE0q8w'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 149, '롤의 정리의 정의와 기하학적 의미'
FROM public.youtube_lectures
WHERE video_id = 'kO7tVfE0q8w'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 224, '롤의 정리를 만족시키는 상수 c 구하기'
FROM public.youtube_lectures
WHERE video_id = 'kO7tVfE0q8w'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 299, '평균값 정리의 정의와 기하학적 의미'
FROM public.youtube_lectures
WHERE video_id = 'kO7tVfE0q8w'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 374, '평균값 정리를 만족시키는 상수 c 구하기'
FROM public.youtube_lectures
WHERE video_id = 'kO7tVfE0q8w'
ON CONFLICT DO NOTHING;


-- 8/9 고2 목토 (미분(곱미분, 다항식의 나눗셈))
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('_SKz786ddsU', '8/9 고2 목토 (미분(곱미분, 다항식의 나눗셈))', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '곱의 미분법(곱미분)의 개념과 성질'
FROM public.youtube_lectures
WHERE video_id = '_SKz786ddsU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 303, '인수정리와 미분계수를 활용한 미정계수의 결정'
FROM public.youtube_lectures
WHERE video_id = '_SKz786ddsU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1366, '치환을 이용한 미분계수 정의 형태의 극한값 계산'
FROM public.youtube_lectures
WHERE video_id = '_SKz786ddsU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1822, '로피탈의 정리의 개념과 올바른 사용 조건'
FROM public.youtube_lectures
WHERE video_id = '_SKz786ddsU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 2733, '도함수와 수열의 합(시그마) 공식의 연계 문제'
FROM public.youtube_lectures
WHERE video_id = '_SKz786ddsU'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 3036, '미분을 이용한 다항식의 나눗셈과 나머지정리'
FROM public.youtube_lectures
WHERE video_id = '_SKz786ddsU'
ON CONFLICT DO NOTHING;


-- 8/7 고2 목토 (미분(다항식미분, 합미분, 곱미분))
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('ksobN_pSjCs', '8/7 고2 목토 (미분(다항식미분, 합미분, 곱미분))', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '다항식의 미분 공식과 증명'
FROM public.youtube_lectures
WHERE video_id = 'ksobN_pSjCs'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 570, '미분의 성질 (실수배, 합, 차)'
FROM public.youtube_lectures
WHERE video_id = 'ksobN_pSjCs'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 690, '곱의 미분법과 증명'
FROM public.youtube_lectures
WHERE video_id = 'ksobN_pSjCs'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1110, '합성함수의 미분법 (체인 룰)'
FROM public.youtube_lectures
WHERE video_id = 'ksobN_pSjCs'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 2130, '다항식의 미분법 문제 풀이'
FROM public.youtube_lectures
WHERE video_id = 'ksobN_pSjCs'
ON CONFLICT DO NOTHING;


-- 7/31 고2 목토 (미분(미분가능성과 연속성))
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('ddN4A0zi-K4', '7/31 고2 목토 (미분(미분가능성과 연속성))', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '미분가능성과 연속성의 정의 및 관계'
FROM public.youtube_lectures
WHERE video_id = 'ddN4A0zi-K4'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 480, '미분가능하면 연속이다의 증명'
FROM public.youtube_lectures
WHERE video_id = 'ddN4A0zi-K4'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 630, '절댓값 함수의 연속성과 미분가능성 조사'
FROM public.youtube_lectures
WHERE video_id = 'ddN4A0zi-K4'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 930, '그래프에서 불연속점과 미분불능점 판정'
FROM public.youtube_lectures
WHERE video_id = 'ddN4A0zi-K4'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1380, '도함수의 정의와 기하학적 의미'
FROM public.youtube_lectures
WHERE video_id = 'ddN4A0zi-K4'
ON CONFLICT DO NOTHING;


-- 8/2 고2 목토 (미분(미분가능성과 연속성 문제풀이))
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('7ZJinBn0ii0', '8/2 고2 목토 (미분(미분가능성과 연속성 문제풀이))', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '평균 변화율과 순간 변화율의 정의'
FROM public.youtube_lectures
WHERE video_id = '7ZJinBn0ii0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 180, '평균 변화율과 미분 계수의 대소 비교'
FROM public.youtube_lectures
WHERE video_id = '7ZJinBn0ii0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 390, '미분 계수의 형태 변형과 모양 맞추기'
FROM public.youtube_lectures
WHERE video_id = '7ZJinBn0ii0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 2070, '미분 계수의 성질을 활용한 다양한 예제 풀이'
FROM public.youtube_lectures
WHERE video_id = '7ZJinBn0ii0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 2670, '치환 및 관계식을 활용한 미분 계수 구하기'
FROM public.youtube_lectures
WHERE video_id = '7ZJinBn0ii0'
ON CONFLICT DO NOTHING;


-- 8/9 고2 목토 (미분(곱미분 활용, 극대극소))
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('iuDBwmB2ARQ', '8/9 고2 목토 (미분(곱미분 활용, 극대극소))', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '평균 변화율과 순간 변화율의 비교 및 직관적 이해'
FROM public.youtube_lectures
WHERE video_id = 'iuDBwmB2ARQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 780, '평균 변화율 계산 및 연습 문제'
FROM public.youtube_lectures
WHERE video_id = 'iuDBwmB2ARQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1050, '미분 계수의 정의와 접선의 기울기'
FROM public.youtube_lectures
WHERE video_id = 'iuDBwmB2ARQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 2310, '2차 함수에서의 평균 변화율과 중점 미분 계수의 관계'
FROM public.youtube_lectures
WHERE video_id = 'iuDBwmB2ARQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 2970, '3차 함수의 평균 변화율과 미분 계수 문제 풀이'
FROM public.youtube_lectures
WHERE video_id = 'iuDBwmB2ARQ'
ON CONFLICT DO NOTHING;


-- 8/14 고2 목토 (미분(극대극소와 그래프))
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('8wGvZFewUCE', '8/14 고2 목토 (미분(극대극소와 그래프))', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '함수의 연속성 기본 성질과 사칙연산'
FROM public.youtube_lectures
WHERE video_id = '8wGvZFewUCE'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 90, '합성함수의 연속성 판정과 반례'
FROM public.youtube_lectures
WHERE video_id = '8wGvZFewUCE'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 510, '불연속 함수의 연산에 따른 연속성 판정'
FROM public.youtube_lectures
WHERE video_id = '8wGvZFewUCE'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 960, '연속성 진위 판정(ㄱ, ㄴ, ㄷ) 문제 풀이 및 반례 정리'
FROM public.youtube_lectures
WHERE video_id = '8wGvZFewUCE'
ON CONFLICT DO NOTHING;


-- 8/16 고2 목토 (미분(삼차함수 비율관계))
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('qTEhp30HPwQ', '8/16 고2 목토 (미분(삼차함수 비율관계))', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '연속함수의 성질과 대수적 증명'
FROM public.youtube_lectures
WHERE video_id = 'qTEhp30HPwQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 570, '최대·최소 정리의 개념과 조건 분석'
FROM public.youtube_lectures
WHERE video_id = 'qTEhp30HPwQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 960, '다양한 함수의 최댓값과 최솟값 구하기'
FROM public.youtube_lectures
WHERE video_id = 'qTEhp30HPwQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1200, '사잇값 정리의 개념과 기하학적 해석'
FROM public.youtube_lectures
WHERE video_id = 'qTEhp30HPwQ'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1890, '사잇값 정리를 이용한 실근의 존재성 증명'
FROM public.youtube_lectures
WHERE video_id = 'qTEhp30HPwQ'
ON CONFLICT DO NOTHING;


-- 8/21 고2 목토 (미분(극대극소 문제풀이, 방정식 부등식의 활용))
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('qlNs1_2tFU0', '8/21 고2 목토 (미분(극대극소 문제풀이, 방정식 부등식의 활용))', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '함수의 연속의 직관적 의미와 대수적 정의'
FROM public.youtube_lectures
WHERE video_id = 'qlNs1_2tFU0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 360, '구간(Interval)의 표현 방식과 정의'
FROM public.youtube_lectures
WHERE video_id = 'qlNs1_2tFU0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1650, '구간에서의 연속성과 불연속의 조건 분석'
FROM public.youtube_lectures
WHERE video_id = 'qlNs1_2tFU0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 3150, '미정계수를 포함한 함수의 연속성 문제 풀이'
FROM public.youtube_lectures
WHERE video_id = 'qlNs1_2tFU0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 3480, '연속함수의 성질을 이용한 함숫값 추론 문제 풀이'
FROM public.youtube_lectures
WHERE video_id = 'qlNs1_2tFU0'
ON CONFLICT DO NOTHING;


-- 8/23 고2 목토 (미분(방정식 부등식의 활용 문제풀이, 속도와 가속도))
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('ByIqHITpk7I', '8/23 고2 목토 (미분(방정식 부등식의 활용 문제풀이, 속도와 가속도))', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '0/0 꼴과 무한대-무한대 꼴을 이용한 미정계수의 결정'
FROM public.youtube_lectures
WHERE video_id = 'ByIqHITpk7I'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1080, '샌드위치 정리와 함수의 극한 활용 문제 풀이'
FROM public.youtube_lectures
WHERE video_id = 'ByIqHITpk7I'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1800, '도형과 그래프를 결합한 함수의 극한 활용'
FROM public.youtube_lectures
WHERE video_id = 'ByIqHITpk7I'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 2220, '함수의 극한에 대한 참·거짓 진위 판정과 반례'
FROM public.youtube_lectures
WHERE video_id = 'ByIqHITpk7I'
ON CONFLICT DO NOTHING;


-- 8/28 고2 목토 (미분(속도와 가속도 문제풀이), 적분(부정적분))
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('dQl94nMHqgg', '8/28 고2 목토 (미분(속도와 가속도 문제풀이), 적분(부정적분))', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '치환과 평행이동을 이용한 함수의 극한'
FROM public.youtube_lectures
WHERE video_id = 'dQl94nMHqgg'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 450, '가우스 함수와 절댓값 함수의 극한 판정'
FROM public.youtube_lectures
WHERE video_id = 'dQl94nMHqgg'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 780, '합성함수의 극한과 방향성 추적'
FROM public.youtube_lectures
WHERE video_id = 'dQl94nMHqgg'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1470, '함수의 극한 기본 성질과 수렴 조건의 이해'
FROM public.youtube_lectures
WHERE video_id = 'dQl94nMHqgg'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 2730, '샌드위치 정리(조임 정리)와 대소 관계'
FROM public.youtube_lectures
WHERE video_id = 'dQl94nMHqgg'
ON CONFLICT DO NOTHING;


-- 8/30 고2 목토 (적분(정적분))
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('uDQIoXSRZD0', '8/30 고2 목토 (적분(정적분))', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '0/0 꼴과 무한대/무한대 꼴 극한 계산 기법'
FROM public.youtube_lectures
WHERE video_id = 'uDQIoXSRZD0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 420, '미정계수 결정의 대수적 증명과 응용'
FROM public.youtube_lectures
WHERE video_id = 'uDQIoXSRZD0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 990, '무한대-무한대 꼴 및 무한대*0 꼴의 계산법'
FROM public.youtube_lectures
WHERE video_id = 'uDQIoXSRZD0'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1410, '미정계수 결정 문제 풀이 실전'
FROM public.youtube_lectures
WHERE video_id = 'uDQIoXSRZD0'
ON CONFLICT DO NOTHING;


-- 9/4 고2 목토 (적분(정적분의 기하학적 의미))
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('nKD-uFMiVLI', '9/4 고2 목토 (적분(정적분의 기하학적 의미))', '선생님 추천 개념 강의영상 (미적분Ⅰ)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '함수의 극한의 기본 개념과 그래프 분석'
FROM public.youtube_lectures
WHERE video_id = 'nKD-uFMiVLI'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 180, '무한대 발산의 정의와 기하학적 해석'
FROM public.youtube_lectures
WHERE video_id = 'nKD-uFMiVLI'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 480, '무한대에서의 극한과 점근선'
FROM public.youtube_lectures
WHERE video_id = 'nKD-uFMiVLI'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1140, '우극한과 좌극한의 정의 및 기하학적 해석'
FROM public.youtube_lectures
WHERE video_id = 'nKD-uFMiVLI'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1350, '극한값의 존재 조건과 미정계수 결정 문제'
FROM public.youtube_lectures
WHERE video_id = 'nKD-uFMiVLI'
ON CONFLICT DO NOTHING;


