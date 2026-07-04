// scratch/seed_youtube_data.js
// 선생님이 직접 정리해주신 공통수학1, 2 강의 목록 DB 일괄 이식 스크립트

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wcvkmdvrowljypueucwx.supabase.co';
const supabaseKey = 'sb_publishable_BtAepfY-CiPuAsOSxJ_Y8w_ZTNZ7UWI';
const supabase = createClient(supabaseUrl, supabaseKey);

// 텍스트 시간 포맷 (예: "34:03" 또는 "0:30")을 초(seconds) 단위 숫자로 변환
function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  if (parts.length === 3) {
    // HH:MM:SS
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
  } else if (parts.length === 2) {
    // MM:SS 또는 H:MM
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  return parseInt(timeStr, 10) || 0;
}

// 선생님이 긁어주신 56개 강의 정보 배열 파싱
const rawLectures = [
  {
    title: '2/3 예비고1 화토 공수1(행렬의 진위판정, 케일리-해밀턴 정리)',
    videoId: 'LtHXt5_Ds3c',
    grade: '공통수학1',
    chapters: [
      { time: '0:30', title: '행렬의 진위판정 도입' },
      { time: '2:22', title: '단위행렬(E)의 역할' },
      { time: '13:17', title: '0인자(Zero Divisor) 개념' },
      { time: '25:18', title: '단위행렬의 추정' },
      { time: '28:50', title: '최대공약수와 행렬의 차수' },
      { time: '42:04', title: '케일리-해밀턴 정리(Cayley-Hamilton Theorem)' },
      { time: '49:34', title: '케일리-해밀턴 정리 활용' }
    ]
  },
  {
    title: '1/31 예비고1 화토 (행렬의 곱셈)',
    videoId: 'jswDH1N4JDo',
    grade: '공통수학1',
    chapters: [
      { time: '0:13', title: '행렬 곱셈의 기초 정의 및 계산 방법' },
      { time: '3:53', title: '곱셈이 가능한 행렬의 조건' },
      { time: '28:20', title: '행렬 곱셈의 성질 (교환법칙 불성립, 영행렬의 특징)' },
      { time: '31:43', title: '행렬의 연산 법칙 (결합법칙, 분배법칙)' },
      { time: '39:42', title: '곱셈 공식 주의사항 및 진위 판별 문제' }
    ]
  },
  {
    title: '1/31 예비고1 화토 (단위행렬)',
    videoId: 'k6HqddNEHVs',
    grade: '공통수학1',
    chapters: [
      { time: '0:00', title: '단위행렬의 정의' },
      { time: '1:36', title: '단위행렬의 성질' },
      { time: '3:35', title: '거듭제곱과 연산' },
      { time: '4:24', title: '곱셈 공식의 적용' },
      { time: '8:03', title: '진위 판정 문제 풀이' }
    ]
  },
  {
    title: '1/27 예비고1 화토 (행렬의 정의)',
    videoId: '5NTYHh7rIsE',
    grade: '공통수학1',
    chapters: [
      { time: '0:01', title: '행렬의 기초 개념' },
      { time: '3:00', title: '행렬의 명칭과 유래' },
      { time: '6:36', title: '행렬의 종류와 크기 표현' },
      { time: '8:02', title: '행렬의 성분 표시' },
      { time: '11:05', title: '행렬의 계산 문제 풀이' },
      { time: '14:49', title: '서로 같은 행렬의 조건' }
    ]
  },
  {
    title: '1/27 예비고1 화토 (행렬의 덧셈, 뺄셈)',
    videoId: 'pTQbMkcyBoU',
    grade: '공통수학1',
    chapters: [
      { time: '0:06', title: '행렬의 덧셈과 뺄셈 조건' },
      { time: '0:46', title: '행렬 덧셈의 성질' },
      { time: '2:02', title: '영행렬(Zero Matrix)' },
      { time: '9:37', title: '행렬의 뺄셈과 방정식' },
      { time: '18:44', title: '표를 이용한 행렬의 응용' },
      { time: '24:25', title: '행렬의 실수배(스칼라배)' }
    ]
  },
  {
    title: '1/24 예비고1 화토 (조합)',
    videoId: '59vClsmZVFU',
    grade: '공통수학1',
    chapters: [
      { time: '1:21', title: '조합의 개념' },
      { time: '2:49', title: '조합의 계산' },
      { time: '6:05', title: '조합의 성질' },
      { time: '10:27', title: '조합의 수학적 정의' },
      { time: '12:42', title: '조합의 파스칼 삼각형' },
      { time: '18:36', title: '필수 유형 풀이' },
      { time: '21:46', title: '적어도 문제' },
      { time: '25:19', title: '도형과 조합' }
    ]
  },
  {
    title: '1/20 예비고1 화토 (순열)',
    videoId: 'eRGMH9Qz7fI',
    grade: '공통수학1',
    chapters: [
      { time: '0:01', title: '순열의 정의 및 기본 개념' },
      { time: '3:38', title: '순열의 계산 및 회장/부회장 뽑기 예시' },
      { time: '6:33', title: '팩토리얼(n!)과 0!의 정의' },
      { time: '10:22', title: '이웃하는 순열 및 이웃하지 않는 순열' },
      { time: '14:06', title: '적어도 문제(여사건 활용) 및 교대로 서는 순열' },
      { time: '18:44', title: '배수 판정법 (2, 3, 4, 5, 6, 8, 9의 배수)' },
      { time: '32:45', title: '순열과 배수 판정법을 활용한 문제 풀이' }
    ]
  },
  {
    title: '1/13 예비고1 화토 (경우의 수)',
    videoId: 'QxLvV9n0o0E',
    grade: '공통수학1',
    chapters: [
      { time: '0:01', title: '순열과 조합의 개념' },
      { time: '5:51', title: '합의 법칙과 곱의 법칙' },
      { time: '8:36', title: '경우의 수 세기 시 주의사항' },
      { time: '9:54', title: '소수와 약수' },
      { time: '14:27', title: '포함-배제의 원리' },
      { time: '18:00', title: '곱의 법칙 실전 문제 풀이' }
    ]
  },
  {
    title: '1/10 예비고1 화토 (이차방정식의 실근의 조건)',
    videoId: 'IN2mzgdfkyA',
    grade: '공통수학1',
    chapters: [
      { time: '0:18', title: '이차방정식 실근 조건 개요' },
      { time: '0:54', title: '근의 부호 조건' },
      { time: '6:08', title: '근의 부호가 다를 때 심화' },
      { time: '12:47', title: '근의 범위 조건 (근의 분리)' },
      { time: '13:53', title: '근의 범위 문제 풀이' }
    ]
  },
  {
    title: '1/6 예비고1 화토 (연립이차부등식)',
    videoId: 'IpSwYqJkDQM',
    grade: '공통수학1',
    chapters: [
      { time: '0:05', title: '연립이차부등식의 기본 개념 및 절댓값 부등식과의 연계 설명' },
      { time: '0:50', title: '절댓값 부등식을 그래프로 해결하는 방법 및 풀이 시 주의사항' },
      { time: '1:38', title: '예제 1 풀이' },
      { time: '2:34', title: '예제 2 풀이' }
    ]
  },
  {
    title: '12/30 예비고1 화토 (이차부등식의 해의 조건 + 가우스부등식)',
    videoId: '6kp8JphVhi0',
    grade: '공통수학1',
    chapters: [
      { time: '0:04', title: '가우스 부등식의 기본 개념 및 풀이법' },
      { time: '0:35', title: '가우스가 포함된 이차부등식 치환 풀이' },
      { time: '3:06', title: '정수가 포함된 가우스 부등식 변형 및 풀이' },
      { time: '9:23', title: '해의 조건을 이용한 이차부등식 작성' },
      { time: '13:07', title: '항상 성립하는 이차부등식 (판별식 활용)' }
    ]
  },
  {
    title: '12/27 예비고1 화토 (절댓값부등식)',
    videoId: '_RlgG6XpuYg',
    grade: '공통수학1',
    chapters: [
      { time: '0:01', title: '절댓값 부등식의 정의 및 기본 개념' },
      { time: '0:42', title: '절댓값의 거리 개념을 이용한 부등식 풀이 기초' },
      { time: '2:47', title: '절댓값 부등식의 일반적인 해법 (안쪽/바깥쪽 범위)' },
      { time: '5:40', title: '치환을 이용한 복잡한 절댓값 부등식 풀이' },
      { time: '9:19', title: '두 절댓값을 포함한 연립부등식 풀이' },
      { time: '16:53', title: '절댓값 기호를 없애기 위한 구간 나누기(케이스 분류) 방법' },
      { time: '20:10', title: '절댓값이 두 개인 부등식의 구간별 해법' },
      { time: '27:06', title: '그래프를 활용한 절댓값 부등식 해석 및 풀이' }
    ]
  },
  {
    title: '12/27 예비고1 화토 (이차부등식)',
    videoId: '1GIZh5SrG_Y',
    grade: '공통수학1',
    chapters: [
      { time: '0:09', title: '이차부등식의 기본 개념 및 해석 방법' },
      { time: '1:06', title: '그래프를 이용한 이차부등식 문제 풀이 (근이 두 개인 경우)' },
      { time: '7:38', title: '중근을 갖는 이차부등식 (그래프가 x축에 접하는 경우)' },
      { time: '10:49', title: '최고차항 계수가 음수인 경우 및 부등식 변형' },
      { time: '11:36', title: '판별식을 활용한 이차부등식 풀이 (실근이 없는 경우)' }
    ]
  },
  {
    title: '12/23 예비고1 화토 (연립일차부등식)',
    videoId: 'lJPcIBI2mzM',
    grade: '공통수학1',
    chapters: [
      { time: '0:03', title: '연립부등식의 의미 및 기초 개념' },
      { time: '2:25', title: '연립부등식 풀이 예시' },
      { time: '4:24', title: '꼴의 부등식 (A < B < C 형태)' },
      { time: '7:13', title: '부등식의 해가 한 점인 경우' },
      { time: '10:41', title: '부등식의 사칙연산 (덧셈 및 곱셈)' }
    ]
  },
  {
    title: '12/23 예비고1 화토 (일차부등식)',
    videoId: 'VbzYf_1d97I',
    grade: '공통수학1',
    chapters: [
      { time: '0:01', title: '1차 부등식의 기초 개념 및 복습' },
      { time: '0:39', title: '문자가 포함된 1차 부등식의 풀이 주의사항 (양변을 나눌 때의 조건)' },
      { time: '2:26', title: '허수에서의 대소 관계 (대소 비교 불가)' },
      { time: '3:14', title: '부등식의 기본 성질 (덧셈, 뺄셈, 제곱의 성질)' },
      { time: '6:59', title: '부등식 성질 확인 문제 풀이' },
      { time: '9:52', title: '실수의 대소 관계 비교 방법 (뺄셈, 제곱을 이용한 비교)' },
      { time: '13:17', title: 'x의 계수를 모르는 부등식의 케이스별 풀이 (부정/불능 판단)' },
      { time: '19:27', title: '절대부등식의 개념 소개' }
    ]
  },
  {
    title: '12/20 예비고1 화토 (연립이차방정식)',
    videoId: 'wyIfExiUDyI',
    grade: '공통수학1',
    chapters: [
      { time: '0:31', title: '연립이차방정식의 기초 개념' },
      { time: '3:05', title: '연립이차방정식 풀이법' },
      { time: '6:17', title: '이차식과 이차식의 연립' },
      { time: '10:12', title: '대칭식(Symmetric Equation)의 풀이' },
      { time: '21:36', title: '연립방정식의 실근 조건과 판별식' },
      { time: '23:42', title: '해가 없거나 무수히 많은 경우' },
      { time: '32:07', title: '특수한 연립이차방정식' }
    ]
  },
  {
    title: '8/26 예비고1 화목토 (곱셈공식 변형)',
    videoId: 'thPwJfYH98A',
    grade: '공통수학1',
    chapters: [
      { time: '0:00', title: '숙제 질의응답' },
      { time: '9:20', title: '곱셈공식 변형의 개념' },
      { time: '13:06', title: '기본적인 곱셈공식 변형 문제 풀이' },
      { time: '19:08', title: '통분을 이용한 곱셈공식 변형' },
      { time: '22:01', title: '분수 형태의 곱셈공식 변형' },
      { time: '24:06', title: '고난도 변형(5제곱, 7제곱 등)의 아이디어' },
      { time: '33:35', title: '방정식과 연계된 변형 문제' },
      { time: '34:48', title: '문자가 세 개인 곱셈공식 변형' }
    ]
  },
  {
    title: '8/26 예비고1 화목토 (곱셈공식 변형(2))',
    videoId: '7mSjT-aiUvQ',
    grade: '공통수학1',
    chapters: [
      { time: '0:01', title: '곱셈공식 변형 기본 문제 풀이' },
      { time: '4:01', title: '활용 문제 (직육면체 대각선 길이)' },
      { time: '7:35', title: '완전제곱식 합으로의 변형 (중요 개념)' },
      { time: '12:27', title: '기타 곱셈공식 변형 및 마무리' }
    ]
  },
  {
    title: '8/23 예비고1 화목토 (곱셈공식(2))',
    videoId: 'hM75fDZdSao',
    grade: '공통수학1',
    chapters: [
      { time: '0:00', title: '다항식 전개 연습 및 기초 복습' },
      { time: '1:34', title: '세제곱 곱셈 공식 적용 및 계수 확인' },
      { time: '5:25', title: '세 개 이상의 다항식 곱셈 규칙 (합과 곱의 관계)' },
      { time: '7:35', title: '4개 다항식 전개 및 패턴 찾기' },
      { time: '23:23', title: '숫자만 이용한 계수 계산법 활용' },
      { time: '25:10', title: '주요 곱셈 공식 증명 및 심화 공식' },
      { time: '34:07', title: '심화 곱셈 공식(세제곱 꼴 등) 전개 실습' },
      { time: '38:59', title: '파스칼의 삼각형을 이용한 계수 구하기' },
      { time: '40:20', title: '마플 개념 익히기 문제 풀이 및 모든 계수의 합 구하는 팁' }
    ]
  },
  {
    title: '8/21 예비고1 화목토 (곱셈공식)',
    videoId: 'nxsVSO9l4Hc',
    grade: '공통수학1',
    chapters: [
      { time: '0:00', title: '다항식의 곱셈과 분배법칙 복습' },
      { time: '1:00', title: '곱셈 공식의 중요성 및 암기 전략 안내' },
      { time: '1:51', title: '$(a+b+c)^2$ 공식 증명 및 해설' },
      { time: '3:07', title: '세제곱 곱셈 공식 $(a+b)^3$ 유도 및 계수 설명' },
      { time: '4:27', title: '파스칼의 삼각형을 이용한 계수 규칙 설명' },
      { time: '5:26', title: '학습 과제 안내 및 마무리' }
    ]
  },
  {
    title: '8/21 예비고1 화목토 (다항식의 연산)',
    videoId: 'on4mzw2f5S8',
    grade: '공통수학1',
    chapters: [
      { time: '0:30', title: '다항식의 정의 및 복습' },
      { time: '2:07', title: '항, 계수, 차수' },
      { time: '4:08', title: '다항식의 차수 및 상수항' },
      { time: '5:13', title: '동류항' },
      { time: '6:12', title: 'x에 대한 다항식의 해석' },
      { time: '11:28', title: '내림차순과 오름차순' },
      { time: '16:21', title: '다항식의 덧셈과 뺄셈' },
      { time: '19:07', title: '계수만을 이용한 계산법' }
    ]
  },
  {
    title: '9/7 화토 다항식의 나눗셈',
    videoId: 'bzFTgb2C9og',
    grade: '공통수학1',
    chapters: [
      { time: '0:08', title: '다항식의 나눗셈 기초 및 원리' },
      { time: '04:29', title: '검산식(항등식)의 개념과 나머지 조건' },
      { time: '6:41', title: '조립제법의 개념 및 사용 방법' },
      { time: '10:15', title: '조립제법 사용 시 주의사항' },
      { time: '17:40', title: '예제 풀이' },
      { time: '20:22', title: '검산식을 활용한 다항식 구하기' },
      { time: '23:16', title: '검산식 변형을 통한 몫과 나머지 도출' },
      { time: '30:20', title: '조립제법을 이용한 구체적인 문제 해결 및 몫/나머지 보정' }
    ]
  },
  {
    title: '9/7 화토 항등식, 나머지정리,인수정리',
    videoId: 'aYl_hNIFJ4I',
    grade: '공통수학1',
    chapters: [
      { time: '0:05', title: '항등식의 정의와 방정식과의 차이점' },
      { time: '1:37', title: '미정계수법 (계수비교법 및 수치대입법)' },
      { time: '11:48', title: '특정 조건(임의의 x, k에 관계없이)이 주어지는 항등식 문제 풀이' },
      { time: '24:04', title: '연속 조립제법을 이용한 다항식 변형' },
      { time: '38:43', title: '나머지정리의 개념과 정의' },
      { time: '41:54', title: '인수정리의 개념과 활용' }
    ]
  },
  {
    title: '9/14 화토 나머지정리와 인수정리',
    videoId: '3_HVDIvWaUs',
    grade: '공통수학1',
    chapters: [
      { time: '0:00', title: '나머지 정리의 기본 원리 및 2차식 나눗셈' },
      { time: '8:16', title: '미지수 줄이기(방법 2)와 개념 적용' },
      { time: '22:46', title: '3차식으로 나눈 나머지 구하기' },
      { time: '41:16', title: '몫을 다시 나누는 문제 해결' },
      { time: '47:01', title: '인수정리(나머지가 0인 경우)' }
    ]
  },
  {
    title: '9/14 화토 인수분해',
    videoId: 'h8hNO2tA3Rs',
    grade: '공통수학1',
    chapters: [
      { time: '0:03', title: '인수분해의 정의' },
      { time: '2:00', title: '인수분해 공식' },
      { time: '5:47', title: '삼각형 모양 판단 공식' },
      { time: '9:26', title: '인수분해 적용' },
      { time: '13:23', title: '항이 4개인 식의 인수분해' },
      { time: '14:50', title: '6제곱 식의 인수분해' }
    ]
  },
  {
    title: '9/21 화토 복소수',
    videoId: 'DIRRPp1_bRQ',
    grade: '공통수학1',
    chapters: [
      { time: '0:43', title: '복소수의 도입' },
      { time: '4:23', title: '허수(i)의 정의' },
      { time: '6:24', title: '복소수의 분류' },
      { time: '7:00', title: '복소수가 같을 조건' },
      { time: '8:15', title: '켤레복소수' },
      { time: '13:53', title: '복소수의 사칙연산' },
      { time: '15:48', title: '분모의 실수화' },
      { time: '18:17', title: '켤레복소수의 성질' }
    ]
  },
  {
    title: '11/9 화토 복소수의 정의(2)',
    videoId: 'nqiQwt0yz90',
    grade: '공통수학1',
    chapters: [
      { time: '0:01', title: '복소수의 정의' },
      { time: '1:06', title: '두 복소수가 같을 조건' },
      { time: '1:22', title: '켤레복소수의 정의와 성질' },
      { time: '2:13', title: '복소수의 사칙연산' },
      { time: '3:42', title: '허수 단위 i의 정의' },
      { time: '4:13', title: '분모의 실수화' },
      { time: '7:39', title: '켤레복소수의 성질 증명' },
      { time: '13:04', title: '복소수가 실수 또는 순허수가 될 조건' },
      { time: '19:42', title: '복소수의 제곱이 음수가 될 조건' },
      { time: '26:25', title: '복소수가 포함된 등식과 미지수 구하기' },
      { time: '30:24', title: '복소수를 이용한 다항식의 값 구하기' },
      { time: '43:57', title: '켤레복소수의 성질을 이용한 식의 계산' },
      { time: '46:27', title: '복소수의 연산 등식 풀이' }
    ]
  },
  {
    title: '11/12 화토 이차방정식과 근과 계수의 관계(1)',
    videoId: 'x8XeblQQecM',
    grade: '공통수학1',
    chapters: [
      { time: '0:02', title: '이차방정식의 근의 대입과 미정계수 결정' },
      { time: '4:31', title: '절댓값이 포함된 이차방정식 풀이' },
      { time: '9:31', title: '이차방정식의 판별식 개념 및 근의 개수 판별' },
      { time: '19:22', title: '판별식을 이용한 완전제곱식 조건 및 응용' },
      { time: '40:40', title: '이차방정식의 근과 계수의 관계' },
      { time: '54:22', title: '복소수 범위에서의 이차식 인수분해' },
      { time: '57:04', title: '이차방정식의 켤레근의 성질' }
    ]
  },
  {
    title: '11/12 화토 이차방정식과 근과 계수의 관계(2)',
    videoId: 'iG4t83cJ9nA',
    grade: '공통수학1',
    chapters: [
      { time: '0:02', title: '두 근의 합과 곱을 이용한 식의 계산' },
      { time: '1:00', title: '분수 형태의 식 통분 및 계산' },
      { time: '3:20', title: '이차식의 차수 낮추기(근의 성질 대입)' },
      { time: '14:05', title: '두 근이 주어졌을 때 이차방정식 세우기' },
      { time: '15:39', title: '계수를 포함한 방정식의 응용 문제' }
    ]
  },
  {
    title: '11/16 고1 화토 이차방정식과 이차함수의 관계',
    videoId: 'RhXr_Twi2dY',
    grade: '공통수학1',
    chapters: [
      { time: '0:00', title: '개념설명: 이차함수의 기본 그래프와 평행이동' },
      { time: '12:29', title: '이차방정식과 이차함수의 관계' },
      { time: '20:08', title: '개념 check: 판별식을 이용한 위치 관계 확인' },
      { time: '42:54', title: '문제 풀이: 이차함수와 x축, 직선의 교점 관련 실전 문제' }
    ]
  },
  {
    title: '11/19 고1 화토 이차함수의 최대최소',
    videoId: '1aDwKEApx0A',
    grade: '공통수학1',
    chapters: [
      { time: '0:00', title: '개념설명 (이차함수의 최대최소 기본 개념 및 축의 방정식)' },
      { time: '10:07', title: '개념 check (문제 풀이 및 복습)' },
      { time: '21:38', title: '문제1 (이차함수의 최대최소 범위 확인)' },
      { time: '24:50', title: '문제2 (미지수 K가 포함된 이차함수의 최대최소)' },
      { time: '38:55', title: '문제3 (치환을 이용한 이차함수의 최대최소)' },
      { time: '1:06:58', title: '문제4 (XY 관계식이 주어진 이차함수의 최대최소)' },
      { time: '1:09:40', title: '문제5 (이차함수의 최대최소 활용)' }
    ]
  },
  {
    title: '12/24 고1 화토 삼사차방정식',
    videoId: '-KmX1_v7Nfg',
    grade: '공통수학1',
    chapters: [
      { time: '0:01', title: '3·4차 방정식 기본 개념 및 인수분해/조립제법' },
      { time: '17:15', title: '유형 1: 공통 부분이 있는 방정식 (치환)' },
      { time: '25:58', title: '유형 2: 지수가 짝수인 방정식 (복이차식)' },
      { time: '37:30', title: '유형 3: 계수가 대칭인 4차 방정식 (상반방정식)' },
      { time: '45:51', title: '근과 계수 및 미지수 구하기' },
      { time: '47:48', title: '3차 방정식의 중근 조건' },
      { time: '51:18', title: '3차 방정식의 활용 (도형)' }
    ]
  },
  {
    title: '12/31 고1 화토 삼차방정식의 근과계수, 연립이차방정식 베이직쎈',
    videoId: 'GzT5CNdswK8',
    grade: '공통수학1',
    chapters: [
      { time: '0:02', title: '3차 방정식의 근과 계수의 관계 개념 설명' },
      { time: '03:32', title: '3차 방정식의 작성 방법 및 관련 예제' },
      { time: '9:05', title: '3차 방정식에서의 켤레근 성질' },
      { time: '12:17', title: 'x³=1 및 x³=-1의 허근 오메가(ω) 성질' },
      { time: '16:31', title: '연립이차방정식 풀이 (1차식과 2차식, 2차식과 2차식)' },
      { time: '21:55', title: '대칭식 연립방정식 풀이 및 치환 활용법' }
    ]
  },
  {
    title: '1/4 고1 화토 연립부등식, 절댓값 부등식',
    videoId: 'thxZ7nA5AUY',
    grade: '공통수학1',
    chapters: [
      { time: '0:01', title: '1차 부등식 기초' },
      { time: '0:46', title: '미지수 계수의 부등식 (케이스 분류)' },
      { time: '3:45', title: '연립일차부등식의 정의' },
      { time: '6:05', title: '연립부등식 풀이법(연속형)' },
      { time: '7:53', title: '특수해의 경우' },
      { time: '10:18', title: '연립부등식의 해가 주어진 경우' },
      { time: '12:00', title: '해를 갖도록(또는 갖지 않도록) 하는 조건' },
      { time: '18:40', title: '정수 해의 개수/합 조건' },
      { time: '23:30', title: '연립부등식의 활용' },
      { time: '26:05', title: '절댓값 부등식(기본)' },
      { time: '34:10', title: '복합 부등식 풀이' },
      { time: '39:15', title: '절댓값이 두 개 이상인 경우' }
    ]
  },
  {
    title: '고1 1/7 화토 이차부등식, 이차부등식 연립',
    videoId: 'E1tnd-52fQw',
    grade: '공통수학1',
    chapters: [
      { time: '0:01', title: '이차부등식의 정의 및 판별법' },
      { time: '1:41', title: '이차함수 그래프를 이용한 이차부등식 풀이 원리' },
      { time: '6:25', title: '특수한 경우의 해 (모든 실수, 해 없음, 중근 등)' },
      { time: '9:13', title: '완전제곱식을 이용한 부등식 해석' },
      { time: '10:43', title: '해가 주어졌을 때 이차부등식 식 세우기' },
      { time: '14:40', title: '이차부등식이 항상 성립할 조건 (판별식 활용)' },
      { time: '19:49', title: '해가 존재하지 않을 조건' },
      { time: '22:00', title: '이차함수와 일차함수, 이차함수 간의 관계 해석' },
      { time: '25:04', title: '두 이차부등식의 곱이 0보다 큰 경우 (연립부등식)' }
    ]
  },
  {
    title: '1/11 고1 화토 이차방정식의 실근조건',
    videoId: 'BRZo6_3t_d0',
    grade: '공통수학1',
    chapters: [
      { time: '0:00', title: '두 근이 모두 1보다 큰 경우 설명' },
      { time: '11:07', title: '두 근 사이에 -3이 있는 경우 설명' },
      { time: '31:59', title: '두 근이 모두 양수/음수일 때, 또는 서로 다른 부호일 때' },
      { time: '41:23', title: '필수 예제 풀이 및 실근 조건 종합 연습' }
    ]
  },
  {
    title: '1/11 고1 화토 경우의수(합의법칙, 곱의법칙)',
    videoId: 'lpUgH9WXqbc',
    grade: '공통수학1',
    chapters: [
      { time: '0:43', title: '경우의 수 기본 개념 및 합의 법칙·곱의 법칙 기초' },
      { time: '3:29', title: '합의 법칙과 곱의 법칙의 구분 (동시성 기준)' },
      { time: '8:20', title: '합의 법칙 예제 (주사위 합의 경우의 수)' },
      { time: '12:09', title: '방정식 자연수 해 구하기' },
      { time: '14:54', title: '십의 자리/일의 자리 조건 경우의 수' },
      { time: '16:51', title: '다항식의 전개 항의 개수' },
      { time: '17:29', title: '약수의 개수 구하는 방법 (소인수분해 활용)' },
      { time: '22:16', title: '경로의 수 계산' },
      { time: '25:23', title: '색칠하기 문제 (인접 영역 조건)' },
      { time: '33:26', title: '지불 방법과 지불 금액의 차이 및 계산' }
    ]
  },
  {
    title: '1/14 고1 화토 순열',
    videoId: 'pkxq0eHkvUU',
    grade: '공통수학1',
    chapters: [
      { time: '0:17', title: '합의 법칙과 곱의 법칙 개념 복습' },
      { time: '0:37', title: '순열(Permutation)의 기초' },
      { time: '4:23', title: 'nPr의 정의: n명 중에서 r명을 뽑아 나열' },
      { time: '7:12', title: '조합(Combination)의 개념 도입 ($nCr$)' },
      { time: '10:52', title: '팩토리얼 및 순열 관련 정의 및 약속' },
      { time: '21:15', title: '이웃하는 경우의 수 계산' },
      { time: '23:54', title: '이웃하지 않는 경우의 수 계산' },
      { time: '25:40', title: '남녀 교대로 세우는 경우의 수' },
      { time: '28:08', title: '특정 조건이 있는 문자열 나열' },
      { time: '31:12', title: '적어도 한쪽 끝에 모음이 올 경우의 수' },
      { time: '34:49', title: '자연수 만들기 및 배수 판정법' },
      { time: '40:55', title: '사전식 배열 순서 구하기' }
    ]
  },
  {
    title: '1/14 고1 화토 조합',
    videoId: 'jfmH_zY-988',
    grade: '공통수학1',
    chapters: [
      { time: '0:12', title: '순열(Permutation)과 순서의 중요성 개념' },
      { time: '2:10', title: '조합(Combination, nCr)의 정의와 계산 원리' },
      { time: '4:22', title: '조합의 계산 예시 및 성질(nCr = nCn-r)' },
      { time: '10:46', title: '조합의 성질을 이용한 방정식 풀이' },
      { time: '18:45', title: '조합을 이용한 조건부 선택 문제 풀이' },
      { time: '22:15', title: '특정한 조건을 포함하거나 제외하는 조합 문제' },
      { time: '26:36', title: '조합과 순열(나열)의 결합 문제' },
      { time: '30:30', title: '조합을 이용한 기하학적 개수 구하기 (직선 개수)' },
      { time: '33:05', title: '삼각형 개수 구하기' },
      { time: '34:58', title: '평행사변형 개수 구하기' }
    ]
  },
  
  // ================= 공통수학 2 과목 =================
  {
    title: '2/8 고1 화토 공통수학2 무게중심, 직선의 방정식(기초)',
    videoId: 'KWC6ygiWDDM',
    grade: '공통수학2',
    chapters: [
      { time: '0:01', title: '삼각형의 무게중심 구하는 법 (좌표의 평균)' },
      { time: '0:39', title: '삼각형의 중점들의 무게중심 구하기' },
      { time: '3:35', title: '직선의 방정식 기초 (기울기 및 y절편)' },
      { time: '10:06', title: '직선의 방정식 개념 (특수 직선 x=a, y=b)' },
      { time: '12:19', title: '기울기와 탄젠트(tan)의 관계' },
      { time: '14:29', title: '한 점과 기울기가 주어졌을 때 직선의 방정식 구하기' },
      { time: '17:43', title: '두 점을 지나는 직선의 방정식' },
      { time: '19:21', title: 'x절편과 y절편이 주어졌을 때 직선의 방정식' },
      { time: '21:21', title: '문제 풀이 및 연습' }
    ]
  },
  {
    title: '2/8 고1 화토 공통수학2 내분점',
    videoId: 'Kadf8YFNU-U',
    grade: '공통수학2',
    chapters: [
      { time: '0:24', title: '좌표평면에서의 내분점 공식' },
      { time: '6:17', title: '내분점 계산 연습 및 주의사항' },
      { time: '11:00', title: '삼각형의 무게중심 공식 유도' },
      { time: '23:16', title: '삼각형의 외심과 내심 성질 복습' },
      { time: '43:07', title: '1사분면 위의 내분점 조건' },
      { time: '47:14', title: '평행사변형과 마름모의 성질을 이용한 좌표 구하기' },
      { time: '54:43', title: '내각의 이등분선 정리 활용' }
    ]
  },
  {
    title: '2/11 고1 화토 직선의 방정식(문제)',
    videoId: '0p3RHIgjCw0',
    grade: '공통수학2',
    chapters: [
      { time: '0:17', title: '직선의 방정식 기초: 중점을 지나는 직선 구하기' },
      { time: '2:49', title: 'x절편과 y절편을 이용한 직선의 방정식' },
      { time: '6:00', title: '기울기와 각도를 이용한 직선의 방정식' },
      { time: '16:43', title: '세 점이 한 직선 위에 있을 조건(기울기 일치)' },
      { time: '17:59', title: '삼각형의 넓이를 이등분하는 직선의 방정식' },
      { time: '21:08', title: '평행한 직선의 방정식 구하기' },
      { time: '22:14', title: '수직인 직선의 방정식 구하기' },
      { time: '23:37', title: '두 직선의 위치 관계(평행 및 수직 조건)' },
      { time: '35:54', title: '선분의 수직이등분선의 방정식' }
    ]
  },
  {
    title: '2/11 고1 화토 직선의 방정식(개념이어서)',
    videoId: 'COWCLGAFzP0',
    grade: '공통수학2',
    chapters: [
      { time: '0:01', title: '직선의 방정식과 1차 함수의 중요성 및 기본 개념 소개' },
      { time: '1:07', title: '직선의 방정식의 두 가지 형태: 표준형과 일반형 정의' },
      { time: '2:33', title: '표준형과 일반형의 차이 및 학습 전략' },
      { time: '10:49', title: '직선의 방정식 그래프 그리는 방법' },
      { time: '22:10', title: '두 직선의 위치 관계(평행, 일치, 한 점에서 만남)' },
      { time: '26:17', title: '일반형에서 위치 관계 판단하기' },
      { time: '33:10', title: '위치 관계 판단 기준 요약 및 정리' },
      { time: '40:24', title: '두 직선이 수직일 조건(기울기 곱이 -1)' },
      { time: '54:28', title: '정점을 지나는 직선의 방정식(항등식 개념)' },
      { time: '1:01:26', title: '예제 풀이 및 개념 확인' }
    ]
  },
  {
    title: '2/15 고1 화토 원의 방정식',
    videoId: '0KFw3OhH4Ow',
    grade: '공통수학2',
    chapters: [
      { time: '0:03', title: '원의 정의 및 원의 방정식 유도' },
      { time: '3:03', title: '원의 방정식의 표준형과 일반형' },
      { time: '14:20', title: '좌표축에 접하는 원의 방정식' },
      { time: '33:14', title: '원의 방정식 구하기 실전 문제 풀이' }
    ]
  },
  {
    title: '2/15 고1 화토 직선의 방정식',
    videoId: 'qI3JY6DGWuo',
    grade: '공통수학2',
    chapters: [
      { time: '01:48', title: '세 직선으로 삼각형이 만들어지지 않는 경우' },
      { time: '08:10', title: '점 P를 지나는 직선의 방정식' },
      { time: '09:53', title: '두 직선의 교점을 지나는 직선의 방정식 구하기' },
      { time: '18:06', title: '점과 직선 사이의 거리 공식 증명 및 개념' },
      { time: '29:48', title: '점과 직선 사이의 거리 공식 실전 문제 풀이' },
      { time: '31:28', title: '직선과 수직이고 원점으로부터 거리가 주어진 직선의 방정식' },
      { time: '47:27', title: '평행한 두 직선 사이의 거리 구하기' },
      { time: '50:20', title: '세 점을 꼭짓점으로 하는 삼각형의 넓이 구하기 (신발끈 정리)' }
    ]
  },
  {
    title: '2/18 고1 화토 원의 접선의 방정식',
    videoId: 'VboF0emnifM',
    grade: '공통수학2',
    chapters: [
      { time: '0:00', title: '이전 문제 풀이 및 피타고라스 정리 복습' },
      { time: '1:44', title: '원 위의 점과 직선 사이의 거리(최대/최소) 구하기' },
      { time: '7:11', title: '기울기가 주어진 원의 접선의 방정식 공식 및 유도' },
      { time: '17:48', title: '원 위의 한 점에서의 접선의 방정식 공식 및 유도' },
      { time: '32:21', title: '원 밖의 한 점에서 그은 접선의 방정식 개요 및 예제 풀이' }
    ]
  },
  {
    title: '2/18 고1 화토 원의방정식, 원과 직선의 위치관계',
    videoId: 'COj9iSCvQEg',
    grade: '공통수학2',
    chapters: [
      { time: '0:51', title: '세 점을 지나는 원의 방정식 (일반형)' },
      { time: '16:22', title: '원이 되기 위한 조건 (R^2 > 0)' },
      { time: '19:48', title: '좌표축에 접하는 원의 방정식' },
      { time: '24:47', title: 'x축, y축에 동시에 접하는 원' },
      { time: '27:04', title: '원과 직선의 위치관계 (d와 r의 비교)' },
      { time: '42:58', title: '두 원의 교점을 지나는 원의 방정식' },
      { time: '48:50', title: '공통현의 방정식' }
    ]
  },
  {
    title: '2/22 고1 화토 평행이동, 대칭이동',
    videoId: '4fUciy_Vviw',
    grade: '공통수학2',
    chapters: [
      { time: '0:05', title: '점의 평행이동 기본 원리' },
      { time: '1:27', title: '도형의 평행이동 규칙' },
      { time: '3:06', title: '원의 평행이동' },
      { time: '5:09', title: '대칭이동의 개요' },
      { time: '6:30', title: '점의 대칭이동 공식' },
      { time: '11:24', title: '도형의 대칭이동 부호 변화' },
      { time: '20:57', title: '평행이동과 대칭이동의 순서' },
      { time: '27:52', title: '복합 문제 풀이' }
    ]
  },
  {
    title: '2/22 고1 화토 원의 밖에서 그은 접선의 방정식, 평행이동',
    videoId: 'yt-iESa3pnI',
    grade: '공통수학2',
    chapters: [
      { time: '0:05', title: '원 밖에서 그은 접선의 방정식 구하는 방법' },
      { time: '35:38', title: '원 위의 점에서의 접선의 방정식 공식 활용' },
      { time: '1:02:48', title: '평행이동의 개념' }
    ]
  },
  {
    title: '2/26 고1 수토 대칭이동 문제풀이, 집합(개념)',
    videoId: 'phifLvvqug8',
    grade: '공통수학2',
    chapters: [
      { time: '0:17', title: '선분의 길이 최소값 구하기 (대칭이동 활용)' },
      { time: '10:48', title: '대칭이동 활용 문제 풀이' },
      { time: '14:42', title: '점 두 개가 있을 때의 대칭이동 문제' },
      { time: '17:38', title: '집합의 정의 및 개념 설명' },
      { time: '24:40', title: '집합의 표현 방법 (벤 다이어그램, 조건제시법)' },
      { time: '36:49', title: '집합의 분류 (공집합, 유한/무한집합)' },
      { time: '42:12', title: '유한집합의 원소 개수 표현 n(A)' }
    ]
  },
  {
    title: '2/26 고1 수토 점에 대한 대칭이동, 직선에 대한 대칭이동',
    videoId: '69HrKcpZv7w',
    grade: '공통수학2',
    chapters: [
      { time: '0:03', title: '대칭이동의 종류 소개' },
      { time: '1:06', title: '점에 대한 점의 대칭이동 개념 및 공식 유도' },
      { time: '8:00', title: '점에 대한 도형(원)의 대칭이동 개념 및 식 적용' },
      { time: '32:26', title: '직선에 대한 점의 대칭이동 개념 (수직 및 중점)' },
      { time: '46:06', title: '직선에 대한 점의 대칭이동 문제 풀이' },
      { time: '49:10', title: '직선에 대한 도형(원/포물선)의 대칭이동' }
    ]
  },
  {
    title: '3/1 고1 수토 부분집합(2)',
    videoId: '9NiRDYXMckY',
    grade: '공통수학2',
    chapters: [
      { time: '0:11', title: '부분집합의 개수 구하는 원리' },
      { time: '1:09', title: '특정 원소를 포함하거나 포함하지 않는 부분집합의 개수' },
      { time: '6:13', title: '부분집합의 포함 관계와 정의' },
      { time: '10:46', title: '직선에 대한 점의 대칭 이동' },
      { time: '14:26', title: '부분집합의 포함 관계를 이용한 미지수 구하기' },
      { time: '20:01', title: '집합이 서로 같을 조건' },
      { time: '22:21', title: '좌표평면에서의 대칭 이동 문제 풀이' },
      { time: '26:01', title: '적어도 ~가 포함되는 부분집합의 개수' },
      { time: '27:37', title: '집합의 포함 관계 응용 문제' }
    ]
  },
  {
    title: '3/1 고1 수토 부분집합(1)',
    videoId: '5VwqSYGiXgk',
    grade: '공통수학2',
    chapters: [
      { time: '0:02', title: '집합과 원소의 정의 및 구분' },
      { time: '7:40', title: '집합의 표현 방법 (원소나열법, 조건제시법)' },
      { time: '9:51', title: '집합의 연산과 원소의 개수' },
      { time: '24:10', title: '부분집합의 개념 및 포함 관계' },
      { time: '33:16', title: '집합의 부분집합 나열 및 개수' },
      { time: '37:26', title: '도형의 대칭이동 (점과 도형)' },
      { time: '44:46', title: '서로 같은 집합과 진부분집합' },
      { time: '51:40', title: '부분집합의 개수 공식 및 점에 대한 대칭이동' }
    ]
  },
  {
    title: '8/16 고1 수토 (집합의 연산) - 공수2',
    videoId: 'XSIzR68gBLs',
    grade: '공통수학2',
    chapters: [
      { time: '0:01', title: '합집합의 정의 및 예시' },
      { time: '0:24', title: '교집합의 정의 및 예시' },
      { time: '1:24', title: '서로소의 정의' },
      { time: '4:12', title: '합집합과 교집합의 성질' },
      { time: '8:41', title: '여집합의 정의' },
      { time: '12:09', title: '차집합의 정의' },
      { time: '16:21', title: '여집합과 차집합의 성질' },
      { time: '17:55', title: '부분집합과 연산의 관계' },
      { time: '19:18', title: '연습 문제 풀이' }
    ]
  },
  {
    title: '8/20 고1 수토 (집합의 연산-(2)) - 공수2',
    videoId: '5Uxn48q-fjs',
    grade: '공통수학2',
    chapters: [
      { time: '0:08', title: '집합 연산의 재해석 및 차집합의 성질' },
      { time: '3:13', title: '연산 법칙(분배 법칙, 드모르간의 법칙)을 이용한 등식 증명' },
      { time: '7:00', title: '집합의 관계식 분석을 통한 부분집합 관계 파악' },
      { time: '10:51', title: '벤다이어그램을 활용한 집합의 영역 색칠 및 해석' },
      { time: '13:24', title: '이차부등식을 이용한 집합의 원소 범위 구하기' },
      { time: '16:48', title: '대칭차집합의 정의 및 성질' },
      { time: '23:31', title: '대칭차집합의 여집합 및 복합 연산 해석' },
      { time: '26:38', title: '새로운 연산 기호의 정의 및 반복 연산 패턴 파악' }
    ]
  }
];

async function run() {
  try {
    console.log(`🚀 총 ${rawLectures.length}개의 수집된 강의 데이터를 DB에 이식하기 시작합니다...`);

    for (let i = 0; i < rawLectures.length; i++) {
      const lecture = rawLectures[i];
      console.log(`--------------------------------------------------`);
      console.log(`[이식 중 ${i + 1}/${rawLectures.length}] ${lecture.title}`);

      // 1. youtube_lectures 테이블에 동영상 업서트(Upsert)
      const { data: dbLecture, error: lError } = await supabase
        .from('youtube_lectures')
        .upsert({
          video_id: lecture.videoId,
          title: lecture.title,
          description: `공통수학 학습을 위한 선생님 추천 강의영상 (${lecture.grade})`
        }, { onConflict: 'video_id' })
        .select('id')
        .single();

      if (lError) {
        console.error(`❌ 강의 업서트 실패:`, lError.message);
        if (lError.message.includes('Could not find the table')) {
          console.error('⚠️ [중요 경고] Supabase SQL Editor에 youtube_schema.sql 파일의 코드를 복사해 먼저 테이블을 생성하셔야 합니다!');
          return;
        }
        continue;
      }

      // 2. youtube_timelines 기존 데이터 청소 (중복 적재 방지)
      const { error: dError } = await supabase
        .from('youtube_timelines')
        .delete()
        .eq('lecture_id', dbLecture.id);
      
      if (dError) {
        console.error(`⚠️ 기존 타임라인 정리 오류:`, dError.message);
      }

      // 3. 타임라인 대량 인서트
      if (lecture.chapters && lecture.chapters.length > 0) {
        const rows = lecture.chapters.map(ch => ({
          lecture_id: dbLecture.id,
          start_seconds: parseTimeToSeconds(ch.time),
          chapter_title: ch.title
        }));

        const { error: tError } = await supabase
          .from('youtube_timelines')
          .insert(rows);

        if (tError) {
          console.error(`❌ 타임라인 적재 실패:`, tError.message);
        } else {
          console.log(`✅ DB 저장 완료! (${rows.length}개 타임라인)`);
        }
      } else {
        console.log(`ℹ️ 타임라인이 없는 영상으로 등록을 마칩니다.`);
      }
    }

    console.log('\n🎉 모든 수동 수집 개념 강의 및 타임라인 데이터베이스 이식이 끝났습니다!');

  } catch (err) {
    console.error('❌ 스크립트 실행 중 에러 발생:', err.message);
  }
}

run();
