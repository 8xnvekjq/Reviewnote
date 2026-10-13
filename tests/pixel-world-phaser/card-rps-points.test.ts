import test from 'node:test'; import assert from 'node:assert/strict';
import { pointsMayChange, withPointsRefresh } from '../../src/features/pixel-world-phaser/logic/cardRpsPoints.ts';
import { createMockCardRpsAdapter } from '../../src/features/pixel-world-phaser/ui/cardRpsAdapterMock.ts';

const view = (status: string, matchId = 'm'): any => ({ matchId, mode: 'friend', status, stake: 10, prize: 20, me: { id: 'a' }, opponent: { id: 'b' }, round: 1, rounds: [], shootout: [], deadlineAt: 1, winnerId: null, endReason: null, pointDelta: null });

test('수락·끝(승리·거절·만료·취소)으로 바뀔 때만 포인트가 바뀐다고 본다', () => {
  assert.equal(pointsMayChange('invited', 'choosing'), true);
  assert.equal(pointsMayChange(undefined, 'choosing'), true);
  assert.equal(pointsMayChange('revealing', 'choosing'), false);
  assert.equal(pointsMayChange('choosing', 'revealing'), false);
  for (const s of ['finished', 'declined', 'expired', 'cancelled'] as const) assert.equal(pointsMayChange('invited', s), true);
  assert.equal(pointsMayChange('finished', 'finished'), false);
  assert.equal(pointsMayChange(undefined, 'invited'), false);
});

test('내 RPC 결과와 상대 행동 알림을 합쳐 같은 변화는 한 번만 다시 읽는다', async () => {
  let refreshes = 0; let push: ((m: any) => void) | undefined; const seen: string[] = [];
  const results: Record<string, any> = { invite: view('invited'), submit: view('revealing'), shootout: view('finished') };
  const base: any = {
    extra: 'kept',
    invite: async () => results.invite, respond: async () => view('choosing', 'r'), cancelInvite: async () => undefined,
    startNpc: async () => view('choosing', 'n'), submitCards: async () => results.submit, submitShootout: async () => results.shootout,
    leave: async () => view('finished', 'l'), getMatch: async () => view('finished'), getActive: async () => null,
    subscribe: (h: any) => { push = h.onMatch; return () => {}; },
  };
  const a = withPointsRefresh(base, () => { refreshes++; });
  assert.equal(a.extra, 'kept');
  a.subscribe({ onMatch: m => seen.push(m.status) });
  await a.invite('b', 10); assert.equal(refreshes, 1); // 판돈 맡김
  push!(view('invited')); assert.equal(refreshes, 1); // 같은 상태 알림
  push!(view('choosing')); assert.equal(refreshes, 2); // 상대가 수락
  await a.submitCards('m', ['rock']); assert.equal(refreshes, 2); // 공개 중 — 변화 없음
  push!(view('choosing')); assert.equal(refreshes, 2); // 다음 판
  push!(view('finished')); assert.equal(refreshes, 3); // 상대의 마지막 제출로 정산
  await a.submitShootout('m', 'rock'); assert.equal(refreshes, 3); // 이미 본 끝 — 두 번 읽지 않음
  await a.getMatch('m'); assert.equal(refreshes, 3);
  await a.cancelInvite('x'); assert.equal(refreshes, 4);
  await a.respond('r', false); assert.equal(refreshes, 5);
  await a.leave('l'); assert.equal(refreshes, 6);
  assert.deepEqual(seen, ['invited', 'choosing', 'choosing', 'finished']);
});

test('모의 어댑터 NPC 경기도 감쌀 수 있다', async () => {
  let refreshes = 0;
  const a = withPointsRefresh(createMockCardRpsAdapter(), () => { refreshes++; });
  const m = await a.startNpc(); assert.equal(m.status, 'choosing'); assert.equal(refreshes, 1);
});
