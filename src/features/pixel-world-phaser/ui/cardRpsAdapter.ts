import {
  RPS_FRIEND_STAKES, type CardRpsAdapter, type RpsErrorCode, type RpsFriendStake,
  type RpsInvite, type RpsMatchView, type RpsPlayerView,
} from '../logic/cardRpsContract';
import { RPS_HANDS, type RpsHand, type RpsInventory, type RpsRoundResult } from '../logic/cardRps';

type RpcResult = { data: unknown; error: unknown };
interface RealtimeChannelLike {
  on(type: 'postgres_changes', filter: Record<string, unknown>, callback: (payload: { new?: unknown; old?: unknown }) => void): RealtimeChannelLike;
  subscribe(): RealtimeChannelLike;
}
export interface CardRpsSupabaseClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
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

export function createCardRpsAdapter(supabase: CardRpsSupabaseClient): CardRpsAdapter {
  const adapter: CardRpsAdapter & { registerPresenceToken(): Promise<string> } = {
    async registerPresenceToken() {
      const value = await call(supabase, 'register_card_rps_presence');
      if (typeof value !== 'string') throw new CardRpsError('network');
      return value;
    },
    invite(opponentId, stake) {
      if (!opponentId || !(RPS_FRIEND_STAKES as readonly number[]).includes(stake)) return Promise.reject(new CardRpsError('not_found'));
      return matchCall(supabase, 'invite_card_rps_presence', { p_token: opponentId, p_stake: stake });
    },
    respond(matchId, accept) { return matchCall(supabase, 'respond_card_rps', { p_match_id: matchId, p_accept: accept }); },
    async cancelInvite(matchId) { await call(supabase, 'cancel_card_rps_invite', { p_match_id: matchId }); },
    startNpc() { return matchCall(supabase, 'start_npc_card_rps'); },
    submitCards(matchId, cards) {
      if (!Array.isArray(cards) || !cards.every(hand)) return Promise.reject(new CardRpsError('invalid_cards'));
      return matchCall(supabase, 'submit_card_rps_cards', { p_match_id: matchId, p_cards: cards });
    },
    submitShootout(matchId, value) {
      if (!hand(value)) return Promise.reject(new CardRpsError('invalid_cards'));
      return matchCall(supabase, 'submit_card_rps_shootout', { p_match_id: matchId, p_hand: value });
    },
    leave(matchId) { return matchCall(supabase, 'leave_card_rps', { p_match_id: matchId }); },
    getMatch(matchId) { return matchCall(supabase, 'get_card_rps_match', { p_match_id: matchId }); },
    async getActive() {
      const raw = await call(supabase, 'get_active_card_rps');
      if (raw === null) return null;
      const parsed = parseRpsMatch(raw); if (!parsed) throw new CardRpsError('network'); return parsed;
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
            if (m.status === 'invited' && row?.player_b === m.me.id) {
              const invite: RpsInvite = { matchId: m.matchId, from: { id: m.opponent.id, nickname: m.opponent.nickname }, stake: m.stake,
                expiresAt: m.deadlineAt ?? Date.now() + 30_000 };
              handlers.onInvite?.(invite);
            }
          }).catch(() => undefined);
        }).subscribe();
      return () => { stopped = true; void supabase.removeChannel(channel); };
    },
  };
  return adapter;
}

export type { RpsFriendStake };
