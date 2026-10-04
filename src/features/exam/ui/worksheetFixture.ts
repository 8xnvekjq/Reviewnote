// Synthetic browser fixture only. Real worksheet answers/solutions stay outside src/public.
import type { ExamPaperSummary, ExamQuestion } from '../contract';

export const WORKSHEET_FIXTURE: ExamPaperSummary = {
  id: 'mock-worksheet', title: '영파여고 미적분Ⅰ 학력평가 기출 — 미분계수와 도함수',
  kind: 'worksheet', schoolName: '영파여고', unitName: '미분계수와 도함수', grade: 2,
  questionCount: 2, maxScore: 7, published: true, examDate: '', source: '브라우저 검증용',
  timeLimitMinutes: null, electives: [], inProgress: null, lastResult: null, resultCount: 0,
};
export const WORKSHEET_FIXTURE_QUESTIONS: ExamQuestion[] = [
  { id: 'worksheet-1', number: 1, section: 'common', imageUrl: '/exams/youngpa-worksheet-derivatives/q-01.png',
    isChoice: true, answerType: 'choice5', points: 3, sourceLabel: '2017년 9월 고2 가06' },
  { id: 'worksheet-2', number: 2, section: 'common', imageUrl: '/exams/youngpa-worksheet-derivatives/q-14.png',
    isChoice: false, answerType: 'digits', points: 4, sourceLabel: '2025년 10월 고2 29' },
];

/** 중3 삼각비 학습지 개편판 1차·2차(삼각비 표 참고 버튼) 브라우저 검증용. 문항 이미지는 실제 것을 쓰고 정답은 합성 값.
 * 기존 18문항판(2026-g3m-trig-creative)은 개편판 공개 때 비공개로 내려가므로 목록 픽스처에 두지 않는다. */
const trigPaper = (id: string, title: string): ExamPaperSummary => ({
  id, title,
  kind: 'worksheet', schoolName: '리뷰노트', unitName: '삼각비의 활용', grade: 9,
  questionCount: 2, maxScore: 10, published: true, examDate: '', source: '브라우저 검증용',
  timeLimitMinutes: null, electives: [], inProgress: null, lastResult: null, resultCount: 0,
});
const trigQuestion = (id: string, number: number, imageUrl: string, sourceLabel: string): ExamQuestion => ({
  id, number, section: 'common', imageUrl, isChoice: false, answerType: 'digits', points: 5, sourceLabel,
});
export const TRIG_WORKSHEET_FIXTURE = trigPaper('2026-g3m-trig-creative-1', '중3-2 삼각비 창의융합 형성평가 대비 (1차)');
export const TRIG_WORKSHEET_FIXTURE_QUESTIONS: ExamQuestion[] = [
  trigQuestion('worksheet-trig-1', 1, '/exams/2026-g3m-trig-creative-1/q-01.png', '리뷰노트 변형 문항 · 유형 A-①'),
  trigQuestion('worksheet-trig-2', 2, '/exams/2026-g3m-trig-creative-1/q-09.png', '리뷰노트 변형 문항 · 유형 E-①'),
];
export const TRIG_WORKSHEET_2_FIXTURE = trigPaper('2026-g3m-trig-creative-2', '중3-2 삼각비 창의융합 형성평가 대비 (2차)');
export const TRIG_WORKSHEET_2_FIXTURE_QUESTIONS: ExamQuestion[] = [
  trigQuestion('worksheet-trig2-1', 1, '/exams/2026-g3m-trig-creative-2/q-01.png', '리뷰노트 변형 문항 · 2차 유형 A'),
  trigQuestion('worksheet-trig2-2', 2, '/exams/2026-g3m-trig-creative-2/q-05.png', '리뷰노트 변형 문항 · 2차 유형 E'),
];

export const WORKSHEET_FIXTURES = [
  { paper: WORKSHEET_FIXTURE, questions: WORKSHEET_FIXTURE_QUESTIONS },
  { paper: TRIG_WORKSHEET_FIXTURE, questions: TRIG_WORKSHEET_FIXTURE_QUESTIONS },
  { paper: TRIG_WORKSHEET_2_FIXTURE, questions: TRIG_WORKSHEET_2_FIXTURE_QUESTIONS },
];
