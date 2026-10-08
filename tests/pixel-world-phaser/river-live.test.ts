import { test } from 'node:test';
import assert from 'node:assert/strict';
import { continuousPosition, PLAZA_BOUNDS } from '../../src/features/pixel-room/plaza/presenceProtocol.ts';
import { createPlazaStoreReducer, createPlazaStoreState, plazaStoreReducer } from '../../src/features/pixel-room/plaza/presenceStore.ts';
import { PLAZA_CHANNEL_NAME } from '../../src/features/pixel-room/plaza/types.ts';
import {
  CATCH_BUBBLE_MS, FISH_ACTIVE_MAX_MS, FISH_RECEIVE_LIMIT, FISH_RESULT_MS, RIVER_BOUNDS, RIVER_CHANNEL_NAME,
  applyFishEvent, buildFishEvent, catchBubbleText, celebratesCatch, createRiverFishStore, expireFishStore, fishReportForGamePhase,
  parseFishEvent, peerFishingView, riverFeet, riverPayload, takeFishToken,
} from '../../src/features/pixel-world-phaser/logic/riverPresence.ts';

const appearance = { top: null, bottom: null, hair: null, shoes: null, eyes: null, skin: null };
const roster = new Set(['a', 'b']);
const cast = { sessionId: 'b', seq: 1, phase: 'casting', target: { x: 288, y: 183 } };

test('river uses its own channel so legacy plaza clients never see river traffic', () => {
  assert.notEqual(RIVER_CHANNEL_NAME, PLAZA_CHANNEL_NAME);
});

test('river presence: continuous cell coordinates survive the shared reducer with river bounds, plaza bounds unchanged', () => {
  const feet = { x: 20.3 * 16, y: 17.6 * 16 }; // 광장 범위(16×12)를 넘는 강가 좌표
  const payload = riverPayload(feet);
  assert.equal(payload.version, 2);
  assert.deepEqual(payload.position, { x: 19.8, y: 17.1 });
  assert.equal(payload.x, 20); assert.equal(payload.y, 17);
  const player = { sessionId: 'b', direction: 'Right' as const, moving: true, seq: 3, updatedAt: 1, appearance, pet: 'pet_dog' as const, ...payload };
  const river = createPlazaStoreReducer(RIVER_BOUNDS)(createPlazaStoreState(), { type: 'broadcast', player });
  assert.deepEqual(continuousPosition(river.players.get('b')!, RIVER_BOUNDS), { x: 19.8, y: 17.1 });
  assert.deepEqual(riverFeet(river.players.get('b')!), { x: 20.3 * 16, y: 17.6 * 16 });
  assert.equal(river.players.get('b')!.pet, 'pet_dog');
  // 같은 payload를 광장 reducer에 넣으면 광장 범위 밖이라 칸 좌표로 떨어진다(광장 동작 그대로).
  const plaza = plazaStoreReducer(createPlazaStoreState(), { type: 'broadcast', player });
  assert.deepEqual(continuousPosition(plaza.players.get('b')!), { x: 20, y: 17 });
  // 광장은 16×12 + 바깥 네 칸 여백(fx-walkable). 강가는 여백 없이 26×22.
  assert.deepEqual(PLAZA_BOUNDS, { width: 16, height: 12, slack: 4 });
  assert.equal(RIVER_BOUNDS.slack ?? 0, 0);
  // 강가 범위 밖·NaN은 연속 좌표로 믿지 않는다.
  assert.deepEqual(continuousPosition({ ...player, position: { x: 26, y: 3 } }, RIVER_BOUNDS), { x: 20, y: 17 });
  assert.deepEqual(continuousPosition({ ...player, position: { x: NaN, y: 3 } }, RIVER_BOUNDS), { x: 20, y: 17 });
});

test('parseFishEvent accepts every phase and keeps only whitelisted fields', () => {
  assert.deepEqual(parseFishEvent({ ...cast, name: '홍길동', userId: 'u1', html: '<b>x</b>' }), cast);
  for (const phase of ['waiting', 'bite', 'reeling', 'escaped', 'idle']) assert.equal(parseFishEvent({ sessionId: 'b', seq: 2, phase })?.phase, phase);
  assert.deepEqual(parseFishEvent({ sessionId: 'b', seq: 4, phase: 'landed', speciesId: 'buri', lengthCm: 23.44 }), { sessionId: 'b', seq: 4, phase: 'landed', speciesId: 'buri', lengthCm: 23.4 });
});

test('parseFishEvent rejects bad payloads: unknown species, length out of range, bad target, bad phase/seq/session', () => {
  const bad: unknown[] = [
    null, 'fish', [], { ...cast, sessionId: '' }, { ...cast, sessionId: 'x'.repeat(129) }, { ...cast, seq: -1 }, { ...cast, seq: 1.5 }, { ...cast, seq: '1' },
    { ...cast, phase: 'dance' }, { ...cast, target: undefined }, { ...cast, target: { x: -1, y: 10 } }, { ...cast, target: { x: 10, y: 99999 } },
    { ...cast, target: { x: NaN, y: 1 } }, { ...cast, target: { x: '10', y: 1 } },
    { sessionId: 'b', seq: 2, phase: 'landed', speciesId: 'shark', lengthCm: 20 },
    { sessionId: 'b', seq: 2, phase: 'landed', speciesId: 'buri', lengthCm: 25.2 },
    { sessionId: 'b', seq: 2, phase: 'landed', speciesId: 'buri', lengthCm: 9.8 },
    { sessionId: 'b', seq: 2, phase: 'landed', speciesId: 'buri', lengthCm: Infinity },
    { sessionId: 'b', seq: 2, phase: 'landed', speciesId: 'buri' },
    { sessionId: 'b', seq: 2, phase: 'landed', speciesId: '__proto__', lengthCm: 10 },
  ];
  for (const raw of bad) assert.equal(parseFishEvent(raw), null, JSON.stringify(raw));
  // 경계값(최소/최대)은 받는다.
  assert.ok(parseFishEvent({ sessionId: 'b', seq: 2, phase: 'landed', speciesId: 'buri', lengthCm: 10 }));
  assert.ok(parseFishEvent({ sessionId: 'b', seq: 2, phase: 'landed', speciesId: 'buri', lengthCm: 25 }));
});

test('buildFishEvent: casting needs a target in the scene; landed needs a catalog species', () => {
  assert.deepEqual(buildFishEvent('a', 1, { phase: 'casting', shadow: 1 }, { x: 320.04, y: 183 }), { sessionId: 'a', seq: 1, phase: 'casting', target: { x: 320, y: 183 } });
  assert.equal(buildFishEvent('a', 1, { phase: 'casting', shadow: 1 }, null), null);
  assert.equal(buildFishEvent('a', 2, { phase: 'landed', speciesId: 'nope', lengthCm: 3 }, null), null);
  assert.deepEqual(buildFishEvent('a', 3, { phase: 'bite' }, null), { sessionId: 'a', seq: 3, phase: 'bite' });
});

test('fishReportForGamePhase maps the minigame phases (reeling when the reel starts; landed waits for the server)', () => {
  assert.deepEqual(fishReportForGamePhase('waiting'), { phase: 'waiting' });
  assert.deepEqual(fishReportForGamePhase('bite'), { phase: 'bite' });
  assert.deepEqual(fishReportForGamePhase('reeling'), { phase: 'reeling' });
  assert.equal(fishReportForGamePhase('landed'), null);
  assert.deepEqual(fishReportForGamePhase('tooEarly'), { phase: 'escaped' });
  assert.deepEqual(fishReportForGamePhase('missed'), { phase: 'escaped' });
  assert.deepEqual(fishReportForGamePhase('cancelled'), { phase: 'idle' });
  assert.equal(fishReportForGamePhase('casting'), null);
  assert.equal(fishReportForGamePhase('idle'), null);
});

test('token bucket: a burst is cut after capacity, then refills over time', () => {
  let bucket;
  let ok = 0;
  for (let i = 0; i < 20; i++) { const r = takeFishToken(bucket, 1000); bucket = r.bucket; if (r.ok) ok++; }
  assert.equal(ok, FISH_RECEIVE_LIMIT.capacity);
  assert.equal(takeFishToken(bucket, 1000 + FISH_RECEIVE_LIMIT.refillMs - 1).ok, false);
  assert.equal(takeFishToken(bucket, 1000 + FISH_RECEIVE_LIMIT.refillMs).ok, true);
});

test('applyFishEvent: roster, ordering, rate limit, target carry-over, catch bubble and sparkle', () => {
  let store = createRiverFishStore();
  assert.equal(applyFishEvent(store, { ...cast, sessionId: 'stranger' }, 0, roster), store, 'not in the river');
  assert.equal(applyFishEvent(store, { ...cast, target: { x: -5, y: 0 } }, 0, roster), store, 'invalid');
  store = applyFishEvent(store, cast, 0, roster);
  assert.deepEqual(store.peers.get('b')!.target, cast.target);
  store = applyFishEvent(store, { sessionId: 'b', seq: 2, phase: 'bite' }, 100, roster);
  assert.equal(store.peers.get('b')!.phase, 'bite');
  assert.deepEqual(store.peers.get('b')!.target, cast.target, 'bite keeps the cast target');
  assert.equal(applyFishEvent(store, { sessionId: 'b', seq: 2, phase: 'waiting' }, 120, roster), store, 'old/duplicate seq');
  store = applyFishEvent(store, { sessionId: 'b', seq: 3, phase: 'landed', speciesId: 'buri', lengthCm: 23.4 }, 200, roster);
  const caught = store.peers.get('b')!.catch!;
  assert.equal(catchBubbleText(caught), '붕어 23.4cm!');
  assert.equal(peerFishingView(store).b.sparkleAt, null, 'common fish: no sparkle');
  store = applyFishEvent(store, { sessionId: 'b', seq: 4, phase: 'landed', speciesId: 'moonfish', lengthCm: 9 }, 300, roster);
  assert.equal(peerFishingView(store).b.sparkleAt, 300, 'legendary: sparkle for everyone');
  assert.ok(celebratesCatch('rare') && celebratesCatch('legendary') && !celebratesCatch('uncommon'));
  // 속도 제한: 같은 순간 수십 개를 보내도 통 크기까지만.
  let flood = createRiverFishStore(), accepted = 0;
  for (let i = 1; i <= 30; i++) { const next = applyFishEvent(flood, { sessionId: 'a', seq: i, phase: i % 2 ? 'waiting' : 'bite' }, 5000, roster); if (next.peers.get('a')?.seq === i) accepted++; flood = next; }
  assert.equal(accepted, FISH_RECEIVE_LIMIT.capacity);
});

test('expireFishStore: results clear, stuck lines clear, catch bubble ends, leavers are dropped; unchanged store is kept', () => {
  let store = applyFishEvent(createRiverFishStore(), cast, 0, roster);
  store = applyFishEvent(store, { sessionId: 'a', seq: 1, phase: 'landed', speciesId: 'pirami', lengthCm: 7 }, 0, roster);
  assert.equal(expireFishStore(store, 10, roster), store);
  const stuck = expireFishStore(store, FISH_ACTIVE_MAX_MS + 1, roster);
  assert.equal(stuck.peers.get('b')!.phase, 'idle');
  const result = expireFishStore(store, FISH_RESULT_MS + 1, roster);
  assert.equal(result.peers.get('a')!.phase, 'idle'); assert.ok(result.peers.get('a')!.catch, 'bubble outlives the bobber');
  assert.equal(expireFishStore(store, CATCH_BUBBLE_MS + 1, roster).peers.get('a')!.catch, null);
  const left = expireFishStore(store, 10, new Set(['a']));
  assert.equal(left.peers.has('b'), false); assert.equal(left.buckets.has('b'), false);
});
