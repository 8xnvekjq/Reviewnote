import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlazaStoreState,
  getOtherPlayers,
  plazaStoreReducer,
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

test('sweep-stale: updatedAt으로부터 staleAfterMs 넘게 아무 갱신이 없으면 제거한다(마지막 안전망)', () => {
  const joined = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [makePlayer({ sessionId: 'stale-one', updatedAt: 1000 })],
  });
  const swept = plazaStoreReducer(joined, { type: 'sweep-stale', now: 1000 + 15_000 + 1, staleAfterMs: 15_000 });
  assert.equal(swept.players.size, 0);
});

test('sweep-stale: staleAfterMs 이내면 살아있는 세션은 건드리지 않는다(동일 참조 반환)', () => {
  const joined = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [makePlayer({ sessionId: 'fresh-one', updatedAt: 1000 })],
  });
  const swept = plazaStoreReducer(joined, { type: 'sweep-stale', now: 1000 + 15_000 - 1, staleAfterMs: 15_000 });
  assert.strictEqual(swept, joined);
});

test('sweep-stale: 여러 세션 중 오래된 것만 골라서 제거하고 신선한 것은 남긴다', () => {
  const joined = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [
      makePlayer({ sessionId: 'old', updatedAt: 0 }),
      makePlayer({ sessionId: 'new', updatedAt: 20_000 }),
    ],
  });
  const swept = plazaStoreReducer(joined, { type: 'sweep-stale', now: 20_001, staleAfterMs: 15_000 });
  assert.deepEqual([...swept.players.keys()], ['new']);
});

test('sweep-stale은 정상적인 presence-leave/broadcast 동작을 바꾸지 않는다(기존 정책 그대로)', () => {
  // sweep-stale action 자체를 한 번도 dispatch하지 않는 한, 이미 통과하던 기존 12개 테스트의
  // 시나리오(presence-join/leave/broadcast의 seq 정책)는 이 추가분과 전혀 상호작용하지 않는다 —
  // 이 테스트는 그 사실을 broadcast 경로로 한 번 더 확인해 둔다(회귀 방지용).
  const joined = plazaStoreReducer(createPlazaStoreState(), {
    type: 'presence-join',
    players: [makePlayer({ seq: 5, x: 10, y: 10 })],
  });
  const stale = plazaStoreReducer(joined, {
    type: 'broadcast',
    player: makePlayer({ seq: 3, x: 0, y: 0 }),
  });
  assert.deepEqual(stale.players.get('session-a'), makePlayer({ seq: 5, x: 10, y: 10 }));
});
