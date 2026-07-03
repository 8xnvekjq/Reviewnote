export interface MistakeAnalysis {
  solvingProcess: string;   // [문제 풀이 과정]
  mistakeDetail: string;    // [실수한 지점 상세 분석]
  rootCause: string;        // [근본적인 틀린 이유]
  actionPlan: string;       // [향후 재발 방지 대책]
  hints?: string[];         // [단계별 힌트 목록 (최대 3개)]
}

export type ReviewState = 'O' | 'X' | 'star' | '';

export interface MistakeEntry {
  id: string;
  title: string;
  imageUrl: string;         // Base64 image data url
  date: string;             // ISO date string
  analysis?: MistakeAnalysis;
  reviews?: ReviewState[];  // Array of 3 review states, e.g. ['O', 'X', '']
}

export type ActiveTab = 'notes' | 'completed' | 'camera';
