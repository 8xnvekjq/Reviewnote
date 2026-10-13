import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_DUELS, RPS_DUEL_HEARTBEAT_MS, RPS_DUEL_TTL_MS, addDuel, applyDuel, duelSessionsFor, duelStamps, endDuel, expireDuels, leaveDuels, parseDuelPayload,
} from '../../src/features/pixel-world-phaser/logic/duelRegistry.ts';

const on = (matchId: string, ids: string[], at = 0) => ({ matchId, sessionIds: ids as [string] | [string, string], active: true, at });
const off = (matchId: string, ids: string[], at = 0) => ({ matchId, sessionIds: ids as [string] | [string, string], active: false, at });

test('heartbeat is well inside the TTL', () => {
  assert.ok(RPS_DUEL_TTL_MS >= RPS_DUEL_HEARTBEAT_MS * 3);
});
test('parse accepts old single-session payloads and rejects junk', () => {
  assert.deepEqual(parseDuelPayload({ matchId: 'm', sessionIds: ['a'], active: false, at: 5 }), off('m', ['a'], 5));
  assert.deepEqual(parseDuelPayload({ matchId: 'm', sessionIds: ['a', 'b', 'a'], active: true, at: 5 }), on('m', ['a', 'b'], 5));
  assert.equal(parseDuelPayload({ sessionIds: ['a'], active: true }), null, 'no matchId');
  assert.equal(parseDuelPayload({ matchId: 'm', sessionIds: [], active: true }), null);
  assert.equal(parseDuelPayload({ matchId: 'm', sessionIds: ['a'] }), null);
  assert.equal(parseDuelPayload(null), null);
});
test('bug repro: inviter marks both; accepter\'s own old-style end clears the whole match', () => {
  // 신청한 쪽: [나, 상대] 대결 중 → 수락한 쪽: [나]만 대결 중 → 끝은 각자 [나]만(예전 클라이언트).
  let r = applyDuel(EMPTY_DUELS, on('m1', ['inviter', 'accepter']), 1000);
  r = applyDuel(r, on('m1', ['accepter']), 2000);
  assert.deepEqual(duelStamps(r), { inviter: 1000, accepter: 1000 }, 'stamp stays at first sight');
  // 신청한 쪽의 끝만 와도(수락한 쪽 끝을 놓쳐도) 두 사람 다 지워진다.
  r = applyDuel(r, off('m1', ['inviter']), 3000);
  assert.deepEqual(duelStamps(r), {});
});
test('either participant\'s end clears both', () => {
  const r = applyDuel(applyDuel(EMPTY_DUELS, on('m1', ['a', 'b']), 0), off('m1', ['b']), 1);
  assert.deepEqual(duelStamps(r), {});
});
test('local end clears my own entry (broadcasts are not echoed to the sender)', () => {
  const r = applyDuel(EMPTY_DUELS, on('m1', ['inviter', 'me']), 0);
  assert.deepEqual(duelStamps(endDuel(r, 'm1', 10)), {});
});
test('a late active:true after the end is ignored, even with a newer sender clock', () => {
  let r = applyDuel(EMPTY_DUELS, on('m1', ['a', 'b'], 100), 0);
  r = applyDuel(r, off('m1', ['a'], 200), 1);
  assert.deepEqual(duelStamps(applyDuel(r, on('m1', ['b'], 150), 2)), {}, 'older at');
  assert.deepEqual(duelStamps(applyDuel(r, on('m1', ['b'], 999), 2)), {}, 'skewed clock');
  // 다른 경기는 상관없다.
  assert.deepEqual(duelStamps(applyDuel(r, on('m2', ['a', 'b']), 3)), { a: 3, b: 3 });
});
test('heartbeat refreshes TTL without changing the bubble stamp', () => {
  let r = applyDuel(EMPTY_DUELS, on('m1', ['a', 'b']), 0);
  r = applyDuel(r, on('m1', ['a', 'b']), RPS_DUEL_HEARTBEAT_MS);
  r = applyDuel(r, on('m1', ['b']), RPS_DUEL_HEARTBEAT_MS * 2);
  r = expireDuels(r, RPS_DUEL_HEARTBEAT_MS * 2 + RPS_DUEL_TTL_MS - 1);
  assert.deepEqual(duelStamps(r), { a: 0, b: 0 });
});
test('a duel not refreshed within the TTL expires', () => {
  const r = applyDuel(EMPTY_DUELS, on('m1', ['a', 'b']), 0);
  assert.equal(expireDuels(r, RPS_DUEL_TTL_MS - 1), r, 'unchanged object while fresh');
  assert.deepEqual(duelStamps(expireDuels(r, RPS_DUEL_TTL_MS)), {});
});
test('old ended memories are eventually forgotten', () => {
  const r = endDuel(EMPTY_DUELS, 'm1', 0);
  assert.ok('m1' in expireDuels(r, 1000).ended);
  assert.deepEqual(expireDuels(r, 60 * 60_000).ended, {});
});
test('a player leaving the plaza clears their match (both bubbles)', () => {
  let r = applyDuel(EMPTY_DUELS, on('m1', ['a', 'b']), 0);
  r = applyDuel(r, on('m2', ['c', 'd']), 0);
  const after = leaveDuels(r, ['b']);
  assert.deepEqual(duelStamps(after), { c: 0, d: 0 });
  assert.equal(leaveDuels(r, ['zzz']), r, 'unrelated leave keeps the same object');
});
test('joining a new match moves a player out of a stale one', () => {
  let r = applyDuel(EMPTY_DUELS, on('m1', ['a', 'b']), 0); // m1의 끝을 놓쳤다
  r = addDuel(r, 'm2', ['a', 'c'], 5);
  assert.deepEqual(r.matches.m1.sessionIds, ['b']);
  assert.deepEqual(r.matches.m2.sessionIds, ['a', 'c']);
});
test('end/heartbeat payload carries both participants when known', () => {
  const r = applyDuel(EMPTY_DUELS, on('m1', ['inviter', 'me']), 0);
  assert.deepEqual(duelSessionsFor(r, 'm1', 'me'), ['me', 'inviter']);
  assert.deepEqual(duelSessionsFor(r, 'other', 'me'), ['me']);
});
