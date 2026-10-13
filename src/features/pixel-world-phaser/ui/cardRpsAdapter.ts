import {
  RPS_FRIEND_STAKES, type CardRpsAdapter, type RpsErrorCode, type RpsFriendStake,
  type RpsInvite, type RpsMatchView, type RpsPlayerView,
} from '../logic/cardRpsContract';
import { RPS_HANDS, type RpsHand, type RpsInventory, type RpsRoundResult } from '../logic/cardRps';

type RpcResult = { data: unknown; error: unknown };
interface RealtimeChannelLike {
  on(type: 'postgres_changes', filter: Record<string, unknown>, callback: (payload: { new?: unknown; old?: unknown }) => void): RealtimeChannelLike;
  subscribe(callback?: (status: string) => void): RealtimeChannelLike;
}
export interface CardRpsSupabaseClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
  /** 받은 신청 확인용 표 읽기(참가자만 읽힌다 — RLS). 없으면 확인을 건너뛴다. */
  from?(table: 'pixel_card_rps_matches'): unknown;
  channel(name: string): RealtimeChannelLike;
  removeChannel(channel: RealtimeChannelLike): PromiseLike<unknown> | unknown;
}

const CODES: readonly RpsErrorCode[] = ['not_enough_points','busy','not_found','not_your_turn','invalid_cards','expired','self','offline','network'];
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const hand = (v: unknown): v is RpsHand => typeof v === 'string' && (RPS_HANDS as readonly string[]).includes(v);
const inventory = (v: unknown): v is RpsInventory => object(v) && RPS_HANDS.every(h => integer(v[h]) && (v[h] as number) >= 0 && (v[h] as number) <= 3);

export class CardRpsError extends Error {
  readonly code: RpsErrorCode;
  constructor(code: RpsErrorCode) { super(code); this.code = code; this.name = 'CardRpsError'; }
}
function errorCode(raw: unknown): RpsErrorCode {
  const value = object(raw) ? [raw.code, raw.message, raw.details, raw.hint].filter(x => typeof x === 'string').join(' ') : String(raw ?? '');
  return CODES.find(code => value.includes(code)) ?? 'network';
}
function player(v: unknown): RpsPlayerView | null {
  if (!object(v) || typeof v.id !== 'string' || !v.id || typeof v.nickname !== 'string' || typeof v.isNpc !== 'boolean'
    || !inventory(v.inventory) || !integer(v.wins) || v.wins < 0 || typeof v.submitted !== 'boolean') return null;
  return { id: v.id, nickname: v.nickname, isNpc: v.isNpc, inventory: v.inventory, wins: v.wins, submitted: v.submitted };
}
function rounds(v: unknown): RpsRoundResult[] | null {
  if (!Array.isArray(v)) return null;
  const out: RpsRoundResult[] = [];
  for (const r of v) {
    if (!object(r) || !Array.isArray(r.a) || !r.a.every(hand) || !Array.isArray(r.b) || !r.b.every(hand)
      || !['a','b','draw'].includes(String(r.winner)) || !Array.isArray(r.clashes)) return null;
    const clashes = r.clashes.flatMap(c => object(c) && integer(c.aIndex) && integer(c.bIndex) && hand(c.a) && hand(c.b)
      && ['a','b','draw'].includes(String(c.result)) ? [{ aIndex: c.aIndex, bIndex: c.bIndex, a: c.a, b: c.b, result: c.result as 'a'|'b'|'draw' }] : []);
    if (clashes.length !== r.clashes.length) return null;
    out.push({ a: r.a, b: r.b, winner: r.winner as 'a'|'b'|'draw', clashes });
  }
  return out;
}
export function parseRpsMatch(raw: unknown): RpsMatchView | null {
  if (!object(raw)) return null;
  const me = player(raw.me), opponent = player(raw.opponent), parsedRounds = rounds(raw.rounds);
  const shootout = Array.isArray(raw.shootout) ? raw.shootout.flatMap(s => object(s) && hand(s.a) && hand(s.b)
    && ['a','b','draw'].includes(String(s.result)) ? [{ a: s.a, b: s.b, result: s.result as 'a'|'b'|'draw' }] : []) : [];
  if (!me || !opponent || !parsedRounds || !Array.isArray(raw.shootout) || shootout.length !== raw.shootout.length
    || typeof raw.matchId !== 'string' || !['friend','npc'].includes(String(raw.mode))
    || !['invited','choosing','revealing','shootout','finished','declined','expired','cancelled'].includes(String(raw.status))
    || !integer(raw.stake) || raw.stake < 0 || !integer(raw.prize) || raw.prize < 0 || !integer(raw.round) || raw.round < 1
    || (raw.deadlineAt !== null && (!integer(raw.deadlineAt) || raw.deadlineAt < 0))
    || (raw.winnerId !== null && typeof raw.winnerId !== 'string')
    || (raw.endReason !== null && !['wins','shootout','timeout','left'].includes(String(raw.endReason)))
    || (raw.pointDelta !== null && !integer(raw.pointDelta))) return null;
  return { matchId: raw.matchId, mode: raw.mode as RpsMatchView['mode'], status: raw.status as RpsMatchView['status'], stake: raw.stake,
    prize: raw.prize, me, opponent, round: raw.round, rounds: parsedRounds, shootout, deadlineAt: raw.deadlineAt as number|null,
    winnerId: raw.winnerId as string|null, endReason: raw.endReason as RpsMatchView['endReason'], pointDelta: raw.pointDelta as number|null };
}

async function call(client: CardRpsSupabaseClient, fn: string, args?: Record<string, unknown>): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new CardRpsError('network')), 12_000); });
    const result = await Promise.race([Promise.resolve(client.rpc(fn, args)), timeout]);
    if (result.error) throw new CardRpsError(errorCode(result.error));
    return result.data;
  } catch (e) { if (e instanceof CardRpsError) throw e; throw new CardRpsError('network'); }
  finally { if (timer) clearTimeout(timer); }
}
async function matchCall(client: CardRpsSupabaseClient, fn: string, args?: Record<string, unknown>): Promise<RpsMatchView> {
  const parsed = parseRpsMatch(await call(client, fn, args));
  if (!parsed) throw new CardRpsError('network');
  return parsed;
}

const inviteOf = (m: RpsMatchView): RpsInvite => ({ matchId: m.matchId, from: { id: m.opponent.id, nickname: m.opponent.nickname }, stake: m.stake,
  expiresAt: m.deadlineAt ?? Date.now() + 30_000 });

export function createCardRpsAdapter(supabase: CardRpsSupabaseClient): CardRpsAdapter {
  /** 내 auth id(경기 응답의 me.id에서 배운다) — 받은 신청(player_b = 나)을 가려내는 데 쓴다. */
  let myId: string | null = null;
  /** 한 번 확인한 신청은 다시 RPC로 읽지 않는다(4초 확인이 RPC를 늘리지 않게). null = 내가 받은 신청이 아님. */
  const checked = new Map<string, RpsInvite | null>();
  const learn = (m: RpsMatchView) => { myId = m.me.id; return m; };
  const mc = (fn: string, args?: Record<string, unknown>) => matchCall(supabase, fn, args).then(learn);
  const adapter: CardRpsAdapter & { registerPresenceToken(): Promise<string> } = {
    async registerPresenceToken() {
      const value = await call(supabase, 'register_card_rps_presence');
      if (typeof value !== 'string') throw new CardRpsError('network');
      return value;
    },
    invite(opponentId, stake) {
      if (!opponentId || !(RPS_FRIEND_STAKES as readonly number[]).includes(stake)) return Promise.reject(new CardRpsError('not_found'));
      return mc('invite_card_rps_presence', { p_token: opponentId, p_stake: stake });
    },
    respond(matchId, accept) { return mc('respond_card_rps', { p_match_id: matchId, p_accept: accept }); },
    async cancelInvite(matchId) { await call(supabase, 'cancel_card_rps_invite', { p_match_id: matchId }); },
    startNpc() { return mc('start_npc_card_rps'); },
    submitCards(matchId, cards) {
      if (!Array.isArray(cards) || !cards.every(hand)) return Promise.reject(new CardRpsError('invalid_cards'));
      return mc('submit_card_rps_cards', { p_match_id: matchId, p_cards: cards });
    },
    submitShootout(matchId, value) {
      if (!hand(value)) return Promise.reject(new CardRpsError('invalid_cards'));
      return mc('submit_card_rps_shootout', { p_match_id: matchId, p_hand: value });
    },
    leave(matchId) { return mc('leave_card_rps', { p_match_id: matchId }); },
    getMatch(matchId) { return mc('get_card_rps_match', { p_match_id: matchId }); },
    async pendingInvite() {
      // 표 직접 읽기는 가볍다(인덱스 pixel_card_rps_invites, RLS로 내 경기만). 새 신청일 때만 RPC로 자세히 읽는다.
      if (!supabase.from) return null;
      let result: RpcResult;
      // supabase-js 쿼리 빌더의 깊은 제네릭 타입을 피해 필요한 모양만 적는다.
      const table = supabase.from('pixel_card_rps_matches') as { select(columns: string): { eq(column: string, value: string): PromiseLike<RpcResult> } };
      try { result = await table.select('id,player_b').eq('status', 'invited'); } catch { throw new CardRpsError('network'); }
      if (result.error || !Array.isArray(result.data)) throw new CardRpsError('network');
      for (const row of result.data) {
        if (!object(row) || typeof row.id !== 'string') continue;
        if (myId && row.player_b !== myId) continue;
        if (checked.has(row.id)) { const known = checked.get(row.id); if (known && known.expiresAt > Date.now()) return known; continue; }
        const m = await adapter.getMatch(row.id);
        const mine = m.status === 'invited' && m.mode === 'friend' && row.player_b === m.me.id ? inviteOf(m) : null;
        if (m.status === 'invited') checked.set(row.id, mine);
        if (mine) return mine;
      }
      return null;
    },
    async getActive() {
      const raw = await call(supabase, 'get_active_card_rps');
      if (raw === null) return null;
      const parsed = parseRpsMatch(raw); if (!parsed) throw new CardRpsError('network'); return learn(parsed);
    },
    subscribe(handlers) {
      let stopped = false;
      const channel = supabase.channel(`card-rps-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pixel_card_rps_matches' }, payload => {
          const row = object(payload.new) ? payload.new : object(payload.old) ? payload.old : null;
          const id = row && typeof row.id === 'string' ? row.id : null; if (!id || stopped) return;
          void adapter.getMatch(id).then(m => {
            if (stopped) return;
            handlers.onMatch?.(m);
            if (m.status !== 'invited' || m.mode !== 'friend') return;
            // 실시간 행에 player_b가 없으면(열이 빠진 알림) 표를 읽어 내가 받은 신청인지 확인한다.
            if (typeof row?.player_b === 'string') { if (row.player_b === m.me.id) handlers.onInvite?.(inviteOf(m)); return; }
            void adapter.pendingInvite?.().then(invite => { if (!stopped && invite) handlers.onInvite?.(invite); }).catch(() => undefined);
          }).catch(() => undefined);
        }).subscribe(status => {
          // 처음 연결·끊겼다 다시 연결됐을 때: 그동안 온 신청은 실시간으로 다시 오지 않으니 직접 확인한다.
          if (status !== 'SUBSCRIBED' || stopped || !handlers.onInvite) return;
          void adapter.pendingInvite?.().then(invite => { if (!stopped && invite) handlers.onInvite?.(invite); }).catch(() => undefined);
        });
      return () => { stopped = true; void supabase.removeChannel(channel); };
    },
  };
  return adapter;
}

export type { RpsFriendStake };

const SETTLED: readonly RpsMatchView['status'][] = ['finished', 'declined', 'expired', 'cancelled'];
/**
 * 카드 대결은 서버가 point_adjustment를 바꾼다(판돈 맡김·돌려받기·상금). 예전엔 화면(App) 잔액을 다시 맞추지 않아
 * HUD 숫자가 서버와 달라졌고, 그 뒤 럭키상점 차감이 오래된 값으로 서버를 덮어쓸 수도 있었다.
 * 포인트가 움직일 수 있는 때(신청·응답·취소, 경기가 끝난 상태를 처음 볼 때, 포인트 부족 거절)에 refresh를 부른다.
 */
export function withPointRefresh<A extends CardRpsAdapter>(adapter: A, refresh: () => void): A {
  const settled = new Set<string>();
  const seen = (m: RpsMatchView) => {
    if (SETTLED.includes(m.status) && !settled.has(m.matchId)) { settled.add(m.matchId); refresh(); }
    return m;
  };
  const after = <T>(promise: Promise<T>, always: boolean): Promise<T> => promise.then(value => {
    if (always) refresh(); else if (value && typeof value === 'object' && 'matchId' in value) seen(value as unknown as RpsMatchView);
    return value;
  }, (error: unknown) => {
    if (error instanceof CardRpsError && error.code === 'not_enough_points') refresh();
    throw error;
  });
  return {
    ...adapter,
    invite: (opponentId, stake) => after(adapter.invite(opponentId, stake), true),
    respond: (matchId, accept) => after(adapter.respond(matchId, accept), true),
    cancelInvite: matchId => after(adapter.cancelInvite(matchId), true),
    startNpc: () => after(adapter.startNpc(), false),
    submitCards: (matchId, cards) => after(adapter.submitCards(matchId, cards), false),
    submitShootout: (matchId, value) => after(adapter.submitShootout(matchId, value), false),
    leave: matchId => after(adapter.leave(matchId), false),
    getMatch: matchId => after(adapter.getMatch(matchId), false),
    getActive: () => adapter.getActive().then(m => m && seen(m)),
    subscribe: handlers => adapter.subscribe({ ...handlers, onMatch: m => { seen(m); handlers.onMatch?.(m); } }),
  };
}
