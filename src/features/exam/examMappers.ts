// 기출문제 풀이 — 서버 RPC 응답(jsonb) ↔ contract 타입 매핑과 채점 보조 로직.
// supabase 클라이언트를 import하지 않는 순수 함수만 둔다(node --test로 바로 돌릴 수 있게).
// 채점의 기준은 언제나 서버(submit_exam_attempt)다 — 여기 정규화/등급 계산은 서버 SQL
// (private.exam_normalize_answer / private.exam_estimate_grade)과 같은 규칙을 클라이언트에서
// 미리 보여 주거나 입력을 다듬는 용도.

import type {
  ExamAttempt,
  ExamAnswerType,
  ExamPaperMetadata,
  ExamAnswerMetadata,
  ExamElective,
  ExamItemState,
  ExamMode,
  ExamPaperProgress,
  ExamPaperSummary,
  ExamPaperHistoryAttempt,
  ExamQuestion,
  ExamResult,
  ExamResultItem,
} from './contract';

export type ExamResultSummary = Pick<ExamResult, 'attemptId' | 'paperTitle' | 'mode' | 'elective' | 'score' | 'estimatedGrade' | 'submittedAt' | keyof ExamPaperMetadata>;

const ELECTIVES: readonly ExamElective[] = ['확률과 통계', '미적분', '기하'];
const CIRCLED = '①②③④⑤';

type Row = Record<string, unknown>;

function asRow(value: unknown): Row {
  return value && typeof value === 'object' ? (value as Row) : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function asNullableString(value: unknown): string | null {
  return value == null ? null : asString(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = asNumber(value, NaN);
  return Number.isFinite(n) ? n : null;
}

function asElective(value: unknown): ExamElective | null {
  if (value === null) return null;
  return ELECTIVES.includes(value as ExamElective) ? (value as ExamElective) : '미적분';
}

function asSection(value: unknown): 'common' | ExamElective {
  return value === 'common' ? 'common' : asElective(value) ?? '미적분';
}

function asMode(value: unknown): ExamMode {
  return value === 'real' ? 'real' : 'free';
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mapMetadata(r: Row): ExamPaperMetadata {
  if (r.kind == null) return {};
  return {
    kind: r.kind === 'school' ? 'school' : r.kind === 'hanneung' ? 'hanneung' : 'csat',
    hanneungLevel: r.hanneungLevel === 'advanced' || r.hanneungLevel === 'basic' ? r.hanneungLevel : null,
    schoolName: asNullableString(r.schoolName), year: asNullableNumber(r.year),
    grade: asNullableNumber(r.grade), semester: asNullableNumber(r.semester),
    examTerm: r.examTerm === 'mid' || r.examTerm === 'final' ? r.examTerm : null,
    questionCount: asNumber(r.questionCount, 30), maxScore: asNumber(r.maxScore, 100),
    published: r.published !== false,
  };
}

function mapAnswerMetadata(r: Row): ExamAnswerMetadata {
  if (r.answerType == null) return {};
  return {
    answerType: r.answerType === 'choice10' ? 'choice10' : r.answerType === 'digits' ? 'digits' : r.answerType === 'choice4' ? 'choice4' : 'choice5',
    choices: Array.isArray(r.choices) ? r.choices.filter((c): c is string => typeof c === 'string') : null,
  };
}

function mapRound(r: Row): { round?: number } {
  const round = asNumber(r.round);
  return Number.isInteger(round) && round > 0 ? { round } : {};
}

/** 서버와 같은 규칙: 공백 제거, ①~⑤ → 1~5, 숫자만이면 앞자리 0 제거('007' → '7', '000' → '0'). 빈 값은 null. */
export function normalizeExamAnswer(raw: string | number | null | undefined): string | null {
  if (raw == null) return null;
  let v = String(raw).trim();
  v = v.replace(/[①②③④⑤]/g, (ch) => String(CIRCLED.indexOf(ch) + 1));
  if (v === '') return null;
  if (/^[0-9]+$/.test(v)) {
    v = v.replace(/^0+/, '');
    if (v === '') v = '0';
  }
  return v;
}

/** 답 유형별 유효 범위만 통과(choice5 1~5, choice10 1~10, digits 0~999). */
export function sanitizeExamAnswer(raw: string | number | null | undefined, isChoice: boolean | ExamAnswerType): string | null {
  const v = normalizeExamAnswer(raw);
  if (v == null) return null;
  if (isChoice === 'choice10') return /^([1-9]|10)$/.test(v) ? v : null;
  if (isChoice === 'choice4') return /^[1-4]$/.test(v) ? v : null;
  if (isChoice === true || isChoice === 'choice5') return /^[1-5]$/.test(v) ? v : null;
  return /^[0-9]{1,3}$/.test(v) ? v : null;
}

/** 서버 채점과 같은 비교(미응답은 오답). */
export function isExamAnswerCorrect(answer: string | null | undefined, correctAnswer: string): boolean {
  const a = normalizeExamAnswer(answer);
  return a != null && a === normalizeExamAnswer(correctAnswer);
}

/** 원점수 → 추정 등급 1~9. rawCuts = [1등급컷, …, 8등급컷](내림차순). 점수 >= k등급컷이면 k등급. */
export function estimateExamGrade(rawCuts: readonly number[], score: number): number {
  if (rawCuts.length === 0) return 0;
  return 1 + rawCuts.filter((cut) => score < cut).length;
}

/** 실전 모드 남은 시간(ms, 0 이상). 자유 모드는 null. */
export function examRemainingMs(attempt: Pick<ExamAttempt, 'startedAt' | 'timeLimitMinutes'>, nowMs: number): number | null {
  if (attempt.timeLimitMinutes == null) return null;
  const end = Date.parse(attempt.startedAt) + attempt.timeLimitMinutes * 60_000;
  return Math.max(0, end - nowMs);
}

/** 서버 시각(serverNow)과 이 기기 시각의 차이만큼 startedAt을 옮겨, 기기 시계가 틀려도
 *  `startedAt + 제한시간 - Date.now()`가 서버 기준 남은 시간이 되게 한다. */
export function alignToClientClock(startedAt: string, serverNow: string | null | undefined, clientNowMs: number): string {
  const started = Date.parse(startedAt);
  const server = serverNow ? Date.parse(serverNow) : NaN;
  if (!Number.isFinite(started)) return startedAt;
  if (!Number.isFinite(server)) return new Date(started).toISOString();
  return new Date(started + (clientNowMs - server)).toISOString();
}

function mapExamPaperProgress(raw: unknown): ExamPaperProgress | null {
  if (raw == null || typeof raw !== 'object') return null;
  const r = asRow(raw);
  if (r.attemptId == null) return null;
  return {
    attemptId: asString(r.attemptId),
    ...mapRound(r),
    mode: asMode(r.mode),
    elective: asElective(r.elective),
    startedAt: asString(r.startedAt),
    timeLimitMinutes: asNullableNumber(r.timeLimitMinutes),
    answeredCount: asNumber(r.answeredCount),
    elapsedMs: asNumber(r.elapsedMs),
  };
}

function mapExamPaperLastResult(raw: unknown): ExamPaperSummary['lastResult'] {
  if (raw == null || typeof raw !== 'object') return null;
  const r = asRow(raw);
  if (r.attemptId == null) return null;
  return {
    attemptId: asString(r.attemptId),
    ...mapRound(r),
    score: asNumber(r.score),
    estimatedGrade: asNullableNumber(r.estimatedGrade),
    submittedAt: asString(r.submittedAt),
  };
}

/** list_exam_papers_for_me RPC 응답의 한 줄 → ExamPaperSummary(시험지 + 내 진행 정도). */
export function mapExamPaper(row: unknown): ExamPaperSummary {
  const r = asRow(row);
  return {
    ...mapMetadata(r),
    id: asString(r.id),
    title: asString(r.title),
    examDate: asString(r.examDate),
    source: asString(r.source),
    timeLimitMinutes: asNumber(r.timeLimitMinutes, 100),
    electives: asArray(r.electives).filter((e): e is ExamElective => ELECTIVES.includes(e as ExamElective)),
    inProgress: mapExamPaperProgress(r.inProgress),
    lastResult: mapExamPaperLastResult(r.lastResult),
    resultCount: asNumber(r.resultCount),
  };
}

export function mapExamQuestion(raw: unknown): ExamQuestion {
  const r = asRow(raw);
  return {
    id: asString(r.id),
    number: asNumber(r.number),
    section: asSection(r.section),
    imageUrl: asString(r.imageUrl),
    ...mapAnswerMetadata(r),
    isChoice: r.isChoice === true,
    points: asNumber(r.points),
  };
}

export function mapExamItemState(raw: unknown): ExamItemState {
  const r = asRow(raw);
  return {
    questionId: asString(r.questionId),
    answer: asNullableString(r.answer),
    unsure: r.unsure === true,
    timeSpentMs: asNumber(r.timeSpentMs),
    visits: asNumber(r.visits),
    checked: mapCheckedAnswer(r.checked),
  };
}

/** check_exam_answer 응답 / 시도 payload의 items[].checked → { isCorrect, correctAnswer }. 없으면 null. */
export function mapCheckedAnswer(raw: unknown): { isCorrect: boolean; correctAnswer: string } | null {
  if (raw == null || typeof raw !== 'object') return null;
  const r = asRow(raw);
  if (r.correctAnswer == null) return null;
  return { isCorrect: r.isCorrect === true, correctAnswer: asString(r.correctAnswer) };
}

/** start/get_active RPC 응답 → ExamAttempt. startedAt은 기기 시계 기준으로 보정된다. */
export function mapExamAttempt(raw: unknown, clientNowMs: number = Date.now()): ExamAttempt {
  const r = asRow(raw);
  const questions = asArray(r.questions).map(mapExamQuestion).sort((a, b) => a.number - b.number);
  return {
    id: asString(r.id),
    ...mapMetadata(r),
    ...(r.paperTitle != null ? { paperTitle: asString(r.paperTitle) } : {}),
    paperId: asString(r.paperId),
    mode: asMode(r.mode),
    elective: asElective(r.elective),
    startedAt: alignToClientClock(asString(r.startedAt), asNullableString(r.serverNow), clientNowMs),
    timeLimitMinutes: asNullableNumber(r.timeLimitMinutes),
    status: r.status === 'submitted' ? 'submitted' : 'in_progress',
    questions,
    items: asArray(r.items).map(mapExamItemState),
    visitOrder: asArray(r.visitOrder).map((n) => asNumber(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= asNumber(r.questionCount, 30)),
  };
}

function mapChoiceRates(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const rates = value.map((n) => asNumber(n, NaN));
  return rates.every(Number.isFinite) ? rates : null;
}

export function mapExamResultItem(raw: unknown): ExamResultItem {
  const r = asRow(raw);
  return {
    questionId: asString(r.questionId),
    number: asNumber(r.number),
    section: asSection(r.section),
    imageUrl: asString(r.imageUrl),
    ...mapAnswerMetadata(r),
    isChoice: r.isChoice === true,
    points: asNumber(r.points),
    answer: asNullableString(r.answer),
    correctAnswer: asString(r.correctAnswer),
    isCorrect: r.isCorrect === true,
    unsure: r.unsure === true,
    timeSpentMs: asNumber(r.timeSpentMs),
    nationalWrongRate: asNullableNumber(r.nationalWrongRate),
    nationalChoiceRates: mapChoiceRates(r.nationalChoiceRates),
    addedMistakeId: asNullableString(r.addedMistakeId),
  };
}

export function mapExamResult(raw: unknown): ExamResult {
  const r = asRow(raw);
  const cut = asRow(r.gradeCut);
  const numbers = (v: unknown) => asArray(v).map((n) => asNumber(n));
  const rawByGrade = numbers(cut.rawByGrade);
  const score = asNumber(r.score);
  return {
    attemptId: asString(r.attemptId),
    ...mapRound(r),
    ...mapMetadata(r),
    ...(r.paperId != null ? { paperId: asString(r.paperId) } : {}),
    paperTitle: asString(r.paperTitle),
    mode: asMode(r.mode),
    elective: asElective(r.elective),
    score,
    correctCount: asNumber(r.correctCount),
    totalCount: asNumber(r.totalCount),
    totalTimeMs: asNumber(r.totalTimeMs),
    estimatedGrade: r.kind === 'school' ? null : r.kind === 'hanneung' ? asNullableNumber(r.estimatedGrade) : asNullableNumber(r.estimatedGrade) ?? estimateExamGrade(rawByGrade, score),
    gradeCut: {
      rawByGrade,
      standardByGrade: numbers(cut.standardByGrade),
      percentileByGrade: numbers(cut.percentileByGrade),
      topStandard: asNullableNumber(cut.topStandard),
      topPercentile: asNullableNumber(cut.topPercentile),
      source: asString(cut.source),
    },
    items: asArray(r.items).map(mapExamResultItem).sort((a, b) => a.number - b.number),
    submittedAt: asString(r.submittedAt),
  };
}

export function mapExamResultSummary(raw: unknown): ExamResultSummary {
  const r = asRow(raw);
  return {
    attemptId: asString(r.attemptId),
    ...mapMetadata(r),
    paperTitle: asString(r.paperTitle),
    mode: asMode(r.mode),
    elective: asElective(r.elective),
    score: asNumber(r.score),
    estimatedGrade: asNullableNumber(r.estimatedGrade),
    submittedAt: asString(r.submittedAt),
  };
}

/** 허용 필드만 복사하고 진행 중 정오를 한 번 더 숨긴다. */
export function mapExamPaperHistory(raw: unknown): ExamPaperHistoryAttempt[] {
  return asArray(raw).map(value => {
    const r = asRow(value);
    const submitted = r.status === 'submitted';
    return {
      ...mapMetadata(r),
      ...(r.paperTitle != null ? { paperTitle: asString(r.paperTitle) } : {}),
      attemptId: asString(r.attemptId),
      round: mapRound(r).round ?? 1,
      startedAt: asString(r.startedAt),
      submittedAt: submitted ? asNullableString(r.submittedAt) : null,
      status: submitted ? 'submitted' as const : 'in_progress' as const,
      mode: asMode(r.mode),
      elective: asElective(r.elective),
      score: submitted ? asNullableNumber(r.score) : null,
      estimatedGrade: submitted ? asNullableNumber(r.estimatedGrade) : null,
      totalTimeMs: Math.max(0, asNumber(r.totalTimeMs)),
      items: asArray(r.items).map(value => {
        const item = asRow(value);
        return {
          ...mapAnswerMetadata(item),
          number: asNumber(item.number), section: asSection(item.section),
          isCorrect: submitted && typeof item.isCorrect === 'boolean' ? item.isCorrect : null,
          unsure: item.unsure === true, answered: item.answered === true,
          timeSpentMs: Math.max(0, asNumber(item.timeSpentMs)),
        };
      }).sort((a, b) => a.number - b.number),
    };
  }).sort((a, b) => a.round - b.round);
}

export function mapAddedMistakes(raw: unknown): Array<{ questionId: string; mistakeId: string }> {
  return asArray(raw)
    .map(asRow)
    .filter((r) => r.questionId != null && r.mistakeId != null)
    .map((r) => ({ questionId: asString(r.questionId), mistakeId: asString(r.mistakeId) }));
}

/** 저장/제출 RPC에 보낼 문항 상태(필요한 필드만, 숫자는 0 이상 정수). */
export function toExamItemsPayload(items: readonly ExamItemState[]): ExamItemState[] {
  return items.map((it) => ({
    questionId: it.questionId,
    answer: normalizeExamAnswer(it.answer),
    unsure: it.unsure === true,
    timeSpentMs: Math.max(0, Math.round(Number.isFinite(it.timeSpentMs) ? it.timeSpentMs : 0)),
    visits: Math.max(0, Math.round(Number.isFinite(it.visits) ? it.visits : 0)),
  }));
}

export function toVisitOrderPayload(visitOrder: readonly number[], maximum = 30): number[] {
  return visitOrder.filter((n) => Number.isInteger(n) && n >= 1 && n <= maximum);
}

/** mistakes.image_url이 절대 URL이 되도록 RPC에 넘길 origin('https://host[:port]'). */
export function toMistakeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

const ERROR_MESSAGES: Record<string, string> = {
  EXAM_AUTH_REQUIRED: '로그인이 풀렸어요. 다시 로그인한 뒤 이어서 풀어 주세요.',
  EXAM_PAPER_NOT_FOUND: '이 시험지를 찾지 못했어요.',
  EXAM_INVALID_MODE: '풀이 모드를 다시 골라 주세요.',
  EXAM_INVALID_ELECTIVE: '선택과목을 다시 골라 주세요.',
  EXAM_ATTEMPT_NOT_FOUND: '풀이 기록을 찾지 못했어요.',
  EXAM_NOT_IN_PROGRESS: '이미 제출한 시험이에요.',
  EXAM_NOT_SUBMITTED: '아직 제출하지 않은 시험이에요.',
  EXAM_REAL_MODE_LOCKED: '실전 모드에서는 제출 전에 정답을 볼 수 없어요.',
  EXAM_QUESTION_NOT_FOUND: '이 시험에 없는 문항이에요.',
  EXAM_INVALID_ANSWER: '채점할 답을 먼저 입력해 주세요.',
  EXAM_INVALID_ORIGIN: '오답노트에 추가하지 못했어요. 앱을 새로고침한 뒤 다시 시도해 주세요.',
};

const NETWORK_MESSAGE = '인터넷 연결이 불안정해요. 잠시 후 다시 시도해 주세요.';
const FALLBACK_MESSAGE = '잠시 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';

/** Supabase/네트워크 에러 → 학생에게 보여 줄 짧은 한국어 문구. */
export function examErrorMessage(error: unknown): string {
  const message = typeof error === 'string' ? error : asString(asRow(error).message);
  const code = message.match(/EXAM_[A-Z_]+/)?.[0];
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (/failed to fetch|network|fetch failed|timeout|load failed/i.test(message)) return NETWORK_MESSAGE;
  return FALLBACK_MESSAGE;
}

/** 클라이언트가 throw하는 에러. message는 그대로 화면에 보여 줘도 되는 한국어 문구. */
export class ExamClientError extends Error {
  code: string | null;
  constructor(cause: unknown) {
    super(examErrorMessage(cause));
    this.name = 'ExamClientError';
    const raw = typeof cause === 'string' ? cause : asString(asRow(cause).message);
    this.code = raw.match(/EXAM_[A-Z_]+/)?.[0] ?? null;
    this.cause = cause;
  }
}
