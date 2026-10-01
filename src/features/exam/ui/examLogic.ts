// 기출문제 풀이 화면의 순수 로직 — React/DOM 없이 node --test 로 검증한다(tests/exam/practice.test.ts).
import type { ExamElective, ExamItemState, ExamResultItem } from '../contract.ts';

export const MINUTE_MS = 60_000;
/** 실전 모드에서 남은 시간 알림을 띄우는 시점(남은 ms). 큰 것부터. */
export const TIME_ALERTS_MS = [10 * MINUTE_MS, 5 * MINUTE_MS] as const;

// ── 남은 시간 ──

/** 실전 모드 남은 시간(ms). 자유 모드(timeLimitMinutes=null)는 null. 0 아래로 내려가지 않는다. */
export function remainingMs(startedAt: string, timeLimitMinutes: number | null, nowMs: number): number | null {
  if (timeLimitMinutes == null) return null;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return timeLimitMinutes * MINUTE_MS;
  return Math.max(0, started + timeLimitMinutes * MINUTE_MS - nowMs);
}

/** prev→next 사이에 새로 지나간 알림 시점들(예: 10분 남음). prev가 null이면(처음 계산) 이미 지난 알림은 울리지 않는다. */
export function crossedAlerts(prevMs: number | null, nextMs: number | null): number[] {
  if (prevMs == null || nextMs == null) return [];
  return TIME_ALERTS_MS.filter(at => prevMs > at && nextMs <= at);
}

/** mm:ss (분은 100분 이상도 그대로). 음수는 0. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 결과 화면용 총 시간: '1시간 23분', '12분 5초', '40초'. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return s > 0 ? `${m}분 ${s}초` : `${m}분`;
  return `${s}초`;
}

// ── 문항 스톱워치 ──

/** 문항별 누적 시간. 지금 보고 있는 문항 하나만 runningSince 부터 흐른다. */
export interface StopwatchState {
  times: Record<string, number>;
  activeId: string | null;
  runningSince: number | null; // 멈춰 있으면 null(탭 숨김·검토 화면 등)
}

export function createStopwatch(times: Record<string, number> = {}): StopwatchState {
  return { times: { ...times }, activeId: null, runningSince: null };
}

/** 흐르던 구간을 times 에 확정하고 멈춘다. */
export function pauseStopwatch(sw: StopwatchState, now: number): StopwatchState {
  if (sw.activeId == null || sw.runningSince == null) return { ...sw, runningSince: null };
  const add = Math.max(0, now - sw.runningSince);
  return {
    times: { ...sw.times, [sw.activeId]: (sw.times[sw.activeId] ?? 0) + add },
    activeId: sw.activeId,
    runningSince: null,
  };
}

/** 보는 문항을 바꾸고(같아도 됨) 지금부터 다시 흐르게 한다. */
export function switchStopwatch(sw: StopwatchState, activeId: string | null, now: number): StopwatchState {
  const paused = pauseStopwatch(sw, now);
  return { times: paused.times, activeId, runningSince: activeId == null ? null : now };
}

/** 지금 이 순간 문항의 누적 시간(흐르는 구간 포함). */
export function elapsedFor(sw: StopwatchState, questionId: string, now: number): number {
  const base = sw.times[questionId] ?? 0;
  if (sw.activeId === questionId && sw.runningSince != null) return base + Math.max(0, now - sw.runningSince);
  return base;
}

// ── 답 ──

/** 단답 정규화: 숫자만, 앞자리 0 제거('007'→'7', '000'→'0'), 0~999 밖이거나 비면 null. */
export function normalizeShortAnswer(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0 || n > 999) return null;
  return String(n);
}

/** 객관식 답 토글: 같은 번호를 다시 누르면 해제, 다른 번호면 그걸로 교체(하나만). */
export function toggleChoice(current: string | null, choice: number): string | null {
  const next = String(choice);
  return current === next ? null : next;
}

/** 단답 → [백, 십, 일] 자릿수. 미응답이면 [0,0,0]. */
export function digitsFromAnswer(answer: string | null): [number, number, number] {
  const n = normalizeShortAnswer(answer);
  const v = n == null ? 0 : Number(n);
  return [Math.floor(v / 100), Math.floor(v / 10) % 10, v % 10];
}

/** [백, 십, 일] → 정규화된 단답 문자열. */
export function answerFromDigits(digits: readonly number[]): string {
  const [h = 0, t = 0, o = 0] = digits.map(d => clampDigit(d));
  return String(h * 100 + t * 10 + o);
}

export function clampDigit(d: number): number {
  if (!Number.isFinite(d)) return 0;
  return Math.min(9, Math.max(0, Math.round(d)));
}

/** 자릿수 휠: 드래그가 끝났을 때 관성(속도)을 반영해 멈출 값. 아래로 끌면(+) 작은 숫자 쪽으로 간다. */
export function snapWheel(startValue: number, dragPx: number, velocityPxPerMs: number, itemHeight: number, momentumMs = 140): number {
  if (itemHeight <= 0) return clampDigit(startValue);
  const v = Math.max(-4, Math.min(4, velocityPxPerMs)); // 너무 세게 튕겨도 한 번에 몇 칸만
  const projected = dragPx + v * momentumMs;
  return clampDigit(startValue - projected / itemHeight);
}

/** 휠을 마우스 휠/트랙패드로 돌릴 때: 누적 deltaY 가 한 칸(threshold)을 넘을 때마다 1씩. */
export function wheelSteps(accumulatedDeltaY: number, threshold = 40): { steps: number; rest: number } {
  const steps = Math.trunc(accumulatedDeltaY / threshold);
  return { steps, rest: accumulatedDeltaY - steps * threshold };
}

// ── 번호판 / OMR ──

export type PadStatus = 'empty' | 'answered' | 'unsure';

/** 번호판 칸 상태: 🤔가 우선(답이 있어도 애매하면 다시 볼 대상), 그다음 응답/미응답. */
export function padStatus(item: Pick<ExamItemState, 'answer' | 'unsure'> | undefined): PadStatus {
  if (!item) return 'empty';
  if (item.unsure) return 'unsure';
  return item.answer == null ? 'empty' : 'answered';
}

export function countAnswered(items: Iterable<Pick<ExamItemState, 'answer'>>): number {
  let n = 0;
  for (const item of items) if (item.answer != null) n += 1;
  return n;
}

// ── 결과 ──

/** 원점수 → 추정 등급. rawCuts 는 1~8등급 컷(내림차순). 컷 이상이면 그 등급, 모두 미만이면 9. */
export function estimateGrade(score: number, rawCuts: readonly number[]): number {
  for (let i = 0; i < rawCuts.length; i += 1) if (score >= rawCuts[i]) return i + 1;
  return rawCuts.length + 1;
}

/** 오답노트 후보: 틀린 문제 + 🤔 문제(번호 순). */
export function mistakeCandidates<T extends Pick<ExamResultItem, 'isCorrect' | 'unsure' | 'number'>>(items: readonly T[]): T[] {
  return items.filter(item => !item.isCorrect || item.unsure).sort((a, b) => a.number - b.number);
}

/** 어려운 문제를 맞혔을 때 칭찬 한 줄(전국 오답률이 있을 때만). */
export function praiseLine(item: Pick<ExamResultItem, 'isCorrect' | 'nationalWrongRate'>): string | null {
  if (!item.isCorrect || item.nationalWrongRate == null) return null;
  return `전국 오답률 ${formatRate(item.nationalWrongRate)}% 문제를 맞혔어요!`;
}

export function formatRate(rate: number): string {
  return Number.isInteger(rate) ? String(rate) : rate.toFixed(1);
}

/** 채점(목 클라이언트·테스트 공용). answer/correct 는 정규화된 문자열 비교. */
export function isAnswerCorrect(answer: string | null, correct: string, isChoice: boolean): boolean {
  if (answer == null) return false;
  if (isChoice) return answer.trim() === correct.trim();
  const a = normalizeShortAnswer(answer);
  return a != null && a === normalizeShortAnswer(correct);
}

export const ELECTIVES: ExamElective[] = ['확률과 통계', '미적분', '기하'];
export const ELECTIVE_SHORT: Record<ExamElective, string> = { '확률과 통계': '확통', '미적분': '미적분', '기하': '기하' };
export const CHOICE_MARKS = ['①', '②', '③', '④', '⑤'] as const;

/** 답을 화면용으로: 객관식 '3' → '③', 단답 그대로, 미응답 '—'. */
export function displayAnswer(answer: string | null, isChoice: boolean): string {
  if (answer == null) return '—';
  if (isChoice) {
    const n = Number(answer);
    return CHOICE_MARKS[n - 1] ?? answer;
  }
  return answer;
}

// ── v2: 표준점수·백분위 추정 / 진행 시간 ──

/** 표준점수·백분위 추정에 쓰는 등급컷(ExamResult.gradeCut 과 같은 모양). */
export interface GradeCutAnchors {
  rawByGrade: readonly number[];
  standardByGrade: readonly number[];
  percentileByGrade: readonly number[];
  topStandard: number | null;
  topPercentile: number | null;
}

/** 표준점수 추정 하한(비현실적으로 낮은 값은 여기서 자른다). */
export const MIN_STANDARD_SCORE = 50;

/** (원점수, 값) 점들을 원점수 내림차순으로 이은 꺾은선 위의 값. 맨 아래 점 아래는 마지막 두 점 기울기로 연장. */
function interpolateAnchors(raw: number, points: Array<[number, number]>): number | null {
  // 같은 원점수가 겹치면(동점 컷) 위쪽 값 하나만 둔다.
  const sorted = [...points].sort((a, b) => b[0] - a[0]).filter((p, i, arr) => i === 0 || p[0] < arr[i - 1][0]);
  if (sorted.length === 0) return null;
  if (raw >= sorted[0][0]) return sorted[0][1];
  for (let i = 1; i < sorted.length; i += 1) {
    const [x1, y1] = sorted[i - 1];
    const [x0, y0] = sorted[i];
    if (raw >= x0) return y0 + ((raw - x0) / (x1 - x0)) * (y1 - y0);
  }
  if (sorted.length === 1) return sorted[0][1];
  const [xa, ya] = sorted[sorted.length - 2];
  const [xb, yb] = sorted[sorted.length - 1];
  return yb + ((raw - xb) / (xa - xb)) * (ya - yb);
}

function anchorPoints(raws: readonly number[], values: readonly number[], top: number | null): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  if (top != null && Number.isFinite(top)) points.push([100, top]);
  raws.forEach((raw, k) => {
    const value = values[k];
    if (Number.isFinite(raw) && value != null && Number.isFinite(value)) points.push([raw, value]);
  });
  return points;
}

/** 원점수 → 추정 표준점수·백분위(정수). (100, top) + (등급컷 원점수, 등급컷 값) 점들을 잇는 선형 보간.
 *  top 이 null 이면 1등급컷 위는 1등급컷 값 그대로, 8등급컷 아래는 마지막 두 점 기울기로 연장하되
 *  표준점수는 MIN_STANDARD_SCORE 아래로, 백분위는 0~100 밖으로 나가지 않는다. 데이터가 없으면 null. */
export function estimateStandardScore(raw: number, gradeCut: GradeCutAnchors): { standard: number | null; percentile: number | null } {
  const score = Math.min(100, Math.max(0, raw));
  const standard = interpolateAnchors(score, anchorPoints(gradeCut.rawByGrade, gradeCut.standardByGrade, gradeCut.topStandard));
  const percentile = interpolateAnchors(score, anchorPoints(gradeCut.rawByGrade, gradeCut.percentileByGrade, gradeCut.topPercentile));
  return {
    standard: standard == null ? null : Math.max(MIN_STANDARD_SCORE, Math.round(standard)),
    percentile: percentile == null ? null : Math.min(100, Math.max(0, Math.round(percentile))),
  };
}

/** 시험지 카드의 진행 시간: 1시간 미만은 mm:ss, 넘으면 'h시간 m분'. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 3600) return formatClock(ms);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}시간 ${m}분`;
}

/** 진행 막대 비율(0~1). */
export function progressRatio(answered: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.min(1, Math.max(0, answered / total));
}

// ── v2: 채점해 보기 잠금 ──

/** "채점해 보기"를 한 문항(checked)은 답을 바꿀 수 없다. 서버(목 포함)는 저장·제출 때 잠긴 문항의 답·결과를 이전 값으로 지킨다. */
export function keepCheckedAnswers<T extends Pick<ExamItemState, 'questionId' | 'answer' | 'checked'>>(prev: readonly T[], next: readonly T[]): T[] {
  const locked = new Map(prev.filter(item => item.checked).map(item => [item.questionId, item]));
  const merged = next.map(item => {
    const old = locked.get(item.questionId);
    return old ? { ...item, answer: old.answer, checked: old.checked } : item;
  });
  for (const [questionId, old] of locked) if (!next.some(item => item.questionId === questionId)) merged.push(old);
  return merged;
}
