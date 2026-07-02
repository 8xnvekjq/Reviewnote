export interface MistakeAnalysis {
  solvingProcess: string;   // [문제 풀이 과정]
  mistakeDetail: string;    // [실수한 지점 상세 분석]
  rootCause: string;        // [근본적인 틀린 이유]
  actionPlan: string;       // [향후 재발 방지 대책]
}

export interface MistakeEntry {
  id: string;
  title: string;
  imageUrl: string;         // Base64 image data url
  date: string;             // ISO date string
  analysis?: MistakeAnalysis;
}

export type ActiveTab = 'notes' | 'camera' | 'settings';
