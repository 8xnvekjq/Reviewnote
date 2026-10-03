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

/** 중3 학습지(삼각비 표 참고 링크) 브라우저 검증용. 문항 이미지는 실제 것을 쓰고 정답은 합성 값. */
export const TRIG_WORKSHEET_FIXTURE: ExamPaperSummary = {
  id: '2026-g3m-trig-creative', title: '중3-2 삼각비 창의융합 형성평가 대비',
  kind: 'worksheet', schoolName: '리뷰노트', unitName: '삼각비의 활용', grade: 9,
  questionCount: 2, maxScore: 10, published: true, examDate: '', source: '브라우저 검증용',
  timeLimitMinutes: null, electives: [], inProgress: null, lastResult: null, resultCount: 0,
};
export const TRIG_WORKSHEET_FIXTURE_QUESTIONS: ExamQuestion[] = [
  { id: 'worksheet-trig-1', number: 1, section: 'common', imageUrl: '/exams/2026-g3m-trig-creative/q-01.png',
    isChoice: false, answerType: 'digits', points: 5, sourceLabel: '리뷰노트 변형 문항 · 유형 A-①' },
  { id: 'worksheet-trig-2', number: 2, section: 'common', imageUrl: '/exams/2026-g3m-trig-creative/q-13.png',
    isChoice: false, answerType: 'digits', points: 5, sourceLabel: '리뷰노트 변형 문항 · 유형 E-①' },
];

export const WORKSHEET_FIXTURES = [
  { paper: WORKSHEET_FIXTURE, questions: WORKSHEET_FIXTURE_QUESTIONS },
  { paper: TRIG_WORKSHEET_FIXTURE, questions: TRIG_WORKSHEET_FIXTURE_QUESTIONS },
];
