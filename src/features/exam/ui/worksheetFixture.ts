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
