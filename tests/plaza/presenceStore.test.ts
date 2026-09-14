import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlazaStoreState,
  getOtherPlayers,
  getPathSince,
  plazaStoreReducer,
  MAX_PATH_LENGTH,
  MAX_RECENTLY_LEFT_REFS,
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

// presence-join/sync의 새 액션 shape은 각 player마다 presence_ref(그 join/접속을 식별하는 값,
// Supabase가 매 track()마다 새로 발급)를 함께 실어 보낸다 — presenceStore.ts의 PlazaStoreState.
// presenceRefs 주석 참고. 테스트 대부분은 "정상적인 한 번의 join/leave 왕복"만 검증하면 되므로
// 기본 ref 하나('ref-a')로 join과 leave를 짝지어 준다 — 실제 identity 검증(다른 ref의 leave는
// 무시됨) 테스트는 별도로 아래에 둔다.
function withRef(player: PlazaPlayerState, presenceRef = 'ref-a') {
  return { player, presenceRef };
}

test('presence join이 새 플레이어를 추가한다', () => {
  const state = createPlazaStoreState();
  const next = plazaStoreReducer(state, { type: 'presence-join', players: [withRef(makePlayer())] });
  assert.equal(next.players.size, 1);
  assert.deepEqual(next.players.get('session-a'), makePlayer());
});

test('presence leave가 플레이어를 제거한다', () => {
  const joined = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [withRef(makePlayer())],
  });
  const left = plazaStoreReducer(joined, { type: 'presence-leave', leaves: [{ sessionId: 'session-a', presenceRef: 'ref-a' }] });
  assert.equal(left.players.size, 0);
});

test('presence leave에 없는 sessionId를 넘기면 아무 변화 없다(동일 참조 반환)', () => {
  const joined = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [withRef(makePlayer())],
  });
  const same = plazaStoreReducer(joined, { type: 'presence-leave', leaves: [{ sessionId: 'unknown', presenceRef: 'whatever' }] });
  assert.strictEqual(same, joined);
});

test('broadcast: seq가 저장된 값보다 크지 않으면(낮거나 같으면) 버린다 — 위치가 되돌아가지 않는다', () => {
  const joined = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [withRef(makePlayer({ seq: 5, x: 10, y: 10 }))],
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
    players: [withRef(makePlayer({ seq: 5, x: 10, y: 10 }))],
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
    players: [withRef(makePlayer({ seq: 42, x: 9, y: 9 }), 'ref-old')],
  });

  // 탭 새로고침 등으로 재접속 — 훅이 seq 카운터를 1부터 다시 시작해서 presence-join으로 재등장
  // 한다(서버는 이 새 join에 새 presence_ref를 발급한다).
  const reconnected = plazaStoreReducer(before, {
    type: 'presence-join',
    players: [withRef(makePlayer({ seq: 1, x: 0, y: 0, updatedAt: 5000 }), 'ref-new')],
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
    players: [withRef(makePlayer({ sessionId: 'me' })), withRef(makePlayer({ sessionId: 'friend' }))],
  });
  const others = getOtherPlayers(state, 'me');
  assert.equal(others.length, 1);
  assert.equal(others[0].sessionId, 'friend');
});

test('getOtherPlayers: 아무도 제외되지 않는 sessionId를 넘기면 전원이 나온다', () => {
  const state = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [withRef(makePlayer({ sessionId: 'a' })), withRef(makePlayer({ sessionId: 'b' }))],
  });
  const others = getOtherPlayers(state, 'nobody-here');
  assert.equal(others.length, 2);
});

test('appearance는 있는 그대로 왕복된다(값 손상 없음)', () => {
  const appearance = { top: 'sage', bottom: 'blue', shoes: 'red', hair: 'brown', eyes: 'green' };
  const state = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [withRef(makePlayer({ appearance }))],
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
    players: [withRef(rawWithExtraFields)],
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
    players: [withRef(makePlayer({ sessionId: 'a' })), withRef(makePlayer({ sessionId: 'b' }))],
  });
  const synced = plazaStoreReducer(joined, {
    type: 'presence-sync',
    players: [withRef(makePlayer({ sessionId: 'a' }))], // b는 이제 sync에 없다 — 나간 것으로 취급
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
    players: [withRef(makePlayer({ sessionId: 'idle-one', updatedAt: 1000 }))],
  });
  assert.strictEqual(joined.players.size, 1);
  assert.ok(joined.players.has('idle-one'));
  // (더 이상 'sweep-stale' 같은 시간 기반 action이 존재하지 않으므로 여기서 dispatch할 것이
  // 없다 — state가 join 직후 그대로 유지된다는 사실 자체가 이 회귀 테스트의 전부다.)
});

test('presence leave는 즉시(다른 조건 없이) 플레이어를 제거한다', () => {
  const joined = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [withRef(makePlayer({ sessionId: 'leaving-one', updatedAt: 1000 }))],
  });
  const left = plazaStoreReducer(joined, { type: 'presence-leave', leaves: [{ sessionId: 'leaving-one', presenceRef: 'ref-a' }] });
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
    players: [withRef(makePlayer({ sessionId: 'walker', seq: 2, x: 3, y: 4, moving: false }))],
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
    players: [withRef(makePlayer({ sessionId: 'walker', seq: 2, x: 3, y: 4, moving: false }))],
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
    players: [withRef(makePlayer({ sessionId: 'walker', seq: 2, x: 2, y: 0, moving: false }))],
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
    players: [withRef(makePlayer({ sessionId: 'walker', seq: 5, x: 9, y: 9 }))],
  });
  assert.deepEqual(getPathSince(synced.paths, 'walker', -1), [{ x: 9, y: 9, seq: 5 }]);
});

test('presence-leave는 해당 세션의 경로 이력도 함께 지운다', () => {
  const moved = plazaStoreReducer(createPlazaStoreState(), {
    type: 'broadcast',
    player: makePlayer({ sessionId: 'walker', seq: 1, x: 1, y: 0 }),
  });
  const joined = plazaStoreReducer(moved, {
    type: 'presence-join',
    players: [withRef(makePlayer({ sessionId: 'walker', seq: 1, x: 1, y: 0 }), 'ref-a')],
  });
  const left = plazaStoreReducer(joined, { type: 'presence-leave', leaves: [{ sessionId: 'walker', presenceRef: 'ref-a' }] });
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

// --- 퇴장/재입장(leave/rejoin) lifecycle 버그(2026-09) 수정 검증 ---
//
// 실제 원인: 광장을 나가면(Plaza unmount) usePlazaRealtime.ts가 untrack()을 비동기로(fire-and-
// forget) 보낸다. 사용자가 곧바로 다시 들어오면(Plaza remount) 새 join의 track()이 먼저
// 서버/다른 클라이언트에 도착하고, 나갈 때 보낸 leave가 그 뒤에야 뒤늦게 도착할 수 있다 —
// 예전 reducer는 leave를 sessionId만 보고 지웠으므로, 이 뒤늦은 leave가 방금 재입장한 진짜
// 최신 세션을 통째로 지워버렸다(tests/plaza/lifecycle.browser.mjs가 실제 브라우저로 재현).
// presence_ref(그 join의 식별자)를 함께 기억해 두고, "지금 아는 join과 다른 leave"는 무시하는
// 것으로 고쳤다.
test('presence-leave: 이미 새 join(다른 presenceRef)으로 대체된 세션에 대한 뒤늦은 leave는 무시한다', () => {
  const firstJoin = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [withRef(makePlayer({ sessionId: 'walker', seq: 1, x: 1, y: 0 }), 'ref-old')],
  });
  // 사용자가 곧바로 재입장 — 새 join, 새 presence_ref, 새 seq(0부터).
  const rejoined = plazaStoreReducer(firstJoin, {
    type: 'presence-join',
    players: [withRef(makePlayer({ sessionId: 'walker', seq: 1, x: 5, y: 5 }), 'ref-new')],
  });
  assert.deepEqual(rejoined.players.get('walker'), makePlayer({ sessionId: 'walker', seq: 1, x: 5, y: 5 }));

  // 나갈 때 보냈던 leave가 이제야(재입장보다 늦게) 도착한다 — ref-old 그대로.
  const afterStaleLeave = plazaStoreReducer(rejoined, {
    type: 'presence-leave',
    leaves: [{ sessionId: 'walker', presenceRef: 'ref-old' }],
  });
  // 무시돼야 한다 — 방금 재입장한 walker가 화면에서 사라지면 안 된다.
  assert.strictEqual(afterStaleLeave, rejoined);
  assert.deepEqual(afterStaleLeave.players.get('walker'), makePlayer({ sessionId: 'walker', seq: 1, x: 5, y: 5 }));
  assert.ok(afterStaleLeave.players.has('walker'));
});

test('presence-leave: 진짜 현재 join(같은 presenceRef)에 대한 leave는 정상적으로 제거한다', () => {
  const joined = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [withRef(makePlayer({ sessionId: 'walker' }), 'ref-current')],
  });
  const left = plazaStoreReducer(joined, {
    type: 'presence-leave',
    leaves: [{ sessionId: 'walker', presenceRef: 'ref-current' }],
  });
  assert.ok(!left.players.has('walker'));
  assert.deepEqual(getPathSince(left.paths, 'walker', -1), []);
});

test('presence-leave: 한 번도 join으로 본 적 없는 세션의 leave는 조용히 무시한다(모르는 걸 지우지 않음)', () => {
  const state = createPlazaStoreState();
  const result = plazaStoreReducer(state, {
    type: 'presence-leave',
    leaves: [{ sessionId: 'ghost', presenceRef: 'ref-unknown' }],
  });
  assert.strictEqual(result, state);
});

test('presence-join은 재입장마다 presenceRef를 최신 것으로 갱신한다(그 뒤의 진짜 leave는 정상 처리)', () => {
  const firstJoin = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [withRef(makePlayer({ sessionId: 'walker' }), 'ref-1')],
  });
  const rejoined = plazaStoreReducer(firstJoin, {
    type: 'presence-join',
    players: [withRef(makePlayer({ sessionId: 'walker', x: 9 }), 'ref-2')],
  });
  // 최신 ref(ref-2)에 대한 leave는 정상적으로 제거돼야 한다.
  const left = plazaStoreReducer(rejoined, {
    type: 'presence-leave',
    leaves: [{ sessionId: 'walker', presenceRef: 'ref-2' }],
  });
  assert.ok(!left.players.has('walker'));
});

// --- 실시간 이동 3차 조사(2026-09) 수정 검증: presence-sync가 이미 처리된 leave를 되살리지
// 못하게 막는 recentlyLeftRefs ---
//
// 실제 원인은 usePlazaRealtime.ts의 plazaVisitTeardown 주석과 PlazaStoreState.recentlyLeftRefs
// 주석 참고 — 실제 Supabase 프로젝트를 대상으로 재현했을 때, presence-leave를 정상 처리한
// 직후(같은 밀리초 안에) 그 세션을 다시 포함한 presence-sync가 뒤따라오는 경우가 실제로
// 관찰됐다(leave와 그 leave를 아직 반영 못 한 sync가 함께 도착 — 서버 쪽 결과적 일관성
// 문제로 보인다). sync가 무조건 신뢰되는 기존 정책이라면 방금 지운 세션이 그대로 되살아난다
// ("광장 퇴장 후에도 상대 화면에 캐릭터가 남음" 버그).
test('presence-sync: 방금 leave를 확인한 join(같은 presenceRef)이 sync에 다시 나타나도 되살리지 않는다', () => {
  const joined = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [withRef(makePlayer({ sessionId: 'walker' }), 'ref-gone')],
  });
  const left = plazaStoreReducer(joined, {
    type: 'presence-leave',
    leaves: [{ sessionId: 'walker', presenceRef: 'ref-gone' }],
  });
  assert.ok(!left.players.has('walker'));

  // leave 처리 직후, 아직 그 leave를 반영하지 못한 stale한 sync가 뒤따라온다 — 같은 sessionId,
  // 같은(=이미 끝난) presenceRef.
  const staleSync = plazaStoreReducer(left, {
    type: 'presence-sync',
    players: [withRef(makePlayer({ sessionId: 'walker' }), 'ref-gone')],
  });
  assert.ok(!staleSync.players.has('walker'), 'sync가 방금 확인한 leave를 되살리면 안 된다');
  assert.deepEqual(getPathSince(staleSync.paths, 'walker', -1), []);
});

test('presence-sync: 진짜 재입장(다른 presenceRef)은 sync로도 정상 반영된다', () => {
  const joined = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [withRef(makePlayer({ sessionId: 'walker' }), 'ref-old')],
  });
  const left = plazaStoreReducer(joined, {
    type: 'presence-leave',
    leaves: [{ sessionId: 'walker', presenceRef: 'ref-old' }],
  });
  // 진짜 재입장 — 새 presenceRef를 단 sync.
  const resynced = plazaStoreReducer(left, {
    type: 'presence-sync',
    players: [withRef(makePlayer({ sessionId: 'walker', x: 7 }), 'ref-new')],
  });
  assert.deepEqual(resynced.players.get('walker'), makePlayer({ sessionId: 'walker', x: 7 }));
});

test('presence-sync: leave를 겪은 적 없는 세션은(recentlyLeftRefs와 무관하게) 평소처럼 반영된다', () => {
  const state = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-sync',
    players: [withRef(makePlayer({ sessionId: 'newcomer' }), 'ref-fresh')],
  });
  assert.ok(state.players.has('newcomer'));
});

test('recentlyLeftRefs는 MAX_RECENTLY_LEFT_REFS를 넘으면 가장 오래된 것부터 잊는다(무한 성장 방지)', () => {
  let state = createPlazaStoreState();
  const total = MAX_RECENTLY_LEFT_REFS + 5;
  for (let i = 1; i <= total; i++) {
    const ref = `ref-${i}`;
    state = plazaStoreReducer(state, {
      type: 'presence-join',
      players: [withRef(makePlayer({ sessionId: `s${i}` }), ref)],
    });
    state = plazaStoreReducer(state, {
      type: 'presence-leave',
      leaves: [{ sessionId: `s${i}`, presenceRef: ref }],
    });
  }
  assert.equal(state.recentlyLeftRefs.size, MAX_RECENTLY_LEFT_REFS);
  // 가장 오래된(ref-1..ref-5)은 잊혔으므로, 그 ref로 다시 sync가 와도 이제는 정상적으로 받아들여진다.
  const forgotten = plazaStoreReducer(state, {
    type: 'presence-sync',
    players: [withRef(makePlayer({ sessionId: 's1' }), 'ref-1')],
  });
  assert.ok(forgotten.players.has('s1'), '너무 오래된 leave 기록은 잊혀 더 이상 sync를 막지 않아야 한다');
  // 가장 최근(ref-total)은 여전히 기억하고 있어야 한다.
  assert.ok(state.recentlyLeftRefs.has(`ref-${total}`));
});
