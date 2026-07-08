-- ====================================================
-- PROBABILITY AND STATISTICS PLAYLIST YOUTUBE DATA IMPORT SQL
-- Generated At: 2026. 7. 9. 오전 1:22:01
-- ====================================================

-- 3/7 고3 목토 확통 (모집단과 표본, 표본평균)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('D7vC_SYHwbA', '3/7 고3 목토 확통 (모집단과 표본, 표본평균)', '선생님 추천 개념 강의영상 (확률과 통계)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '통계적 추정의 도입 및 모집단과 표본의 개념'
FROM public.youtube_lectures
WHERE video_id = 'D7vC_SYHwbA'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 100, '표본 조사와 전수 조사의 차이점 및 예시'
FROM public.youtube_lectures
WHERE video_id = 'D7vC_SYHwbA'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 503, '표본평균의 분포와 표본평균의 평균, 분산, 표준편차 공식'
FROM public.youtube_lectures
WHERE video_id = 'D7vC_SYHwbA'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1008, '임의 추출과 신뢰할 수 있는 표본 크기 결정 문제 풀이'
FROM public.youtube_lectures
WHERE video_id = 'D7vC_SYHwbA'
ON CONFLICT DO NOTHING;


-- 2/21 예비고3 목토 확통 (이항분포 평균, 분산 증명)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('kH_6M8JPqv8', '2/21 예비고3 목토 확통 (이항분포 평균, 분산 증명)', '선생님 추천 개념 강의영상 (확률과 통계)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '이항분포 B(n, p) 에서 기댓값(평균) E(X) = np 공식 유도 및 수학적 증명'
FROM public.youtube_lectures
WHERE video_id = 'kH_6M8JPqv8'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 504, '이항분포 분산 V(X) = np(1-p)의 수학적 증명 시작 및 수식 변형'
FROM public.youtube_lectures
WHERE video_id = 'kH_6M8JPqv8'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 809, '치환법을 활용한 독립시행 확률 합 정리'
FROM public.youtube_lectures
WHERE video_id = 'kH_6M8JPqv8'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1012, '이항분포 표준편차 및 분산 증명 마무리'
FROM public.youtube_lectures
WHERE video_id = 'kH_6M8JPqv8'
ON CONFLICT DO NOTHING;


-- 2/21 예비고3 목토 확통 (표준정규분포)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('JftIm6NWUp8', '2/21 예비고3 목토 확통 (표준정규분포)', '선생님 추천 개념 강의영상 (확률과 통계)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '표준정규분포 N(0, 1)의 정의 및 성질'
FROM public.youtube_lectures
WHERE video_id = 'JftIm6NWUp8'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 201, '확률변수의 표준화 변환 공식 (Z = (X-m)/sig)의 원리'
FROM public.youtube_lectures
WHERE video_id = 'JftIm6NWUp8'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 405, '표준정규분포표를 읽는 방법 및 대칭성 활용 방법'
FROM public.youtube_lectures
WHERE video_id = 'JftIm6NWUp8'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 507, '표준화를 활용한 실전 확률 계산 문제 풀이'
FROM public.youtube_lectures
WHERE video_id = 'JftIm6NWUp8'
ON CONFLICT DO NOTHING;


-- 2/21 예비고3 목토 확통 (정규분포)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('zKYVoOLA9dM', '2/21 예비고3 목토 확통 (정규분포)', '선생님 추천 개념 강의영상 (확률과 통계)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 2, '이항분포의 정규분포로의 근사 (큰 수의 법칙)'
FROM public.youtube_lectures
WHERE video_id = 'zKYVoOLA9dM'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 204, '정규분포 N(m, sig^2)의 정의와 확률밀도함수의 기하학적 그래프 개형'
FROM public.youtube_lectures
WHERE video_id = 'zKYVoOLA9dM'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 304, '평균(m)과 표준편차(sig)의 변화에 따른 그래프 대칭축과 흩어짐 비교'
FROM public.youtube_lectures
WHERE video_id = 'zKYVoOLA9dM'
ON CONFLICT DO NOTHING;


-- 2/19 예비고3 목토 확통 (이항분포)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('AGDiZ9PVTFI', '2/19 예비고3 목토 확통 (이항분포)', '선생님 추천 개념 강의영상 (확률과 통계)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '독립시행의 확률와 이항분포의 관계 정의'
FROM public.youtube_lectures
WHERE video_id = 'AGDiZ9PVTFI'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 200, '이항분포 기호 B(n, p)의 의미 및 확률질량함수 구성'
FROM public.youtube_lectures
WHERE video_id = 'AGDiZ9PVTFI'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 403, '이항분포를 따르는 변수의 평균(np)과 분산(npq) 공식 활용 기본 예제'
FROM public.youtube_lectures
WHERE video_id = 'AGDiZ9PVTFI'
ON CONFLICT DO NOTHING;


-- 2/14 예비고3 목토 확통 (기댓값, 분산, 표준편차)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('TyO8_BN6ERM', '2/14 예비고3 목토 확통 (기댓값, 분산, 표준편차)', '선생님 추천 개념 강의영상 (확률과 통계)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '확률변수 X의 기댓값(평균)의 대수적 정의 및 계산 방법'
FROM public.youtube_lectures
WHERE video_id = 'TyO8_BN6ERM'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 401, '확률변수 aX + b의 평균, 분산, 표준편차의 성질 증명'
FROM public.youtube_lectures
WHERE video_id = 'TyO8_BN6ERM'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 704, '분산의 정의(편차 제곱의 평균) 및 제곱의 평균에서 평균의 제곱을 뺀 계산 공식'
FROM public.youtube_lectures
WHERE video_id = 'TyO8_BN6ERM'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1214, '표준편차의 기하학적 의미 및 산포도 분석'
FROM public.youtube_lectures
WHERE video_id = 'TyO8_BN6ERM'
ON CONFLICT DO NOTHING;


-- 2/5 예비고3 목토 확통 (이산확률변수, 연속확률변수)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('Cub3ERufBMc', '2/5 예비고3 목토 확통 (이산확률변수, 연속확률변수)', '선생님 추천 개념 강의영상 (확률과 통계)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1, '통계 파트의 확률변수와 확률분포의 정의'
FROM public.youtube_lectures
WHERE video_id = 'Cub3ERufBMc'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 102, '이산확률변수와 확률질량함수의 성질'
FROM public.youtube_lectures
WHERE video_id = 'Cub3ERufBMc'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 505, '연속확률변수와 확률밀도함수의 정의 및 기하학적 의미 (넓이 = 1)'
FROM public.youtube_lectures
WHERE video_id = 'Cub3ERufBMc'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 907, '확률밀도함수 그래프에서의 구간 확률 계산 및 미정계수 결정'
FROM public.youtube_lectures
WHERE video_id = 'Cub3ERufBMc'
ON CONFLICT DO NOTHING;


-- 1/31 예비고3 목토 확통 (독립과 종속, 독립시행)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('Di-peRxhsEk', '1/31 예비고3 목토 확통 (독립과 종속, 독립시행)', '선생님 추천 개념 강의영상 (확률과 통계)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '사건의 독립과 종속의 엄밀한 정의 및 수학적 판정법'
FROM public.youtube_lectures
WHERE video_id = 'Di-peRxhsEk'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 208, '종속사건과 조건부확률에서의 종속의 의미'
FROM public.youtube_lectures
WHERE video_id = 'Di-peRxhsEk'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 310, '독립시행의 정의와 주사위/동전 던지기 시행의 예시'
FROM public.youtube_lectures
WHERE video_id = 'Di-peRxhsEk'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 510, '독립시행의 확률 공식 유도 및 기본 문제 풀이'
FROM public.youtube_lectures
WHERE video_id = 'Di-peRxhsEk'
ON CONFLICT DO NOTHING;


-- 1/31 예비고3 목토 확통 (전확률법칙)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('wnB7Bisfo-s', '1/31 예비고3 목토 확통 (전확률법칙)', '선생님 추천 개념 강의영상 (확률과 통계)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1, '조건부확률을 활용한 전확률의 법칙(Total Probability Theorem) 개념'
FROM public.youtube_lectures
WHERE video_id = 'wnB7Bisfo-s'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 203, '표본 공간의 분할과 곱셈정리를 이용한 사건의 확률 쪼개기'
FROM public.youtube_lectures
WHERE video_id = 'wnB7Bisfo-s'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 605, '실생활 문제(예: 불량률 문제, 안경 쓴 학생 문제)에서의 전확률법칙 적용'
FROM public.youtube_lectures
WHERE video_id = 'wnB7Bisfo-s'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 807, '조건부확률의 분모를 전확률로 두는 베이즈 정리의 실전 문제 풀이'
FROM public.youtube_lectures
WHERE video_id = 'wnB7Bisfo-s'
ON CONFLICT DO NOTHING;


-- 1/29 예비고3 목토 확통 (조건부확률, 확률의 곱셈정리)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('H6DFqtr4dI4', '1/29 예비고3 목토 확통 (조건부확률, 확률의 곱셈정리)', '선생님 추천 개념 강의영상 (확률과 통계)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '조건부확률 P(A|B)의 정의 및 벤다이어그램 해석'
FROM public.youtube_lectures
WHERE video_id = 'H6DFqtr4dI4'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 201, '조건부확률 계산 공식 및 분모 제한의 원리'
FROM public.youtube_lectures
WHERE video_id = 'H6DFqtr4dI4'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 407, '확률의 곱셈정리의 정의 및 종속/독립에 따른 형태 구분'
FROM public.youtube_lectures
WHERE video_id = 'H6DFqtr4dI4'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 810, '표를 이용하여 푸는 조건부확률 실전 팁 및 예제 풀이'
FROM public.youtube_lectures
WHERE video_id = 'H6DFqtr4dI4'
ON CONFLICT DO NOTHING;


-- 1/24 예비고3 목토 확통 (확률의 덧셈정리)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('SVNsRVlY6Q4', '1/24 예비고3 목토 확통 (확률의 덧셈정리)', '선생님 추천 개념 강의영상 (확률과 통계)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '수학적 확률의 기본 공리 및 샘플 스페이스'
FROM public.youtube_lectures
WHERE video_id = 'SVNsRVlY6Q4'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 402, '배반사건의 정의 및 배반사건일 때의 덧셈정리 공식'
FROM public.youtube_lectures
WHERE video_id = 'SVNsRVlY6Q4'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 707, '일반적인 두 사건의 확률의 덧셈정리 공식 활용'
FROM public.youtube_lectures
WHERE video_id = 'SVNsRVlY6Q4'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1112, '여사건의 확률의 정의 및 ''적어도'' 조건이 포함된 문제 풀이'
FROM public.youtube_lectures
WHERE video_id = 'SVNsRVlY6Q4'
ON CONFLICT DO NOTHING;


-- 1/21 예비고3 목토 확통 (확률의 정의)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('rup1SHmJonc', '1/21 예비고3 목토 확통 (확률의 정의)', '선생님 추천 개념 강의영상 (확률과 통계)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1, '시행, 사건, 표본공간의 용어 정의'
FROM public.youtube_lectures
WHERE video_id = 'rup1SHmJonc'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 103, '수학적 확률의 정의와 전제조건'
FROM public.youtube_lectures
WHERE video_id = 'rup1SHmJonc'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 607, '통계적 확률과 기하학적 확률의 정의 및 활용 예시'
FROM public.youtube_lectures
WHERE video_id = 'rup1SHmJonc'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1116, '소수와 서로소 등 정수 조건 사건을 분류하여 확률 구하는 예제'
FROM public.youtube_lectures
WHERE video_id = 'rup1SHmJonc'
ON CONFLICT DO NOTHING;


-- 1/15 예비고3 목토 확통 (이항계수의 성질, 파스칼의 삼각형)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('eMkaA2KLg6A', '1/15 예비고3 목토 확통 (이항계수의 성질, 파스칼의 삼각형)', '선생님 추천 개념 강의영상 (확률과 통계)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1, '(1+x)^n 의 전개식을 이용한 이항계수의 성질 도입'
FROM public.youtube_lectures
WHERE video_id = 'eMkaA2KLg6A'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 203, '이항계수의 합 공식과 홀수/짝수 번째 계수 합 공식 증명'
FROM public.youtube_lectures
WHERE video_id = 'eMkaA2KLg6A'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 809, '이항계수의 성질을 활용한 고난도 거듭제곱 연산 및 나머지 계산'
FROM public.youtube_lectures
WHERE video_id = 'eMkaA2KLg6A'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1423, '파스칼의 삼각형의 구성 원리와 하키스틱 패턴 증명'
FROM public.youtube_lectures
WHERE video_id = 'eMkaA2KLg6A'
ON CONFLICT DO NOTHING;


-- 1/10 예비고3 목토 확통 (같은 것이 있는 순열)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('ku_daorZXlc', '1/10 예비고3 목토 확통 (같은 것이 있는 순열)', '선생님 추천 개념 강의영상 (확률과 통계)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '같은 것이 포함된 순열(동자순열)의 나열 원리 및 나눗셈 처리'
FROM public.youtube_lectures
WHERE video_id = 'ku_daorZXlc'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 608, '순서가 이미 정해진 조합을 같은 것이 있는 순열로 변환하여 푸는 방법'
FROM public.youtube_lectures
WHERE video_id = 'ku_daorZXlc'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1010, '최단 거리 경로 수 구하기 문제 풀이와 장애물이 있는 경우의 분기 처리'
FROM public.youtube_lectures
WHERE video_id = 'ku_daorZXlc'
ON CONFLICT DO NOTHING;


-- 1/10 예비고3 목토 확통 (이항정리)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('vs_Z8ZAI8Vw', '1/10 예비고3 목토 확통 (이항정리)', '선생님 추천 개념 강의영상 (확률과 통계)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 2, '이항정리의 정의 및 일반항 구성 원리'
FROM public.youtube_lectures
WHERE video_id = 'vs_Z8ZAI8Vw'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 103, '두 다항식의 거듭제곱의 곱에서 특정 항의 계수 구하는 법'
FROM public.youtube_lectures
WHERE video_id = 'vs_Z8ZAI8Vw'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 505, '파스칼의 삼각형의 기본 구조 및 행과 열의 대칭성 관찰'
FROM public.youtube_lectures
WHERE video_id = 'vs_Z8ZAI8Vw'
ON CONFLICT DO NOTHING;


-- 1/10 예비고3 목토 확통 (중복조합)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('-EeXWNOUE4w', '1/10 예비고3 목토 확통 (중복조합)', '선생님 추천 개념 강의영상 (확률과 통계)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1, '중복조합의 정의 및 기호 nHr'
FROM public.youtube_lectures
WHERE video_id = '-EeXWNOUE4w'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 101, '칸막이 모델(공과 바)을 이용한 중복조합 공식의 조합 변환 유도'
FROM public.youtube_lectures
WHERE video_id = '-EeXWNOUE4w'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 506, '무기명 투표, 과일 고르기 등 실생활 중복조합 유형'
FROM public.youtube_lectures
WHERE video_id = '-EeXWNOUE4w'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 807, '음이 아닌 정수해의 개수와 양의 정수해(자연수해)의 개수 구하기 조건 분할'
FROM public.youtube_lectures
WHERE video_id = '-EeXWNOUE4w'
ON CONFLICT DO NOTHING;


-- 1/8 예비고3 목토 확통 (확통 기본, 원순열)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('xcXpLOeJCLA', '1/8 예비고3 목토 확통 (확통 기본, 원순열)', '선생님 추천 개념 강의영상 (확률과 통계)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 2, '고교 확률과 통계 전체 단원 로드맵 소개 및 고1 경우의 수 복습'
FROM public.youtube_lectures
WHERE video_id = 'xcXpLOeJCLA'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 504, '원탁에 둘러앉는 경우의 수 (원순열) 기본 개념'
FROM public.youtube_lectures
WHERE video_id = 'xcXpLOeJCLA'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 708, '원순열의 공식 (n-1)! 의 유도 원리'
FROM public.youtube_lectures
WHERE video_id = 'xcXpLOeJCLA'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 1013, '다각형 모양(탁자, 정삼각형, 직사각형) 배열에서의 원순열 변형 공식'
FROM public.youtube_lectures
WHERE video_id = 'xcXpLOeJCLA'
ON CONFLICT DO NOTHING;


-- 1/8 예비고3 목토 확통 (중복순열)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('A2b3i0J44Gw', '1/8 예비고3 목토 확통 (중복순열)', '선생님 추천 개념 강의영상 (확률과 통계)')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 2, '중복순열의 정의와 기호 nPIr 의 뜻'
FROM public.youtube_lectures
WHERE video_id = 'A2b3i0J44Gw'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 103, '서로 다른 것을 중복하여 서로 다른 것에 나열하는 상황 구별법'
FROM public.youtube_lectures
WHERE video_id = 'A2b3i0J44Gw'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 406, '중복순열을 적용한 모스 부호 만들기, 깃발 신호, 함수의 개수 구하기'
FROM public.youtube_lectures
WHERE video_id = 'A2b3i0J44Gw'
ON CONFLICT DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 607, '5진법 또는 중복 순열을 이용한 자연수의 개수 구하기'
FROM public.youtube_lectures
WHERE video_id = 'A2b3i0J44Gw'
ON CONFLICT DO NOTHING;


