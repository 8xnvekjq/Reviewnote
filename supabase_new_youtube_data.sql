-- 새로운 고2 대수(지수, 로그, 삼각함수, 수열) 유튜브 강의 및 타임라인 데이터 적재 스크립트
-- Supabase SQL Editor에 복사하여 실행하시면 됩니다.

DO $$
DECLARE
  v_lecture_id UUID;
BEGIN
  --------------------------------------------------
  -- 1. 12/20 예비고2 수토 대수 (지수법칙, 거듭제곱근)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('B6VRprbvYhw', '12/20 예비고2 수토 대수 (지수법칙, 거듭제곱근)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '수업 오리엔테이션 및 대수 과목 구성 안내'),
  (v_lecture_id, 90, '지수법칙의 기본 개념 및 증명'),
  (v_lecture_id, 372, '지수법칙 응용 문제 풀이'),
  (v_lecture_id, 461, '거듭제곱근의 정의와 개념'),
  (v_lecture_id, 697, '실수 범위에서의 거듭제곱근과 방정식의 해'),
  (v_lecture_id, 949, 'n제곱근의 개수 판별 (홀수/짝수 차이)'),
  (v_lecture_id, 1508, '그래프를 통한 거듭제곱근의 이해'),
  (v_lecture_id, 1696, '거듭제곱근 관련 예제 풀이'),
  (v_lecture_id, 1920, 'n제곱근의 성질 및 음수 처리 주의점'),
  (v_lecture_id, 2117, '거듭제곱근의 연산 성질 (중첩된 제곱근 포함)'),
  (v_lecture_id, 2472, '거듭제곱근 연산 문제 풀이'),
  (v_lecture_id, 2716, '거듭제곱근의 대소 비교 방법 및 마무리');

  --------------------------------------------------
  -- 2. 12/24 예비고2 수토 대수 (지수의 확장)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('byOHdeGoGXo', '12/24 예비고2 수토 대수 (지수의 확장)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '수업 도입 및 지수 확장의 목적'),
  (v_lecture_id, 90, '정수 범위에서의 지수 확장 (0제곱 및 음수 지수)'),
  (v_lecture_id, 466, '유리수 범위에서의 지수 확장 (거듭제곱근의 표현)'),
  (v_lecture_id, 922, '실수 범위에서의 지수 확장 (무리수 지수의 존재성)'),
  (v_lecture_id, 1012, '실전 문제 풀이 및 수업 마무리');

  --------------------------------------------------
  -- 3. 12/31 예비고2 수토 대수 (로그의 정의)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('dPgPilVSEvo', '12/31 예비고2 수토 대수 (로그의 정의)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '로그의 도입 배경 및 필요성'),
  (v_lecture_id, 81, '로그의 정의 (지수 방정식의 해로서의 로그)'),
  (v_lecture_id, 228, '로그와 지수의 변환 연습'),
  (v_lecture_id, 317, '로그 방정식을 지수 방정식으로 바꾸기'),
  (v_lecture_id, 375, '로그 값 계산하기'),
  (v_lecture_id, 497, '로그의 밑과 진수 조건'),
  (v_lecture_id, 666, '밑과 진수 조건을 활용한 변수 범위 구하기'),
  (v_lecture_id, 734, '로그 2의 3이 무리수임 증명 (귀류법)'),
  (v_lecture_id, 915, '마무리 및 질의응답');

  --------------------------------------------------
  -- 4. 12/31 예비고2 수토 대수 (로그의 기본성질들)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('wbRt6gJ24GA', '12/31 예비고2 수토 대수 (로그의 기본성질들)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '로그의 도입 및 지수 계산을 쉽게 하는 이유'),
  (v_lecture_id, 60, '로그의 기본 성질(1번: 로그의 정의) 증명'),
  (v_lecture_id, 176, '로그의 덧셈과 뺄셈 성질 증명'),
  (v_lecture_id, 317, '로그의 진수 지수 성질 증명 및 계산 연습'),
  (v_lecture_id, 515, '로그 기본 연산 예제 풀이'),
  (v_lecture_id, 1158, '밑변환 공식의 개념 및 필요성'),
  (v_lecture_id, 1348, '밑변환 공식의 증명'),
  (v_lecture_id, 1641, '로그의 역수 관계 및 밑변환 공식 응용'),
  (v_lecture_id, 1772, '밑변환 공식 관련 예제 풀이'),
  (v_lecture_id, 2210, '로그의 여러 가지 성질(지수의 지수 등) 및 마무리');

  --------------------------------------------------
  -- 5. 1/3 예비고2 수토 대수 (상용로그)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('qASEI50hws0', '1/3 예비고2 수토 대수 (상용로그)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '상용로그의 정의 및 도입 배경 (밑이 10인 로그)'),
  (v_lecture_id, 59, '상용로그표 보는 방법'),
  (v_lecture_id, 195, '상용로그표에 없는 값 계산 (진수의 변화)'),
  (v_lecture_id, 287, '로그의 정수 부분과 소수 부분 개념 및 성질'),
  (v_lecture_id, 593, '상용로그표를 이용한 방정식 풀이'),
  (v_lecture_id, 842, '정수 부분과 소수 부분의 깊이 있는 이해'),
  (v_lecture_id, 1157, '소수 부분의 이동과 자릿수의 관계 문제 풀이'),
  (v_lecture_id, 1268, '상용로그를 이용한 정수 자릿수 예측'),
  (v_lecture_id, 1374, '소수점 아래 0이 아닌 숫자가 처음 나타나는 위치 찾기 및 마무리');

  --------------------------------------------------
  -- 6. 1/3 예비고2 수토 대수 (지수함수 맛보기)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('h4hgnBDHY5g', '1/3 예비고2 수토 대수 (지수함수 맛보기)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '지수함수와 로그함수 학습 계획 안내'),
  (v_lecture_id, 45, '지수함수의 정의 및 y=2^x 그래프 점 찍어보기'),
  (v_lecture_id, 118, '음수 지수 개념 및 그래프 완성'),
  (v_lecture_id, 155, '함수의 기본 요소(정의역, 치역, 점근선) 체크'),
  (v_lecture_id, 212, '지수함수의 특징 및 난이도 안내'),
  (v_lecture_id, 261, '밑(a)이 2일 때의 기하급수적 증가와 그래프 개형'),
  (v_lecture_id, 342, '밑이 1보다 작을 때의 그래프 특징 (감소함수)'),
  (v_lecture_id, 421, '지수함수 그래프 그리기 예제 1 (증가함수)'),
  (v_lecture_id, 502, '지수함수 그래프 그리기 예제 2 (감소함수) 및 마무리');

  --------------------------------------------------
  -- 7. 1/14 예비고2 수토 대수 (지수함수)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('H2GMoY7j-rU', '1/14 예비고2 수토 대수 (지수함수)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '2학기 시험 범위 및 수열 단원 소개'),
  (v_lecture_id, 43, '지수로그 함수 개요'),
  (v_lecture_id, 70, '지수함수의 정의 및 기본 그래프(점 찍기)'),
  (v_lecture_id, 276, '지수함수의 정의역과 치역 및 점근선'),
  (v_lecture_id, 320, '밑(a)의 범위 조건'),
  (v_lecture_id, 358, '지수함수 그래프 그리기 및 대소 비교'),
  (v_lecture_id, 510, '평행 이동과 대칭 이동(x축, y축, 원점)'),
  (v_lecture_id, 664, '이동된 지수함수 그래프 그리기 예제'),
  (v_lecture_id, 842, '평행 이동이 적용된 함수의 정의역, 치역 및 점근선 구하기'),
  (v_lecture_id, 1032, '지수함수의 성질(지수법칙과의 관계)'),
  (v_lecture_id, 1095, '함수의 볼록성(아래로 볼록)과 평균 개념 마무리');

  --------------------------------------------------
  -- 8. 1/14 예비고2 수토 대수 (지수함수의 최대최소)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('JnsCuqHciOc', '1/14 예비고2 수토 대수 (지수함수의 최대최소)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '수업 시작 및 출석 관련 대화'),
  (v_lecture_id, 26, '지수함수의 최대·최소 개념 (증가/감소 함수 기초)'),
  (v_lecture_id, 90, '지수함수의 최대·최소 기본 문제 풀이'),
  (v_lecture_id, 152, '치환을 이용한 지수함수 문제 풀이 (이차함수 형태)'),
  (v_lecture_id, 295, '치환 시 변수의 범위 설정 중요성 강조'),
  (v_lecture_id, 323, '지수함수 치환 문제 심화 (범위 제한이 있는 경우)'),
  (v_lecture_id, 496, '마무리 및 다음 문제 풀이 예고');

  --------------------------------------------------
  -- 9. 1/14 예비고2 수토 대수 (로그함수-2)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('ck1jZO8msmY', '1/14 예비고2 수토 대수 (로그함수-2)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 2, '로그함수의 평행 이동 및 괄호 사용의 중요성'),
  (v_lecture_id, 90, '로그함수의 평행 이동 예제 및 점근선 파악'),
  (v_lecture_id, 148, '로그함수의 대칭 이동 (x축, y축 대칭)'),
  (v_lecture_id, 187, '평행 이동된 로그함수의 정의역과 치역 분석'),
  (v_lecture_id, 236, '로그함수 그래프 그리기 및 정의역/치역 예제'),
  (v_lecture_id, 289, '복잡한 로그 식의 변형 및 그래프 개형 파악'),
  (v_lecture_id, 383, '로그함수의 역함수 구하는 방법 및 쉽게 구하는 팁'),
  (v_lecture_id, 473, '지수함수를 이용한 대소 비교 (증가함수)'),
  (v_lecture_id, 530, '밑이 1보다 작은 지수함수의 대소 비교');

  --------------------------------------------------
  -- 10. 1/14 예비고2 수토 대수 (로그함수-3)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('67X7ozGp74I', '1/14 예비고2 수토 대수 (로그함수-3)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '지수와 로그의 대소 비교 기초'),
  (v_lecture_id, 40, '로그함수에서의 밑의 크기에 따른 증가/감소 판별'),
  (v_lecture_id, 66, '로그 대소 비교 문제 풀이 (지수 변환 활용)'),
  (v_lecture_id, 133, '로그의 성질 (로그 밖으로 지수 내리기와 정의역의 주의점)'),
  (v_lecture_id, 254, '짝수/홀수 지수에 따른 로그 함수의 그래프 차이 (함정 문제)'),
  (v_lecture_id, 341, '마플 특강: 로그함수 그래프와 밑의 관계를 이용한 대소 비교');

  --------------------------------------------------
  -- 11. 1/14 예비고2 수토 대수 (로그함수-1)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('bGza3aySPTk', '1/14 예비고2 수토 대수 (로그함수-1)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '로그함수의 정의 및 지수함수와의 관계'),
  (v_lecture_id, 37, '지수함수와 로그함수의 역함수 관계'),
  (v_lecture_id, 95, '로그함수의 그래프 특징 (정의역, 치역, 점근선)'),
  (v_lecture_id, 163, '밑이 1보다 작은 경우의 로그함수 그래프'),
  (v_lecture_id, 228, '로그함수 역함수 구하기 예제'),
  (v_lecture_id, 256, '로그의 성질을 만족하는 함수 형태 분석'),
  (v_lecture_id, 355, '로그함수 그래프 그리기 (증가/감소 및 곡률)'),
  (v_lecture_id, 439, '로그함수의 x축 대칭 관계'),
  (v_lecture_id, 561, '로그함수의 밑의 크기에 따른 대소 비교 방법');

  --------------------------------------------------
  -- 12. 1/21 예비고2 수토 대수 (지수함수와 로그함수의 교점)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('bM1RUp9IdrA', '1/21 예비고2 수토 대수 (지수함수와 로그함수의 교점)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '지수함수와 로그함수의 역함수 관계 및 교점의 유무'),
  (v_lecture_id, 48, '밑의 크기(1보다 작을 때)에 따른 교점 특징'),
  (v_lecture_id, 71, '지수함수(y=2^x)와 로그함수(y=log_sqrt(2)|x|) 그래프 그리기'),
  (v_lecture_id, 153, '그래프를 통한 교점 개수 확인'),
  (v_lecture_id, 176, '접하는 경우에 대한 판단의 어려움 및 학습 범위 안내');

  --------------------------------------------------
  -- 13. 1/21 예비고2 수토 대수 (로그함수의 최대최소)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('tln-xudozFw', '1/21 예비고2 수토 대수 (로그함수의 최대최소)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '로그함수의 최대/최소 개념 및 증가/감소 함수 판별'),
  (v_lecture_id, 30, '치환을 이용한 로그함수의 최대/최소 풀이 방식 설명'),
  (v_lecture_id, 62, '예제 1: 밑이 1보다 큰 증가함수인 경우의 최댓값과 최솟값'),
  (v_lecture_id, 126, '예제 2: 밑이 1보다 작은 감소함수인 경우의 최댓값과 최솟값'),
  (v_lecture_id, 223, '치환을 통한 2차 함수 형태의 로그함수 문제와 범위 설정'),
  (v_lecture_id, 283, '치환 범위 적용 및 최종 계산 및 마무리');

  --------------------------------------------------
  -- 14. 1/21 예비고2 수토 대수 (산술기하 평균을 이용한 최대최소)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('y6Cy5z0KsZ8', '1/21 예비고2 수토 대수 (산술기하 평균을 이용한 최대최소)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '수업 도입 및 산술기하 평균 복습'),
  (v_lecture_id, 29, '산술기하 평균의 정의 및 성립 조건'),
  (v_lecture_id, 95, '지수식의 최솟값 구하기 (산술기하 평균 적용)'),
  (v_lecture_id, 160, '미지수 k가 포함된 지수식의 최솟값 문제'),
  (v_lecture_id, 224, '로그식의 최솟값과 산술기하 평균의 관계'),
  (v_lecture_id, 280, '계산 과정 관련 질의응답'),
  (v_lecture_id, 335, '로그의 역수 관계와 산술기하 평균 활용'),
  (v_lecture_id, 400, '지수식의 치환과 t의 범위 설정 (산술기하 활용)'),
  (v_lecture_id, 473, '치환을 이용한 지수함수 최솟값 예제 풀이'),
  (v_lecture_id, 573, '로그의 덧셈 성질과 산술기하 평균을 이용한 최종 문제 풀이');

  --------------------------------------------------
  -- 15. 1/21 예비고2 수토 대수 (기울기를 이용한 지수,로그의 대소비교)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('zlqJ5EKTLBU', '1/21 예비고2 수토 대수 (기울기를 이용한 지수,로그의 대소비교)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '대소 비교를 위한 기울기 해석의 필요성 도입'),
  (v_lecture_id, 50, '로그함수 그래프에서의 기울기를 활용한 대소 비교 (원점 연결)'),
  (v_lecture_id, 146, '다른 점을 기준으로 한 로그함수의 기울기 해석'),
  (v_lecture_id, 225, '지수함수 그래프에서의 기울기 해석 및 대소 비교'),
  (v_lecture_id, 345, '역함수 관계와 직선의 기울기를 활용한 심화 문제 풀이'),
  (v_lecture_id, 595, '지수함수의 평행이동과 직선의 기울기를 이용한 중점 좌표 구하기'),
  (v_lecture_id, 815, '로그함수의 평행이동과 삼각형 넓이/기울기 관계를 이용한 문제 풀이'),
  (v_lecture_id, 935, '지수함수 점근선과 직선 사이의 거리 문제 해결'),
  (v_lecture_id, 1023, '주기 함수 언급 및 강의 마무리');

  --------------------------------------------------
  -- 16. 1/24 예비고2 수토 대수 (지수부등식)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('rHBCcUnGnD4', '1/24 예비고2 수토 대수 (지수부등식)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '지수함수의 밑에 따른 증가/감소 함수와 부등호 방향 변화 개념'),
  (v_lecture_id, 95, '치환을 이용한 지수부등식 풀이 시 주의사항 (t > 0 범위)'),
  (v_lecture_id, 126, '밑을 통일하여 푸는 기본적인 지수부등식 예제 풀이'),
  (v_lecture_id, 160, '밑이 1보다 작은 경우 부등호 방향이 바뀌는 예제 풀이'),
  (v_lecture_id, 189, '치환을 이용한 2차 부등식 형태의 지수부등식 풀이 및 마무리');

  --------------------------------------------------
  -- 17. 1/24 예비고2 수토 대수 (로그방정식)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('E9kxyfSRROw', '1/24 예비고2 수토 대수 (로그방정식)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '로그 방정식의 기본 개념 및 지수 방정식과의 비교'),
  (v_lecture_id, 20, '로그 방정식 풀이 시 주의점 (진수 조건 및 밑 조건)'),
  (v_lecture_id, 54, '밑과 진수 조건 확인법'),
  (v_lecture_id, 75, '로그 함수의 그래프와 치역 (치환 시 고려사항)'),
  (v_lecture_id, 201, '로그 방정식 예제 1 풀이'),
  (v_lecture_id, 214, '로그가 포함된 방정식 풀이 및 진수 조건 검토'),
  (v_lecture_id, 264, '치환을 이용한 로그 방정식 풀이'),
  (v_lecture_id, 326, '지수와 로그의 관계를 이용한 계산 팁'),
  (v_lecture_id, 383, '근과 계수의 관계를 활용한 로그 방정식 문제 풀이 및 마무리');

  --------------------------------------------------
  -- 18. 1/24 예비고2 수토 대수 (로그부등식)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('aquDbcGaDOM', '1/24 예비고2 수토 대수 (로그부등식)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '로그부등식의 기본 개념 (증가/감소 함수 및 밑 조건)'),
  (v_lecture_id, 41, '로그부등식 기초 예제 풀이 (밑이 1보다 큰 경우)'),
  (v_lecture_id, 115, '로그부등식 예제 풀이 (밑이 1보다 작은 경우 및 연립부등식)'),
  (v_lecture_id, 175, '치환을 이용한 로그부등식 풀이 및 진수 조건의 중요성'),
  (v_lecture_id, 272, '지수에 로그가 포함된 부등식 풀이 및 마무리');

  --------------------------------------------------
  -- 19. 1/24 예비고2 수토 대수 (지수방정식)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('7RVSZNQJIkQ', '1/24 예비고2 수토 대수 (지수방정식)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '지수 방정식의 정의와 기본 개념'),
  (v_lecture_id, 54, '밑을 같게 하여 지수 방정식 풀기 및 지수 함수의 1대1 대응 성질'),
  (v_lecture_id, 167, '치환을 이용한 지수 방정식 풀이 (주의사항: 치환된 문자의 범위)'),
  (v_lecture_id, 280, '치환 후 인수분해가 되지 않는 경우의 접근 방식 안내'),
  (v_lecture_id, 330, '근과 계수의 관계를 이용한 지수 방정식 응용 문제 풀이 및 마무리');

  --------------------------------------------------
  -- 20. 1/24 예비고2 수토 대수 (까다로운 지수로그 방부등식)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('CktqUxZ7sj0', '1/24 예비고2 수토 대수 (까다로운 지수로그 방부등식)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '도입 및 학습 주제 안내 (까다로운 지수로그 방정식)'),
  (v_lecture_id, 26, '밑이 미지수인 지수 방정식 (밑이 1인 경우 고려)'),
  (v_lecture_id, 90, '지수가 같은 지수 방정식 (지수가 0인 경우 고려)'),
  (v_lecture_id, 145, '밑이 미지수인 지수 방정식 예제 풀이'),
  (v_lecture_id, 222, '지수 부등식 (증가/감소 함수 및 범위 나누기)'),
  (v_lecture_id, 342, '로그 방정식 (진수가 1인 경우 등 숨은 해 찾기)'),
  (v_lecture_id, 438, '지수에 로그가 포함된 방정식/부등식 풀이법'),
  (v_lecture_id, 583, '로그를 취하는 최대/최소 문제 예제 풀이'),
  (v_lecture_id, 673, '지수에 로그가 있는 부등식 심화 유형'),
  (v_lecture_id, 755, '치환을 이용한 지수 방정식/부등식 (범위 주의)'),
  (v_lecture_id, 859, '치환을 이용한 방정식 예제 풀이'),
  (v_lecture_id, 908, '치환을 이용한 로그 부등식 풀이 및 마무리');

  --------------------------------------------------
  -- 21. 1/31 예비고2 수토 대수 (삼각함수 프리뷰)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('GbNT4KL1PA4', '1/31 예비고2 수토 대수 (삼각함수 프리뷰)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '삼각함수와 삼각비의 개념 소개'),
  (v_lecture_id, 43, '직각삼각형에서의 삼각비 정의 (사인, 코사인, 탄젠트)'),
  (v_lecture_id, 80, '특수각(30°, 45°, 60°)에서의 삼각비 값과 증명'),
  (v_lecture_id, 246, '좌표평면 위에서의 삼각함수 정의 확장'),
  (v_lecture_id, 373, '각도 변화에 따른 사인, 코사인 값의 변화 (주기성)'),
  (v_lecture_id, 465, '사인과 코사인의 값 확인'),
  (v_lecture_id, 492, '탄젠트의 기하학적 의미와 기울기 관계'),
  (v_lecture_id, 633, '사인 그래프의 개형 및 주기성 확인'),
  (v_lecture_id, 769, '각도 단위와 실수 대응을 위한 향후 학습 계획 (호도법 예고)');

  --------------------------------------------------
  -- 22. 2/4 예비고2 수토 대수 (일반각과 호도법)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('kUQDnhRAyrw', '2/4 예비고2 수토 대수 (일반각과 호도법)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '호도법 도입 배경 및 학습 목표'),
  (v_lecture_id, 48, '좌표평면에서의 시초선과 동경의 정의'),
  (v_lecture_id, 156, '특정 각도(120°, 390°, -60°)의 동경 표시'),
  (v_lecture_id, 240, '일반각의 개념 및 표현 방법'),
  (v_lecture_id, 362, '일반각 표현 연습 문제 풀이'),
  (v_lecture_id, 596, '사분면의 각 판별 연습'),
  (v_lecture_id, 745, '호도법의 정의 및 1라디안의 개념'),
  (v_lecture_id, 992, '60분법과 호도법의 변환 관계(pi = 180°)'),
  (v_lecture_id, 1059, '각도 단위 변환 공식 및 호도법에서의 일반각'),
  (v_lecture_id, 1256, '60분법과 호도법 간의 변환 연습'),
  (v_lecture_id, 1380, '호도법을 이용한 일반각 표현 및 복습'),
  (v_lecture_id, 1696, '부채꼴의 호의 길이와 넓이 공식 유도'),
  (v_lecture_id, 1876, '호의 길이와 넓이 공식 적용 문제 풀이'),
  (v_lecture_id, 2031, '부채꼴 둘레를 이용한 넓이 최대화 문제 및 마무리');

  --------------------------------------------------
  -- 23. 2/4 예비고2 수토 대수 (삼각함수의 정의)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('wKKIM9QbdfU', '2/4 예비고2 수토 대수 (삼각함수의 정의)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '삼각함수(사인, 코사인)의 정의와 단위원에서의 개념'),
  (v_lecture_id, 165, '단위원에서 사인(y좌표)의 변화'),
  (v_lecture_id, 206, '탄젠트의 정의(기울기) 및 부호 결정'),
  (v_lecture_id, 350, '중학교 과정 삼각비 복습 및 확장 준비'),
  (v_lecture_id, 417, '동경이 주어졌을 때 삼각함수 값 구하기 (예제 풀이)'),
  (v_lecture_id, 523, '삼각형을 이용한 삼각함수 값 구하기 팁'),
  (v_lecture_id, 631, '사분면별 삼각함수의 부호 (올사탄코)'),
  (v_lecture_id, 780, '라디안과 60분법 변환 및 예제 (120도)'),
  (v_lecture_id, 903, '210도 동경에서의 삼각함수 값 구하기'),
  (v_lecture_id, 975, '다양한 각도에 대한 삼각함수의 부호 판별'),
  (v_lecture_id, 1132, '삼각함수의 곱과 부호를 이용한 사분면 추론'),
  (v_lecture_id, 1215, '삼각함수 사이의 관계 (사인제곱 + 코사인제곱 = 1)'),
  (v_lecture_id, 1331, '주어진 값을 이용한 삼각함수 값 구하기'),
  (v_lecture_id, 1397, '탄젠트 역수 등 기타 관계 언급'),
  (v_lecture_id, 1456, '곱셈공식 변형을 활용한 삼각함수 식 계산'),
  (v_lecture_id, 1590, '탄젠트가 포함된 식의 통분 및 계산 예제 풀이');

  --------------------------------------------------
  -- 24. 2/7 예비고2 수토 대수 (삼각함수 그래프)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('_iTOlDzzHtw', '2/7 예비고2 수토 대수 (삼각함수 그래프)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '삼각함수의 정의와 단위원에서의 좌표 관계'),
  (v_lecture_id, 210, '호도법(라디안) 개념 및 변환'),
  (v_lecture_id, 409, '사인(sin) 그래프 그리기'),
  (v_lecture_id, 560, '주기 함수의 정의와 성질'),
  (v_lecture_id, 957, '사인 그래프 복습 및 2pi 주기 확인'),
  (v_lecture_id, 1107, '코사인(cos) 그래프와 사인과의 관계'),
  (v_lecture_id, 1250, '짝함수(우함수)와 홀함수(기함수) 개념 및 적용'),
  (v_lecture_id, 1537, '코사인 그래프의 성질 및 예제'),
  (v_lecture_id, 1660, '사인/코사인 그래프의 치역과 주기의 변화'),
  (v_lecture_id, 2071, '삼각함수의 평행이동 개념'),
  (v_lecture_id, 2260, '탄젠트(tan) 그래프와 점근선'),
  (v_lecture_id, 2652, '탄젠트의 홀함수 성질 및 예제'),
  (v_lecture_id, 2771, '탄젠트의 주기 변화, 평행이동 및 점근선 방정식 마무리');

  --------------------------------------------------
  -- 25. 2/7 예비고2 수토 대수 (여러가지 삼각함수 그래프)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('Rgn6XLV14IM', '2/7 예비고2 수토 대수 (여러가지 삼각함수 그래프)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '삼각함수 그래프의 성질 (주기 및 치역 변화) 기초'),
  (v_lecture_id, 67, '삼각함수의 평행이동 해석 방법'),
  (v_lecture_id, 168, '사인 그래프의 주기, 최댓값, 최솟값 예제 풀이'),
  (v_lecture_id, 282, '코사인 그래프의 평행이동 예제'),
  (v_lecture_id, 340, '코사인 그래프의 변형 (주기 및 평행이동) 예제'),
  (v_lecture_id, 412, '그래프를 보고 식(a, b값) 추론하기'),
  (v_lecture_id, 471, '그래프 분석을 통한 미정계수(a, b, c) 구하기'),
  (v_lecture_id, 597, '삼각함수 그래프 종합 문제 풀이'),
  (v_lecture_id, 731, '전체 절댓값이 포함된 삼각함수 그래프'),
  (v_lecture_id, 805, 'x에 절댓값이 포함된 삼각함수 및 탄젠트 그래프 성질');

  --------------------------------------------------
  -- 26. 2/11 예비고2 수토 대수 (삼각함수의 최대최소)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('HNwHxEftU3s', '2/11 예비고2 수토 대수 (삼각함수의 최대최소)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '삼각함수 최대·최소 학습 방향 안내'),
  (v_lecture_id, 28, '삼각함수의 각변환을 이용한 최대·최소 구하기'),
  (v_lecture_id, 125, '절댓값이 포함된 삼각함수의 그래프와 최대·최소'),
  (v_lecture_id, 216, '2차식 형태의 삼각함수 (치환을 이용한 최대·최소)'),
  (v_lecture_id, 303, '문자가 섞인 식의 삼각함수 변형 및 문제 풀이'),
  (v_lecture_id, 403, '분수식 형태의 삼각함수 (유리함수 개념 적용) 및 마무리');

  --------------------------------------------------
  -- 27. 2/11 예비고2 수토 대수 (삼각함수 각변환)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('BLqtb2lrTuo', '2/11 예비고2 수토 대수 (삼각함수 각변환)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '2pi 주기 및 대칭성(홀함수/짝함수)을 이용한 각변환'),
  (v_lecture_id, 361, '간단한 각변환 연습 문제 풀이'),
  (v_lecture_id, 385, '그래프를 이용한 pi +- x 각변환 원리'),
  (v_lecture_id, 726, 'pi/2 +- x 각변환 및 탄젠트 각변환 방법'),
  (v_lecture_id, 906, '복합적인 삼각함수 식 계산 예제'),
  (v_lecture_id, 1182, '사인과 코사인을 이용한 식의 값 계산'),
  (v_lecture_id, 1269, '각의 합이 90도일 때의 삼각함수 성질 (보각관계)'),
  (v_lecture_id, 1491, '각의 합이 90도인 응용 문제 풀이'),
  (v_lecture_id, 1540, '삼각형의 내각 합(180도)을 이용한 각변환'),
  (v_lecture_id, 1655, '삼각형 내각 응용 문제 풀이'),
  (v_lecture_id, 1708, '삼각함수 표 및 각변환을 통한 삼각함수 값 구하기'),
  (v_lecture_id, 1833, '좌표 및 동경을 이용한 각변환의 시각적 해석'),
  (v_lecture_id, 2077, '공식 암기 대신 그래프 활용의 중요성 강조 및 마무리');

  --------------------------------------------------
  -- 28. 2/14 예비고2 수토 대수 (삼각방정식, 삼각부등식)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('UP5TVrWL8x0', '2/14 예비고2 수토 대수 (삼각방정식, 삼각부등식)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '삼각방정식 및 부등식의 기본 개념과 그래프 활용의 중요성'),
  (v_lecture_id, 66, '사인(sin) 그래프를 이용한 삼각방정식 해 구하기 및 대칭성 활용'),
  (v_lecture_id, 186, '코사인(cos) 그래프를 이용한 삼각방정식 해 구하기'),
  (v_lecture_id, 286, '탄젠트(tan) 그래프와 주기성을 이용한 방정식 풀이'),
  (v_lecture_id, 461, '대칭성을 이용한 방정식의 해의 합 구하기'),
  (v_lecture_id, 598, '복합적인 삼각방정식 예제 풀이 (근의 합 활용)'),
  (v_lecture_id, 761, '주기가 다른 사인 함수의 방정식 해 구하기'),
  (v_lecture_id, 844, '다수의 근을 갖는 삼각방정식 예제 및 대칭성 심화'),
  (v_lecture_id, 966, '삼각부등식의 기본 개념 및 영역 판별'),
  (v_lecture_id, 1061, '사인 함수를 이용한 삼각부등식 풀이 예제'),
  (v_lecture_id, 1161, '코사인 함수를 이용한 삼각부등식 풀이 예제'),
  (v_lecture_id, 1254, '탄젠트 함수의 점근선을 고려한 삼각부등식 풀이 및 마무리');

  --------------------------------------------------
  -- 29. 2/21 예비고2 수토 대수 (사인법칙)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('8WcksCBsY2Y', '2/21 예비고2 수토 대수 (사인법칙)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '삼각함수 활용 및 도형 파트 소개'),
  (v_lecture_id, 23, '사인법칙의 정의 및 공식 설명'),
  (v_lecture_id, 72, '사인법칙 증명 (직각삼각형과 원주각 성질 활용)'),
  (v_lecture_id, 152, '사인법칙을 활용한 변의 길이 구하기 예제'),
  (v_lecture_id, 255, '외접원의 반지름 길이 구하기 예제'),
  (v_lecture_id, 302, '사인법칙의 변형 공식 및 기본형 정리'),
  (v_lecture_id, 378, '세 변의 길이의 비와 사인값의 비의 관계'),
  (v_lecture_id, 435, '사인법칙을 이용한 삼각형 성립 조건'),
  (v_lecture_id, 490, '사인법칙 응용 문제 풀이 및 마무리');

  --------------------------------------------------
  -- 30. 2/21 예비고2 수토 대수 (코사인법칙)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('iGjnkckstEU', '2/21 예비고2 수토 대수 (코사인법칙)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '코사인법칙 도입 및 피타고라스 정리와의 관계'),
  (v_lecture_id, 43, '코사인법칙의 증명 과정'),
  (v_lecture_id, 257, '코사인법칙 공식 정리 및 암기 확인'),
  (v_lecture_id, 370, '코사인법칙의 변형 공식 소개'),
  (v_lecture_id, 430, '코사인법칙 활용 상황 (변과 각의 관계)'),
  (v_lecture_id, 520, '세 변의 길이가 주어졌을 때 각 구하기'),
  (v_lecture_id, 612, '평행사변형에서의 코사인법칙 활용 (대각선 길이 구하기)'),
  (v_lecture_id, 810, '사인법칙과 코사인법칙의 선택 기준 및 삼각형의 변 구하기'),
  (v_lecture_id, 947, '코사인법칙을 이용한 복잡한 삼각형의 변 계산'),
  (v_lecture_id, 1101, '외접원 반지름이 주어진 경우의 삼각형 변 계산'),
  (v_lecture_id, 1170, '사인법칙을 활용한 응용 문제 풀이 및 마무리');

  --------------------------------------------------
  -- 31. 2/25 예비고2 수토 대수 (삼각형의 넓이)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('oAMXWEsxZ9k', '2/25 예비고2 수토 대수 (삼각형의 넓이)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '삼각형의 넓이 구하는 기본 공식 복습'),
  (v_lecture_id, 41, '내접원의 반지름을 이용한 넓이 공식 (1/2 rl)'),
  (v_lecture_id, 89, '사인(sin)을 이용한 삼각형 넓이 공식 (1/2 ab sin C)'),
  (v_lecture_id, 166, '좌표평면에서의 넓이 (신발끈 정리)'),
  (v_lecture_id, 211, '외접원의 반지름(R)과 세 변의 길이를 이용한 공식 증명 및 유도'),
  (v_lecture_id, 352, '삼각형 넓이 공식 응용 문제 풀이'),
  (v_lecture_id, 495, '내접원 반지름 공식 증명'),
  (v_lecture_id, 595, '헤론의 공식 소개 및 증명'),
  (v_lecture_id, 878, '세 변의 길이가 주어진 삼각형 넓이 풀이법 (헤론의 공식 vs 코사인 법칙)'),
  (v_lecture_id, 1055, '평행사변형 넓이 공식'),
  (v_lecture_id, 1083, '일반 사각형의 넓이 공식 (대각선 이용)'),
  (v_lecture_id, 1157, '사각형 관련 예제 풀이'),
  (v_lecture_id, 1230, '곱셈공식 변형을 활용한 넓이 관련 응용 문제 풀이');

  --------------------------------------------------
  -- 32. 3/4 예비고2 수토 대수 (수열의 정의, 등차수열)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('J7oqC1x0Fdo', '3/4 예비고2 수토 대수 (수열의 정의, 등차수열)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '수열의 정의 및 대수 과목에서의 위치'),
  (v_lecture_id, 157, '수열의 기본 용어 (항, 제n항 등) 및 유한/무한수열'),
  (v_lecture_id, 243, '수열의 규칙 찾기 예제 풀이'),
  (v_lecture_id, 350, '수열의 일반항(an) 개념'),
  (v_lecture_id, 427, '일반항을 이용한 항 나열 예제'),
  (v_lecture_id, 531, '규칙을 파악하여 일반항 구하기'),
  (v_lecture_id, 708, '등차수열의 정의와 공차(d)'),
  (v_lecture_id, 826, '등차수열의 일반항 구성 및 공차의 특징'),
  (v_lecture_id, 933, '등차수열 판별 및 공차 구하기 연습'),
  (v_lecture_id, 1030, '등차수열의 일반항 공식과 구하는 방법'),
  (v_lecture_id, 1248, '등차중항의 개념과 관계식'),
  (v_lecture_id, 1416, '등차중항을 활용한 문제 풀이'),
  (v_lecture_id, 1522, '등차수열의 문제 풀이 팁 (미지수 설정)'),
  (v_lecture_id, 1688, '등차수열 예제 풀이 및 마무리');

  --------------------------------------------------
  -- 33. 5/6 고2 수토 대수 (등차수열)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('6StTQgVaM18', '5/6 고2 수토 대수 (등차수열)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '수열의 정의와 항(term)에 대한 개념 이해'),
  (v_lecture_id, 81, '유한수열 and 무한수열의 구분'),
  (v_lecture_id, 106, '수열의 규칙 찾기 및 예제 풀이'),
  (v_lecture_id, 161, '수열의 일반항(a_n) 정의와 함수의 관계'),
  (v_lecture_id, 234, '일반항을 이용한 항 나열 예제'),
  (v_lecture_id, 283, '수열의 규칙을 파악하여 일반항 구하기'),
  (v_lecture_id, 385, '등차수열의 정의와 공차(d)의 개념'),
  (v_lecture_id, 466, '등차수열의 관계식'),
  (v_lecture_id, 516, '등차수열 판별 및 공차 구하기 예제'),
  (v_lecture_id, 590, '등차수열의 일반항 공식 (a_n = a_1 + (n-1)d)'),
  (v_lecture_id, 691, '일반항을 활용한 등차수열 찾기 예제'),
  (v_lecture_id, 773, '등차중항의 개념과 성질'),
  (v_lecture_id, 892, '등차중항을 활용한 문제 풀이'),
  (v_lecture_id, 953, '등차수열의 합과 관련된 수 설정 테크닉'),
  (v_lecture_id, 1064, '세 숫자가 등차수열을 이룰 때의 합과 곱 응용 문제 풀이');

  --------------------------------------------------
  -- 34. 5/6 고2 수토 대수 (등차수열의 합)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('BYFCzj8kDdc', '5/6 고2 수토 대수 (등차수열의 합)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '가우스의 일화로 보는 등차수열의 합의 원리'),
  (v_lecture_id, 133, '등차수열의 합 공식 유도 및 정리'),
  (v_lecture_id, 253, '공식의 형태 변형 (첫째항과 끝항 활용)'),
  (v_lecture_id, 347, '등차수열의 합 계산 예제 풀이'),
  (v_lecture_id, 492, '다양한 수열에서의 합 구하기 문제 풀이'),
  (v_lecture_id, 591, '등차수열의 합과 이차함수의 관계'),
  (v_lecture_id, 703, '처음으로 음수가 되는 항 찾기 및 합의 최댓값 탐구'),
  (v_lecture_id, 810, '합이 주어진 상황에서 일반항 및 공차 구하기'),
  (v_lecture_id, 1096, '이차함수 그래프를 활용한 최솟값 판별 및 마무리');

  --------------------------------------------------
  -- 35. 5/9 고2 수토 대수 (등비수열)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('9RefLF2aIHI', '5/9 고2 수토 대수 (등비수열)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '등비수열의 정의 및 예시'),
  (v_lecture_id, 48, '등비수열과 지수함수의 관계 및 성질'),
  (v_lecture_id, 103, '공비(r)의 개념 및 등비수열의 일반항 유도'),
  (v_lecture_id, 161, '등비수열 판별법'),
  (v_lecture_id, 225, '등비수열 찾기 연습 문제'),
  (v_lecture_id, 280, '등비수열의 일반항 구하기 연습'),
  (v_lecture_id, 406, '등비중항의 정의 및 공식'),
  (v_lecture_id, 485, '등비중항 증명'),
  (v_lecture_id, 523, '등비중항을 이용한 문제 풀이 및 마무리');

  --------------------------------------------------
  -- 36. 5/9 고2 수토 대수 (Sn으로 an 구하기)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('i8Gqa7rUe_k', '5/9 고2 수토 대수 (Sn으로 an 구하기)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '수열의 합과 일반항의 관계 중요성 강조'),
  (v_lecture_id, 47, 'S_n을 이용해 a_n을 구하는 원리 및 주의사항 (n=1일 때)'),
  (v_lecture_id, 157, '예제 풀이 1 (S_n이 주어졌을 때 일반항 구하기)'),
  (v_lecture_id, 248, '예제 풀이 2 (첫째항이 일반항 규칙과 다른 경우)'),
  (v_lecture_id, 383, '등차수열이 되기 위한 상수 k 조건 구하기'),
  (v_lecture_id, 477, '등차수열의 합 공식과 상수항의 관계 (빠르게 푸는 팁)'),
  (v_lecture_id, 641, '등차수열의 합 조건이 주어졌을 때 일반항 및 S_n 구하기');

  --------------------------------------------------
  -- 37. 5/13 고2 수토 대수 (등비수열의 합)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('YMuFahCsrfU', '5/13 고2 수토 대수 (등비수열의 합)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '등비수열의 합 도입 및 이전 수업(등차수열) 복습'),
  (v_lecture_id, 41, '등비수열 합 공식 유도 준비 (항의 나열)'),
  (v_lecture_id, 125, '등비수열의 합 공식 유도 과정'),
  (v_lecture_id, 226, '등비수열의 합 공식 정리 (공비가 1이 아닐 때)'),
  (v_lecture_id, 291, '공비가 1일 때의 등비수열의 합'),
  (v_lecture_id, 335, '등비수열의 합 공식 적용 예제 풀이'),
  (v_lecture_id, 445, '공비가 1보다 작을 때의 공식 활용 및 계산'),
  (v_lecture_id, 503, '추가 예제 풀이'),
  (v_lecture_id, 599, 'Sn을 이용한 일반항(an) 구하기 개념'),
  (v_lecture_id, 648, 'Sn에서 an 구하기 예제 풀이 (첫째항 체크 포함)'),
  (v_lecture_id, 740, 'Sn 식에 미지수가 포함된 경우의 풀이 및 마무리');

  --------------------------------------------------
  -- 38. 5/16 고2 수토 대수 (원리합계)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('Xuy5HBLMLOw', '5/16 고2 수토 대수 (원리합계)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '원리합계(원금과 이자의 합)의 개념 소개'),
  (v_lecture_id, 40, '단리법과 복리법의 차이 및 복리의 원리'),
  (v_lecture_id, 114, '단리를 적용한 원리합계 계산 예시'),
  (v_lecture_id, 228, '복리를 적용한 원리합계 계산 및 지수 함수적 증가'),
  (v_lecture_id, 315, '적립금 원리합계의 개념 및 초/말 예금의 차이'),
  (v_lecture_id, 502, '매년 초 10만 원씩 10년 적립 시 원리합계 풀이'),
  (v_lecture_id, 788, '정립금 증가 문제의 접근 방식'),
  (v_lecture_id, 896, '매년 정립금을 3%씩 늘려갈 경우의 원리합계 풀이'),
  (v_lecture_id, 1012, '복리 효과의 중요성 및 마무리');

  --------------------------------------------------
  -- 39. 5/16 고2 수토 대수 (시그마)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('XY2J0pVnAMo', '5/16 고2 수토 대수 (시그마)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '수열의 합과 시그마의 개념 도입'),
  (v_lecture_id, 86, '시그마의 정의 및 표현 방법'),
  (v_lecture_id, 185, '시그마 기호를 사용한 수열 표현 연습 (등차/등비수열)'),
  (v_lecture_id, 364, '시그마의 기본 성질 (선형성)'),
  (v_lecture_id, 491, '시그마의 상수배 성질'),
  (v_lecture_id, 556, '상수항의 시그마 계산 및 중요성 강조'),
  (v_lecture_id, 640, '시그마 성질을 이용한 예제 풀이 1'),
  (v_lecture_id, 711, '시그마 성질을 이용한 예제 풀이 2'),
  (v_lecture_id, 760, '시그마 연산 시 주의사항 및 마무리');

  --------------------------------------------------
  -- 40. 5/20 고2 수토 대수 (시그마 공식)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('o8JAp1LybDE', '5/20 고2 수토 대수 (시그마 공식)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '자연수의 거듭제곱 합(시그마) 공식 소개'),
  (v_lecture_id, 53, '시그마 k 공식 (등차수열 합 공식 활용)'),
  (v_lecture_id, 107, '시그마 k² 공식 유도 및 증명 (파스칼의 삼각형 활용)'),
  (v_lecture_id, 586, '시그마 k² 공식 암기법 정리'),
  (v_lecture_id, 643, '시그마 k³ 공식 소개'),
  (v_lecture_id, 685, '시그마 공식 활용 예제 1 (1차식)'),
  (v_lecture_id, 793, '시그마 공식 활용 예제 2 (제곱식)'),
  (v_lecture_id, 866, '시그마 공식 활용 예제 3 (전개 및 계산)'),
  (v_lecture_id, 930, '연속된 자연수의 곱의 합 (시그마 활용)'),
  (v_lecture_id, 1147, '특수한 수열의 합 (등비수열 및 반복 숫자 합) 및 마무리');

  --------------------------------------------------
  -- 41. 5/20 고2 수토 대수 (여러가지 수열의 합)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('-Q6wMLvlvuE', '5/20 고2 수토 대수 (여러가지 수열의 합)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '수열의 합 기본 원리 및 소거되는 형태'),
  (v_lecture_id, 146, '부분분수의 정의와 계산 방법'),
  (v_lecture_id, 318, '부분분수 응용 예제 풀이'),
  (v_lecture_id, 457, '세 개의 항으로 이루어진 부분분수 변형'),
  (v_lecture_id, 538, '무리수 형태의 수열 합 (유리화)'),
  (v_lecture_id, 582, '몇급수의 정의와 합을 구하는 과정 (마무리)');

  --------------------------------------------------
  -- 42. 5/23 고2 수토 대수 (수열의 귀납적 정의)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('pQSD52A0v08', '5/23 고2 수토 대수 (수열의 귀납적 정의)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '수열의 귀납적 정의 개념 도입'),
  (v_lecture_id, 69, '귀납적 정의와 초기항의 필요성'),
  (v_lecture_id, 151, '귀납적 관계식을 이용한 항 구하기 예제'),
  (v_lecture_id, 214, '피보나치 수열 소개'),
  (v_lecture_id, 304, '등차수열의 귀납적 정의'),
  (v_lecture_id, 368, '등차중항을 이용한 정의'),
  (v_lecture_id, 426, '등비수열의 귀납적 정의와 등비중항'),
  (v_lecture_id, 489, '등차/등비 수열 판별 및 일반항 구하기 연습'),
  (v_lecture_id, 577, '수열을 귀납적으로 정의해보기 연습'),
  (v_lecture_id, 643, '여러 가지 수열의 귀납적 정의 (합의 꼴)'),
  (v_lecture_id, 853, '여러 가지 수열의 귀납적 정의 (곱의 꼴)'),
  (v_lecture_id, 963, '교육과정 외 유형 및 일반항 구하기 예제'),
  (v_lecture_id, 1135, '곱의 꼴을 이용한 일반항(팩토리얼) 구하기 마무리');

  --------------------------------------------------
  -- 43. 5/27 고2 수토 대수 (수학적 귀납법)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('Y4q4eb3Ni9Q', '5/27 고2 수토 대수 (수학적 귀납법)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '수학적 귀납법의 개념 설명 (도미노 원리)'),
  (v_lecture_id, 75, '수학적 귀납법의 두 가지 단계 (베이직 스텝, 인덕션 스텝)'),
  (v_lecture_id, 124, 'n=1일 때 성립 확인 (베이직 스텝)'),
  (v_lecture_id, 184, 'k번째 가정 및 k+1번째 성립 증명 (인덕션 스텝)'),
  (v_lecture_id, 359, '시그마 k제곱 공식 증명 문제 풀이');

  --------------------------------------------------
  -- 44. 6/6 고2 수토 대수 (원리합계- 대출금의 상환, 연금의 현가)
  --------------------------------------------------
  INSERT INTO public.youtube_lectures (video_id, title, description)
  VALUES ('7affzaY4DuU', '6/6 고2 수토 대수 (원리합계- 대출금의 상환, 연금의 현가)', '대수 학습을 위한 선생님 추천 강의영상 (고2 대수)')
  ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
  RETURNING id INTO v_lecture_id;

  DELETE FROM public.youtube_timelines WHERE lecture_id = v_lecture_id;
  INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title) VALUES
  (v_lecture_id, 0, '원리합계 개념 복습 및 복리 계산 원리'),
  (v_lecture_id, 41, '예시를 통한 원리합계 계산 방식 설명'),
  (v_lecture_id, 118, '대출금 상환 문제의 도입 (할부 개념)'),
  (v_lecture_id, 225, '미래 가치와 현재 가치의 차이 (화폐의 시간 가치)'),
  (v_lecture_id, 400, '대출금 상환 문제 풀이 (카메라 할부 예시)'),
  (v_lecture_id, 706, '연금의 개념 및 연금의 현가 소개'),
  (v_lecture_id, 846, '연금 원리합계 계산 예시'),
  (v_lecture_id, 1050, '연금의 현가 역계산 (미래 가치를 현재 가치로 환산)'),
  (v_lecture_id, 1200, '화폐 가치 차이에 대한 요약 및 수업 마무리');

END $$;
