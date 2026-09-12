import test from 'node:test';
import assert from 'node:assert/strict';
import { canViewOwnExamPrep } from '../../src/utils/examPrepAccess.ts';
import { computeExamPrepReport } from '../../src/utils/examPrepAnalysis.ts';
import { aggregatePlanPatterns } from '../../src/utils/planPatternAnalysis.ts';
import { daysSince } from '../../src/utils/examPrepCommentFormat.ts';
import { buildExamPrepStudentList } from '../../src/utils/examPrepStudentList.ts';
import type { MistakeEntry } from '../../src/types/index.ts';

const GRADE = '공통수학2';
const CHAPTERS = ['평면좌표', '직선의 방정식', '원의 방정식', '도형의 이동', '집합', '명제', '함수', '유리함수', '무리함수'];

function mistake(overrides: Partial<MistakeEntry> & { id: string }): MistakeEntry {
  return {
    id: overrides.id, userId: 'u1', title: overrides.title || overrides.id, imageUrl: '', date: '2026-09-01T00:00:00.000Z',
    grade: GRADE, chapter: '원의 방정식', reviews: [], rootCauses: [], userActionPlan: '', isHidden: false,
    ...overrides,
  };
}

test('canViewOwnExamPrep opens to any logged-in user, not an allowlist', () => {
  assert.equal(canViewOwnExamPrep('any-random-uuid-not-on-any-list'), true);
  assert.equal(canViewOwnExamPrep('u1'), true);
  assert.equal(canViewOwnExamPrep(undefined), false);
  assert.equal(canViewOwnExamPrep(''), false);
});

test('computeExamPrepReport: N=0 is a real (non-null) report with an empty-state shape', () => {
  const report = computeExamPrepReport([], 'u1', '학생', GRADE, CHAPTERS[0], CHAPTERS[CHAPTERS.length - 1], new Set());
  assert.ok(report);
  assert.equal(report!.N, 0);
});

test('computeExamPrepReport: sampleWarning is tiered — N<=2 gets the "패턴 판단 어려움" message, not the generic one', () => {
  const oneMistake = [mistake({ id: 'm1' })];
  const report1 = computeExamPrepReport(oneMistake, 'u1', '학생', GRADE, CHAPTERS[0], CHAPTERS[CHAPTERS.length - 1], new Set());
  assert.equal(report1!.sampleWarning, '아직 반복되는 패턴을 판단하기에는 기록이 적어요.');

  const fiveMistakes = Array.from({ length: 5 }, (_, i) => mistake({ id: `m${i}` }));
  const report5 = computeExamPrepReport(fiveMistakes, 'u1', '학생', GRADE, CHAPTERS[0], CHAPTERS[CHAPTERS.length - 1], new Set());
  assert.match(report5!.sampleWarning!, /참고용으로만 활용/);

  const eightMistakes = Array.from({ length: 8 }, (_, i) => mistake({ id: `m${i}` }));
  const report8 = computeExamPrepReport(eightMistakes, 'u1', '학생', GRADE, CHAPTERS[0], CHAPTERS[CHAPTERS.length - 1], new Set());
  assert.equal(report8!.sampleWarning, null);
});

test('computeExamPrepReport: a thin sample (N<3) does not claim "안정적" from zero retries', () => {
  const twoMistakes = [mistake({ id: 'm1', reviews: [] }), mistake({ id: 'm2', reviews: [] })];
  const report = computeExamPrepReport(twoMistakes, 'u1', '학생', GRADE, CHAPTERS[0], CHAPTERS[CHAPTERS.length - 1], new Set());
  assert.equal(report!.review.retry, 0);
  assert.ok(!report!.stableItems.some(s => s.includes('재도전(X)이 필요했던 문제가 시험범위 내에 없음')));
});

test('computeExamPrepReport: N>=3 with zero retries is allowed to claim stability', () => {
  const threeMistakes = ['m1', 'm2', 'm3'].map(id => mistake({ id, chapter: CHAPTERS[(Number(id.slice(1)) - 1) % CHAPTERS.length], reviews: [] }));
  const report = computeExamPrepReport(threeMistakes, 'u1', '학생', GRADE, CHAPTERS[0], CHAPTERS[CHAPTERS.length - 1], new Set());
  assert.equal(report!.review.retry, 0);
  assert.ok(report!.stableItems.some(s => s.includes('재도전(X)이 필요했던 문제가 시험범위 내에 없음')));
});

test('computeExamPrepReport: priorities carry both an admin suggestion and a student-first-person variant', () => {
  // rootCauses repeated (>=2) so a weakItem/priority actually gets generated.
  const mistakes = [
    mistake({ id: 'm1', rootCauses: ['calc'] }),
    mistake({ id: 'm2', rootCauses: ['calc'] }),
    mistake({ id: 'm3', rootCauses: ['calc'] }),
  ];
  const report = computeExamPrepReport(mistakes, 'u1', '학생', GRADE, CHAPTERS[0], CHAPTERS[CHAPTERS.length - 1], new Set());
  assert.ok(report!.priorities.length > 0);
  const p = report!.priorities[0];
  assert.match(p.suggestion, /다시 풀리며/); // admin/teacher-directed phrasing preserved
  assert.match(p.studentSuggestion, /다시 풀어보며/); // student self-directed phrasing
  assert.notEqual(p.suggestion, p.studentSuggestion);
});

test('aggregatePlanPatterns: low alignment produces a teacher variant with "다음 상담" and a student variant without it', () => {
  // 3+ evaluable plans, alignRate < 0.35: category never matches its own root cause.
  const plans = [
    { text: '조건을 다시 확인하겠다', rootCauses: ['calc'] },
    { text: '조건을 다시 확인하겠다', rootCauses: ['calc'] },
    { text: '조건을 다시 확인하겠다', rootCauses: ['calc'] },
    { text: '조건을 다시 확인하겠다', rootCauses: ['calc'] },
  ];
  const result = aggregatePlanPatterns(plans);
  const teacherLine = result.interpretation.find(l => l.includes('다른 방향을 향하는'));
  const studentLine = result.interpretationForStudent.find(l => l.includes('다른 방향을 향할'));
  assert.ok(teacherLine, 'expected a teacher-facing low-alignment line');
  assert.match(teacherLine!, /다음 상담에서/);
  assert.ok(studentLine, 'expected a student-facing low-alignment line');
  assert.doesNotMatch(studentLine!, /다음 상담/);
  assert.match(studentLine!, /내가/);
});

test('daysSince: same calendar day is D+0, a day earlier is D+1', () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 0, 0).toISOString();
  assert.equal(daysSince(today), 0);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0).toISOString();
  assert.equal(daysSince(yesterday), 1);
  const thirteenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13, 12, 0, 0).toISOString();
  assert.equal(daysSince(thirteenDaysAgo), 13);
});

test('buildExamPrepStudentList: no longer filters by grade — 고3/중3 real students are included', () => {
  const profilesGradeMap = { s1: '고1', s2: '고2', s3: '고3', s4: '중3' };
  const profilesMap = { s1: '학생1', s2: '학생2', s3: '학생3', s4: '학생4' };
  const list = buildExamPrepStudentList([], profilesMap, profilesGradeMap);
  assert.deepEqual(list.map(s => s.id).sort(), ['s1', 's2', 's3', 's4']);
});

test('buildExamPrepStudentList: excludedStudentIds removes only the named account(s), nothing else', () => {
  const profilesGradeMap = { s1: '고1', test1: '중3', s2: '고2' };
  const profilesMap = { s1: '학생1', test1: 'Test', s2: '학생2' };
  const list = buildExamPrepStudentList([], profilesMap, profilesGradeMap, new Set(['test1']));
  assert.deepEqual(list.map(s => s.id).sort(), ['s1', 's2']);
  assert.ok(!list.some(s => s.id === 'test1'));
});

test('buildExamPrepStudentList: a student with no school_grade is kept (not dropped) and sorts last', () => {
  const profilesGradeMap = { s1: '고1', noGrade: '', s2: '고2' };
  const profilesMap = { s1: '학생1', noGrade: '학생0', s2: '학생2' };
  const list = buildExamPrepStudentList([], profilesMap, profilesGradeMap);
  assert.equal(list.length, 3);
  assert.equal(list.at(-1)!.id, 'noGrade');
  assert.equal(list.at(-1)!.grade, '');
});
