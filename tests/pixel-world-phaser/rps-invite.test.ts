import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_INBOX, canAffordStake, expireInvite, offerInvite, parseInvitePayload, rpsInviteErrorText, settleInvite,
} from '../../src/features/pixel-world-phaser/logic/rpsInvite.ts';
import { CardRpsError, createCardRpsAdapter, withPointRefresh } from '../../src/features/pixel-world-phaser/ui/cardRpsAdapter.ts';

const invite = (matchId: string, expiresAt = 10_000) => ({ matchId, from: { id: 'a', nickname: '가' }, stake: 20, expiresAt });

test('받은 신청은 세 길로 와도 한 번만 뜨고, 답한 신청·만료된 신청은 다시 뜨지 않는다', () => {
  let box = offerInvite(EMPTY_INBOX, invite('m1'), 0);
  assert.equal(box.current?.matchId, 'm1');
  assert.equal(offerInvite(box, invite('m1'), 1), box, '같은 신청(실시간·broadcast·확인)은 그대로');
  box = settleInvite(box, 'm1');
  assert.equal(box.current, null);
  assert.equal(offerInvite(box, invite('m1'), 2), box, '답한 신청은 다시 안 뜬다');
  assert.equal(offerInvite(box, invite('m2', 5), 5), box, '이미 만료된 신청은 안 뜬다');
  box = offerInvite(box, invite('m3', 100), 50);
  assert.equal(expireInvite(box, 99), box);
  box = expireInvite(box, 100);
  assert.equal(box.current, null);
  assert.equal(offerInvite(box, invite('m3', 100), 60).current, null, '시간이 지나 내린 신청은 늦게 온 알림으로 다시 뜨지 않는다');
});

test('광장 신청 알림 payload를 검사한다', () => {
  assert.deepEqual(parseInvitePayload({ matchId: 'abc-1', toSessionId: 'def-2', at: 3 }), { matchId: 'abc-1', toSessionId: 'def-2', at: 3 });
  for (const bad of [null, 'x', { matchId: 1, toSessionId: 'a', at: 1 }, { matchId: 'a', toSessionId: 'b' }, { matchId: 'a b', toSessionId: 'b', at: 1 }, { matchId: 'a', toSessionId: 'b', at: Infinity }]) {
    assert.equal(parseInvitePayload(bad), null, JSON.stringify(bad));
  }
});

test('판돈 감당 여부는 서버와 같은 정의(max(0, 잔액) ≥ 판돈)', () => {
  assert.equal(canAffordStake(50, 49), false);
  assert.equal(canAffordStake(50, 50), true);
  assert.equal(canAffordStake(10, -30), false);
  assert.equal(canAffordStake(10, Number.NaN), false);
});

test('포인트 부족 안내 문구', () => {
  assert.equal(rpsInviteErrorText('not_enough_points', 'invite'), '포인트가 부족해요');
  assert.equal(rpsInviteErrorText('not_enough_points', 'accept'), '포인트가 부족해서 수락할 수 없어요');
  assert.match(rpsInviteErrorText('busy', 'invite'), /다른 대결/);
  assert.match(rpsInviteErrorText('weird', 'invite'), /연결/);
});

const view = (over: Record<string, unknown> = {}) => ({ matchId: 'm', mode: 'friend', status: 'invited', stake: 20, prize: 40,
  me: { id: 'me', nickname: '나', isNpc: false, inventory: { rock: 3, scissors: 3, paper: 3 }, wins: 0, submitted: false },
  opponent: { id: 'you', nickname: '너', isNpc: false, inventory: { rock: 3, scissors: 3, paper: 3 }, wins: 0, submitted: false },
  round: 1, rounds: [], shootout: [], deadlineAt: 99_999_999_999_999, winnerId: null, endReason: null, pointDelta: null, ...over });

test('pendingInvite: 표에서 나에게 온 신청만 골라 한 번만 RPC로 읽는다', async () => {
  const rpc: string[] = [];
  let rows: { id: string; player_b: string }[] = [{ id: 'sent', player_b: 'you' }, { id: 'got', player_b: 'me' }];
  const client: any = {
    rpc: async (fn: string, args: any) => { rpc.push(fn + ':' + (args?.p_match_id ?? '')); return { data: view({ matchId: args.p_match_id }), error: null }; },
    from: () => ({ select: () => ({ eq: async () => ({ data: rows, error: null }) }) }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
  const adapter = createCardRpsAdapter(client);
  const found = await adapter.pendingInvite!();
  assert.equal(found?.matchId, 'got');
  assert.equal(found?.from.nickname, '너');
  assert.deepEqual(rpc, ['get_card_rps_match:sent', 'get_card_rps_match:got'], '보낸 신청은 한 번 확인 후 내 id를 배워 건너뛴다');
  assert.equal((await adapter.pendingInvite!())?.matchId, 'got');
  assert.equal(rpc.length, 2, '같은 신청을 다시 RPC로 읽지 않는다(4초 확인 부하)');
  rows = [];
  assert.equal(await adapter.pendingInvite!(), null);
  client.from = () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: 'x' } }) }) });
  await assert.rejects(adapter.pendingInvite!(), (e: any) => e instanceof CardRpsError && e.code === 'network');
});

test('실시간 알림에 player_b가 빠져 있어도 표를 확인해 신청을 알리고, 다시 연결되면 확인한다', async () => {
  let handler: ((p: any) => void) | null = null; let status: ((s: string) => void) | null = null;
  const client: any = {
    rpc: async (_fn: string, args: any) => ({ data: view({ matchId: args.p_match_id }), error: null }),
    from: () => ({ select: () => ({ eq: async () => ({ data: [{ id: 'got', player_b: 'me' }], error: null }) }) }),
    channel: () => ({ on(_t: string, _f: unknown, cb: any) { handler = cb; return this; }, subscribe(cb: any) { status = cb; return this; } }), removeChannel() {},
  };
  const invites: string[] = [];
  const stop = createCardRpsAdapter(client).subscribe({ onInvite: i => invites.push(i.matchId) });
  status!('SUBSCRIBED');
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(invites, ['got'], '연결되자마자 기다리는 신청을 확인한다');
  handler!({ new: { id: 'got' } });
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(invites, ['got', 'got'], '열이 빠진 알림도 표 확인으로 전달(중복은 화면이 거른다)');
  stop();
});

test('withPointRefresh: 신청·응답·끝난 경기·포인트 부족 거절 때 잔액을 다시 읽는다', async () => {
  let calls = 0; let fail = false;
  const base: any = {
    invite: async () => { if (fail) throw new CardRpsError('not_enough_points'); return view(); },
    respond: async () => view({ status: 'choosing' }), cancelInvite: async () => {}, startNpc: async () => view({ status: 'choosing', mode: 'npc' }),
    submitCards: async () => view({ status: 'finished', matchId: 'f' }), submitShootout: async () => view(), leave: async () => view({ status: 'finished', matchId: 'f' }),
    getMatch: async () => view({ status: 'finished', matchId: 'f' }), getActive: async () => null, subscribe: () => () => {},
  };
  const a = withPointRefresh(base, () => { calls++; });
  await a.invite('t', 20); assert.equal(calls, 1);
  await a.respond('m', true); assert.equal(calls, 2);
  await a.startNpc(); assert.equal(calls, 2, '진행 중 경기는 안 읽는다');
  await a.submitCards('f', ['rock']); assert.equal(calls, 3);
  await a.getMatch('f'); await a.leave('f'); assert.equal(calls, 3, '같은 끝난 경기는 한 번만');
  fail = true;
  await assert.rejects(a.invite('t', 50)); assert.equal(calls, 4, '포인트 부족이면 HUD를 서버 값으로 맞춘다');
});
