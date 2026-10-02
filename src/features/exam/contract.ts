// 기출문제 풀이 — 서버/데이터, 필기 엔진, 풀이 화면이 공유하는 계약.
//
// 시험 데이터 원본: src/features/exam/data/2025-06-math.json (정답·배점·등급컷·전국 오답률)
// 문항 이미지: public/exams/2025-06-math/{c|prob|calc|geom}-NN.png (한 장에 한 문항,
//   목록은 src/features/exam/data/2025-06-math.images.json)

/** 수학 선택과목. 공통(1~22) + 선택 1과목(23~30) = 30문항. */
export type ExamElective = '확률과 통계' | '미적분' | '기하';
/** 실전 모드: 전체 제한시간(기본 100분), 제출 전 정답 비공개, 0분이면 자동 제출.
 *  자유 모드: 시간 제한 없음, 문항마다 "채점해 보기" 가능. */
export type ExamMode = 'real' | 'free';

export type ExamPaperKind = 'csat' | 'school' | 'hanneung';
export type ExamAnswerType = 'choice4' | 'choice5' | 'digits' | 'choice10';
/** 선택 필드는 기존 운영 RPC 응답과의 호환용. 새 RPC는 모두 제공한다. */
export interface ExamPaperMetadata {
  kind?: ExamPaperKind;
  hanneungLevel?: 'advanced' | 'basic' | null;
  schoolName?: string | null;
  year?: number | null;
  grade?: number | null;
  semester?: number | null;
  examTerm?: 'mid' | 'final' | null;
  questionCount?: number;
  maxScore?: number;
  published?: boolean;
}
export interface ExamAnswerMetadata {
  answerType?: ExamAnswerType;
  /** 선지만 공개. 정답 번호는 제출/채점 RPC 외에는 제공하지 않는다. */
  choices?: string[] | null;
}

export interface ExamPaperSummary extends ExamPaperMetadata {
  id: string;            // 예: '2025-06-math'
  title: string;         // '2025학년도 6월 모의평가 수학'
  examDate: string;      // '2024-06-04'. 시행일이 없는 원본은 빈 문자열로 매핑.
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
  elective: ExamElective | null;
  startedAt: string;
  timeLimitMinutes: number | null;
  answeredCount: number;  // 답한 문항 수(시험지 questionCount 이하)
  elapsedMs: number;      // 문항 스톱워치 합계(진행된 시간)
}

/** 학생이 받는 문항. 정답은 절대 포함하지 않는다(서버 RLS로도 막는다). */
export interface ExamQuestion extends ExamAnswerMetadata {
  id: string;            // 서버 문항 id (uuid)
  number: number;        // 시험지 안의 문항 번호
  section: 'common' | ExamElective;
  imageUrl: string;      // '/exams/2025-06-math/c-01.png'
  isChoice: boolean;     // true: choice5/choice10, false: digits. 이전 RPC 호환용.
  points: number;        // 양수 배점(소수 가능)
}

/** 문항 하나에 대한 학생의 현재 상태(자동 저장 단위). */
export interface ExamItemState {
  questionId: string;
  answer: string | null; // choice5 '1'~'5', choice10 '1'~'10', digits '0'~'999', 미응답 null
  unsure: boolean;       // 🤔 애매 표시
  timeSpentMs: number;   // 문항 스톱워치 누적
  visits: number;        // 이 문항을 연 횟수
  /** v2: 자유 모드에서 "채점해 보기"를 한 문항이면 그 결과. 이 문항의 답은 더 이상 바꿀 수 없다
   *  (화면은 입력을 잠그고, 서버도 이후 저장·제출에서 이 문항의 답을 바꾸지 않는다). */
  checked?: { isCorrect: boolean; correctAnswer: string } | null;
}

export interface ExamAttempt extends ExamPaperMetadata {
  paperTitle?: string;
  id: string;
  paperId: string;
  mode: ExamMode;
  elective: ExamElective | null;
  startedAt: string;     // ISO, 실전 모드 남은 시간 = startedAt + timeLimit - now (서버 시각 기준 보정은 구현 재량)
  timeLimitMinutes: number | null; // 자유 모드는 null
  status: 'in_progress' | 'submitted';
  questions: ExamQuestion[];       // 문항 번호 순서, 개수는 시험지 데이터 기준
  items: ExamItemState[];          // 저장돼 있던 진행 상황(이어 풀기)
  visitOrder: number[];            // 문항을 연 순서(번호), 리포트용
}

export interface ExamResultItem extends ExamAnswerMetadata {
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

export interface ExamResult extends ExamPaperMetadata {
  /** 같은 학생·시험지에서 시작 순서로 계산한 회차. 이전 서버와의 호환을 위해 선택 필드. */
  round?: number;
  attemptId: string;
  /** 시험지 id. 이전 서버 응답에는 없을 수 있다(그땐 문항 imageUrl 경로로 찾는다). */
  paperId?: string;
  paperTitle: string;
  mode: ExamMode;
  elective: ExamElective | null;
  score: number;          // 원점수 0~maxScore, 소수 가능
  correctCount: number;
  totalCount: number;     // 이 시도에 포함된 실제 문항 수
  totalTimeMs: number;
  /** 수능·모평 추정 등급 1~9. 내신은 null. */
  estimatedGrade: number | null;
  /** v2: topStandard/topPercentile = 원점수 100점(최고점)일 때 값(선택과목별). 없으면 null.
   *  표준점수·백분위 추정은 (100, top) + (등급컷 원점수, 등급컷 표준점수/백분위) 점들을 잇는 선형 보간. */
  gradeCut: { rawByGrade: number[]; standardByGrade: number[]; percentileByGrade: number[]; topStandard: number | null; topPercentile: number | null; source: string };
  items: ExamResultItem[];
  submittedAt: string;
}

// v2 표준점수·백분위(추정)는 화면에서 gradeCut으로 계산한다(ui/examLogic.ts의 estimateStandardScore).
/** 기록 화면 전용. 진행 중에는 채점 여부와 관계없이 isCorrect가 null이다. 정답은 포함하지 않는다. */
export interface ExamHistoryItem extends ExamAnswerMetadata {
  number: number;
  section: 'common' | ExamElective;
  isCorrect: boolean | null;
  unsure: boolean;
  answered: boolean;
  timeSpentMs: number;
}

export interface ExamPaperHistoryAttempt extends ExamPaperMetadata {
  paperTitle?: string;
  attemptId: string;
  round: number;
  startedAt: string;
  submittedAt: string | null;
  status: 'in_progress' | 'submitted';
  mode: ExamMode;
  elective: ExamElective | null;
  score: number | null;
  estimatedGrade: number | null;
  totalTimeMs: number;
  items: ExamHistoryItem[];
}

/** src/features/exam/examClient.ts의 서버 경계. */
export interface ExamClient {
  getInk(attemptId: string): Promise<ExamInkDocument[]>;
  /** 바뀐 내용(events)만 보낸다. 결과 필기 전체 대신 결과 획 id 목록의 해시로 서버 결과와 맞춘다. */
  saveInk(attemptId: string, questionId: string, request: InkSaveRequest): Promise<number>;
  getInkReplay(attemptId: string, questionId: string): Promise<InkReplayData>;
  /** 학생은 자기 기록만. studentId 지정은 관리자에게만 허용한다. */
  listPaperHistory(paperId: string, studentId?: string): Promise<ExamPaperHistoryAttempt[]>;
  listPapers(): Promise<ExamPaperSummary[]>;
  /** 진행 중인 시도가 있으면 그것을 돌려준다(이어 풀기). 없으면 null. */
  getActiveAttempt(paperId: string): Promise<ExamAttempt | null>;
  startAttempt(paperId: string, mode: ExamMode, elective: ExamElective | null): Promise<ExamAttempt>;
  /** 진행 상황 자동 저장(디바운스는 호출 측 책임). 실패해도 throw 대신 false. */
  saveProgress(attemptId: string, items: ExamItemState[], visitOrder: number[]): Promise<boolean>;
  /** 자유 모드 전용: 문항 하나를 바로 채점. 실전 모드면 서버가 거부한다.
   *  v2: 서버가 이 답을 저장하고 문항을 잠근다(checked). 이미 잠긴 문항을 다시 부르면 처음 결과를 그대로 돌려준다. */
  checkAnswer(attemptId: string, questionId: string, answer: string): Promise<{ isCorrect: boolean; correctAnswer: string }>;
  /** 제출 + 서버 채점. 이후 정답 공개. */
  submitAttempt(attemptId: string, items: ExamItemState[], visitOrder: number[]): Promise<ExamResult>;
  getResult(attemptId: string): Promise<ExamResult>;
  listMyResults(paperId?: string): Promise<Array<Pick<ExamResult, 'attemptId' | 'paperTitle' | 'mode' | 'elective' | 'score' | 'estimatedGrade' | 'submittedAt' | keyof ExamPaperMetadata>>>;
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

export interface ExamInkDocument {
  questionId: string;
  strokes: InkStroke[];
  revision: number;
  updatedAt?: string;
  lastBatchId?: string | null;
}

export type InkChangeKind = 'draw' | 'erase' | 'undo' | 'redo' | 'clear' | 'restore';
export interface InkReplayEvent {
  id: string;
  kind: InkChangeKind;
  at: number;
  added: Array<{ index: number; stroke: InkStroke }>;
  removed: string[];
}
/** save_exam_ink_delta 요청. idsHash = 결과 획 id를 순서대로 '\n'으로 이은 문자열의 SHA-256(hex, inkIdsHash). */
export interface InkSaveRequest {
  revision: number;
  legacyImport: boolean;
  events: InkReplayEvent[];
  batchId: string;
  idsHash: string;
}
export interface InkReplayBatch {
  id: string;
  revision: number;
  baseRevision: number;
  baseline: InkStroke[] | null;
  events: InkReplayEvent[];
}
export interface InkReplayData {
  batches: InkReplayBatch[];
  strokes: InkStroke[];
  revision: number;
}

export interface AdminExamAttemptSummary {
  attemptId: string;
  paperId: string;
  paperTitle: string;
  round: number;
  status: 'in_progress' | 'submitted';
  mode: ExamMode;
  elective: ExamElective | null;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  maxScore: number;
  answeredCount: number;
  questionCount: number;
}

/** 기출문제 풀이 패널(관리자): 시험지마다 학생별 가장 최근 응시(채점된 응시 우선). */
export interface AdminPaperStudentActivity extends AdminExamAttemptSummary {
  studentId: string;
  studentName: string;
  attemptCount: number;
  inProgress: boolean;
}
export interface AdminPaperActivity {
  paperId: string;
  /** 가장 최근 응시가 맨 앞. */
  students: AdminPaperStudentActivity[];
}

/** 관리자 읽기 전용 검토에 필요한 서버 호출 묶음. */
export interface AdminExamApi {
  listAttempts(studentId: string, offset?: number): Promise<AdminExamAttemptSummary[]>;
  getAttempt(attemptId: string): Promise<ExamAttempt>;
  getInk(attemptId: string): Promise<ExamInkDocument[]>;
  getInkReplay(attemptId: string, questionId: string): Promise<InkReplayData>;
  getResult(attemptId: string): Promise<ExamResult>;
  /** 관리자가 아니면 null. */
  listPaperActivity(): Promise<AdminPaperActivity[] | null>;
}

export interface ExamInkCanvasProps {
  /** 문항 이미지 위에 겹쳐 그린다. 컨테이너 크기에 맞춰 이미지와 같은 영역을 덮는다. */
  imageUrl: string;
  strokes: InkStroke[];                       // 제어 컴포넌트: 문항별 획은 부모(W3)가 들고 있다
  onChange: (next: InkStroke[], kind?: InkChangeKind) => void;
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
