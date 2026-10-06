import { WORKSHEET_FIXTURES } from './worksheetFixture';

const worksheetFixture = (paperId: string) => WORKSHEET_FIXTURES.find(fixture => fixture.paper.id === paperId) ?? null;
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
import { decodeInkPayload, encodeInkEvents } from '../ink/inkCodec';
import { countAnswered, ELECTIVES, estimateGrade, isAnswerCorrect, keepCheckedAnswers } from './examLogic.ts';
import { canReadSharedTeacherAudio, pickSharedTeacher, readSharedTeacher, writeSharedTeacher, type SharedTeacherAttempt } from './mockTeacherShare.ts';

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
/** ?filters=1: 시험지 고르기 필터(연도·월 / 연도·학기·중간기말·학교) 검증용 목록 전용 목 시험지. 문항은 첫 시험지 것을 빌려 쓴다. */
const filterPaper = (meta: Pick<ExamPaperSummary, 'id' | 'title' | 'examDate' | 'source'> & Partial<ExamPaperSummary>): ExamPaperSummary => ({
  timeLimitMinutes: PAPER.timeLimitMinutes, electives: [...ELECTIVES], inProgress: null, lastResult: null, resultCount: 0, ...meta,
});
const schoolFilterPaper = (id: string, schoolName: string, year: number, semester: number, examTerm: 'mid' | 'final') => filterPaper({
  id, title: `${year} ${schoolName} 1학년 ${semester}학기 ${examTerm === 'mid' ? '중간' : '기말'} (목)`, examDate: '', source: schoolName,
  kind: 'school', schoolName, year, grade: 1, semester, examTerm, questionCount: 30, maxScore: 100, published: true, timeLimitMinutes: 50, electives: [],
});
export const FILTER_FIXTURE_PAPERS: ExamPaperSummary[] = [
  filterPaper({ id: 'mock-csat-2026-11', title: '2026학년도 대학수학능력시험 수학 (목)', examDate: '2025-11-13', source: '한국교육과정평가원' }),
  filterPaper({ id: 'mock-csat-2026-06', title: '2026학년도 6월 모의평가 수학 (목)', examDate: '2025-06-04', source: '한국교육과정평가원' }),
  schoolFilterPaper('mock-school-2026-s1-final', '둔촌고', 2026, 1, 'final'),
  schoolFilterPaper('mock-school-2025-s2-final', '상일여고', 2025, 2, 'final'),
  filterPaper({ id: 'mock-worksheet-g3-quadratic', title: '중3 이차함수 학습지 (목)', examDate: '', source: '브라우저 검증용', kind: 'worksheet',
    schoolName: '리뷰노트', unitName: '이차함수', grade: 9, questionCount: 2, maxScore: 10, published: true, timeLimitMinutes: null, electives: [] }),
];
const filterFixture = (paperId: string) => FILTER_FIXTURE_PAPERS.find(paper => paper.id === paperId) ?? null;
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
  /** 시험지 고르기 필터 검증용 목 시험지(수능·모평 2장, 학생 공개 내신 2장)를 더한다. */
  filters?: boolean;
  /** 호출 기록(테스트에서 검사). */
  log?: Array<{ method: string; args: unknown[] }>;
  /** 주면 관리자 탭이 선생님 풀이(필기·녹음·채점·제출)를 이 localStorage 키에 올리고, 학생 탭은 고정 🎓 대신
   *  서버와 같은 공개 규칙(mockTeacherShare)으로 거기서 선생님 풀이를 고른다. */
  sharedTeacherKey?: string;
}

export function createMockExamClient(options: MockExamClientOptions = {}): ExamClient {
  const papers = [...(options.worksheet ? WORKSHEET_FIXTURES.map(fixture => fixture.paper) : []), ...MOCK_PAPERS, ...HANNEUNG_META, ...ERA_META, ...(options.admin ? [SCHOOL_META] : []), ...(options.filters ? FILTER_FIXTURE_PAPERS : [])];
  const store = new Map<string, StoredAttempt>();
  const ink = new Map<string, ExamInkDocument[]>();
  const replay = new Map<string, InkReplayBatch[]>();
  const audio = new Map<string, Array<import('../contract').SolutionAudioClip & { startedAt: number }>>();
  const sampleRate = 8000, seconds = 12;
  const wav = new Uint8Array(44 + sampleRate * seconds * 2);
  const view = new DataView(wav.buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, i) => { wav[offset + i] = char.charCodeAt(0); });
  text(0, 'RIFF'); view.setUint32(4, wav.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, wav.length - 44, true);
  const mockAudioUrl = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  let seq = 0;
  // 문항별 채점해 본 시각(attemptId:questionId → ISO). 선생님 풀이 공개 순서를 흉내 내는 데만 쓴다.
  const checkedAt = new Map<string, string>();

  const load = () => {
    if (!options.persistKey) return;
    try {
      const raw = localStorage.getItem(options.persistKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { seq: number; attempts: StoredAttempt[]; ink?: [string, ExamInkDocument[]][]; replay?: [string, InkReplayBatch[]][] };
      seq = parsed.seq;
      for (const entry of parsed.attempts) store.set(entry.attempt.id, entry);
      for (const [id, docs] of parsed.ink ?? []) ink.set(id, decodeInkPayload(docs, 'cache'));
      for (const [id, batches] of parsed.replay ?? []) replay.set(id, decodeInkPayload(batches, 'cache'));
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
  // 관리자 탭: 이 응시의 선생님 풀이를 공유 저장소에 올린다(공개 여부는 학생 쪽 pickSharedTeacher가 판단).
  const shareTeacher = (attemptId: string) => {
    const entry = store.get(attemptId);
    if (!options.admin || !options.sharedTeacherKey || !entry) return;
    const prefix = `${attemptId}:`;
    const byQuestion = <T,>(rows: Iterable<[string, T]>) => Object.fromEntries([...rows]
      .filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]));
    const row: SharedTeacherAttempt = {
      attemptId, paperId: entry.attempt.paperId, mode: entry.attempt.mode, status: entry.attempt.status,
      submittedAt: entry.result?.submittedAt ?? null,
      checkedAt: byQuestion(checkedAt),
      ink: Object.fromEntries((ink.get(attemptId) ?? []).map(doc => [doc.questionId,
        { strokes: doc.strokes, revision: doc.revision, batches: replay.get(`${attemptId}:${doc.questionId}`) ?? [] }])),
      audio: byQuestion([...audio].map(([key, rows]) => [key, rows.map(clip => ({ id: clip.id, startedAt: clip.startedAt,
        durationMs: clip.durationMs, sizeBytes: clip.sizeBytes }))] as [string, SharedTeacherAttempt['audio'][string]])),
    };
    writeSharedTeacher(options.sharedTeacherKey, row);
  };

  const paperTitle = (paperId: string) => papers.find(p => p.id === paperId)?.title ?? PAPER.title;
  const roundFor = (attempt: ExamAttempt) => [...store.values()]
    .filter(entry => entry.attempt.paperId === attempt.paperId)
    .sort((a, b) => a.attempt.startedAt.localeCompare(b.attempt.startedAt) || a.attempt.id.localeCompare(b.attempt.id))
    .findIndex(entry => entry.attempt.id === attempt.id) + 1;

  const grade = (entry: StoredAttempt, items: ExamItemState[]): ExamResult => {
    const { attempt } = entry;
    const byId = new Map(items.map(item => [item.questionId, item]));
    const worksheet = worksheetFixture(attempt.paperId)?.paper;
    const school = attempt.paperId === MOCK_SCHOOL_ID || worksheet != null;
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
      ...(worksheet ?? (school ? SCHOOL_META : {})),
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
      return decodeInkPayload(clone(ink.get(attemptId) ?? []));
    },
    async getPeerSolution(attemptId, questionId) {
      record('getPeerSolution', [attemptId, questionId]);
      await wait();
      const result = must(attemptId).result;
      const item = result?.items.find(row => row.questionId === questionId);
      if (!result || result.kind === 'hanneung' || !item || (item.isCorrect !== false && !item.unsure)) throw new Error('EXAM_PEER_NOT_ALLOWED');
      if (item.number === 3) return null;
      const strokes = mockPeerStrokes();
      return { label: { face: '🐱', character: '하치와레', title: '수학의 신', grade: '고2', isTeacher: false },
        strokes, solutionKey: 'mock-peer-fingerprint' };
    },
    async getPeerSolutionReplay(attemptId, questionId, solutionKey) {
      record('getPeerSolutionReplay', [attemptId, questionId, solutionKey]);
      if (solutionKey !== 'mock-peer-fingerprint') throw new Error('EXAM_PEER_CHANGED');
      const result = must(attemptId).result;
      const item = result?.items.find(row => row.questionId === questionId);
      if (!result || result.kind === 'hanneung' || !item || (item.isCorrect !== false && !item.unsure)) throw new Error('EXAM_PEER_NOT_ALLOWED');
      // Reuse the anonymous fixture without adding another getPeerSolution request to the log.
      const strokes = mockPeerStrokes();
      const events = strokes.map((_, i) => ({ ...inkDelta(strokes.slice(0,i), strokes.slice(0,i+1), 'draw', (i+1)*600), id: `peer-event-${i}` }));
      return { strokes, revision: 1, batches: [{ id: 'peer-batch-1', revision: 1, baseRevision: 0, baseline: [], events }] };
    },
    async listPeerSolutions(attemptId, questionId) {
      record('listPeerSolutions', [attemptId, questionId]);
      await wait();
      const { attempt, result } = must(attemptId);
      const item = result?.items.find(row => row.questionId === questionId) ?? attempt.items.find(row => row.questionId === questionId);
      const correct = item && ('isCorrect' in item ? item.isCorrect : item.checked?.isCorrect);
      const allowed = result ? !!item && (correct === false || item.unsure)
        : attempt.mode === 'free' && !!item && 'checked' in item && !!item.checked && (correct === false || item.unsure);
      if (attempt.kind === 'hanneung' || !allowed) throw new Error('EXAM_PEER_NOT_ALLOWED');
      if (attempt.questions.find(q => q.id === questionId)?.number === 3) return [];
      const students = [
        { solutionKey: 'mock-peer-fingerprint', label: { face: '🐱', title: '수학의 신', grade: '고2', isTeacher: false }, timeSpentMs: 252000 },
        { solutionKey: 'mock-peer-second', label: { face: '🦊', title: '도전자', grade: '고1', isTeacher: false }, timeSpentMs: 15000 },
      ];
      if (options.sharedTeacherKey) {
        const teacher = pickSharedTeacher(readSharedTeacher(options.sharedTeacherKey), attempt.paperId, questionId);
        return teacher ? [...students, { solutionKey: `mock-teacher:${teacher.attemptId}:${teacher.ink[questionId].revision}`,
          label: { face: '🎓', title: null, grade: null, isTeacher: true }, timeSpentMs: 61000,
          hasAudio: (teacher.audio[questionId]?.length ?? 0) > 0 }] : students;
      }
      return [...students,
        { solutionKey: 'mock-peer-teacher', label: { face: '🎓', title: null, grade: null, isTeacher: true }, timeSpentMs: 61000, hasAudio: true },
      ];
    },
    async getPeerSolutionByKey(attemptId, questionId, solutionKey) {
      record('getPeerSolutionByKey', [attemptId, questionId, solutionKey]);
      const { attempt, result } = must(attemptId);
      const item = result?.items.find(row => row.questionId === questionId) ?? attempt.items.find(row => row.questionId === questionId);
      const correct = item && ('isCorrect' in item ? item.isCorrect : item.checked?.isCorrect);
      if (attempt.kind === 'hanneung' || !item || !(result ? correct === false || item.unsure
        : attempt.mode === 'free' && 'checked' in item && item.checked && (correct === false || item.unsure))) throw new Error('EXAM_PEER_NOT_ALLOWED');
      if (options.sharedTeacherKey && solutionKey.startsWith('mock-teacher:')) {
        const teacher = pickSharedTeacher(readSharedTeacher(options.sharedTeacherKey), attempt.paperId, questionId);
        const doc = teacher?.ink[questionId];
        if (!teacher || !doc || solutionKey !== `mock-teacher:${teacher.attemptId}:${doc.revision}`) throw new Error('EXAM_PEER_CHANGED');
        const batches = decodeInkPayload<InkReplayBatch[]>(doc.batches, 'cache');
        const first = Math.min(...batches.flatMap(batch => batch.events.map(event => event.at)));
        const origin = Number.isFinite(first) ? first : 0;
        return { strokes: decodeInkPayload<InkStroke[]>(doc.strokes, 'cache'), revision: doc.revision,
          batches: batches.map(batch => ({ ...batch, events: batch.events.map(event => ({ ...event, at: event.at - origin })) })),
          audioClips: canReadSharedTeacherAudio(teacher, questionId) ? [...(teacher.audio[questionId] ?? [])]
            .sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))
            .map(clip => ({ id: clip.id, offsetMs: clip.startedAt - origin, durationMs: clip.durationMs, mime: 'audio/wav',
              sizeBytes: clip.sizeBytes, storagePath: `mock/${clip.id}.wav`, url: mockAudioUrl })) : [] };
      }
      if (!['mock-peer-fingerprint', 'mock-peer-second', 'mock-peer-teacher'].includes(solutionKey)) throw new Error('EXAM_PEER_CHANGED');
      const strokes = mockPeerStrokes().map(s => ({ ...s, color: solutionKey === 'mock-peer-second' ? '#dc2626' : '#2563eb' }));
      const events = strokes.map((_, i) => ({ ...inkDelta(strokes.slice(0, i), strokes.slice(0, i + 1), 'draw', (i + 1) * 600), id: `peer-event-${i}` }));
      return { strokes, revision: 1, batches: [{ id: 'peer-batch-1', revision: 1, baseRevision: 0, baseline: [], events }],
        ...(solutionKey === 'mock-peer-teacher' ? { audioClips: [
          { id: 'teacher-audio-1', offsetMs: -500, durationMs: 5500, mime: 'audio/wav', sizeBytes: wav.length, storagePath: 'mock/teacher1.wav', url: mockAudioUrl },
          { id: 'teacher-audio-2', offsetMs: 6000, durationMs: 4000, mime: 'audio/wav', sizeBytes: wav.length, storagePath: 'mock/teacher2.wav', url: mockAudioUrl },
        ] } : {}) };
    },
    async uploadSolutionAudio(clip, blob) {
      record('uploadSolutionAudio', [clip, blob.size]);
      if (!options.admin) throw new Error('EXAM_ADMIN_REQUIRED');
      await wait();
      const key = `${clip.attemptId}:${clip.questionId}`;
      const rows = audio.get(key) ?? [];
      if (!rows.some(row => row.id === clip.id)) rows.push({ id: clip.id, offsetMs: 0, startedAt: clip.startedAt,
        durationMs: clip.durationMs, mime: 'audio/wav', sizeBytes: blob.size, storagePath: `mock/${clip.id}.wav`, url: mockAudioUrl });
      audio.set(key, rows);
      shareTeacher(clip.attemptId);
    },
    async listSolutionAudio(attemptId, questionId) {
      record('listSolutionAudio', [attemptId, questionId]);
      if (!options.admin) throw new Error('EXAM_ADMIN_REQUIRED');
      await wait();
      return (audio.get(`${attemptId}:${questionId}`) ?? []).map(row => ({ id: row.id, startedAt: row.startedAt,
        durationMs: row.durationMs, mime: row.mime, sizeBytes: row.sizeBytes, storagePath: row.storagePath }))
        .sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
    },
    async deleteSolutionAudio(clipId) {
      record('deleteSolutionAudio', [clipId]);
      if (!options.admin) throw new Error('EXAM_ADMIN_REQUIRED');
      await wait();
      for (const [key, rows] of audio) {
        if (!rows.some(row => row.id === clipId)) continue;
        audio.set(key, rows.filter(row => row.id !== clipId));
        shareTeacher(key.slice(0, key.lastIndexOf(':')));
      }
    },
    // reset_exam_question_solution 흉내: 녹음·재생 기록을 지우고 필기는 빈 채로 revision만 올린다.
    async resetQuestionSolution(attemptId, questionId) {
      record('resetQuestionSolution', [attemptId, questionId]);
      if (!options.admin) throw new Error('EXAM_ATTEMPT_NOT_FOUND');
      must(attemptId);
      await wait();
      const key = `${attemptId}:${questionId}`;
      audio.delete(key);
      replay.delete(key);
      const docs = ink.get(attemptId) ?? [];
      const old = docs.find(row => row.questionId === questionId);
      if (old) ink.set(attemptId, [...docs.filter(row => row.questionId !== questionId), { questionId, strokes: [], revision: old.revision + 1, lastBatchId: null }]);
      persist();
      shareTeacher(attemptId);
      return { revision: old ? old.revision + 1 : 0 };
    },
    async getAttemptForRevision(attemptId) {
      record('getAttemptForRevision', [attemptId]);
      if (!options.admin) throw new Error('EXAM_ADMIN_REQUIRED');
      await wait();
      return clone(must(attemptId).attempt);
    },
    async getInkReplay(attemptId, questionId) {
      must(attemptId);
      const doc = ink.get(attemptId)?.find(row => row.questionId === questionId);
      const batches = replay.get(`${attemptId}:${questionId}`) ?? [];
      const origin = Math.min(...batches.flatMap(batch => batch.events.map(event => event.at)));
      return clone({ batches, strokes: doc?.strokes ?? [], revision: doc?.revision ?? 0,
        audioOriginMs: Number.isFinite(origin) ? origin : 0,
        audioClips: (audio.get(`${attemptId}:${questionId}`) ?? []).map(row => ({ ...row, offsetMs: row.startedAt - (Number.isFinite(origin) ? origin : row.startedAt) })) });
    },
    // save_exam_ink_delta 흉내: 이벤트를 서버 쪽 필기에 적용하고 결과 획 id 해시를 대조한다.
    async saveInk(attemptId, questionId, request) {
      const { revision, legacyImport, events, batchId, idsHash } = request;
      const entry = must(attemptId);
      const packedEvents = encodeInkEvents(events);
      if (options.inkStats) { options.inkStats.requests++; options.inkStats.bytes += new TextEncoder().encode(JSON.stringify({ ...request, events: packedEvents })).length; }
      if (options.failSave) throw new Error('offline');
      const docs = ink.get(attemptId) ?? [];
      const old = docs.find(row => row.questionId === questionId);
      const key = `${attemptId}:${questionId}`;
      const batches = replay.get(key) ?? [];
      const duplicate = batches.find(batch => batch.id === batchId);
      if (duplicate) {
        if (duplicate.baseRevision !== revision || JSON.stringify(encodeInkEvents(duplicate.events)) !== JSON.stringify(packedEvents)) throw new Error('EXAM_REPLAY_BATCH_MISMATCH');
        return duplicate.revision;
      }
      if ((old?.revision ?? 0) !== revision) throw new Error('EXAM_INK_CONFLICT');
      // 관리자 본인 응시는 제출한 뒤에도 풀이(필기)를 고칠 수 있다.
      if (entry.attempt.status === 'submitted' && !options.admin && !(legacyImport && !old)) throw new Error('EXAM_INK_SUBMITTED');
      if (!events.length) throw new Error('EXAM_REPLAY_TOO_LARGE');
      const decodedEvents = decodeInkPayload<typeof events>(packedEvents);
      const strokes = decodedEvents.reduce(applyInkEvent, old?.strokes ?? []);
      if (await inkIdsHash(strokes) !== idsHash) throw new Error('EXAM_REPLAY_FINAL_MISMATCH');
      replay.set(key, [...batches, { id: batchId, revision: revision + 1, baseRevision: revision,
        baseline: batches.at(-1)?.revision === revision ? null : clone(old?.strokes ?? []), events: clone(decodedEvents) }]);
      const next = { questionId, strokes: clone(strokes), revision: revision + 1, lastBatchId: batchId };
      ink.set(attemptId, [...docs.filter(row => row.questionId !== questionId), next]);
      persist();
      shareTeacher(attemptId);
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
          ...(filterFixture(meta.id) ? { timeLimitMinutes: filterFixture(meta.id)!.timeLimitMinutes, electives: filterFixture(meta.id)!.electives } : {
          timeLimitMinutes: worksheetFixture(meta.id) ? null : HANNEUNG_META.find(paper => paper.id === meta.id)?.timeLimitMinutes ?? (meta.id === MOCK_SCHOOL_ID ? 50 : PAPER.timeLimitMinutes),
          electives: worksheetFixture(meta.id) || meta.id === MOCK_SCHOOL_ID || [...HANNEUNG_META, ...ERA_META].some(paper => paper.id === meta.id) ? [] : [...ELECTIVES],
          }),
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
      const worksheet = worksheetFixture(paperId);
      if (worksheet && mode !== 'free') throw new Error('EXAM_INVALID_MODE');
      const school = paperId === MOCK_SCHOOL_ID;
      const historyMeta = [...HANNEUNG_META, ...ERA_META].find(paper => paper.id === paperId);
      const eraSet = eraSets.find(set => set.id === paperId);
      if (eraSet && mode !== 'free') throw new Error('EXAM_INVALID_MODE');
      const historyPaper = HANNEUNG.find(paper => paper.id === paperId);
      seq += 1;
      const attempt: ExamAttempt = {
        ...(worksheet ? { ...worksheet.paper, paperTitle: worksheet.paper.title } : school ? { ...SCHOOL_META, paperTitle: SCHOOL_META.title } : {}),
        ...historyMeta,
        id: `attempt-${seq}`,
        paperId,
        mode,
        elective: worksheet || school || historyMeta ? null : elective,
        startedAt: new Date().toISOString(),
        timeLimitMinutes: mode === 'real' ? options.timeLimitMinutes ?? historyMeta?.timeLimitMinutes ?? (school ? 50 : PAPER.timeLimitMinutes) : null,
        status: 'in_progress',
        questions: worksheet ? clone(worksheet.questions) : eraSet ? eraSet.members.map((member, i) => ({
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
      checkedAt.set(`${attemptId}:${questionId}`, new Date().toISOString());
      persist();
      shareTeacher(attemptId);
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
      shareTeacher(attemptId);
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
          return { ...(r.kind === 'worksheet' ? worksheetFixture(r.paperId ?? '')?.paper : r.kind === 'school' ? SCHOOL_META : {}), kind: r.kind, practiceEra: r.practiceEra, questionCount: r.questionCount, hanneungLevel: r.hanneungLevel, attemptId: r.attemptId, paperTitle: r.paperTitle, mode: r.mode, elective: r.elective, score: r.score, estimatedGrade: r.estimatedGrade, submittedAt: r.submittedAt };
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
  let count = 2, listCalls = 0, examCalls = 0, inkCalls = 0;
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
  let orderCalls = 0, orderDelay = 0, orderFailure = false;
  const completedCounts = [10, 30, 20];
  const api: Pick<AdminExamApi, 'listLivePapers' | 'getLiveExam' | 'getLiveStudentOrder' | 'getLiveInk'> = {
    // 서버처럼 최근 10분 안에 필기한 학생만 센다(브라우저 테스트가 모의 시간으로 만료를 확인).
    listLivePapers: async () => {
      listCalls++;
      const live = Array.from({ length: count }, (_, index) => docs.get(id(index))!).filter(doc => Date.now() - Date.parse(doc.updatedAt) < 10 * 60_000).length;
      return live ? [{ paperId: MOCK_PAPER_ID, liveCount: live }] : [];
    },
    getLiveExam: async paperId => {
      examCalls++;
      if (paperId !== MOCK_PAPER_ID) return [];
      // 실제 RPC처럼 최근 활동순으로 반환하고, 10분 활동이 없는 학생은 제외한다.
      return Array.from({ length: count }, (_, index): AdminLiveStudent => {
        const doc = docs.get(id(index))!;
        return { attemptId: id(index), studentId: `live-student-${index}`, studentName: ['김학생', '이학생', '박학생'][index],
          questionId: questions[0].id, number: 1, imageUrl: questions[0].imageUrl, revision: doc.revision, updatedAt: doc.updatedAt, answeredCount: 0 };
      }).filter(row => Date.now() - Date.parse(row.updatedAt) <= 10 * 60_000)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.attemptId.localeCompare(b.attemptId)).slice(0, 12);
    },
    getLiveStudentOrder: async studentIds => {
      orderCalls++;
      if (orderDelay) await new Promise(resolve => setTimeout(resolve, orderDelay));
      if (orderFailure) throw new Error('MOCK_ORDER_FAILED');
      return studentIds.map(studentId => ({ studentId, completedCount: completedCounts[Number(studentId.split('-').at(-1))] ?? 0 }));
    },
    getLiveInk: async (attemptId, _questionId, since): Promise<LiveInkResponse> => {
      inkCalls++;
      const doc = docs.get(attemptId)!;
      if (since === null || doc.revision - since > 24 || since > doc.revision) return { mode: 'full', revision: doc.revision, strokes: doc.strokes };
      return { mode: 'delta', revision: doc.revision, batches: doc.batches.filter(batch => batch.revision > since) };
    },
  };
  return { api, questions, orderCalls: () => orderCalls,
    setCompletedCount: (index: number, n: number) => { completedCounts[index] = n; },
    setOrderDelay: (ms: number) => { orderDelay = ms; }, setOrderFailure: (fail: boolean) => { orderFailure = fail; },
    listCalls: () => listCalls, examCalls: () => examCalls, inkCalls: () => inkCalls,
    setCount: (n: number) => { count = Math.max(0, Math.min(3, n)); },
    draw: (index: number) => update(index), erase: (index: number) => update(index, true) };
}
