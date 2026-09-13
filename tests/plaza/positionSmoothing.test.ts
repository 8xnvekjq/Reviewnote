import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInterpolationState,
  interpolatedPosition,
  isInterpolating,
  retarget,
  PLAZA_SMOOTH_DURATION_MS,
} from '../../src/features/pixel-room/plaza/positionSmoothing.ts';

test('createInterpolationState: 갓 생성된 상태는 목표에서 정지해 있다(from === to)', () => {
  const state = createInterpolationState({ x: 3, y: 4 }, 1000);
  assert.deepEqual(interpolatedPosition(state, 1000), { x: 3, y: 4 });
  assert.deepEqual(interpolatedPosition(state, 5000), { x: 3, y: 4 });
  assert.equal(isInterpolating(state, 1000), true); // 방금 시작된 구간(elapsed=0)이라 아직 "진행 중"으로 본다
  assert.equal(isInterpolating(state, 1000 + PLAZA_SMOOTH_DURATION_MS), false);
});

test('interpolatedPosition: 시각 T에서 A->B 사이의 정확한 중간 위치를 계산한다', () => {
  const start = 1000;
  const state = { from: { x: 0, y: 0 }, to: { x: 10, y: 20 }, startTime: start };
  const half = start + PLAZA_SMOOTH_DURATION_MS / 2;
  assert.deepEqual(interpolatedPosition(state, half), { x: 5, y: 10 });

  const quarter = start + PLAZA_SMOOTH_DURATION_MS / 4;
  assert.deepEqual(interpolatedPosition(state, quarter), { x: 2.5, y: 5 });
});

test('interpolatedPosition: 시작 전(now < startTime)에는 from에 그대로 머문다', () => {
  const state = { from: { x: 1, y: 1 }, to: { x: 9, y: 9 }, startTime: 1000 };
  assert.deepEqual(interpolatedPosition(state, 500), { x: 1, y: 1 });
});

test('interpolatedPosition: 목표에 도달하면(now >= startTime + duration) 더 이상 진행하지 않는다(오버슈트 없음)', () => {
  const state = { from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, startTime: 1000 };
  const atEnd = interpolatedPosition(state, 1000 + PLAZA_SMOOTH_DURATION_MS);
  const wayAfter = interpolatedPosition(state, 1000 + PLAZA_SMOOTH_DURATION_MS * 100);
  assert.deepEqual(atEnd, { x: 10, y: 10 });
  assert.deepEqual(wayAfter, { x: 10, y: 10 });
  assert.equal(isInterpolating(state, 1000 + PLAZA_SMOOTH_DURATION_MS), false);
});

test('retarget: 중간에 새 목표가 오면 "현재 보간된 위치"에서 부드럽게 방향을 바꾼다(점프하지 않음)', () => {
  const start = 1000;
  const state = { from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, startTime: start };
  const midway = start + PLAZA_SMOOTH_DURATION_MS / 2; // 이 시점의 실제 위치는 x=5
  const currentBeforeRetarget = interpolatedPosition(state, midway);
  assert.deepEqual(currentBeforeRetarget, { x: 5, y: 0 });

  const redirected = retarget(state, { x: 10, y: 10 }, midway);
  // 새 구간의 출발점은 이전 목표(x:10,y:0)가 아니라 "지금 실제로 있던 자리"(x:5,y:0)여야 한다.
  assert.deepEqual(redirected.from, { x: 5, y: 0 });
  assert.deepEqual(redirected.to, { x: 10, y: 10 });
  assert.equal(redirected.startTime, midway);

  // 리다이렉트 직후 위치는 점프 없이 그 출발점과 같다.
  assert.deepEqual(interpolatedPosition(redirected, midway), { x: 5, y: 0 });
});

test('retarget: 목표가 이전과 동일하면(변경 없음) 상태를 그대로 재사용한다(애니메이션 재시작 없음)', () => {
  const state = createInterpolationState({ x: 2, y: 2 }, 1000);
  const settled = { ...state }; // 이미 정지 상태(from===to)라고 가정
  const result = retarget(settled, { x: 2, y: 2 }, 5000);
  assert.strictEqual(result, settled); // 동일 참조 — startTime이 5000으로 리셋되지 않았음을 보장
});

test('reaching the target stops advancing: 도달 이후 추가 프레임에서도 값이 변하지 않는다', () => {
  const state = { from: { x: 0, y: 0 }, to: { x: 4, y: 8 }, startTime: 0 };
  const at1 = interpolatedPosition(state, PLAZA_SMOOTH_DURATION_MS);
  const at2 = interpolatedPosition(state, PLAZA_SMOOTH_DURATION_MS + 1000);
  const at3 = interpolatedPosition(state, PLAZA_SMOOTH_DURATION_MS + 999999);
  assert.deepEqual(at1, { x: 4, y: 8 });
  assert.deepEqual(at2, { x: 4, y: 8 });
  assert.deepEqual(at3, { x: 4, y: 8 });
});
