import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeExamPrepReport,
  RADAR_AXIS_LABELS,
  RADAR_DISCLAIMER_ADMIN,
  RADAR_DISCLAIMER_STUDENT,
} from '../../src/utils/examPrepAnalysis.ts';
import { buildExamPrepStudentOptions } from '../../src/utils/examPrepStudents.ts';
import { canViewOwnExamPrep } from '../../src/utils/examPrepAccess.ts';
import { aggregatePlanPatterns } from '../../src/utils/planPatternAnalysis.ts';
import { daysSince } from '../../src/utils/examPrepCommentFormat.ts';
import type { MistakeEntry } from '../../src/types/index.ts';

const GRADE = '공통수학2';
const START = '평면좌표';
const END = '직선의 방정식'; // rangeChapters = ['평면좌표', '직선의 방정식']

function mistake(partial: Partial<MistakeEntry> & { id: string }): MistakeEntry {
  return {
    userId: 's1',
    title: partial.id,
    imageUrl: '',
    date: '2026-09-01',
    grade: GRADE,
    chapter: START,
    reviews: [],
    ...partial,
  } as MistakeEntry;
}

test('6개 축은 회복·점검 행동으로 구분되고 안내문은 절대 실력 판정을 부정한다', () => {
  assert.deepEqual(RADAR_AXIS_LABELS, [
    '개념 회복', '조건 해석 점검', '풀이 계획 정교화', '계산 점검', '복습 이행', '대책 구체성',
  ]);
  assert.match(RADAR_DISCLAIMER_ADMIN, /절대적인 실력 점수가 아닙니다/);
  assert.match(RADAR_DISCLAIMER_ADMIN, /잘한다·못한다를 단정하지 않고/);
  assert.match(RADAR_DISCLAIMER_STUDENT, /시험 점수나 실력 판정이 아니에요/);
});

test('N=0이면 6축 전부 중립값 50, sampleSize=0', () => {
  const report = computeExamPrepReport([], 's1', '학생', GRADE, START, END, new Set());
  assert.ok(report);
  assert.equal(report!.N, 0);
  for (const axis of report!.radar) {
    assert.equal(axis.score, 50);
    assert.equal(axis.sampleSize, 0);
  }
});

test('한 원인만 반복되어도 그 빈도를 벌점화하지 않고 다른 원인 축은 50 중립이다', () => {
  const tagged = Array.from({ length: 5 }, (_, i) => mistake({ id: `c${i}`, rootCauses: ['concept'] }));
  const untagged = Array.from({ length: 5 }, (_, i) => mistake({ id: `u${i}` }));
  const report = computeExamPrepReport([...tagged, ...untagged], 's1', '학생', GRADE, START, END, new Set());
  assert.ok(report);
  assert.equal(report!.N, 10);
  assert.equal(report!.T, 5);
  const concept = report!.radar[0];
  assert.equal(concept.score, 55);
  assert.match(concept.evidence[0], /빈도 자체는 감점하지 않음/);
  for (const axis of report!.radar.slice(1, 4)) {
    assert.equal(axis.score, 50, `${axis.label} should stay neutral without evidence`);
  }
});

test('low-N shrink는 완전한 회복 행동도 표본 1·2건에서는 완만하게, 5건부터 원점수로 반영한다', () => {
  const scoreFor = (count: number) => {
    const items = Array.from({ length: count }, (_, i) => mistake({
      id: `n${count}-${i}`,
      rootCauses: ['concept'],
      reviews: ['O', 'O', 'O'],
      userActionPlan: '개념 공식을 다시 확인하고 대입한다',
    }));
    const report = computeExamPrepReport(items, 's1', '학생', GRADE, START, END, new Set(items.map(item => item.id)));
    assert.ok(report);
    return report!.radar[0].score;
  };

  assert.equal(scoreFor(1), 60);
  assert.equal(scoreFor(2), 70);
  assert.equal(scoreFor(5), 100);
});

test('조건 해석 자기진단을 많이 남겨도 후속 학습 행동이 충실하면 높은 점수로 보인다', () => {
  const items = Array.from({ length: 5 }, (_, i) => mistake({
    id: `m${i}`,
    rootCauses: ['misread'],
    reviews: ['O', 'O', 'O'],
    userActionPlan: '조건에 밑줄을 긋고 식에 대입해 확인한다',
  }));
  const report = computeExamPrepReport(items, 's1', '학생', GRADE, START, END, new Set());
  assert.ok(report);
  assert.equal(report!.radar[1].score, 93);
  assert.match(report!.radar[1].evidence[0], /5건 — 빈도 자체는 감점하지 않음/);
});

test('계산 정확도 축(calc+formula 복수 태그)은 같은 문제를 두 번 세지 않는다(distinct-mistake count)', () => {
  const both = Array.from({ length: 3 }, (_, i) => mistake({ id: `b${i}`, rootCauses: ['calc', 'formula'] }));
  const conceptOnly = mistake({ id: 'c0', rootCauses: ['concept'] });
  const report = computeExamPrepReport([...both, conceptOnly], 's1', '학생', GRADE, START, END, new Set());
  assert.ok(report);
  assert.equal(report!.N, 4);
  assert.equal(report!.T, 4);
  const calcAxis = report!.radar[3];
  assert.equal(calcAxis.sampleSize, 3);
  assert.ok(calcAxis.evidence[0].includes('3건'), calcAxis.evidence[0]);
});

test('복습·대책 축은 원인 태그와 독립적이고 evidence 숫자는 실제 집계와 일치한다', () => {
  const common = [
    mistake({ id: 'i1', reviews: ['O', 'O', 'O'], userActionPlan: '조건을 표시하고 식을 세운다' }),
    mistake({ id: 'i2', reviews: ['O'] }),
    mistake({ id: 'i3', reviews: ['X'], userActionPlan: '다시 풀기' }),
    mistake({ id: 'i4' }),
  ];
  const withoutCauses = computeExamPrepReport(common, 's1', '학생', GRADE, START, END, new Set());
  const withCauses = computeExamPrepReport(
    common.map((item, i) => ({ ...item, rootCauses: i % 2 === 0 ? ['concept'] : ['strategy'] })),
    's1', '학생', GRADE, START, END, new Set(),
  );
  assert.ok(withoutCauses && withCauses);
  assert.deepEqual(withCauses!.radar.slice(4).map(axis => axis.score), withoutCauses!.radar.slice(4).map(axis => axis.score));

  const reviewAxis = withCauses!.radar[4];
  assert.ok(reviewAxis.evidence.includes('복습을 시작한 문제 3건 / 전체 4건'));
  assert.ok(reviewAxis.evidence.includes('복습 완료 1건, 진행 중 1건, 재도전 필요 1건, 미복습 1건'));

  const planAxis = withCauses!.radar[5];
  assert.ok(planAxis.evidence.includes('대책을 작성한 문제 2건 / 전체 4건'));
  assert.ok(planAxis.evidence.includes(
    `그중 구체적 대책 ${withCauses!.planSpecificity.concrete}건, 모호한 대책 ${withCauses!.planSpecificity.vague}건, 판단 어려움 ${withCauses!.planSpecificity.unclear}건`,
  ));
  assert.ok(planAxis.evidence.includes('점수 반영값 1건 (구체적 1, 모호함 0.5, 판단 어려움 0)'));
  assert.equal(planAxis.score, 30);
});

test('축별 evidence는 실제 카운트 문장이며 AI 생성 텍스트가 없다(고정 템플릿 tail만 포함)', () => {
  const items = [
    mistake({ id: 'p1', rootCauses: ['strategy'], userActionPlan: '경우를 나눠서 풀이 전략을 세운다', reviews: ['O', 'O', 'O'] }),
    mistake({ id: 'p2', rootCauses: ['strategy'] }),
  ];
  const report = computeExamPrepReport(items, 's1', '학생', GRADE, START, END, new Set());
  assert.ok(report);
  const strategyAxis = report!.radar[2];
  assert.ok(strategyAxis.evidence.some(line => line.includes('풀이 계획 정교화 관련 자기진단 2건')));
  assert.ok(strategyAxis.evidence.some(line => /복습 완료 1건/.test(line)));
  const planAxis = report!.radar[5];
  assert.ok(planAxis.evidence.some(line => line.includes('대책을 작성한 문제 1건 / 전체 2건')));
});

test('관리자 학생 선택기는 학년 제한 없이 test·학년 미상 계정을 포함하고 RPC에서 빠진 관리자는 제외한다', () => {
  const testUserId = '945dd787-7606-4244-9056-43ab32c21d93';
  const profilesMap = {
    middle: '중3 학생', high1: '고1 학생', high2: '고2 학생', high3: '고3 학생', unknown: '학년 미상', admin: '관리자',
    [testUserId]: 'test',
  };
  const profilesGradeMap = {
    middle: '중3', high1: '고1', high2: '고2', high3: '고3', unknown: '', [testUserId]: '',
  };
  const items = [
    mistake({ id: 'a', userId: 'high3', date: '2026-09-03' }),
    mistake({ id: 'b', userId: 'middle', date: '2026-09-02' }),
    mistake({ id: 'c', userId: 'admin', date: '2026-09-04' }),
    mistake({ id: 'd', userId: testUserId, date: '2026-09-05' }),
  ];

  const students = buildExamPrepStudentOptions(items, profilesMap, profilesGradeMap);
  assert.deepEqual(students.map(student => student.id), ['middle', 'high1', 'high2', 'high3', 'unknown', testUserId]);
  assert.equal(students.find(student => student.id === 'high3')?.count, 1);
  assert.equal(students.find(student => student.id === testUserId)?.count, 1);
  assert.equal(students.some(student => student.id === 'admin'), false);
  assert.equal(students.at(-1)?.grade, '');
});

test('시험대비 분석 본인 리포트는 모든 로그인 학생에게 열려 있다', () => {
  assert.equal(canViewOwnExamPrep('any-logged-in-user'), true);
  assert.equal(canViewOwnExamPrep('945dd787-7606-4244-9056-43ab32c21d93'), true);
  assert.equal(canViewOwnExamPrep(undefined), false);
  assert.equal(canViewOwnExamPrep(''), false);
});

test('표본 경고는 N<=2와 N<8을 구분하고 얇은 표본을 안정적이라고 단정하지 않는다', () => {
  const one = computeExamPrepReport([mistake({ id: 'one' })], 's1', '학생', GRADE, START, END, new Set());
  assert.equal(one!.sampleWarning, '아직 반복되는 패턴을 판단하기에는 기록이 적어요.');
  assert.ok(!one!.stableItems.some(item => item.includes('재도전(X)이 필요했던 문제가 시험범위 내에 없음')));

  const fiveItems = Array.from({ length: 5 }, (_, i) => mistake({ id: `five-${i}` }));
  const five = computeExamPrepReport(fiveItems, 's1', '학생', GRADE, START, END, new Set());
  assert.match(five!.sampleWarning!, /참고용으로만 활용/);
});

test('관리자와 학생에게 우선순위·대책 해석 문구를 역할에 맞게 제공한다', () => {
  const report = computeExamPrepReport([
    mistake({ id: 'r1', rootCauses: ['calc'] }),
    mistake({ id: 'r2', rootCauses: ['calc'] }),
    mistake({ id: 'r3', rootCauses: ['calc'] }),
  ], 's1', '학생', GRADE, START, END, new Set());
  assert.match(report!.priorities[0].suggestion, /다시 풀리며/);
  assert.match(report!.priorities[0].studentSuggestion, /다시 풀어보며/);

  const planPattern = aggregatePlanPatterns(Array.from({ length: 4 }, () => ({
    text: '조건을 다시 확인하겠다', rootCauses: ['calc'],
  })));
  assert.ok(planPattern.interpretation.some(line => line.includes('다음 상담')));
  assert.ok(planPattern.interpretationForStudent.some(line => line.includes('내가')));
  assert.ok(!planPattern.interpretationForStudent.some(line => line.includes('다음 상담')));
});

test('코멘트 경과일은 updated_at 날짜를 D+N으로 계산한다', () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23).toISOString();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
  assert.equal(daysSince(today), 0);
  assert.equal(daysSince(yesterday), 1);
});
