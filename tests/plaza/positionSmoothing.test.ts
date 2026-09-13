import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advance,
  createInterpolationState,
  enqueueWaypoint,
  interpolatedPosition,
  isInterpolating,
  PLAZA_PATH_QUEUE_CAP,
  PLAZA_SMOOTH_DURATION_MS,
} from '../../src/features/pixel-room/plaza/positionSmoothing.ts';

test('createInterpolationState: 갓 생성된 상태는 목표에서 정지해 있다(from === to)', () => {
  const state = createInterpolationState({ x: 3, y: 4 }, 1000);
  assert.deepEqual(interpolatedPosition(state, 1000), { x: 3, y: 4 });
  assert.deepEqual(interpolatedPosition(state, 5000), { x: 3, y: 4 });
  // from===to는 이동 거리가 0이므로 elapsed와 무관하게 "진행 중"이 아니다 — 갓 스폰된(한 번도
  // 움직인 적 없는) 세션이 화면에서 한 틱짜리 걷기 애니메이션을 잘못 재생하지 않도록 하는 지점
  // (재연결 커서 버그 수정과 함께, moving을 이제 raw 플래그가 아니라 이 함수로 유도하므로 중요).
  assert.equal(isInterpolating(state, 1000), false);
  assert.equal(isInterpolating(state, 1000 + PLAZA_SMOOTH_DURATION_MS), false);
});

test('isInterpolating: from!==to인 leg는 시작 직후(elapsed=0)엔 여전히 "진행 중"이다', () => {
  const state = { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, startTime: 1000, queue: [] };
  assert.equal(isInterpolating(state, 1000), true);
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

test('reaching the target stops advancing: 도달 이후 추가 프레임에서도 값이 변하지 않는다', () => {
  const state = { from: { x: 0, y: 0 }, to: { x: 4, y: 8 }, startTime: 0 };
  const at1 = interpolatedPosition(state, PLAZA_SMOOTH_DURATION_MS);
  const at2 = interpolatedPosition(state, PLAZA_SMOOTH_DURATION_MS + 1000);
  const at3 = interpolatedPosition(state, PLAZA_SMOOTH_DURATION_MS + 999999);
  assert.deepEqual(at1, { x: 4, y: 8 });
  assert.deepEqual(at2, { x: 4, y: 8 });
  assert.deepEqual(at3, { x: 4, y: 8 });
});

// --- enqueueWaypoint / advance — 실시간 이동 버그(순간이동/경로 스킵) 수정 검증 ---
//
// 옛 retarget()은 새 목표가 오면 무조건 "지금 위치 -> 새 목표"로 덮어썼다. 그래서 같은 세션의
// 좌표가 렌더 1번 사이에 여러 번 갱신되면(usePlazaRealtime.ts 헤더 주석의 batching 시나리오)
// 중간 목표들이 통째로 사라졌다. enqueueWaypoint/advance는 "이미 애니메이션 중이면 덮어쓰지
// 않고 대기열에 쌓았다가, 매 leg가 끝날 때마다 하나씩 순서대로 재생"하는 것으로 이걸 고친다.

test('enqueueWaypoint: 갓 생성된(from===to) 세션의 첫 waypoint는 elapsed와 무관하게 즉시 시작한다', () => {
  // now === startTime(elapsed=0) — createInterpolationState 직후 같은 틱에 첫 broadcast가 처리되는
  // 상황을 그대로 재현. elapsed 기준만 봤다면 "아직 안 끝난 leg"로 오판해 불필요하게 한 턴을
  // 대기열에서 흘려보냈을 것이다(스폰 직후 첫 이동이 한 tick 늦게 시작되는 버그).
  const spawned = createInterpolationState({ x: 0, y: 0 }, 0);
  const next = enqueueWaypoint(spawned, { x: 1, y: 0 }, 0);
  assert.deepEqual(next.from, { x: 0, y: 0 });
  assert.deepEqual(next.to, { x: 1, y: 0 });
  assert.equal(next.startTime, 0);
  assert.deepEqual(next.queue, []);
});

test('enqueueWaypoint: 이전 leg가 이미 끝난 정지 상태면 새 waypoint를 즉시 시작한다', () => {
  const settled = { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, startTime: 0, queue: [] };
  const now = PLAZA_SMOOTH_DURATION_MS + 500; // 한참 전에 도착해서 쉬고 있던 상태
  const next = enqueueWaypoint(settled, { x: 2, y: 0 }, now);
  assert.deepEqual(next.from, { x: 1, y: 0 });
  assert.deepEqual(next.to, { x: 2, y: 0 });
  assert.equal(next.startTime, now);
});

test('enqueueWaypoint: 아직 애니메이션 중(mid-leg)이면 활성 leg를 덮어쓰지 않고 대기열에 순서대로 쌓는다', () => {
  const start = 0;
  const state = { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, startTime: start, queue: [] };
  const midway = start + PLAZA_SMOOTH_DURATION_MS / 2; // 아직 (0,0)->(1,0) leg 진행 중

  const afterB = enqueueWaypoint(state, { x: 2, y: 0 }, midway);
  // 활성 leg는 그대로 — 이게 바로 옛 버그(덮어쓰기)의 반대: 중간 목표를 잃지 않는다.
  assert.deepEqual(afterB.from, { x: 0, y: 0 });
  assert.deepEqual(afterB.to, { x: 1, y: 0 });
  assert.equal(afterB.startTime, start);
  assert.deepEqual(afterB.queue, [{ x: 2, y: 0 }]);

  const afterC = enqueueWaypoint(afterB, { x: 3, y: 0 }, midway + 1);
  assert.deepEqual(afterC.queue, [{ x: 2, y: 0 }, { x: 3, y: 0 }]);
});

test('enqueueWaypoint: 대기열 끝(또는 활성 목표)과 같은 좌표가 다시 오면 무시한다(중복 no-op)', () => {
  const queued = { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, startTime: 0, queue: [{ x: 2, y: 0 }] };
  assert.strictEqual(enqueueWaypoint(queued, { x: 2, y: 0 }, 10), queued);

  const settled = createInterpolationState({ x: 2, y: 2 }, 0);
  const now = PLAZA_SMOOTH_DURATION_MS + 5000;
  assert.strictEqual(enqueueWaypoint(settled, { x: 2, y: 2 }, now), settled);
});

test('enqueueWaypoint: 대기열이 PLAZA_PATH_QUEUE_CAP을 넘으면 가장 오래된 것부터 버려서 지연을 제한한다', () => {
  let state = { from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, startTime: 0, queue: [] };
  state = enqueueWaypoint(state, { x: 1, y: 0 }, 0); // 즉시 시작(spawn 직후) — 활성 leg가 된다
  for (let i = 2; i <= PLAZA_PATH_QUEUE_CAP + 5; i++) {
    state = enqueueWaypoint(state, { x: i, y: 0 }, 1); // 여전히 mid-leg(now=1 < duration) — 전부 대기열로
  }
  assert.equal(state.queue?.length, PLAZA_PATH_QUEUE_CAP);
  // 가장 최근에 들어온 것들이 남아야 한다 — 가장 오래된 대기열 항목(x=2)은 잘려나갔다.
  assert.equal(state.queue?.[state.queue.length - 1].x, PLAZA_PATH_QUEUE_CAP + 5);
  assert.notEqual(state.queue?.[0].x, 2);
});

test('advance: leg가 끝나면 대기열의 다음 waypoint로 이어서 진행한다 — 순간이동/스킵 없이 전부 방문', () => {
  // 이동 tick 3개가 렌더 1번으로 배치된 상황을 그대로 재현: mid-leg일 때 3개를 한꺼번에
  // enqueue한다(옛 코드라면 마지막 것만 남기고 앞의 둘을 잃었을 지점).
  const start = 0;
  let state = { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, startTime: start, queue: [] };
  const midway = start + PLAZA_SMOOTH_DURATION_MS / 2;
  state = enqueueWaypoint(state, { x: 2, y: 0 }, midway);
  state = enqueueWaypoint(state, { x: 3, y: 0 }, midway); // 같은 시각(배치) — 거의 동시 도착
  state = enqueueWaypoint(state, { x: 4, y: 0 }, midway);
  assert.deepEqual(state.queue, [{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }]);

  // 원래 leg가 끝나는 시점에 advance()하면 큐의 첫 항목(x=2)으로 넘어가야 한다 — x=4로 바로
  // 건너뛰면 안 된다(이게 바로 고친 버그).
  const t1 = start + PLAZA_SMOOTH_DURATION_MS;
  state = advance(state, t1);
  assert.deepEqual(state.to, { x: 2, y: 0 });
  assert.deepEqual(state.from, { x: 1, y: 0 });
  assert.equal(state.startTime, t1);
  assert.deepEqual(interpolatedPosition(state, t1), { x: 1, y: 0 }); // 방금 시작, 아직 x=1

  const t2 = t1 + PLAZA_SMOOTH_DURATION_MS;
  state = advance(state, t2);
  assert.deepEqual(state.to, { x: 3, y: 0 });
  assert.deepEqual(state.from, { x: 2, y: 0 });

  const t3 = t2 + PLAZA_SMOOTH_DURATION_MS;
  state = advance(state, t3);
  assert.deepEqual(state.to, { x: 4, y: 0 });
  assert.deepEqual(state.from, { x: 3, y: 0 });
  assert.deepEqual(state.queue, []);

  const t4 = t3 + PLAZA_SMOOTH_DURATION_MS;
  assert.deepEqual(interpolatedPosition(advance(state, t4), t4), { x: 4, y: 0 });
});

test('advance: 다음 leg의 시작 시각은 "지금"이 아니라 이전 leg가 끝났어야 할 시각으로 잇는다(드리프트 방지)', () => {
  const start = 1000;
  const state = { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, startTime: start, queue: [{ x: 2, y: 0 }] };
  // rAF 콜백이 예정보다 40ms 늦게 불렸다고 가정.
  const lateNow = start + PLAZA_SMOOTH_DURATION_MS + 40;
  const advanced = advance(state, lateNow);
  // 새 leg의 startTime은 lateNow(1210+40)가 아니라 정확히 start+duration이어야 다음 leg들이
  // 누적 지연 없이 원래 송신 cadence를 유지한다.
  assert.equal(advanced.startTime, start + PLAZA_SMOOTH_DURATION_MS);
});

test('advance: 한 번에 여러 leg를 건너뛰어야 할 만큼 크게 뒤처졌으면(탭 백그라운드 등) 큐를 한 호출에서 다 소진한다', () => {
  const state = {
    from: { x: 0, y: 0 },
    to: { x: 1, y: 0 },
    startTime: 0,
    queue: [{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }],
  };
  // 한참 뒤(4 leg 분량 이상)에야 다시 rAF가 불림 — 탭이 백그라운드에 오래 있었던 상황.
  const farFuture = PLAZA_SMOOTH_DURATION_MS * 10;
  const advanced = advance(state, farFuture);
  assert.deepEqual(advanced.to, { x: 4, y: 0 }); // 큐를 전부 소진하고 마지막 목표에 도달
  assert.deepEqual(advanced.queue, []);
  assert.deepEqual(interpolatedPosition(advanced, farFuture), { x: 4, y: 0 });
});

test('advance: 진행할 게 없으면(큐가 비어있거나 leg가 안 끝났으면) 동일 참조를 그대로 반환한다', () => {
  const midLeg = { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, startTime: 0, queue: [] };
  assert.strictEqual(advance(midLeg, PLAZA_SMOOTH_DURATION_MS / 2), midLeg);

  const settled = { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, startTime: 0, queue: [] };
  assert.strictEqual(advance(settled, PLAZA_SMOOTH_DURATION_MS + 1000), settled);
});

test('isInterpolating: 현재 leg는 끝났어도 대기열에 남은 게 있으면 여전히 "진행 중"이다', () => {
  const state = { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, startTime: 0, queue: [{ x: 2, y: 0 }] };
  const now = PLAZA_SMOOTH_DURATION_MS + 1; // 현재 leg 자체는 끝남
  assert.equal(isInterpolating(state, now), true);

  const empty = { ...state, queue: [] };
  assert.equal(isInterpolating(empty, now), false);
});
