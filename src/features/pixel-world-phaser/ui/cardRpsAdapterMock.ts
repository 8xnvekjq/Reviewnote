import {
  createMatch, forfeit, npcChooseCards, npcShootoutHand, playRound, playShootout, RPS_TURN_MS, seededRng,
  type RpsHand, type RpsMatchState,
} from '../logic/cardRps';
import {
  RPS_INVITE_MS, RPS_NPC, RPS_NPC_ENTRY, RPS_NPC_REWARD,
  type CardRpsAdapter, type RpsFriendStake, type RpsInvite, type RpsMatchStatus, type RpsMatchView,
} from '../logic/cardRpsContract';

export interface MockCardRpsOptions { now?: () => number; seed?: number; latencyMs?: number; playerName?: string }
export interface MockCardRpsAdapter extends CardRpsAdapter { readonly history: readonly RpsMatchView[] }

export function createMockCardRpsAdapter(options: MockCardRpsOptions = {}): MockCardRpsAdapter {
  const now = options.now ?? Date.now;
  const rng = seededRng(options.seed ?? 20261013);
  const latency = options.latencyMs ?? 0;
  let serial = 0;
  let active: LocalMatch | null = null;
  /** 가짜 사용자가 치즈를 한 번이라도 이겼는지 — 첫 승리만 보상. */
  let wonNpcOnce = false;
  const history: RpsMatchView[] = [];
  const matchHandlers = new Set<(match: RpsMatchView) => void>();
  const inviteHandlers = new Set<(invite: RpsInvite) => void>();
  const delay = async <T>(value: T): Promise<T> => latency ? new Promise(resolve => setTimeout(() => resolve(value), latency)) : value;

  const publish = (match: LocalMatch) => {
    if (match.mode === 'npc' && match.status === 'finished' && match.state.winner === 'a' && !match.paid) { match.paid = true; wonNpcOnce = true; }
    const view = toView(match, now());
    history.push(view);
    matchHandlers.forEach(handler => handler(view));
    return view;
  };
  const get = (id: string) => {
    if (!active || active.id !== id) throw new Error('not_found');
    return active;
  };
  const start = (mode: 'npc' | 'friend', stake: number, opponentId: string, opponentName: string) => {
    const prize = mode === 'npc' ? (wonNpcOnce ? 0 : RPS_NPC_REWARD) : stake * 2;
    active = { id: `mock-rps-${++serial}`, mode, stake, prize, paid: false, state: createMatch(), opponentId, opponentName, status: 'choosing', deadlineAt: now() + RPS_TURN_MS, endReason: null };
    return active;
  };
  const settleRound = (match: LocalMatch, mine: readonly RpsHand[]) => {
    const theirs = npcChooseCards(match.state, 'b', rng);
    match.state = playRound(match.state, mine, theirs);
    match.status = match.state.phase === 'finished' ? 'finished' : match.state.phase === 'shootout' ? 'shootout' : 'choosing';
    match.deadlineAt = match.status === 'finished' ? null : now() + RPS_TURN_MS;
    if (match.status === 'finished') match.endReason = 'wins';
  };
  const api: MockCardRpsAdapter = {
    get history() { return history; },
    async invite(opponentId: string, stake: RpsFriendStake) {
      const match = start('friend', stake, opponentId, '연습 상대');
      // 가짜 상대는 즉시 수락하여 화면 흐름을 끝까지 시험할 수 있게 한다.
      return delay(publish(match));
    },
    async respond(matchId: string, accept: boolean) {
      const match = get(matchId);
      match.status = accept ? 'choosing' : 'declined';
      match.deadlineAt = accept ? now() + RPS_TURN_MS : null;
      return delay(publish(match));
    },
    async cancelInvite(matchId: string) { const match = get(matchId); match.status = 'cancelled'; match.deadlineAt = null; publish(match); },
    async startNpc() { return delay(publish(start('npc', RPS_NPC_ENTRY, RPS_NPC.id, RPS_NPC.name))); },
    async submitCards(matchId: string, cards: RpsHand[]) {
      const match = get(matchId);
      if (match.status !== 'choosing') throw new Error('not_your_turn');
      settleRound(match, cards);
      return delay(publish(match));
    },
    async submitShootout(matchId: string, hand: RpsHand) {
      const match = get(matchId);
      if (match.status !== 'shootout') throw new Error('not_your_turn');
      match.state = playShootout(match.state, hand, npcShootoutHand(rng));
      match.status = match.state.phase === 'finished' ? 'finished' : 'shootout';
      match.deadlineAt = match.status === 'finished' ? null : now() + RPS_TURN_MS;
      if (match.status === 'finished') match.endReason = 'shootout';
      return delay(publish(match));
    },
    async leave(matchId: string) {
      const match = get(matchId);
      match.state = forfeit(match.state, 'a'); match.status = 'finished'; match.endReason = 'left'; match.deadlineAt = null;
      return delay(publish(match));
    },
    async getMatch(matchId: string) { return delay(toView(get(matchId), now())); },
    async getActive() { return delay(active && !['finished', 'declined', 'expired', 'cancelled'].includes(active.status) ? toView(active, now()) : null); },
    subscribe(handlers) {
      if (handlers.onMatch) matchHandlers.add(handlers.onMatch);
      if (handlers.onInvite) inviteHandlers.add(handlers.onInvite);
      return () => { if (handlers.onMatch) matchHandlers.delete(handlers.onMatch); if (handlers.onInvite) inviteHandlers.delete(handlers.onInvite); };
    },
  };
  void RPS_INVITE_MS; // 계약의 초대 만료 시간과 같은 가짜 알림 구현을 확장할 때 사용한다.
  return api;
}

interface LocalMatch {
  id: string; mode: 'npc' | 'friend'; stake: number; prize: number; paid: boolean; state: RpsMatchState;
  opponentId: string; opponentName: string; status: RpsMatchStatus; deadlineAt: number | null;
  endReason: RpsMatchView['endReason'];
}

function toView(match: LocalMatch, _now: number): RpsMatchView {
  const finished = match.status === 'finished';
  const winnerId = !finished || !match.state.winner ? null : match.state.winner === 'a' ? 'mock-user' : match.opponentId;
  const won = winnerId === 'mock-user';
  return {
    matchId: match.id, mode: match.mode, status: match.status, stake: match.stake,
    prize: match.prize,
    me: { id: 'mock-user', nickname: '나', isNpc: false, inventory: { ...match.state.inventory.a }, wins: match.state.wins.a, submitted: false },
    opponent: { id: match.opponentId, nickname: match.opponentName, isNpc: match.mode === 'npc', inventory: { ...match.state.inventory.b }, wins: match.state.wins.b, submitted: match.status === 'revealing' },
    round: match.state.rounds.length + (finished ? 0 : 1), rounds: match.state.rounds,
    shootout: match.state.shootout.map(item => ({ ...item, result: item.result })), deadlineAt: match.deadlineAt,
    winnerId, endReason: match.endReason,
    pointDelta: finished ? (match.mode === 'npc' ? (won ? match.prize : 0) : won ? match.stake : -match.stake) : null,
  };
}
