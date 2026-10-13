// 광장 친구 카드 대결 신청 받기·보내기의 순수 규칙(2026-10-13 선생님 제보: 신청 창이 가끔 안 뜸·포인트 부족).
// 신청 알림은 세 길로 온다(실시간 DB 변경·광장 broadcast·4초 확인). 같은 신청은 한 번만 띄운다.
import type { RpsErrorCode, RpsInvite } from './cardRpsContract';

/** 신청한 쪽이 광장에 바로 알리는 이벤트(두 번째 전달 길). 사용자 id는 싣지 않는다. */
export const RPS_INVITE_EVENT = 'rps-invite';
export interface RpsInvitePayload { matchId: string; toSessionId: string; at: number }
/** 광장에서 쉬는 동안 받은 신청을 다시 확인하는 간격(실시간 알림을 놓쳤을 때). */
export const RPS_INVITE_POLL_MS = 4_000;
/** 창이 뜬 직후 이 시간 동안은 버튼을 막는다(연타하던 손가락이 바로 수락/거절을 누르지 않게). */
export const RPS_DIALOG_GUARD_MS = 300;

const UUIDISH = /^[0-9a-zA-Z-]{1,64}$/;
export function parseInvitePayload(raw: unknown): RpsInvitePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.matchId !== 'string' || !UUIDISH.test(v.matchId) || typeof v.toSessionId !== 'string' || !UUIDISH.test(v.toSessionId)
    || typeof v.at !== 'number' || !Number.isFinite(v.at)) return null;
  return { matchId: v.matchId, toSessionId: v.toSessionId, at: v.at };
}

/** 받은 신청함: 이미 띄웠거나 답한 경기는 다시 띄우지 않는다. */
export interface InviteInbox { readonly handled: ReadonlySet<string>; readonly current: RpsInvite | null }
export const EMPTY_INBOX: InviteInbox = { handled: new Set(), current: null };
/** 새로 들어온 신청을 받을지. 이미 처리했거나 만료됐거나 같은 신청이 떠 있으면 그대로 둔다. */
export function offerInvite(inbox: InviteInbox, invite: RpsInvite, now: number): InviteInbox {
  if (inbox.handled.has(invite.matchId) || invite.expiresAt <= now) return inbox;
  if (inbox.current?.matchId === invite.matchId) return inbox;
  // 다른 신청이 떠 있는 중이면(드묾: 서버는 한 사람에게 신청 하나만 허락) 새것으로 바꾼다 — 예전 것은 서버에서 이미 끝났다.
  return { handled: inbox.handled, current: invite };
}
/** 수락·거절·시간 끝으로 창을 닫는다. 같은 경기 신청은 다시 뜨지 않는다. */
export function settleInvite(inbox: InviteInbox, matchId: string): InviteInbox {
  const handled = new Set(inbox.handled); handled.add(matchId);
  return { handled, current: inbox.current?.matchId === matchId ? null : inbox.current };
}
/** 시간이 지난 신청은 내린다(다시 뜨지 않게 처리한 것으로 친다). */
export function expireInvite(inbox: InviteInbox, now: number): InviteInbox {
  return inbox.current && inbox.current.expiresAt <= now ? settleInvite(inbox, inbox.current.matchId) : inbox;
}

/** HUD 잔액으로 걸 수 있는 판돈인지(서버와 같은 정의: max(0, bonus_points + point_adjustment) ≥ 판돈). */
export function canAffordStake(stake: number, balance: number): boolean {
  return Math.max(0, Number.isFinite(balance) ? balance : 0) >= stake;
}

export const RPS_NOT_ENOUGH_POINTS = '포인트가 부족해요';
/** 친구 대결 신청·수락 실패 안내. 예전엔 조용히 넘어가서 "신청했는데 친구 창이 안 뜬다"로 보였다. */
export function rpsInviteErrorText(code: RpsErrorCode | string, role: 'invite' | 'accept'): string {
  if (code === 'not_enough_points') return role === 'accept' ? '포인트가 부족해서 수락할 수 없어요' : RPS_NOT_ENOUGH_POINTS;
  if (code === 'busy') return role === 'accept' ? '다른 대결이 진행 중이라 수락할 수 없어요.' : '친구가 지금 다른 대결 중이에요.';
  if (code === 'offline') return '친구가 광장을 떠났어요.';
  if (code === 'expired' || code === 'not_found' || code === 'not_your_turn') return role === 'accept' ? '신청 시간이 지났어요.' : '신청하지 못했어요. 다시 해 주세요.';
  if (code === 'self') return '나에게는 신청할 수 없어요.';
  return role === 'accept' ? '연결이 불안정해서 수락하지 못했어요.' : '연결이 불안정해서 신청하지 못했어요.';
}
