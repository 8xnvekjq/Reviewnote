// 기출문제 풀이 — 세 작업(서버/데이터, 필기 엔진, 풀이 화면)이 공유하는 계약.
// 여기 있는 타입과 시그니처만 믿고 병렬로 구현한다. 바꿔야 하면 임의로 바꾸지 말고 보고서에 적는다.
//
// 시험 데이터 원본: src/features/exam/data/2025-06-math.json (정답·배점·등급컷·전국 오답률)
// 문항 이미지: public/exams/2025-06-math/{c|prob|calc|geom}-NN.png (한 장에 한 문항,
//   목록은 src/features/exam/data/2025-06-math.images.json)

/** 수학 선택과목. 공통(1~22) + 선택 1과목(23~30) = 30문항. */
export type ExamElective = '확률과 통계' | '미적분' | '기하';
/** 실전 모드: 전체 제한시간(기본 100분), 제출 전 정답 비공개, 0분이면 자동 제출.
 *  자유 모드: 시간 제한 없음, 문항마다 "채점해 보기" 가능. */
export type ExamMode = 'real' | 'free';

export interface ExamPaperSummary {
  id: string;            // 예: '2025-06-math'
  title: string;         // '2025학년도 6월 모의평가 수학'
  examDate: string;      // '2024-06-04'
  source: string;        // '한국교육과정평가원'
  timeLimitMinutes: number;
  electives: ExamElective[];
  // ── v2: 시험지 카드(A4 비율)에 진행 정도 표시. 시험지마다 따로 이어 풀 수 있다(서버도 시험지별 진행 중 1개). ──
  /** 이 시험지의 내 진행 중 시도(없으면 null). */
  inProgress: ExamPaperProgress | null;
  /** 가장 최근에 제출한 내 결과(없으면 null). */
  lastResult: { attemptId: string; score: number; estimatedGrade: number | null; submittedAt: string; round?: number } | null;
  /** 제출한 횟수. */
  resultCount: number;
}

/** 시험지 카드에 보여 줄 진행 정도. */
export interface ExamPaperProgress {
  round?: number;
  attemptId: string;
  mode: ExamMode;
  elective: ExamElective;
  startedAt: string;
  timeLimitMinutes: number | null;
  answeredCount: number;  // 답한 문항 수(0~30)
  elapsedMs: number;      // 문항 스톱워치 합계(진행된 시간)
}

/** 학생이 받는 문항. 정답은 절대 포함하지 않는다(서버 RLS로도 막는다). */
export interface ExamQuestion {
  id: string;            // 서버 문항 id (uuid)
  number: number;        // 1~30
  section: 'common' | ExamElective;
  imageUrl: string;      // '/exams/2025-06-math/c-01.png'
  isChoice: boolean;     // true: ①~⑤ 객관식, false: 0~999 단답
  points: number;        // 2 | 3 | 4
}

/** 문항 하나에 대한 학생의 현재 상태(자동 저장 단위). */
export interface ExamItemState {
  questionId: string;
  answer: string | null; // 객관식 '1'~'5', 단답 '0'~'999'(앞자리 0 없이), 미응답 null
  unsure: boolean;       // 🤔 애매 표시
  timeSpentMs: number;   // 문항 스톱워치 누적
  visits: number;        // 이 문항을 연 횟수
  /** v2: 자유 모드에서 "채점해 보기"를 한 문항이면 그 결과. 이 문항의 답은 더 이상 바꿀 수 없다
   *  (화면은 입력을 잠그고, 서버도 이후 저장·제출에서 이 문항의 답을 바꾸지 않는다). */
  checked?: { isCorrect: boolean; correctAnswer: string } | null;
}

export interface ExamAttempt {
  id: string;
  paperId: string;
  mode: ExamMode;
  elective: ExamElective;
  startedAt: string;     // ISO, 실전 모드 남은 시간 = startedAt + timeLimit - now (서버 시각 기준 보정은 구현 재량)
  timeLimitMinutes: number | null; // 자유 모드는 null
  status: 'in_progress' | 'submitted';
  questions: ExamQuestion[];       // 1~30 순서
  items: ExamItemState[];          // 저장돼 있던 진행 상황(이어 풀기)
  visitOrder: number[];            // 문항을 연 순서(번호), 리포트용
}

export interface ExamResultItem {
  questionId: string;
  number: number;
  section: 'common' | ExamElective;
  imageUrl: string;
  isChoice: boolean;
  points: number;
  answer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  unsure: boolean;
  timeSpentMs: number;
  nationalWrongRate: number | null;     // EBSi 오답률 TOP15에 있으면 %, 없으면 null
  nationalChoiceRates: number[] | null; // 객관식 선지별 선택 비율(①~⑤ %)
  addedMistakeId: string | null;        // 오답노트에 추가했으면 그 mistakes.id
}

export interface ExamResult {
  /** 같은 학생·시험지에서 시작 순서로 계산한 회차. 이전 서버와의 호환을 위해 선택 필드. */
  round?: number;
  attemptId: string;
  paperTitle: string;
  mode: ExamMode;
  elective: ExamElective;
  score: number;          // 원점수 0~100
  correctCount: number;
  totalCount: number;     // 30
  totalTimeMs: number;
  /** 종로학원 확정 등급컷(원점수=추정) 기준 추정 등급 1~9. */
  estimatedGrade: number;
  /** v2: topStandard/topPercentile = 원점수 100점(최고점)일 때 값(선택과목별). 없으면 null.
   *  표준점수·백분위 추정은 (100, top) + (등급컷 원점수, 등급컷 표준점수/백분위) 점들을 잇는 선형 보간. */
  gradeCut: { rawByGrade: number[]; standardByGrade: number[]; percentileByGrade: number[]; topStandard: number | null; topPercentile: number | null; source: string };
  items: ExamResultItem[];
  submittedAt: string;
}

// v2 표준점수·백분위(추정)는 화면에서 gradeCut으로 계산한다(ui/examLogic.ts의 estimateStandardScore).
/** 기록 화면 전용. 진행 중에는 채점 여부와 관계없이 isCorrect가 null이다. 정답은 포함하지 않는다. */
export interface ExamHistoryItem {
  number: number;
  section: 'common' | ExamElective;
  isCorrect: boolean | null;
  unsure: boolean;
  answered: boolean;
  timeSpentMs: number;
}

export interface ExamPaperHistoryAttempt {
  attemptId: string;
  round: number;
  startedAt: string;
  submittedAt: string | null;
  status: 'in_progress' | 'submitted';
  mode: ExamMode;
  elective: ExamElective;
  score: number | null;
  estimatedGrade: number | null;
  totalTimeMs: number;
  items: ExamHistoryItem[];
}

/** src/features/exam/examClient.ts의 서버 경계. */
export interface ExamClient {
  /** 학생은 자기 기록만. studentId 지정은 관리자에게만 허용한다. */
  listPaperHistory(paperId: string, studentId?: string): Promise<ExamPaperHistoryAttempt[]>;
  listPapers(): Promise<ExamPaperSummary[]>;
  /** 진행 중인 시도가 있으면 그것을 돌려준다(이어 풀기). 없으면 null. */
  getActiveAttempt(paperId: string): Promise<ExamAttempt | null>;
  startAttempt(paperId: string, mode: ExamMode, elective: ExamElective): Promise<ExamAttempt>;
  /** 진행 상황 자동 저장(디바운스는 호출 측 책임). 실패해도 throw 대신 false. */
  saveProgress(attemptId: string, items: ExamItemState[], visitOrder: number[]): Promise<boolean>;
  /** 자유 모드 전용: 문항 하나를 바로 채점. 실전 모드면 서버가 거부한다.
   *  v2: 서버가 이 답을 저장하고 문항을 잠근다(checked). 이미 잠긴 문항을 다시 부르면 처음 결과를 그대로 돌려준다. */
  checkAnswer(attemptId: string, questionId: string, answer: string): Promise<{ isCorrect: boolean; correctAnswer: string }>;
  /** 제출 + 서버 채점. 이후 정답 공개. */
  submitAttempt(attemptId: string, items: ExamItemState[], visitOrder: number[]): Promise<ExamResult>;
  getResult(attemptId: string): Promise<ExamResult>;
  listMyResults(paperId?: string): Promise<Array<Pick<ExamResult, 'attemptId' | 'paperTitle' | 'mode' | 'elective' | 'score' | 'estimatedGrade' | 'submittedAt'>>>;
  /** 학생이 OMR 결과에서 고른 문항(틀린 문제·🤔 문제 후보)을 오답노트(mistakes)에 추가. 이미 추가된 건 건너뜀. */
  addToMistakes(attemptId: string, questionIds: string[]): Promise<Array<{ questionId: string; mistakeId: string }>>;
}

// ── 필기 엔진(W2): src/features/exam/ink/ExamInkCanvas.tsx ──

export type InkTool = 'pen' | 'highlighter' | 'eraser';
export interface InkPoint { x: number; y: number; pressure: number; t: number }
/** 좌표는 문항 이미지 기준 정규화(0~1 가로, 세로는 이미지 높이/너비 비율 단위)로 저장해 화면 크기가 바뀌어도 같은 자리에 남는다. */
export interface InkStroke {
  id: string;
  tool: 'pen' | 'highlighter';
  color: string;
  size: number;
  points: InkPoint[];
  /** 꾹 눌러 도형으로 바뀐 획이면 도형 정보(렌더는 이걸 우선). */
  shape?: { kind: 'line'; from: [number, number]; to: [number, number] }
    | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rotation: number };
}

export interface ExamInkCanvasProps {
  /** 문항 이미지 위에 겹쳐 그린다. 컨테이너 크기에 맞춰 이미지와 같은 영역을 덮는다. */
  imageUrl: string;
  strokes: InkStroke[];                       // 제어 컴포넌트: 문항별 획은 부모(W3)가 들고 있다
  onChange: (next: InkStroke[]) => void;
  tool: InkTool;
  color: string;
  size: number;
  /** 애플펜슬 등 펜 입력이 감지되면 손가락 터치는 그리지 않고 스크롤/확대에 양보(손바닥 무시). */
  penOnlyWhenPenDetected?: boolean;
  /** 꾹 눌러 직선/원 변환(기본 true). 펜을 떼지 않고 ~500ms 멈추면 판정. */
  shapeSnap?: boolean;
  readOnly?: boolean;
  /** 문항 이미지를 이 너비(CSS px) 이하로 고정해 글자 크기를 일정하게 한다. 필기 영역은 컨테이너 전체 너비를 쓴다.
   *  좌표 정규화 기준(1)은 실제로 보이는 이미지 너비. 없으면 컨테이너 너비 = 이미지 너비. */
  imageMaxWidth?: number;
}
export interface ExamInkCanvasHandle { undo(): void; redo(): void; clear(): void; canUndo(): boolean; canRedo(): boolean }
