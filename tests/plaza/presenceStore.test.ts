import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlazaStoreState,
  getOtherPlayers,
  getPathSince,
  plazaStoreReducer,
  MAX_PATH_LENGTH,
  type PlazaStoreState,
} from '../../src/features/pixel-room/plaza/presenceStore.ts';
import type { PlazaPlayerState } from '../../src/features/pixel-room/plaza/types.ts';

const APPEARANCE = { top: 'sage', bottom: null, shoes: null, hair: null, eyes: null };

function makePlayer(overrides: Partial<PlazaPlayerState> = {}): PlazaPlayerState {
  return {
    sessionId: 'session-a',
    x: 1,
    y: 2,
    direction: 'Front',
    moving: false,
    appearance: APPEARANCE,
    seq: 1,
    updatedAt: 1000,
    ...overrides,
  };
}

test('presence join이 새 플레이어를 추가한다', () => {
  const state = createPlazaStoreState();
  const next = plazaStoreReducer(state, { type: 'presence-join', players: [makePlayer()] });
  assert.equal(next.players.size, 1);
  assert.deepEqual(next.players.get('session-a'), makePlayer());
});

test('presence leave가 플레이어를 제거한다', () => {
  const joined = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [makePlayer()],
  });
  const left = plazaStoreReducer(joined, { type: 'presence-leave', sessionIds: ['session-a'] });
  assert.equal(left.players.size, 0);
});

test('presence leave에 없는 sessionId를 넘기면 아무 변화 없다(동일 참조 반환)', () => {
  const joined = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [makePlayer()],
  });
  const same = plazaStoreReducer(joined, { type: 'presence-leave', sessionIds: ['unknown'] });
  assert.strictEqual(same, joined);
});

test('broadcast: seq가 저장된 값보다 크지 않으면(낮거나 같으면) 버린다 — 위치가 되돌아가지 않는다', () => {
  const joined = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [makePlayer({ seq: 5, x: 10, y: 10 })],
  });

  const staleLower = plazaStoreReducer(joined, {
    type: 'broadcast',
    player: makePlayer({ seq: 3, x: 0, y: 0 }), // 더 오래된(낮은 seq), 늦게 도착한 메시지
  });
  assert.deepEqual(staleLower.players.get('session-a'), makePlayer({ seq: 5, x: 10, y: 10 }));

  const staleEqual = plazaStoreReducer(joined, {
    type: 'broadcast',
    player: makePlayer({ seq: 5, x: 0, y: 0 }), // 같은 seq 중복 배달
  });
  assert.deepEqual(staleEqual.players.get('session-a'), makePlayer({ seq: 5, x: 10, y: 10 }));
});

test('broadcast: seq가 저장된 값보다 크면 적용한다', () => {
  const joined = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [makePlayer({ seq: 5, x: 10, y: 10 })],
  });
  const applied = plazaStoreReducer(joined, {
    type: 'broadcast',
    player: makePlayer({ seq: 6, x: 11, y: 10, moving: true }),
  });
  assert.deepEqual(applied.players.get('session-a'), makePlayer({ seq: 6, x: 11, y: 10, moving: true }));
});

test('broadcast: 아직 presence로 알려지지 않은 세션의 첫 broadcast는 그대로 받아들인다', () => {
  const state = createPlazaStoreState();
  const applied = plazaStoreReducer(state, {
    type: 'broadcast',
    player: makePlayer({ sessionId: 'brand-new', seq: 0 }),
  });
  assert.ok(applied.players.has('brand-new'));
});

test('재접속(같은 sessionId, seq가 이전보다 낮음): presence 경로는 seq와 무관하게 항상 최신으로 받아들인다', () => {
  // 먼저 오래 있었던 세션 — seq가 많이 쌓였다.
  const before = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [makePlayer({ seq: 42, x: 9, y: 9 })],
  });

  // 탭 새로고침 등으로 재접속 — 훅이 seq 카운터를 1부터 다시 시작해서 presence-join으로 재등장.
  const reconnected = plazaStoreReducer(before, {
    type: 'presence-join',
    players: [makePlayer({ seq: 1, x: 0, y: 0, updatedAt: 5000 })],
  });

  // 낮은 seq임에도 재접속 후 최신 상태(위치 0,0)가 반영되어야 한다 — presence는 seq를 비교하지
  // 않고 "현재 상태"를 그대로 신뢰하는 정책.
  assert.deepEqual(
    reconnected.players.get('session-a'),
    makePlayer({ seq: 1, x: 0, y: 0, updatedAt: 5000 }),
  );

  // 이후 broadcast는 재접속 이후의 새 기준선(seq 1) 대비로 판정된다: seq 2는 적용된다.
  const movedAfterReconnect = plazaStoreReducer(reconnected, {
    type: 'broadcast',
    player: makePlayer({ seq: 2, x: 1, y: 0 }),
  });
  assert.deepEqual(
    movedAfterReconnect.players.get('session-a'),
    makePlayer({ seq: 2, x: 1, y: 0 }),
  );
});

test('getOtherPlayers: "나"의 sessionId는 목록에서 제외된다', () => {
  const state = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [makePlayer({ sessionId: 'me' }), makePlayer({ sessionId: 'friend' })],
  });
  const others = getOtherPlayers(state, 'me');
  assert.equal(others.length, 1);
  assert.equal(others[0].sessionId, 'friend');
});

test('getOtherPlayers: 아무도 제외되지 않는 sessionId를 넘기면 전원이 나온다', () => {
  const state = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [makePlayer({ sessionId: 'a' }), makePlayer({ sessionId: 'b' })],
  });
  const others = getOtherPlayers(state, 'nobody-here');
  assert.equal(others.length, 2);
});

test('appearance는 있는 그대로 왕복된다(값 손상 없음)', () => {
  const appearance = { top: 'sage', bottom: 'blue', shoes: 'red', hair: 'brown', eyes: 'green' };
  const state = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [makePlayer({ appearance })],
  });
  assert.deepEqual(state.players.get('session-a')?.appearance, appearance);
});

test('PlazaPlayerState에 없는 여분 필드(예: presence_ref, 닉네임 등 PII)는 저장되지 않는다', () => {
  const rawWithExtraFields = {
    ...makePlayer(),
    presence_ref: 'phx-ref-123',
    nickname: '홍길동',
    appearance: { ...APPEARANCE, ssn: 'should-not-be-here' },
  } as unknown as PlazaPlayerState;

  const state = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [rawWithExtraFields],
  });
  const stored = state.players.get('session-a');
  assert.ok(stored);
  assert.deepEqual(Object.keys(stored).sort(), [
    'appearance',
    'direction',
    'moving',
    'seq',
    'sessionId',
    'updatedAt',
    'x',
    'y',
  ]);
  assert.deepEqual(Object.keys(stored.appearance).sort(), ['bottom', 'eyes', 'hair', 'shoes', 'top']);
  assert.deepEqual(stored.appearance, APPEARANCE);
});

test('presence sync는 매번 전체 목록을 완전히 대체한다(더 이상 sync에 없는 세션은 사라짐)', () => {
  const joined: PlazaStoreState = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [makePlayer({ sessionId: 'a' }), makePlayer({ sessionId: 'b' })],
  });
  const synced = plazaStoreReducer(joined, {
    type: 'presence-sync',
    players: [makePlayer({ sessionId: 'a' })], // b는 이제 sync에 없다 — 나간 것으로 취급
  });
  assert.deepEqual([...synced.players.keys()], ['a']);
});

test('버그 회귀 방지: 15초 이상 정지해 있어도(broadcast/track 없이 시간만 흘러도) store에서 사라지지 않는다', () => {
  // 과거 sweep-stale 버그의 핵심 시나리오 그대로: presence-join 이후 15초+ 동안 어떤 액션도
  // dispatch하지 않는다(정지한 플레이어는 broadcast도 track도 다시 보내지 않으므로). reducer는
  // Date.now()를 스스로 부르지 않으므로 "시간이 흐른다"는 사실 자체가 액션 없이는 아무 효과도
  // 없어야 한다 — 더 이상 시간 기반으로 제거하는 경로가 전혀 없다는 것을 확인한다.
  const joined = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [makePlayer({ sessionId: 'idle-one', updatedAt: 1000 })],
  });
  assert.strictEqual(joined.players.size, 1);
  assert.ok(joined.players.has('idle-one'));
  // (더 이상 'sweep-stale' 같은 시간 기반 action이 존재하지 않으므로 여기서 dispatch할 것이
  // 없다 — state가 join 직후 그대로 유지된다는 사실 자체가 이 회귀 테스트의 전부다.)
});

test('presence leave는 즉시(다른 조건 없이) 플레이어를 제거한다', () => {
  const joined = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [makePlayer({ sessionId: 'leaving-one', updatedAt: 1000 })],
  });
  const left = plazaStoreReducer(joined, { type: 'presence-leave', sessionIds: ['leaving-one'] });
  assert.equal(left.players.size, 0);
  assert.ok(!left.players.has('leaving-one'));
});

test('이동 후 정지 상태가 그대로 유지된다(정지했다고 값이 사라지거나 바뀌지 않음)', () => {
  const moved = plazaStoreReducer(createPlazaStoreState(), {
    type: 'broadcast',
    player: makePlayer({ sessionId: 'walker', seq: 1, x: 3, y: 4, moving: true }),
  });
  // 정지 전이 — updateMyState가 moving:false로 마지막 track()을 보낸 상황을 presence-join으로
  // 재현한다(실제 훅에서는 track, 여기서는 reducer 레벨이라 presence-join으로 대체 가능).
  const stopped = plazaStoreReducer(moved, {
    type: 'presence-join',
    players: [makePlayer({ sessionId: 'walker', seq: 2, x: 3, y: 4, moving: false })],
  });
  assert.deepEqual(
    stopped.players.get('walker'),
    makePlayer({ sessionId: 'walker', seq: 2, x: 3, y: 4, moving: false }),
  );
  // 정지 상태로 시간이 흘러도(추가 액션 없이) 그대로 남아있다.
  assert.strictEqual(stopped.players.size, 1);
});

test('정지 후 다시 이동해도 같은 sessionId는 갱신될 뿐 중복 생성되지 않는다', () => {
  const stopped = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [makePlayer({ sessionId: 'walker', seq: 2, x: 3, y: 4, moving: false })],
  });
  const movedAgain = plazaStoreReducer(stopped, {
    type: 'broadcast',
    player: makePlayer({ sessionId: 'walker', seq: 3, x: 4, y: 4, moving: true }),
  });
  assert.equal(movedAgain.players.size, 1);
  assert.deepEqual(
    movedAgain.players.get('walker'),
    makePlayer({ sessionId: 'walker', seq: 3, x: 4, y: 4, moving: true }),
  );
});

// --- 실시간 이동 버그(순간이동/경로 스킵) 수정 검증: paths 누적 + getPathSince ---
//
// 실제 원인은 usePlazaRealtime.ts 헤더 주석 참고: React가 같은 태스크 안의 여러 dispatch를
// 렌더 1번으로 묶어버리면(presence의 leave+join 동시 diff, broadcast burst 등), "players"
// 스냅샷만 보는 소비자는 그 사이의 중간 좌표를 전부 놓친다. 아래 첫 테스트가 그 상황을 그대로
// 재현한다 — 중간 상태를 한 번도 들여다보지 않고 오직 "배치가 끝난 뒤의 최종 state"만으로
// getPathSince를 호출해도, 지나온 좌표가 하나도 빠지지 않고 전부 나와야 한다.
test('배치로 렌더가 묶여 중간 state를 한 번도 관찰하지 못해도, paths에는 지나온 좌표가 전부 남는다', () => {
  // 오직 "마지막 state"만 사용한다 — React가 batch 안의 3개 dispatch를 렌더 1번으로 묶었을 때
  // 소비자가 실제로 볼 수 있는 것과 정확히 동일한 조건.
  const afterBurst = [
    { seq: 1, x: 1, y: 0 },
    { seq: 2, x: 2, y: 0 },
    { seq: 3, x: 3, y: 0 },
  ].reduce(
    (state, step) => plazaStoreReducer(state, {
      type: 'broadcast',
      player: makePlayer({ sessionId: 'burst', seq: step.seq, x: step.x, y: step.y, moving: true }),
    }),
    createPlazaStoreState(),
  );

  // "players"(최종 스냅샷)만 보면 x=3 하나뿐 — 이게 바로 옛 버그(retarget-to-latest)가 x=1,2를
  // 잃어버렸던 지점이다.
  assert.deepEqual(afterBurst.players.get('burst'), makePlayer({ sessionId: 'burst', seq: 3, x: 3, y: 0, moving: true }));

  // 하지만 paths는 배치 여부와 무관하게 reducer가 실제로 처리한 액션 순서를 전부 보존한다.
  const fullPath = getPathSince(afterBurst.paths, 'burst', -1);
  assert.deepEqual(fullPath, [
    { x: 1, y: 0, seq: 1 },
    { x: 2, y: 0, seq: 2 },
    { x: 3, y: 0, seq: 3 },
  ]);
});

test('getPathSince: sinceSeq보다 큰 것만, 도착 순서 그대로 돌려준다(커서 재조회)', () => {
  let state = createPlazaStoreState();
  for (const step of [{ seq: 1, x: 0 }, { seq: 2, x: 1 }, { seq: 3, x: 2 }]) {
    state = plazaStoreReducer(state, { type: 'broadcast', player: makePlayer({ sessionId: 's', seq: step.seq, x: step.x, y: 0 }) });
  }
  // 커서를 2로 삼으면 seq 3짜리 하나만 "새로운" 것으로 보인다.
  assert.deepEqual(getPathSince(state.paths, 's', 2), [{ x: 2, y: 0, seq: 3 }]);
  // 커서가 이미 최신이면 빈 배열.
  assert.deepEqual(getPathSince(state.paths, 's', 3), []);
  // 알 수 없는 세션은 빈 배열.
  assert.deepEqual(getPathSince(state.paths, 'nobody', -1), []);
});

test('presence-join(이동 정지 전이 포함)도 경로에 좌표를 추가한다', () => {
  const moved = plazaStoreReducer(createPlazaStoreState(), {
    type: 'broadcast',
    player: makePlayer({ sessionId: 'walker', seq: 1, x: 1, y: 0, moving: true }),
  });
  const stopped = plazaStoreReducer(moved, {
    type: 'presence-join',
    players: [makePlayer({ sessionId: 'walker', seq: 2, x: 2, y: 0, moving: false })],
  });
  assert.deepEqual(getPathSince(stopped.paths, 'walker', -1), [
    { x: 1, y: 0, seq: 1 },
    { x: 2, y: 0, seq: 2 },
  ]);
});

test('presence-sync는 경로를 그 순간 위치 하나로 리셋한다(그 이전 경로는 관측한 적 없으므로 재생하지 않음)', () => {
  const moved = plazaStoreReducer(createPlazaStoreState(), {
    type: 'broadcast',
    player: makePlayer({ sessionId: 'walker', seq: 1, x: 1, y: 0 }),
  });
  const synced = plazaStoreReducer(moved, {
    type: 'presence-sync',
    players: [makePlayer({ sessionId: 'walker', seq: 5, x: 9, y: 9 })],
  });
  assert.deepEqual(getPathSince(synced.paths, 'walker', -1), [{ x: 9, y: 9, seq: 5 }]);
});

test('presence-leave는 해당 세션의 경로 이력도 함께 지운다', () => {
  const moved = plazaStoreReducer(createPlazaStoreState(), {
    type: 'broadcast',
    player: makePlayer({ sessionId: 'walker', seq: 1, x: 1, y: 0 }),
  });
  const left = plazaStoreReducer(moved, { type: 'presence-leave', sessionIds: ['walker'] });
  assert.deepEqual(getPathSince(left.paths, 'walker', -1), []);
});

test('paths는 MAX_PATH_LENGTH를 넘으면 오래된 좌표부터 잘라내고(무한 성장 방지), 최신 구간은 보존한다', () => {
  let state = createPlazaStoreState();
  const total = MAX_PATH_LENGTH + 5;
  for (let seq = 1; seq <= total; seq++) {
    state = plazaStoreReducer(state, { type: 'broadcast', player: makePlayer({ sessionId: 'long-walker', seq, x: seq, y: 0 }) });
  }
  const path = getPathSince(state.paths, 'long-walker', -1);
  assert.equal(path.length, MAX_PATH_LENGTH);
  // 가장 오래된 5개(seq 1~5)는 잘려나가고, 최신 구간(마지막 seq)은 그대로 남아 있다.
  assert.equal(path[0].seq, total - MAX_PATH_LENGTH + 1);
  assert.equal(path[path.length - 1].seq, total);
});

test('낡은/순서 뒤바뀐 broadcast(거부됨)는 players뿐 아니라 paths에도 남지 않는다', () => {
  const advanced = plazaStoreReducer(createPlazaStoreState(), {
    type: 'broadcast',
    player: makePlayer({ sessionId: 's', seq: 5, x: 5, y: 0 }),
  });
  const stale = plazaStoreReducer(advanced, {
    type: 'broadcast',
    player: makePlayer({ sessionId: 's', seq: 3, x: 0, y: 0 }), // 이미 거부되는 낡은 메시지
  });
  assert.deepEqual(getPathSince(stale.paths, 's', -1), [{ x: 5, y: 0, seq: 5 }]);
});
