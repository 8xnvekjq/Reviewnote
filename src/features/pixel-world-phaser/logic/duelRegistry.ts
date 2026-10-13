// 광장 카드 대결 말풍선(✊ ✌️ ✋)의 "누가 지금 대결 중인가" 장부(순수 모듈).
// 경기(matchId)마다 참가자 세션들을 묶어 둔다 — 끝 알림은 두 사람 중 누가 보내도 그 경기의 모두를 지운다.
// 알림 하나가 사라져도 남지 않게: 진행 중인 쪽이 주기적으로 다시 알리고(하트비트), 오래 안 들리면 지운다(TTL).
import type { RpsDuelPayload } from './cardRpsContract';

/** 진행 중인 경기의 참가자가 이 간격으로 "아직 대결 중" 을 다시 알린다. */
export const RPS_DUEL_HEARTBEAT_MS = 20_000;
/** 이만큼 아무 알림도 없으면 그 경기 말풍선을 지운다(하트비트 세 번을 놓친 셈). */
export const RPS_DUEL_TTL_MS = 60_000;
/** 끝난 경기 기억(늦게 온 "대결 중" 무시용)을 이만큼 지나면 버린다. */
export const RPS_DUEL_ENDED_KEEP_MS = 10 * 60_000;

export interface DuelMatch {
  sessionIds: string[];
  /** 말풍선 stamp — 처음 알게 된 시각(내 시계). 하트비트로 바뀌지 않아 풍선이 다시 그려지지 않는다. */
  since: number;
  /** 마지막으로 들은 시각(내 시계) — TTL 판정. */
  seenAt: number;
}
export interface DuelRegistry {
  matches: Readonly<Record<string, DuelMatch>>;
  /** 끝난 경기 → 끝을 들은 시각(내 시계). */
  ended: Readonly<Record<string, number>>;
}
export const EMPTY_DUELS: DuelRegistry = { matches: {}, ended: {} };

/** 받은 broadcast를 그대로 넘겨도 된다 — 모양이 틀리면 null(무시). 예전 클라이언트의 `sessionIds:[나]` 도 받는다. */
export function parseDuelPayload(raw: unknown): RpsDuelPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<RpsDuelPayload>;
  if (typeof p.matchId !== 'string' || !p.matchId || typeof p.active !== 'boolean' || !Array.isArray(p.sessionIds)) return null;
  const ids = [...new Set(p.sessionIds.filter((id): id is string => typeof id === 'string' && !!id))].slice(0, 2);
  if (!ids.length) return null;
  return { matchId: p.matchId, sessionIds: ids as RpsDuelPayload['sessionIds'], active: p.active, at: typeof p.at === 'number' ? p.at : 0 };
}

/** "대결 중"(active:true) 또는 "끝"(active:false) 알림 하나를 반영한다. now = 받은 시각(내 시계). */
export function applyDuel(registry: DuelRegistry, payload: RpsDuelPayload, now: number): DuelRegistry {
  return payload.active ? addDuel(registry, payload.matchId, payload.sessionIds, now) : endDuel(registry, payload.matchId, now);
}

/** 경기 시작·하트비트. 이미 끝난 경기는 되살리지 않는다 — 경기 id는 다시 쓰이지 않으므로, 끝 알림 뒤에
 * 늦게 도착한 "대결 중" 은 보낸 시각과 상관없이 모두 옛것이다(두 기기 시계가 어긋나도 안전). */
export function addDuel(registry: DuelRegistry, matchId: string, sessionIds: readonly string[], now: number): DuelRegistry {
  if (matchId in registry.ended) return registry;
  const current = registry.matches[matchId];
  const ids = [...new Set([...(current?.sessionIds ?? []), ...sessionIds])];
  const matches: Record<string, DuelMatch> = {};
  // 한 사람은 한 번에 한 경기만 한다 — 끝 알림을 놓친 예전 경기에서 이 사람들을 뺀다.
  for (const [id, match] of Object.entries(registry.matches)) {
    if (id === matchId) continue;
    const rest = match.sessionIds.filter(s => !ids.includes(s));
    if (rest.length) matches[id] = rest.length === match.sessionIds.length ? match : { ...match, sessionIds: rest };
  }
  matches[matchId] = { sessionIds: ids, since: current?.since ?? now, seenAt: now };
  return { matches, ended: registry.ended };
}

/** 경기 끝(누가 보냈든, 내 쪽에서 끝났든) — 그 경기의 모든 참가자 말풍선을 지운다. */
export function endDuel(registry: DuelRegistry, matchId: string, now: number): DuelRegistry {
  const { [matchId]: _gone, ...matches } = registry.matches;
  return { matches, ended: { ...registry.ended, [matchId]: now } };
}

/** 광장을 떠난 사람(presence leave / bye)이 낀 경기를 지운다 — 상대 말풍선도 함께(대결은 끝난 것). */
export function leaveDuels(registry: DuelRegistry, sessionIds: Iterable<string>): DuelRegistry {
  const gone = new Set(sessionIds);
  const entries = Object.entries(registry.matches);
  if (!entries.some(([, m]) => m.sessionIds.some(s => gone.has(s)))) return registry;
  return { matches: Object.fromEntries(entries.filter(([, m]) => !m.sessionIds.some(s => gone.has(s)))), ended: registry.ended };
}

/** 오래 안 들린 경기와 오래된 끝 기억을 버린다. 바뀐 게 없으면 같은 객체를 돌려준다. */
export function expireDuels(registry: DuelRegistry, now: number, ttl = RPS_DUEL_TTL_MS, keepEnded = RPS_DUEL_ENDED_KEEP_MS): DuelRegistry {
  const matches = Object.entries(registry.matches), ended = Object.entries(registry.ended);
  const liveMatches = matches.filter(([, m]) => now - m.seenAt < ttl), liveEnded = ended.filter(([, at]) => now - at < keepEnded);
  if (liveMatches.length === matches.length && liveEnded.length === ended.length) return registry;
  return { matches: Object.fromEntries(liveMatches), ended: Object.fromEntries(liveEnded) };
}

/** 말풍선용: 세션 → stamp. */
export function duelStamps(registry: DuelRegistry): Record<string, number> {
  const out: Record<string, number> = {};
  for (const match of Object.values(registry.matches)) for (const id of match.sessionIds) out[id] = match.since;
  return out;
}

/** 내가 보낼 알림의 참가자 목록: 나 + 이 경기에서 알게 된 상대(있으면). */
export function duelSessionsFor(registry: DuelRegistry, matchId: string, me: string): RpsDuelPayload['sessionIds'] {
  const other = registry.matches[matchId]?.sessionIds.find(id => id !== me);
  return other ? [me, other] : [me];
}
