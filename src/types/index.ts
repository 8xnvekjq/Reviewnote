export interface ProblemBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface MistakeAnalysis {
  solvingProcess: string;   // [문제 풀이 과정]
  mistakeSummary?: string;  // [학생 풀이 기반 틀린 이유 1줄 요약]
  problemText?: string;     // [추출된 원본 문제 지문]
  problemBox?: ProblemBox;  // [인쇄된 문제 영역 바운딩 박스 (필기 제외)]
  matchedVideoId?: string;       // AI가 직접 매칭한 유튜브 Video ID
  matchedStartSeconds?: number;  // AI가 직접 매칭한 유튜브 시작 시간(초)
  matchedChapterTitle?: string;  // AI가 직접 매칭한 챕터 제목
  mistakeDetail?: string;   // [실수한 지점 상세 분석] (이전 데이터 호환용)
  rootCause?: string;       // [근본적인 틀린 이유] (이전 데이터 호환용)
  actionPlan?: string;      // [향후 재발 방지 대책] (이전 데이터 호환용)
  modelUsed?: string;       // 분석에 사용된 AI 모델 명
  printed?: boolean;        // 인쇄/출력 완료 여부
  reviewDates?: string[];   // 단계별 복습 완료 일자 배열 (['7/10', '', ''])
}

export type ReviewState = 'O' | 'X' | 'star' | '';

export interface AdminUserStat {
  userId: string;
  email: string;
  mistakeCount: number;      // 전체 오답노트 수
  completedCount: number;    // 복습완료(O 3회) 수
  lastActivity: string | null; // 최근 활동일 (ISO string)
  weeklyScore: number;       // 주간 복습 랭킹 점수
  weeklyTotalCount: number;  // 이번주 등록된 오답 수
  weeklyCompletedCount: number; // 이번주 복습완료(O 3회) 수
  schoolGrade?: string;      // 학년 정보 (예: 중3, 고1)
  lastReviewDate?: string | null; // 마지막 복습 일자
}

// 5대 실수 원인 유형 (체크박스)
export const ROOT_CAUSE_OPTIONS = [
  { id: 'calc',     label: '🧮 계산 실수',       desc: '연산, 산수 오류' },
  { id: 'formula',  label: '📘 공식 오적용',      desc: '공식 암기 부족 / 혼동' },
  { id: 'misread',  label: '🔍 문제 오독',        desc: '조건 누락, 문제를 잘못 읽음' },
  { id: 'concept',  label: '🧠 개념 부족',        desc: '핵심 개념 이해 부족' },
  { id: 'strategy', label: '🎯 풀이 전략 실패',   desc: '어떻게 접근할지 방향을 잡지 못함' },
] as const;

export type RootCauseId = typeof ROOT_CAUSE_OPTIONS[number]['id'];

// 수학 교육과정 과목 및 하위 단원 체계 (중3 + 고교 2022 개정 세분화 버전)
export const MATH_CURRICULUM: Record<string, string[]> = {
  '중3-1':    ['제곱근과 실수', '근호를 포함한 식의 계산', '다항식의 곱셈과 인수분해', '이차방정식', '이차함수와 그래프'],
  '중3-2':    ['삼각비', '원과 직선', '원주각', '통계(대푯값과 산포도)'],
  '공통수학1': ['다항식의 연산', '나머지정리와 인수분해', '복소수', '이차방정식', '이차방정식과 이차함수', '여러 가지 방정식', '여러 가지 부등식', '경우의 수', '순열과 조합', '행렬과 그 연산'],
  '공통수학2': ['평면좌표', '직선의 방정식', '원의 방정식', '도형의 이동', '집합', '명제', '함수', '유리함수', '무리함수'],
  '대수':      ['지수와 로그', '지수함수와 로그함수', '삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)', '삼각함수의 활용 (사인법칙, 코사인법칙 등)', '등차수열과 등비수열', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'],
  '미적분Ⅰ':   ['함수의 극한', '함수의 연속', '미분계수와 도함수', '접선의 방정식과 평균값 정리', '극대·극소와 그래프', '방정식·부등식과 미분', '부정적분과 정적분', '정적분의 활용'],
  '미적분Ⅱ':   ['수열의 극한', '급수', '지수함수와 로그함수의 미분', '삼각함수의 미분', '여러 가지 미분법', '초월함수의 도함수 활용', '여러 가지 적분법', '초월함수 정적분의 활용'],
  '확률과 통계': ['여러 가지 순열과 조합', '이항정리', '확률의 뜻과 성질', '조건부확률', '확률분포', '통계적 추정'],
  '기하':      ['이차곡선', '평면벡터의 연산과 성분', '평면벡터의 내적', '공간도형과 공간좌표'],
  '기타':      ['기타'],
};

export const GRADE_LIST = Object.keys(MATH_CURRICULUM);

export interface MistakeEntry {
  id: string;
  userId?: string;          // Supabase user_id (admin 조회 시 사용)
  title: string;
  imageUrl: string;
  date: string;             // ISO date string
  updatedAt?: string;       // ISO date string
  analysis?: MistakeAnalysis;
  reviews?: ReviewState[];
  grade?: string;
  chapter?: string;
  rootCauses?: string[];
  userActionPlan?: string;
}

export type ActiveTab = 'notes' | 'completed' | 'camera' | 'stats' | 'admin' | 'guide';
