// 테스트·브라우저 하네스용 메모리 ExamClient. 실제 서버(W1 examClient.ts)를 흉내만 낸다:
// 정답은 data json 에서 읽어 채점하고, 실전 모드 채점 요청은 거부한다.
// persistKey 를 주면 localStorage 에 상태를 남겨 새로고침 후 "이어 풀기"도 흉내낼 수 있다.
// v2: 시험지 2개(두 번째는 같은 문항을 쓰는 연습용 복제본) · 시험지별 진행/결과 요약 · 채점해 본 문항 잠금(checked).
import paperJson from '../data/2025-06-math.json';
import imagesJson from '../data/2025-06-math.images.json';
import type {
  ExamAttempt, ExamClient, ExamElective, ExamItemState, ExamMode, ExamPaperSummary, ExamQuestion, ExamResult, ExamResultItem,
} from '../contract.ts';
import { countAnswered, ELECTIVES, estimateGrade, isAnswerCorrect, keepCheckedAnswers } from './examLogic.ts';

interface WrongRateRow { number: number; wrongRate: number; choiceRates: number[] | null }
interface PaperData {
  title: string;
  examDate: string;
  source: string;
  timeLimitMinutes: number;
  answers: Record<string, Record<string, string>>;
  points: Record<string, number>;
  isChoice: Record<string, boolean>;
  gradeCuts: {
    source: string; rawByElective: Record<string, number[]>; standard: number[]; percentile: number[];
    /** 데이터에 있으면 쓰고, 없으면 목 기본값(MOCK_TOP). */
    topStandardByElective?: Record<string, number | null>;
    topPercentileByElective?: Record<string, number | null>;
  };
  wrongRates: { byElective: Record<string, WrongRateRow[]> };
}
type ImageData = Record<string, Record<string, { file: string }>>;

const PAPER = paperJson as unknown as PaperData;
const IMAGES = imagesJson as unknown as ImageData;
export const MOCK_PAPER_ID = '2025-06-math';
/** 시험지마다 따로 진행되는지 보려는 두 번째 목 시험지(문항·정답은 첫 시험지와 같다). */
export const MOCK_PAPER_B_ID = 'mock-practice-b';
const MOCK_PAPERS = [
  { id: MOCK_PAPER_ID, title: PAPER.title, examDate: PAPER.examDate, source: PAPER.source },
  { id: MOCK_PAPER_B_ID, title: '연습용 시험지 B (목)', examDate: '2024-09-04', source: '테스트용 목 데이터' },
];
/** 목 전용 최고점(원점수 100점) 표준점수·백분위 — 실제 값이 아니다. */
const MOCK_TOP = { standard: 152, percentile: 100 };
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

  const paperTitle = (paperId: string) => MOCK_PAPERS.find(p => p.id === paperId)?.title ?? PAPER.title;
  const roundFor = (attempt: ExamAttempt) => [...store.values()]
    .filter(entry => entry.attempt.paperId === attempt.paperId)
    .sort((a, b) => a.attempt.startedAt.localeCompare(b.attempt.startedAt) || a.attempt.id.localeCompare(b.attempt.id))
    .findIndex(entry => entry.attempt.id === attempt.id) + 1;

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
      round: roundFor(attempt),
      paperTitle: paperTitle(attempt.paperId),
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
        topStandard: PAPER.gradeCuts.topStandardByElective?.[attempt.elective] ?? MOCK_TOP.standard,
        topPercentile: PAPER.gradeCuts.topPercentileByElective?.[attempt.elective] ?? MOCK_TOP.percentile,
        source: PAPER.gradeCuts.source,
      },
      items: resultItems,
      submittedAt: new Date().toISOString(),
    };
  };

  return {
    async listPaperHistory(paperId, studentId) {
      record('listPaperHistory', [paperId, studentId]);
      await wait();
      if (studentId) throw new Error('이 기록을 볼 수 없어요.'); // 단일 학생 목
      return [...store.values()].filter(entry => entry.attempt.paperId === paperId).map(entry => {
        const { attempt, result } = entry;
        return {
          attemptId: attempt.id, round: roundFor(attempt), startedAt: attempt.startedAt,
          submittedAt: result?.submittedAt ?? null, status: attempt.status,
          mode: attempt.mode, elective: attempt.elective,
          score: result?.score ?? null, estimatedGrade: result?.estimatedGrade ?? null,
          totalTimeMs: attempt.items.reduce((sum, item) => sum + item.timeSpentMs, 0),
          items: attempt.questions.map(q => {
            const item = attempt.items.find(i => i.questionId === q.id);
            const graded = result?.items.find(i => i.questionId === q.id);
            return {
              number: q.number, section: q.section, isCorrect: attempt.status === 'submitted' ? graded?.isCorrect ?? false : null,
              unsure: item?.unsure ?? false, answered: item?.answer != null, timeSpentMs: item?.timeSpentMs ?? 0,
            };
          }),
        };
      }).sort((a, b) => a.round - b.round);
    },
    async listPapers() {
      record('listPapers', []);
      await wait();
      const entries = [...store.values()];
      return MOCK_PAPERS.map((meta): ExamPaperSummary => {
        const mine = entries.filter(entry => entry.attempt.paperId === meta.id);
        const active = [...mine].reverse().find(entry => entry.attempt.status === 'in_progress');
        const results = mine.map(entry => entry.result).filter((r): r is ExamResult => r != null)
          .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
        const last = results[0];
        return {
          ...meta,
          timeLimitMinutes: PAPER.timeLimitMinutes,
          electives: [...ELECTIVES],
          inProgress: active ? {
            attemptId: active.attempt.id,
            round: roundFor(active.attempt),
            mode: active.attempt.mode,
            elective: active.attempt.elective,
            startedAt: active.attempt.startedAt,
            timeLimitMinutes: active.attempt.timeLimitMinutes,
            answeredCount: countAnswered(active.attempt.items),
            elapsedMs: active.attempt.items.reduce((sum, item) => sum + item.timeSpentMs, 0),
          } : null,
          lastResult: last ? { attemptId: last.attemptId, round: roundFor(must(last.attemptId).attempt), score: last.score, estimatedGrade: last.estimatedGrade, submittedAt: last.submittedAt } : null,
          resultCount: results.length,
        };
      });
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
      // 서버처럼: 시험지마다 진행 중인 시도는 하나. 같은 시험지는 이어 풀기만.
      const existing = [...store.values()].find(entry => entry.attempt.paperId === paperId && entry.attempt.status === 'in_progress');
      if (existing) throw new Error('이 시험지는 풀던 시험이 있어요. 이어 풀기로 열어 주세요.');
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
      entry.attempt.items = keepCheckedAnswers(entry.attempt.items, clone(items));
      entry.attempt.visitOrder = [...visitOrder];
      persist();
      return true;
    },
    async checkAnswer(attemptId, questionId, answer) {
      record('checkAnswer', [attemptId, questionId, answer]);
      await wait();
      const entry = must(attemptId);
      const { attempt } = entry;
      if (attempt.mode !== 'free') throw new Error('실전 모드에서는 제출 전에 채점할 수 없어요.');
      if (attempt.status !== 'in_progress') throw new Error('이미 제출한 시험이에요.');
      const question = attempt.questions.find(q => q.id === questionId);
      if (!question) throw new Error('문항을 찾지 못했어요.');
      // v2: 한 번 채점한 문항은 잠긴다 — 다시 불러도 처음 결과 그대로.
      const existing = attempt.items.find(item => item.questionId === questionId);
      if (existing?.checked) return { ...existing.checked };
      const correctAnswer = correctAnswerFor(question);
      const checked = { isCorrect: isAnswerCorrect(answer, correctAnswer, question.isChoice), correctAnswer };
      if (existing) Object.assign(existing, { answer, checked });
      else attempt.items.push({ questionId, answer, unsure: false, timeSpentMs: 0, visits: 1, checked });
      persist();
      return { ...checked };
    },
    async submitAttempt(attemptId, items, visitOrder) {
      record('submitAttempt', [attemptId, items, visitOrder]);
      await wait();
      const entry = must(attemptId);
      if (entry.result) return clone({ ...entry.result, round: roundFor(entry.attempt) });
      entry.attempt.items = keepCheckedAnswers(entry.attempt.items, clone(items));
      entry.attempt.visitOrder = [...visitOrder];
      entry.attempt.status = 'submitted';
      entry.result = grade(entry, entry.attempt.items);
      persist();
      return clone(entry.result);
    },
    async getResult(attemptId) {
      record('getResult', [attemptId]);
      await wait();
      const entry = must(attemptId);
      if (!entry.result) throw new Error('아직 제출하지 않은 시험이에요.');
      return clone({ ...entry.result, round: roundFor(entry.attempt), items: entry.result.items.map(item => ({ ...item, addedMistakeId: entry.mistakes[item.questionId] ?? null })) });
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
