import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduceLatestVerdictByMistake } from '../../src/utils/reviewCheckLatestVerdict.ts';

test('최근 세션(배열 앞쪽)의 판정이 더 오래된 세션의 판정을 덮어쓰지 않고 그대로 이긴다', () => {
  const map = reduceLatestVerdictByMistake([
    { mistakeId: 'm1', grade: 'correct' },   // 최신 세션 — 이 값이 이겨야 함
    { mistakeId: 'm1', grade: 'incorrect' }, // 더 오래된 세션 — 무시되어야 함
  ]);
  assert.equal(map.get('m1'), 'correct');
});

test('과거엔 틀렸다가 최근에 통과한 경우 -> correct(마스터)로 남는다', () => {
  const map = reduceLatestVerdictByMistake([
    { mistakeId: 'm2', grade: 'correct' },
    { mistakeId: 'm2', grade: 'incorrect' },
    { mistakeId: 'm2', grade: 'incorrect' },
  ]);
  assert.equal(map.get('m2'), 'correct');
});

test('과거엔 통과했다가 최근에 다시 틀린 경우 -> incorrect(약함)로 남는다', () => {
  const map = reduceLatestVerdictByMistake([
    { mistakeId: 'm3', grade: 'incorrect' },
    { mistakeId: 'm3', grade: 'correct' },
  ]);
  assert.equal(map.get('m3'), 'incorrect');
});

test('서로 다른 mistakeId는 독립적으로 각자의 최신 판정을 갖는다', () => {
  const map = reduceLatestVerdictByMistake([
    { mistakeId: 'a', grade: 'correct' },
    { mistakeId: 'b', grade: 'incorrect' },
    { mistakeId: 'a', grade: 'incorrect' },
  ]);
  assert.equal(map.get('a'), 'correct');
  assert.equal(map.get('b'), 'incorrect');
});

test('빈 배열이면 빈 맵을 반환한다(복습체크 이력이 없는 학생)', () => {
  const map = reduceLatestVerdictByMistake([]);
  assert.equal(map.size, 0);
});

test('한 번도 안 틀린 문제는 맵에 아예 등장하지 않는다', () => {
  const map = reduceLatestVerdictByMistake([{ mistakeId: 'only-correct', grade: 'correct' }]);
  assert.equal(map.has('never-touched'), false);
});
