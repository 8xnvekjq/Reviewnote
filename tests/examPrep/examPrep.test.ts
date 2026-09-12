import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeExamPrepReport,
  RADAR_AXIS_LABELS,
  RADAR_DISCLAIMER_ADMIN,
  RADAR_DISCLAIMER_STUDENT,
} from '../../src/utils/examPrepAnalysis.ts';
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

test('RADAR_AXIS_LABELS는 6개, disclaimer 문구는 요청된 정확한 텍스트를 유지한다', () => {
  assert.equal(RADAR_AXIS_LABELS.length, 6);
  assert.equal(
    RADAR_DISCLAIMER_ADMIN,
    '이 점수는 절대적인 실력 점수가 아닙니다. Reviewnote에 기록된 오답, 복습 결과, 자기진단, 대책 등의 신호를 정해진 규칙으로 계산한 상대적 학습 프로필 점수입니다. 같은 학생 안에서 어떤 영역을 먼저 확인할지 비교하는 용도로 봐주세요.',
  );
  assert.equal(
    RADAR_DISCLAIMER_STUDENT,
    '이 숫자는 시험 점수가 아니라, 내 Reviewnote 기록에서 계산한 상대적 학습 신호예요.',
  );
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

test('한 원인만 반복되어도 기록 없는 다른 원인 축은 가짜 100점이 아니라 50 중립이다', () => {
  const tagged = Array.from({ length: 5 }, (_, i) => mistake({ id: `c${i}`, rootCauses: ['concept'] }));
  const untagged = Array.from({ length: 5 }, (_, i) => mistake({ id: `u${i}` }));
  const report = computeExamPrepReport([...tagged, ...untagged], 's1', '학생', GRADE, START, END, new Set());
  assert.ok(report);
  assert.equal(report!.N, 10);
  assert.equal(report!.T, 5);
  const concept = report!.radar[0];
  assert.equal(concept.score, 27);
  for (const axis of report!.radar.slice(1, 4)) {
    assert.equal(axis.score, 50, `${axis.label} should stay neutral without evidence`);
  }
});

test('low-N shrink는 같은 극단 원인 신호를 N=1·2에서 억제하고 N=5부터 원점수를 사용한다', () => {
  const scoreFor = (count: number) => {
    const items = Array.from({ length: count }, (_, i) => mistake({ id: `n${count}-${i}`, rootCauses: ['concept'] }));
    const report = computeExamPrepReport(items, 's1', '학생', GRADE, START, END, new Set());
    assert.ok(report);
    return report!.radar[0].score;
  };

  assert.equal(scoreFor(1), 41);
  assert.equal(scoreFor(2), 32);
  assert.equal(scoreFor(5), 4);
});

test('계산 정확도 축(calc+formula 복수 태그)은 같은 문제를 두 번 세지 않는다(distinct-mistake count)', () => {
  const both = Array.from({ length: 3 }, (_, i) => mistake({ id: `b${i}`, rootCauses: ['calc', 'formula'] }));
  const conceptOnly = mistake({ id: 'c0', rootCauses: ['concept'] });
  const report = computeExamPrepReport([...both, conceptOnly], 's1', '학생', GRADE, START, END, new Set());
  assert.ok(report);
  assert.equal(report!.N, 4);
  assert.equal(report!.T, 4);
  const calcAxis = report!.radar[3];
  // count가 6(3건 x 2태그)으로 이중 집계됐다면 rate>1 -> raw가 음수로 클램프되어 score가 바닥(4)에
  // 붙는다. distinct 카운트(3건)로 고치면 rate=3/4=.75 -> 바닥에 붙지 않는다.
  assert.ok(calcAxis.score > 4, `calc+formula axis should not hit the floor due to double counting, got ${calcAxis.score}`);
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
  assert.ok(strategyAxis.evidence.some(line => line.includes('풀이 전략 관련 자기진단 2건')));
  assert.ok(strategyAxis.evidence.some(line => /복습 완료 1건/.test(line)));
  const planAxis = report!.radar[5];
  assert.ok(planAxis.evidence.some(line => line.includes('대책을 작성한 문제 1건 / 전체 2건')));
});
