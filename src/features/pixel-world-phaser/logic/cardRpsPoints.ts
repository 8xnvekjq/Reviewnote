// 카드 가위바위보가 포인트를 바꾸는 순간(판돈 맡김·돌려받음·승리 보상)에 화면 잔액을 바로 다시 읽게 한다.
// 서버가 profiles.point_adjustment를 이미 바꿨으므로 잔액은 서버 값을 다시 읽어 맞춘다(낙관적 더하기 없음 → 두 번 셀 일 없음).
// 내 행동(RPC 결과)과 상대 행동(실시간 구독) 둘 다 같은 경기 상태 장부를 거쳐, 같은 변화로는 한 번만 다시 읽는다.
import type { CardRpsAdapter, RpsMatchView } from './cardRpsContract';

type Status = RpsMatchView['status'];
const SETTLED: readonly Status[] = ['finished', 'declined', 'expired', 'cancelled'];

/** 상태가 이렇게 바뀌면 내 포인트가 바뀌었을 수 있다(수락 = 판돈 맡김, 끝 = 보상·환불). */
export function pointsMayChange(prev: Status | undefined, next: Status): boolean {
  if (prev === next) return false;
  if (SETTLED.includes(next)) return true;
  return next === 'choosing' && (prev === undefined || prev === 'invited');
}

/** 어댑터를 감싸 포인트가 바뀌는 결과·알림마다 refresh()를 부른다. 원래 어댑터의 다른 필드(예: registerPresenceToken)는 그대로 둔다. */
export function withPointsRefresh<A extends CardRpsAdapter>(adapter: A, refresh: () => void): A {
  const seen = new Map<string, Status>();
  const note = (m: RpsMatchView) => {
    const changed = pointsMayChange(seen.get(m.matchId), m.status);
    seen.set(m.matchId, m.status);
    return changed;
  };
  const watch = async (result: Promise<RpsMatchView>) => { const m = await result; if (note(m)) refresh(); return m; };
  // 신청·응답·취소·나가기는 그 자체로 판돈을 맡기거나 돌려받는다 — 상태와 관계없이 다시 읽는다.
  const always = async (result: Promise<RpsMatchView>) => { const m = await result; note(m); refresh(); return m; };
  return {
    ...adapter,
    invite: (opponentId, stake) => always(adapter.invite(opponentId, stake)),
    respond: (matchId, accept) => always(adapter.respond(matchId, accept)),
    cancelInvite: async matchId => { await adapter.cancelInvite(matchId); seen.set(matchId, 'cancelled'); refresh(); },
    startNpc: () => watch(adapter.startNpc()),
    submitCards: (matchId, cards) => watch(adapter.submitCards(matchId, cards)),
    submitShootout: (matchId, hand) => watch(adapter.submitShootout(matchId, hand)),
    leave: matchId => always(adapter.leave(matchId)),
    // 구독을 놓쳤을 때 게임 화면이 다시 읽는 경기에서도 끝났으면 잔액을 맞춘다.
    getMatch: matchId => watch(adapter.getMatch(matchId)),
    subscribe: handlers => adapter.subscribe({ ...handlers, onMatch: m => { if (note(m)) refresh(); handlers.onMatch?.(m); } }),
  };
}
