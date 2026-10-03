import { WORKSHEET_FIXTURE, WORKSHEET_FIXTURE_QUESTIONS } from './worksheetFixture';
// 테스트·브라우저 하네스용 메모리 ExamClient. 실제 서버(W1 examClient.ts)를 흉내만 낸다:
// 정답은 data json 에서 읽어 채점하고, 실전 모드 채점 요청은 거부한다.
// persistKey 를 주면 localStorage 에 상태를 남겨 새로고침 후 "이어 풀기"도 흉내낼 수 있다.
// v2: 시험지 2개(두 번째는 같은 문항을 쓰는 연습용 복제본) · 시험지별 진행/결과 요약 · 채점해 본 문항 잠금(checked).
import schoolJson from '../data/2026-dongbuk-g1-s2-mid-common2.json';
import advancedJson from '../data/2026-hanneung-79-advanced.json';
import basicJson from '../data/2026-hanneung-79-basic.json';
import round74 from '../data/2025-hanneung-74-advanced.json';
import round75 from '../data/2025-hanneung-75-advanced.json';
import round76 from '../data/2025-hanneung-76-advanced.json';
import round77 from '../data/2026-hanneung-77-advanced.json';
import round78 from '../data/2026-hanneung-78-advanced.json';
import eraSets from '../data/hanneungEraSets.json';
import type { HanneungEra } from './hanneungEra';
import { hanneungGrade } from './hanneungLogic.ts';
import paperJson from '../data/2025-06-math.json';
import imagesJson from '../data/2025-06-math.images.json';
import type {
  AdminExamApi, AdminLiveStudent, InkStroke, LiveInkResponse,
  ExamAttempt, ExamClient, ExamElective, ExamInkDocument, ExamItemState, ExamMode, ExamPaperSummary, ExamQuestion, ExamResult, ExamResultItem, InkReplayBatch,
} from '../contract.ts';
import { sanitizeExamAnswer } from '../examMappers';
import { applyInkEvent, inkDelta, inkIdsHash } from '../ink/inkReplay';
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
export const MOCK_SCHOOL_ID = schoolJson.id;
const SCHOOL_META: ExamPaperSummary = {
  id: schoolJson.id, title: schoolJson.title, examDate: '', source: schoolJson.source,
  kind: 'school', schoolName: schoolJson.schoolName, year: schoolJson.year,
  grade: schoolJson.grade, semester: schoolJson.semester, examTerm: 'mid',
  questionCount: schoolJson.questionCount, maxScore: schoolJson.maxScore, published: false,
  timeLimitMinutes: schoolJson.timeLimitMinutes, electives: [],
  inProgress: null, lastResult: null, resultCount: 0,
};
function schoolQuestions(): ExamQuestion[] {
  return schoolJson.questions.map(q => ({
    id: `school-${q.number}`, number: q.number, section: 'common', imageUrl: q.imageUrl,
    isChoice: q.answerType !== 'digits', answerType: q.answerType as ExamQuestion['answerType'],
    points: q.points, choices: q.choices ?? null,
  }));
}
const MOCK_PAPERS = [
  { id: MOCK_PAPER_ID, title: PAPER.title, examDate: PAPER.examDate, source: PAPER.source },
  { id: MOCK_PAPER_B_ID, title: '연습용 시험지 B (목)', examDate: '2024-09-04', source: '테스트용 목 데이터' },
];
const HANNEUNG = [advancedJson, basicJson];
const ERA_SOURCES = [round74, round75, round76, round77, round78, advancedJson];
const HANNEUNG_META: ExamPaperSummary[] = HANNEUNG.map(paper => ({
  id: paper.id, title: paper.title, examDate: paper.examDate, source: paper.source,
  kind: 'hanneung', hanneungLevel: paper.hanneungLevel as 'advanced' | 'basic',
  year: paper.year, questionCount: 50, maxScore: 100, published: true,
  timeLimitMinutes: paper.timeLimitMinutes, electives: [], inProgress: null, lastResult: null, resultCount: 0,
}));
const ERA_META: ExamPaperSummary[] = eraSets.map(set => ({
  id: set.id, title: set.title, examDate: '', source: '국사편찬위원회', kind: 'hanneung',
  practiceEra: set.era as HanneungEra, hanneungLevel: 'advanced', questionCount: set.members.length,
  maxScore: set.members.length, published: true, timeLimitMinutes: 80, electives: [],
  inProgress: null, lastResult: null, resultCount: 0,
}));
/** 목 전용 최고점(원점수 100점) 표준점수·백분위 — 실제 값이 아니다. */
const MOCK_TOP = { standard: 152, percentile: 100 };
/** Anonymous peer fixture is never inserted into the persisted attempts/ink maps. */
function mockPeerStrokes(): InkStroke[] {
  return Array.from({ length: 3 }, (_, i) => ({
    id: `peer-stroke-${i}`, tool: 'pen', color: '#16a34a', size: 4,
    points: Array.from({ length: 24 }, (_, n) => ({ x: .12 + n * .018, y: .2 + i * .08 + n * .003, pressure: .5, t: n * 20 })),
  }));
}
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
  if (question.sourcePaperId) return ERA_SOURCES.find(p => p.id === question.sourcePaperId)?.questions.find(q => q.number === question.sourceNumber)?.answer ?? '';
  const historyPaper = HANNEUNG.find(paper => question.id.startsWith(paper.id));
  if (historyPaper) return historyPaper.questions[question.number - 1].answer;
  if (question.id.startsWith('worksheet-')) return '4';
  if (question.id.startsWith('school-')) return schoolJson.questions.find(q => q.number === question.number)?.answer ?? '';
  return PAPER.answers[question.section]?.[String(question.number)] ?? '';
}

interface StoredAttempt {
  attempt: ExamAttempt;
  result: ExamResult | null;
  mistakes: Record<string, string>; // questionId → mistakeId
}

export interface MockExamClientOptions {
  /** 비공개 내신 검토를 위한 관리자 하네스. 기본값은 학생. */
  admin?: boolean;
  worksheet?: boolean;
  /** 실전 모드 제한시간 덮어쓰기(분, 소수 가능) — 자동 제출 테스트용. */
  timeLimitMinutes?: number;
  /** 주면 localStorage 에 상태 저장(새로고침 이어 풀기 테스트). */
  persistKey?: string;
  /** 모든 호출 지연(ms). */
  latencyMs?: number;
  /** saveProgress 가 false 를 돌려주게(저장 실패 흉내). */
  failSave?: boolean;
  /** 필기 저장 요청 수·요청 본문 바이트(서버로 가는 양 측정). */
  inkStats?: { requests: number; bytes: number };
  /** 호출 기록(테스트에서 검사). */
  log?: Array<{ method: string; args: unknown[] }>;
}

export function createMockExamClient(options: MockExamClientOptions = {}): ExamClient {
  const papers = [...(options.worksheet ? [WORKSHEET_FIXTURE] : []), ...MOCK_PAPERS, ...HANNEUNG_META, ...ERA_META, ...(options.admin ? [SCHOOL_META] : [])];
  const store = new Map<string, StoredAttempt>();
  const ink = new Map<string, ExamInkDocument[]>();
  const replay = new Map<string, InkReplayBatch[]>();
  let seq = 0;

  const load = () => {
    if (!options.persistKey) return;
    try {
      const raw = localStorage.getItem(options.persistKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { seq: number; attempts: StoredAttempt[]; ink?: [string, ExamInkDocument[]][]; replay?: [string, InkReplayBatch[]][] };
      seq = parsed.seq;
      for (const entry of parsed.attempts) store.set(entry.attempt.id, entry);
      for (const [id, docs] of parsed.ink ?? []) ink.set(id, docs);
      for (const [id, batches] of parsed.replay ?? []) replay.set(id, batches);
    } catch { /* 깨진 저장분은 무시 */ }
  };
  const persist = () => {
    if (!options.persistKey) return;
    try {
      localStorage.setItem(options.persistKey, JSON.stringify({ seq, attempts: [...store.values()], ink: [...ink], replay: [...replay] }));
    } catch { /* 저장 실패는 무시 */ }
  };
  load();

  const wait = async () => {
    if (options.latencyMs) await new Promise(resolve => setTimeout(resolve, options.latencyMs));
  };
  const originalSolutions = new Map<string, string>(); // mistakeId → '원래풀이' 이미지
  const record = (method: string, args: unknown[]) => { options.log?.push({ method, args: structuredClone(args) }); };
  const must = (attemptId: string) => {
    const entry = store.get(attemptId);
    if (!entry) throw new Error('시험 기록을 찾지 못했어요.');
    return entry;
  };
  const clone = <T,>(value: T): T => structuredClone(value);

  const paperTitle = (paperId: string) => papers.find(p => p.id === paperId)?.title ?? PAPER.title;
  const roundFor = (attempt: ExamAttempt) => [...store.values()]
    .filter(entry => entry.attempt.paperId === attempt.paperId)
    .sort((a, b) => a.attempt.startedAt.localeCompare(b.attempt.startedAt) || a.attempt.id.localeCompare(b.attempt.id))
    .findIndex(entry => entry.attempt.id === attempt.id) + 1;

  const grade = (entry: StoredAttempt, items: ExamItemState[]): ExamResult => {
    const { attempt } = entry;
    const byId = new Map(items.map(item => [item.questionId, item]));
    const worksheet = attempt.paperId === WORKSHEET_FIXTURE.id;
    const school = attempt.paperId === MOCK_SCHOOL_ID || worksheet;
    const historyMeta = [...HANNEUNG_META, ...ERA_META].find(paper => paper.id === attempt.paperId);
    const rates = school || historyMeta ? [] : PAPER.wrongRates.byElective[attempt.elective ?? '미적분'] ?? [];
    const resultItems: ExamResultItem[] = attempt.questions.map(question => {
      const item = byId.get(question.id);
      const correctAnswer = correctAnswerFor(question);
      const answer = item?.answer ?? null;
      const rate = rates.find(row => row.number === question.number);
      return {
        questionId: question.id,
        sourcePaperId: question.sourcePaperId, sourceNumber: question.sourceNumber, sourceRound: question.sourceRound,
        number: question.number,
        section: question.section,
        imageUrl: question.imageUrl,
        isChoice: question.isChoice,
        answerType: question.answerType, choices: question.choices, sourceLabel: question.sourceLabel,
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
    const rawByGrade = PAPER.gradeCuts.rawByElective[attempt.elective ?? '미적분'] ?? [];
    return {
      ...(worksheet ? WORKSHEET_FIXTURE : school ? SCHOOL_META : {}),
      ...historyMeta,
      attemptId: attempt.id,
      paperId: attempt.paperId,
      round: roundFor(attempt),
      paperTitle: paperTitle(attempt.paperId),
      mode: attempt.mode,
      elective: attempt.elective,
      score,
      correctCount: resultItems.filter(item => item.isCorrect).length,
      totalCount: resultItems.length,
      totalTimeMs: resultItems.reduce((sum, item) => sum + item.timeSpentMs, 0),
      estimatedGrade: school || historyMeta?.practiceEra ? null : historyMeta ? hanneungGrade(score, historyMeta.hanneungLevel) : estimateGrade(score, rawByGrade),
      gradeCut: {
        rawByGrade: school ? [] : rawByGrade,
        standardByGrade: school ? [] : PAPER.gradeCuts.standard,
        percentileByGrade: school ? [] : PAPER.gradeCuts.percentile,
        topStandard: school ? null : PAPER.gradeCuts.topStandardByElective?.[attempt.elective ?? '미적분'] ?? MOCK_TOP.standard,
        topPercentile: school ? null : PAPER.gradeCuts.topPercentileByElective?.[attempt.elective ?? '미적분'] ?? MOCK_TOP.percentile,
        source: PAPER.gradeCuts.source,
      },
      items: resultItems,
      submittedAt: new Date().toISOString(),
    };
  };

  return {
    async getInk(attemptId) {
      must(attemptId);
      return clone(ink.get(attemptId) ?? []);
    },
    async getPeerSolution(attemptId, questionId) {
      record('getPeerSolution', [attemptId, questionId]);
      await wait();
      const result = must(attemptId).result;
      const item = result?.items.find(row => row.questionId === questionId);
      if (!result || result.kind === 'hanneung' || item?.isCorrect !== false) throw new Error('EXAM_PEER_NOT_ALLOWED');
      if (item.number === 3) return null;
      const strokes = mockPeerStrokes();
      return { label: { character: '하치와레', title: '꾸준한 도전자', grade: '고2', isTeacher: false },
        strokes, solutionKey: 'mock-peer-fingerprint' };
    },
    async getPeerSolutionReplay(attemptId, questionId, solutionKey) {
      record('getPeerSolutionReplay', [attemptId, questionId, solutionKey]);
      if (solutionKey !== 'mock-peer-fingerprint') throw new Error('EXAM_PEER_CHANGED');
      const result = must(attemptId).result;
      if (!result || result.kind === 'hanneung' || result.items.find(row => row.questionId === questionId)?.isCorrect !== false) throw new Error('EXAM_PEER_NOT_ALLOWED');
      // Reuse the anonymous fixture without adding another getPeerSolution request to the log.
      const strokes = mockPeerStrokes();
      const events = strokes.map((_, i) => ({ ...inkDelta(strokes.slice(0,i), strokes.slice(0,i+1), 'draw', (i+1)*600), id: `peer-event-${i}` }));
      return { strokes, revision: 1, batches: [{ id: 'peer-batch-1', revision: 1, baseRevision: 0, baseline: [], events }] };
    },
    async getInkReplay(attemptId, questionId) {
      must(attemptId);
      const doc = ink.get(attemptId)?.find(row => row.questionId === questionId);
      return clone({ batches: replay.get(`${attemptId}:${questionId}`) ?? [], strokes: doc?.strokes ?? [], revision: doc?.revision ?? 0 });
    },
    // save_exam_ink_delta 흉내: 이벤트를 서버 쪽 필기에 적용하고 결과 획 id 해시를 대조한다.
    async saveInk(attemptId, questionId, request) {
      const { revision, legacyImport, events, batchId, idsHash } = request;
      const entry = must(attemptId);
      if (options.inkStats) { options.inkStats.requests++; options.inkStats.bytes += new TextEncoder().encode(JSON.stringify(request)).length; }
      if (options.failSave) throw new Error('offline');
      const docs = ink.get(attemptId) ?? [];
      const old = docs.find(row => row.questionId === questionId);
      const key = `${attemptId}:${questionId}`;
      const batches = replay.get(key) ?? [];
      const duplicate = batches.find(batch => batch.id === batchId);
      if (duplicate) {
        if (duplicate.baseRevision !== revision || JSON.stringify(duplicate.events) !== JSON.stringify(events)) throw new Error('EXAM_REPLAY_BATCH_MISMATCH');
        return duplicate.revision;
      }
      if ((old?.revision ?? 0) !== revision) throw new Error('EXAM_INK_CONFLICT');
      if (entry.attempt.status === 'submitted' && !(legacyImport && !old)) throw new Error('EXAM_INK_SUBMITTED');
      if (!events.length) throw new Error('EXAM_REPLAY_TOO_LARGE');
      const strokes = events.reduce(applyInkEvent, old?.strokes ?? []);
      if (await inkIdsHash(strokes) !== idsHash) throw new Error('EXAM_REPLAY_FINAL_MISMATCH');
      replay.set(key, [...batches, { id: batchId, revision: revision + 1, baseRevision: revision,
        baseline: batches.at(-1)?.revision === revision ? null : clone(old?.strokes ?? []), events: clone(events) }]);
      const next = { questionId, strokes: clone(strokes), revision: revision + 1, lastBatchId: batchId };
      ink.set(attemptId, [...docs.filter(row => row.questionId !== questionId), next]);
      persist();
      return next.revision;
    },
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
      return papers.map((meta): ExamPaperSummary => {
        const mine = entries.filter(entry => entry.attempt.paperId === meta.id);
        const active = [...mine].reverse().find(entry => entry.attempt.status === 'in_progress');
        const results = mine.map(entry => entry.result).filter((r): r is ExamResult => r != null)
          .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
        const last = results[0];
        return {
          ...meta,
          ...(meta.id === MOCK_SCHOOL_ID ? SCHOOL_META : {}),
          timeLimitMinutes: meta.id === WORKSHEET_FIXTURE.id ? null : HANNEUNG_META.find(paper => paper.id === meta.id)?.timeLimitMinutes ?? (meta.id === MOCK_SCHOOL_ID ? 50 : PAPER.timeLimitMinutes),
          electives: meta.id === WORKSHEET_FIXTURE.id || meta.id === MOCK_SCHOOL_ID || [...HANNEUNG_META, ...ERA_META].some(paper => paper.id === meta.id) ? [] : [...ELECTIVES],
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
    async startAttempt(paperId, mode: ExamMode, elective: ExamElective | null) {
      record('startAttempt', [paperId, mode, elective]);
      await wait();
      // 서버처럼: 시험지마다 진행 중인 시도는 하나. 같은 시험지는 이어 풀기만.
      const existing = [...store.values()].find(entry => entry.attempt.paperId === paperId && entry.attempt.status === 'in_progress');
      if (existing) throw new Error('이 시험지는 풀던 시험이 있어요. 이어 풀기로 열어 주세요.');
      if (!papers.some(p => p.id === paperId)) throw new Error('이 시험지를 찾지 못했어요.');
      const worksheet = paperId === WORKSHEET_FIXTURE.id;
      if (worksheet && mode !== 'free') throw new Error('EXAM_INVALID_MODE');
      const school = paperId === MOCK_SCHOOL_ID;
      const historyMeta = [...HANNEUNG_META, ...ERA_META].find(paper => paper.id === paperId);
      const eraSet = eraSets.find(set => set.id === paperId);
      if (eraSet && mode !== 'free') throw new Error('EXAM_INVALID_MODE');
      const historyPaper = HANNEUNG.find(paper => paper.id === paperId);
      seq += 1;
      const attempt: ExamAttempt = {
        ...(worksheet ? { ...WORKSHEET_FIXTURE, paperTitle: WORKSHEET_FIXTURE.title } : school ? { ...SCHOOL_META, paperTitle: SCHOOL_META.title } : {}),
        ...historyMeta,
        id: `attempt-${seq}`,
        paperId,
        mode,
        elective: worksheet || school || historyMeta ? null : elective,
        startedAt: new Date().toISOString(),
        timeLimitMinutes: mode === 'real' ? options.timeLimitMinutes ?? historyMeta?.timeLimitMinutes ?? (school ? 50 : PAPER.timeLimitMinutes) : null,
        status: 'in_progress',
        questions: worksheet ? clone(WORKSHEET_FIXTURE_QUESTIONS) : eraSet ? eraSet.members.map((member, i) => ({
          ...member, id: `${paperId}-${i + 1}`, number: i + 1, section: 'common',
          points: 1, isChoice: true, answerType: 'choice5',
        })) : historyPaper ? historyPaper.questions.map(question => ({
          id: `${paperId}-${question.number}`, number: question.number, section: 'common',
          imageUrl: question.imageUrl, points: question.points, isChoice: true,
          answerType: question.answerType as ExamQuestion['answerType'],
        })) : school ? schoolQuestions() : buildMockQuestions(elective ?? '미적분'),
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
      answer = sanitizeExamAnswer(answer, question.answerType ?? question.isChoice) ?? '';
      if (!answer) throw new Error('채점할 답을 먼저 입력해 주세요.');
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
          return { ...(r.kind === 'worksheet' ? WORKSHEET_FIXTURE : r.kind === 'school' ? SCHOOL_META : {}), kind: r.kind, practiceEra: r.practiceEra, questionCount: r.questionCount, hanneungLevel: r.hanneungLevel, attemptId: r.attemptId, paperTitle: r.paperTitle, mode: r.mode, elective: r.elective, score: r.score, estimatedGrade: r.estimatedGrade, submittedAt: r.submittedAt };
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
    async addOriginalSolutions(rows) {
      record('addOriginalSolutions', [rows.map(row => ({ mistakeId: row.mistakeId, png: row.imageDataUrl.startsWith('data:image/png;base64,'), bytes: row.imageDataUrl.length }))]);
      await wait();
      let added = 0;
      for (const row of rows) {
        if (originalSolutions.has(row.mistakeId)) continue;
        originalSolutions.set(row.mistakeId, row.imageDataUrl);
        added++;
      }
      return added;
    },
  };
}

/** Explicit controls let browser tests change membership and draw/erase between real polling ticks. */
export function createMockLiveExamApi() {
  let count = 2;
  const questions = buildMockQuestions('미적분');
  const docs = new Map<string, { revision: number; strokes: InkStroke[]; batches: Extract<LiveInkResponse, { mode: 'delta' }>['batches']; updatedAt: string }>();
  const id = (index: number) => `live-attempt-${index}`;
  const update = (index: number, erase = false) => {
    const key = id(index);
    const old = docs.get(key) ?? { revision: 0, strokes: [], batches: [], updatedAt: new Date().toISOString() };
    const stroke: InkStroke = { id: `live-${index}-${old.revision}`, tool: 'pen', color: '#2563eb', size: 3,
      points: [{ x: .1, y: .3 + old.revision * .04, pressure: .5, t: 0 }, { x: 1.4, y: .4 + old.revision * .04, pressure: .5, t: 150 }] };
    const strokes = erase ? old.strokes.slice(1) : [...old.strokes, stroke];
    const revision = old.revision + 1;
    docs.set(key, { revision, strokes, updatedAt: new Date().toISOString(), batches: [...old.batches,
      { revision, events: [inkDelta(old.strokes, strokes, erase ? 'erase' : 'draw')] }] });
  };
  for (let i = 0; i < 3; i++) update(i);
  const api: Pick<AdminExamApi, 'listLivePapers' | 'getLiveExam' | 'getLiveInk'> = {
    listLivePapers: async () => count ? [{ paperId: MOCK_PAPER_ID, liveCount: count }] : [],
    getLiveExam: async paperId => paperId !== MOCK_PAPER_ID ? [] : Array.from({ length: count }, (_, index): AdminLiveStudent => {
      const doc = docs.get(id(index))!;
      return { attemptId: id(index), studentId: `live-student-${index}`, studentName: ['김학생', '이학생', '박학생'][index],
        questionId: questions[0].id, number: 1, imageUrl: questions[0].imageUrl, revision: doc.revision, updatedAt: doc.updatedAt, answeredCount: 0 };
    }),
    getLiveInk: async (attemptId, _questionId, since): Promise<LiveInkResponse> => {
      const doc = docs.get(attemptId)!;
      if (since === null || doc.revision - since > 24 || since > doc.revision) return { mode: 'full', revision: doc.revision, strokes: doc.strokes };
      return { mode: 'delta', revision: doc.revision, batches: doc.batches.filter(batch => batch.revision > since) };
    },
  };
  return { api, questions, setCount: (n: number) => { count = Math.max(0, Math.min(3, n)); },
    draw: (index: number) => update(index), erase: (index: number) => update(index, true) };
}
