export interface ProblemBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface MistakeAnalysis {
  solvingProcess: string;   // [문제 풀이 과정]
  hints?: string[];         // [단계별 힌트 목록 (최대 3개)]
  problemText?: string;     // [추출된 원본 문제 지문]
  problemBox?: ProblemBox;  // [인쇄된 문제 영역 바운딩 박스 (필기 제외)]
  mistakeDetail?: string;   // [실수한 지점 상세 분석] (이전 데이터 호환용)
  rootCause?: string;       // [근본적인 틀린 이유] (이전 데이터 호환용)
  actionPlan?: string;      // [향후 재발 방지 대책] (이전 데이터 호환용)
}

export type ReviewState = 'O' | 'X' | 'star' | '';

export interface AdminUserStat {
  userId: string;
  email: string;
  mistakeCount: number;      // 전체 오답노트 수
  completedCount: number;    // 복습완료(O 3회) 수
  lastActivity: string | null; // 최근 활동일 (ISO string)
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

// 수학 교육과정 과목 및 하위 단원 체계 (중3 + 고교 2022 개정)
export const MATH_CURRICULUM: Record<string, string[]> = {
  '중3-1':    ['실수와 그 계산', '다항식의 곱셈과 인수분해', '이차방정식', '이차함수와 그 그래프'],
  '중3-2':    ['삼각비', '원의 성질', '통계'],
  '공통수학1': ['다항식', '방정식과 부등식', '경우의 수', '행렬'],
  '공통수학2': ['도형의 방정식', '집합과 명제', '함수와 그래프'],
  '대수':      ['지수함수와 로그함수', '삼각함수', '수열'],
  '미적분':    ['함수의 극한과 연속', '다항함수의 미분법', '다항함수의 적분법'],
  '확률과 통계': ['순열과 조합', '확률', '통계'],
  '미적분2':   ['수열의 극한', '미분법', '적분법'],
  '기타':      ['기타'],
};

export const GRADE_LIST = Object.keys(MATH_CURRICULUM);

export interface MistakeEntry {
  id: string;
  userId?: string;          // Supabase user_id (admin 조회 시 사용)
  title: string;
  imageUrl: string;
  date: string;             // ISO date string
  analysis?: MistakeAnalysis;
  reviews?: ReviewState[];
  grade?: string;
  chapter?: string;
  rootCauses?: string[];
  userActionPlan?: string;
}

export type ActiveTab = 'notes' | 'completed' | 'camera' | 'stats' | 'admin';
