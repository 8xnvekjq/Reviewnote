// 테스트·브라우저 하네스용 메모리 ExamClient. 실제 서버(W1 examClient.ts)를 흉내만 낸다:
// 정답은 data json 에서 읽어 채점하고, 실전 모드 채점 요청은 거부한다.
// persistKey 를 주면 localStorage 에 상태를 남겨 새로고침 후 "이어 풀기"도 흉내낼 수 있다.
import paperJson from '../data/2025-06-math.json';
import imagesJson from '../data/2025-06-math.images.json';
import type {
  ExamAttempt, ExamClient, ExamElective, ExamItemState, ExamMode, ExamPaperSummary, ExamQuestion, ExamResult, ExamResultItem,
} from '../contract.ts';
import { ELECTIVES, estimateGrade, isAnswerCorrect } from './examLogic.ts';

interface WrongRateRow { number: number; wrongRate: number; choiceRates: number[] | null }
interface PaperData {
  title: string;
  examDate: string;
  source: string;
  timeLimitMinutes: number;
  answers: Record<string, Record<string, string>>;
  points: Record<string, number>;
  isChoice: Record<string, boolean>;
  gradeCuts: { source: string; rawByElective: Record<string, number[]>; standard: number[]; percentile: number[] };
  wrongRates: { byElective: Record<string, WrongRateRow[]> };
}
type ImageData = Record<string, Record<string, { file: string }>>;

const PAPER = paperJson as unknown as PaperData;
const IMAGES = imagesJson as unknown as ImageData;
export const MOCK_PAPER_ID = '2025-06-math';
const SECTION_KEY: Record<'common' | ExamElective, string> = { common: 'c', '확률과 통계': 'prob', '미적분': 'calc', '기하': 'geom' };

export function mockQuestionId(section: 'common' | ExamElective, number: number): string {
  return `q-${SECTION_KEY[section]}-${String(number).padStart(2, '0')}`;
}

export function buildMockQuestions(elective: ExamElective): ExamQuestion[] {
  const questions: ExamQuestion[] = [];
  for (let number = 1; number <= 30; number += 1) {
    const section: 'common' | ExamElective = number <= 22 ? 'common' : elective;
    const file = IMAGES[section]?.[String(number)]?.file ?? `${SECTION_KEY[section]}-${String(number).padStart(2, '0')}.png`;
    questions.push({
      id: mockQuestionId(section, number),
      number,
      section,
      imageUrl: `/exams/${MOCK_PAPER_ID}/${file}`,
      isChoice: PAPER.isChoice[String(number)] ?? false,
      points: PAPER.points[String(number)] ?? 3,
    });
  }
  return questions;
}

function correctAnswerFor(question: ExamQuestion): string {
  return PAPER.answers[question.section]?.[String(question.number)] ?? '';
}

interface StoredAttempt {
  attempt: ExamAttempt;
  result: ExamResult | null;
  mistakes: Record<string, string>; // questionId → mistakeId
}

export interface MockExamClientOptions {
  /** 실전 모드 제한시간 덮어쓰기(분, 소수 가능) — 자동 제출 테스트용. */
  timeLimitMinutes?: number;
  /** 주면 localStorage 에 상태 저장(새로고침 이어 풀기 테스트). */
  persistKey?: string;
  /** 모든 호출 지연(ms). */
  latencyMs?: number;
  /** saveProgress 가 false 를 돌려주게(저장 실패 흉내). */
  failSave?: boolean;
  /** 호출 기록(테스트에서 검사). */
  log?: Array<{ method: string; args: unknown[] }>;
}

export function createMockExamClient(options: MockExamClientOptions = {}): ExamClient {
  const store = new Map<string, StoredAttempt>();
  let seq = 0;

  const load = () => {
    if (!options.persistKey) return;
    try {
      const raw = localStorage.getItem(options.persistKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { seq: number; attempts: StoredAttempt[] };
      seq = parsed.seq;
      for (const entry of parsed.attempts) store.set(entry.attempt.id, entry);
    } catch { /* 깨진 저장분은 무시 */ }
  };
  const persist = () => {
    if (!options.persistKey) return;
    try {
      localStorage.setItem(options.persistKey, JSON.stringify({ seq, attempts: [...store.values()] }));
    } catch { /* 저장 실패는 무시 */ }
  };
  load();

  const wait = async () => {
    if (options.latencyMs) await new Promise(resolve => setTimeout(resolve, options.latencyMs));
  };
  const record = (method: string, args: unknown[]) => { options.log?.push({ method, args: structuredClone(args) }); };
  const must = (attemptId: string) => {
    const entry = store.get(attemptId);
    if (!entry) throw new Error('시험 기록을 찾지 못했어요.');
    return entry;
  };
  const clone = <T,>(value: T): T => structuredClone(value);

  const grade = (entry: StoredAttempt, items: ExamItemState[]): ExamResult => {
    const { attempt } = entry;
    const byId = new Map(items.map(item => [item.questionId, item]));
    const rates = PAPER.wrongRates.byElective[attempt.elective] ?? [];
    const resultItems: ExamResultItem[] = attempt.questions.map(question => {
      const item = byId.get(question.id);
      const correctAnswer = correctAnswerFor(question);
      const answer = item?.answer ?? null;
      const rate = rates.find(row => row.number === question.number);
      return {
        questionId: question.id,
        number: question.number,
        section: question.section,
        imageUrl: question.imageUrl,
        isChoice: question.isChoice,
        points: question.points,
        answer,
        correctAnswer,
        isCorrect: isAnswerCorrect(answer, correctAnswer, question.isChoice),
        unsure: item?.unsure ?? false,
        timeSpentMs: item?.timeSpentMs ?? 0,
        nationalWrongRate: rate?.wrongRate ?? null,
        nationalChoiceRates: rate?.choiceRates ?? null,
        addedMistakeId: entry.mistakes[question.id] ?? null,
      };
    });
    const score = resultItems.reduce((sum, item) => sum + (item.isCorrect ? item.points : 0), 0);
    const rawByGrade = PAPER.gradeCuts.rawByElective[attempt.elective] ?? [];
    return {
      attemptId: attempt.id,
      paperTitle: PAPER.title,
      mode: attempt.mode,
      elective: attempt.elective,
      score,
      correctCount: resultItems.filter(item => item.isCorrect).length,
      totalCount: resultItems.length,
      totalTimeMs: resultItems.reduce((sum, item) => sum + item.timeSpentMs, 0),
      estimatedGrade: estimateGrade(score, rawByGrade),
      gradeCut: {
        rawByGrade,
        standardByGrade: PAPER.gradeCuts.standard,
        percentileByGrade: PAPER.gradeCuts.percentile,
        source: PAPER.gradeCuts.source,
      },
      items: resultItems,
      submittedAt: new Date().toISOString(),
    };
  };

  return {
    async listPapers() {
      record('listPapers', []);
      await wait();
      const paper: ExamPaperSummary = {
        id: MOCK_PAPER_ID,
        title: PAPER.title,
        examDate: PAPER.examDate,
        source: PAPER.source,
        timeLimitMinutes: PAPER.timeLimitMinutes,
        electives: [...ELECTIVES],
      };
      return [paper];
    },
    async getActiveAttempt(paperId) {
      record('getActiveAttempt', [paperId]);
      await wait();
      const active = [...store.values()].reverse().find(entry => entry.attempt.paperId === paperId && entry.attempt.status === 'in_progress');
      return active ? clone(active.attempt) : null;
    },
    async startAttempt(paperId, mode: ExamMode, elective: ExamElective) {
      record('startAttempt', [paperId, mode, elective]);
      await wait();
      seq += 1;
      const attempt: ExamAttempt = {
        id: `attempt-${seq}`,
        paperId,
        mode,
        elective,
        startedAt: new Date().toISOString(),
        timeLimitMinutes: mode === 'real' ? options.timeLimitMinutes ?? PAPER.timeLimitMinutes : null,
        status: 'in_progress',
        questions: buildMockQuestions(elective),
        items: [],
        visitOrder: [],
      };
      store.set(attempt.id, { attempt, result: null, mistakes: {} });
      persist();
      return clone(attempt);
    },
    async saveProgress(attemptId, items, visitOrder) {
      record('saveProgress', [attemptId, items, visitOrder]);
      await wait();
      if (options.failSave) return false;
      const entry = store.get(attemptId);
      if (!entry || entry.attempt.status !== 'in_progress') return false;
      entry.attempt.items = clone(items);
      entry.attempt.visitOrder = [...visitOrder];
      persist();
      return true;
    },
    async checkAnswer(attemptId, questionId, answer) {
      record('checkAnswer', [attemptId, questionId, answer]);
      await wait();
      const { attempt } = must(attemptId);
      if (attempt.mode !== 'free') throw new Error('실전 모드에서는 제출 전에 채점할 수 없어요.');
      const question = attempt.questions.find(q => q.id === questionId);
      if (!question) throw new Error('문항을 찾지 못했어요.');
      const correctAnswer = correctAnswerFor(question);
      return { isCorrect: isAnswerCorrect(answer, correctAnswer, question.isChoice), correctAnswer };
    },
    async submitAttempt(attemptId, items, visitOrder) {
      record('submitAttempt', [attemptId, items, visitOrder]);
      await wait();
      const entry = must(attemptId);
      if (entry.result) return clone(entry.result);
      entry.attempt.items = clone(items);
      entry.attempt.visitOrder = [...visitOrder];
      entry.attempt.status = 'submitted';
      entry.result = grade(entry, items);
      persist();
      return clone(entry.result);
    },
    async getResult(attemptId) {
      record('getResult', [attemptId]);
      await wait();
      const entry = must(attemptId);
      if (!entry.result) throw new Error('아직 제출하지 않은 시험이에요.');
      return clone({ ...entry.result, items: entry.result.items.map(item => ({ ...item, addedMistakeId: entry.mistakes[item.questionId] ?? null })) });
    },
    async listMyResults(paperId) {
      record('listMyResults', [paperId]);
      await wait();
      return [...store.values()]
        .filter(entry => entry.result && (!paperId || entry.attempt.paperId === paperId))
        .map(entry => {
          const r = entry.result!;
          return { attemptId: r.attemptId, paperTitle: r.paperTitle, mode: r.mode, elective: r.elective, score: r.score, estimatedGrade: r.estimatedGrade, submittedAt: r.submittedAt };
        })
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    },
    async addToMistakes(attemptId, questionIds) {
      record('addToMistakes', [attemptId, questionIds]);
      await wait();
      const entry = must(attemptId);
      if (!entry.result) throw new Error('제출한 뒤에 오답노트에 추가할 수 있어요.');
      const added: Array<{ questionId: string; mistakeId: string }> = [];
      for (const questionId of questionIds) {
        if (entry.mistakes[questionId]) continue;
        const mistakeId = `mistake-${attemptId}-${questionId}`;
        entry.mistakes[questionId] = mistakeId;
        added.push({ questionId, mistakeId });
      }
      persist();
      return added;
    },
  };
}
