import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ExamClientError,
  alignToClientClock,
  estimateExamGrade,
  examErrorMessage,
  examRemainingMs,
  isExamAnswerCorrect,
  mapAddedMistakes,
  mapCheckedAnswer,
  mapExamAttempt,
  mapExamPaper,
  mapExamResult,
  mapExamResultSummary,
  normalizeExamAnswer,
  sanitizeExamAnswer,
  toExamItemsPayload,
  toMistakeOrigin,
  toVisitOrderPayload,
} from '../../src/features/exam/examMappers.ts';

test('answers are normalized like the server (spaces, circled digits, leading zeros)', () => {
  assert.equal(normalizeExamAnswer(' 4 '), '4');
  assert.equal(normalizeExamAnswer('④'), '4');
  assert.equal(normalizeExamAnswer('007'), '7');
  assert.equal(normalizeExamAnswer('000'), '0');
  assert.equal(normalizeExamAnswer(231), '231');
  assert.equal(normalizeExamAnswer(''), null);
  assert.equal(normalizeExamAnswer('   '), null);
  assert.equal(normalizeExamAnswer(null), null);
  assert.equal(normalizeExamAnswer(undefined), null);
});

test('only storable answers survive sanitizing', () => {
  assert.equal(sanitizeExamAnswer('3', true), '3');
  assert.equal(sanitizeExamAnswer('6', true), null);
  assert.equal(sanitizeExamAnswer('0', true), null);
  assert.equal(sanitizeExamAnswer('012', false), '12');
  assert.equal(sanitizeExamAnswer('999', false), '999');
  assert.equal(sanitizeExamAnswer('1000', false), null);
  assert.equal(sanitizeExamAnswer('-1', false), null);
  assert.equal(sanitizeExamAnswer('1.5', false), null);
});

test('grading compares normalized strings and treats blanks as wrong', () => {
  assert.equal(isExamAnswerCorrect('023', '23'), true);
  assert.equal(isExamAnswerCorrect('②', '2'), true);
  assert.equal(isExamAnswerCorrect('3', '2'), false);
  assert.equal(isExamAnswerCorrect(null, '0'), false);
  assert.equal(isExamAnswerCorrect('0', '0'), true);
});

test('estimated grade uses the elective raw-score cuts (score >= cut → that grade)', () => {
  const cuts = [87, 77, 64, 54, 35, 22, 15, 10]; // 2025-06 확률과 통계
  assert.equal(estimateExamGrade(cuts, 100), 1);
  assert.equal(estimateExamGrade(cuts, 87), 1);
  assert.equal(estimateExamGrade(cuts, 86), 2);
  assert.equal(estimateExamGrade(cuts, 64), 3);
  assert.equal(estimateExamGrade(cuts, 10), 8);
  assert.equal(estimateExamGrade(cuts, 9), 9);
  assert.equal(estimateExamGrade(cuts, 0), 9);
  assert.equal(estimateExamGrade([], 50), 0);
});

test('startedAt is shifted into the device clock so remaining time follows the server', () => {
  const server = '2026-10-02T10:00:00.000Z';
  const started = '2026-10-02T09:30:00.000Z';
  const deviceAhead = Date.parse(server) + 5 * 60_000; // device clock 5 min fast
  const aligned = alignToClientClock(started, server, deviceAhead);
  assert.equal(aligned, '2026-10-02T09:35:00.000Z');
  // 30분 경과, 100분 제한 → 기기 시계와 상관없이 70분 남음
  assert.equal(examRemainingMs({ startedAt: aligned, timeLimitMinutes: 100 }, deviceAhead), 70 * 60_000);
  assert.equal(examRemainingMs({ startedAt: aligned, timeLimitMinutes: null }, deviceAhead), null);
  assert.equal(examRemainingMs({ startedAt: started, timeLimitMinutes: 10 }, deviceAhead), 0);
  assert.equal(alignToClientClock(started, null, deviceAhead), started);
});

test('attempt payload maps to the contract shape', () => {
  const now = Date.parse('2026-10-02T10:00:00.000Z');
  const attempt = mapExamAttempt({
    id: 'a1',
    paperId: '2025-06-math',
    mode: 'real',
    elective: '기하',
    startedAt: '2026-10-02T09:00:00+00:00',
    timeLimitMinutes: 100,
    status: 'in_progress',
    serverNow: '2026-10-02T10:00:00+00:00',
    visitOrder: [1, 2, 0, 31, 2],
    questions: [
      { id: 'q2', number: 2, section: 'common', imageUrl: '/exams/2025-06-math/c-02.png', isChoice: true, points: 2 },
      { id: 'q1', number: 1, section: 'common', imageUrl: '/exams/2025-06-math/c-01.png', isChoice: true, points: 2 },
      { id: 'q23', number: 23, section: '기하', imageUrl: '/exams/2025-06-math/geom-23.png', isChoice: true, points: 2 },
    ],
    items: [
      { questionId: 'q1', answer: '4', unsure: true, timeSpentMs: 1200, visits: 2, checked: { isCorrect: true, correctAnswer: '4' } },
      { questionId: 'q2', answer: null, unsure: false, timeSpentMs: 0, visits: 0, checked: null },
    ],
  }, now);
  assert.equal(attempt.startedAt, '2026-10-02T09:00:00.000Z');
  assert.equal(attempt.mode, 'real');
  assert.equal(attempt.elective, '기하');
  assert.deepEqual(attempt.questions.map((q) => q.number), [1, 2, 23]);
  assert.equal(attempt.questions[2].section, '기하');
  assert.deepEqual(attempt.visitOrder, [1, 2, 2]);
  assert.deepEqual(attempt.items[0], { questionId: 'q1', answer: '4', unsure: true, timeSpentMs: 1200, visits: 2, checked: { isCorrect: true, correctAnswer: '4' } });
  assert.equal(attempt.items[1].answer, null);
  assert.equal(attempt.items[1].checked, null);
  assert.equal(mapExamAttempt({ mode: 'free', timeLimitMinutes: null, startedAt: '2026-10-02T09:00:00Z' }, now).timeLimitMinutes, null);
});

test('result payload maps national stats, cuts and falls back to a computed grade', () => {
  const result = mapExamResult({
    attemptId: 'a1',
    paperTitle: '2025학년도 6월 모의평가 수학',
    mode: 'free',
    elective: '미적분',
    score: 71,
    correctCount: 22,
    totalCount: 30,
    totalTimeMs: 3_600_000,
    estimatedGrade: null,
    gradeCut: { rawByGrade: [80, 70, 59, 49, 32, 19, 12, 8], standardByGrade: [135, 126], percentileByGrade: [96, 89], topStandard: 152, topPercentile: '100', source: '종로학원' },
    submittedAt: '2026-10-02T10:00:00+00:00',
    items: [
      { questionId: 'q30', number: 30, section: '미적분', imageUrl: '/x.png', isChoice: false, points: 4, answer: null, correctAnswer: '25', isCorrect: false, unsure: false, timeSpentMs: 0, nationalWrongRate: 94.8, nationalChoiceRates: null, addedMistakeId: null },
      { questionId: 'q27', number: 27, section: '미적분', imageUrl: '/y.png', isChoice: true, points: 3, answer: '2', correctAnswer: '2', isCorrect: true, unsure: true, timeSpentMs: 90_000, nationalWrongRate: '65.1', nationalChoiceRates: [11.3, 34.9, 7.2, 28.6, 18.0], addedMistakeId: 'm1' },
    ],
  });
  assert.equal(result.estimatedGrade, 2);
  assert.deepEqual(result.items.map((i) => i.number), [27, 30]);
  assert.equal(result.items[0].nationalWrongRate, 65.1);
  assert.deepEqual(result.items[0].nationalChoiceRates, [11.3, 34.9, 7.2, 28.6, 18.0]);
  assert.equal(result.items[0].addedMistakeId, 'm1');
  assert.equal(result.items[1].nationalChoiceRates, null);
  assert.equal(result.items[1].answer, null);
  assert.equal(result.gradeCut.source, '종로학원');
  assert.equal(result.gradeCut.topStandard, 152);
  assert.equal(result.gradeCut.topPercentile, 100);
  const bare = mapExamResult({ estimatedGrade: 4, score: 10, gradeCut: { rawByGrade: [80], topStandard: null } });
  assert.equal(bare.estimatedGrade, 4);
  assert.equal(bare.gradeCut.topStandard, null);
  assert.equal(bare.gradeCut.topPercentile, null);
});

test('papers, summaries and added mistakes map from rows', () => {
  const bare = { id: '2025-06-math', title: 't', examDate: '2024-06-04', source: 's', timeLimitMinutes: 100, electives: ['확률과 통계', '미적분', '기하', '물리'] };
  assert.deepEqual(mapExamPaper({ ...bare, inProgress: null, lastResult: null, resultCount: 0 }), {
    id: '2025-06-math', title: 't', examDate: '2024-06-04', source: 's', timeLimitMinutes: 100, electives: ['확률과 통계', '미적분', '기하'],
    inProgress: null, lastResult: null, resultCount: 0,
  });
  const withProgress = mapExamPaper({
    ...bare,
    inProgress: { attemptId: 'a2', mode: 'free', elective: '기하', startedAt: '2026-10-02T09:00:00+00:00', timeLimitMinutes: null, answeredCount: 7, elapsedMs: '61000' },
    lastResult: { attemptId: 'a1', score: 84, estimatedGrade: null, submittedAt: '2026-10-01T10:00:00+00:00' },
    resultCount: 3,
  });
  assert.deepEqual(withProgress.inProgress, { attemptId: 'a2', mode: 'free', elective: '기하', startedAt: '2026-10-02T09:00:00+00:00', timeLimitMinutes: null, answeredCount: 7, elapsedMs: 61000 });
  assert.deepEqual(withProgress.lastResult, { attemptId: 'a1', score: 84, estimatedGrade: null, submittedAt: '2026-10-01T10:00:00+00:00' });
  assert.equal(withProgress.resultCount, 3);
  assert.equal(mapExamPaper({ ...bare, inProgress: { mode: 'real', timeLimitMinutes: 100 }, lastResult: 'x' }).inProgress, null);
  assert.equal(mapExamPaper(bare).resultCount, 0);
  assert.deepEqual(mapExamResultSummary({ attemptId: 'a', paperTitle: 't', mode: 'real', elective: '기하', score: 88, estimatedGrade: 1, submittedAt: 'z', extra: 1 }), {
    attemptId: 'a', paperTitle: 't', mode: 'real', elective: '기하', score: 88, estimatedGrade: 1, submittedAt: 'z',
  });
  assert.deepEqual(mapAddedMistakes([{ questionId: 'q1', mistakeId: 'm1', created: true }, { questionId: 'q2' }, null]), [{ questionId: 'q1', mistakeId: 'm1' }]);
  assert.deepEqual(mapAddedMistakes(null), []);
});

test('checked answers map from check_exam_answer and attempt items', () => {
  assert.deepEqual(mapCheckedAnswer({ isCorrect: true, correctAnswer: '108' }), { isCorrect: true, correctAnswer: '108' });
  assert.deepEqual(mapCheckedAnswer({ isCorrect: 'yes', correctAnswer: 4 }), { isCorrect: false, correctAnswer: '4' });
  assert.equal(mapCheckedAnswer(null), null);
  assert.equal(mapCheckedAnswer({ isCorrect: true }), null);
  assert.equal(examErrorMessage({ message: 'EXAM_INVALID_ANSWER' }), '채점할 답을 먼저 입력해 주세요.');
});

test('payloads sent to the server are cleaned up', () => {
  assert.deepEqual(toExamItemsPayload([{ questionId: 'q', answer: ' 07 ', unsure: true, timeSpentMs: 1234.6, visits: -2 }]), [
    { questionId: 'q', answer: '7', unsure: true, timeSpentMs: 1235, visits: 0 },
  ]);
  assert.deepEqual(toExamItemsPayload([{ questionId: 'q', answer: null, unsure: false, timeSpentMs: Number.NaN, visits: 1 }])[0].timeSpentMs, 0);
  // checked는 서버가 정하는 값이라 보내지 않는다.
  assert.equal('checked' in toExamItemsPayload([{ questionId: 'q', answer: '1', unsure: false, timeSpentMs: 0, visits: 0, checked: { isCorrect: true, correctAnswer: '1' } }])[0], false);
  assert.deepEqual(toVisitOrderPayload([1, 0, 30, 31, 2.5, 3]), [1, 30, 3]);
  assert.equal(toMistakeOrigin('https://reviewnote.app/'), 'https://reviewnote.app');
  assert.equal(toMistakeOrigin('http://127.0.0.1:5174'), 'http://127.0.0.1:5174');
});

test('server error tokens become short Korean messages', () => {
  assert.equal(examErrorMessage({ message: 'EXAM_REAL_MODE_LOCKED' }), '실전 모드에서는 제출 전에 정답을 볼 수 없어요.');
  assert.equal(examErrorMessage('EXAM_NOT_SUBMITTED'), '아직 제출하지 않은 시험이에요.');
  assert.match(examErrorMessage(new TypeError('Failed to fetch')), /인터넷/);
  assert.match(examErrorMessage({ message: 'duplicate key value' }), /잠시 문제가/);
  assert.match(examErrorMessage(undefined), /잠시 문제가/);
  const err = new ExamClientError({ message: 'EXAM_ATTEMPT_NOT_FOUND' });
  assert.equal(err.code, 'EXAM_ATTEMPT_NOT_FOUND');
  assert.equal(err.message, '풀이 기록을 찾지 못했어요.');
  assert.ok(err instanceof Error);
});
