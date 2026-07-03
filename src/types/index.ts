export interface ProblemBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface MistakeAnalysis {
  solvingProcess: string;   // [문제 풀이 과정]
  mistakeDetail: string;    // [실수한 지점 상세 분석]
  rootCause: string;        // [근본적인 틀린 이유]
  actionPlan: string;       // [향후 재발 방지 대책]
  hints?: string[];         // [단계별 힌트 목록 (최대 3개)]
  problemText?: string;     // [추출된 원본 문제 지문]
  problemBox?: ProblemBox;  // [인쇄된 문제 영역 바운딩 박스 (필기 제외)]
}

export type ReviewState = 'O' | 'X' | 'star' | '';

export interface AdminUserStat {
  userId: string;
  email: string;
  mistakeCount: number;      // 전체 오답노트 수
  completedCount: number;    // 복습완료(O 3회) 수
  lastActivity: string | null; // 최근 활동일 (ISO string)
}

export interface MistakeEntry {
  id: string;
  title: string;
  imageUrl: string;         // Base64 image data url
  date: string;             // ISO date string
  analysis?: MistakeAnalysis;
  reviews?: ReviewState[];  // Array of 3 review states, e.g. ['O', 'X', '']
}

export type ActiveTab = 'notes' | 'completed' | 'camera' | 'admin' | 'settings';

