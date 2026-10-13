// 카드 가위바위보 서버·화면 공용 약속(2026-10-13). 규칙은 cardRps.ts.
// 서버(rps-server)는 이 모양으로 응답하고, 화면(rps-ui)은 이 어댑터만 보고 만든다(진짜/가짜 어댑터 교체).
import type { RpsHand, RpsInventory, RpsRoundResult } from './cardRps';

/** 친구 대결: 둘이 같은 금액을 걸고 이긴 쪽이 모두 가져간다(판돈 ×2). 하루 게임 포인트 상한과 무관. 임시 수치. */
export const RPS_FRIEND_STAKES = [10, 20, 50] as const;
export type RpsFriendStake = (typeof RPS_FRIEND_STAKES)[number];
export const RPS_FRIEND_DEFAULT_STAKE: RpsFriendStake = 20;
/** NPC 대결은 무료(참가비 0). */
export const RPS_NPC_ENTRY = 0;
/** NPC 보상: 하루 첫 승리(KST)만 받는다. 그날 이후 승리는 보상 없는 연습 판, 다음 날 다시 받는다. 임시 수치. */
export const RPS_NPC_REWARD = 20;
/** 친구 신청 응답 대기 시간. 지나면 신청이 사라지고 맡긴 포인트는 돌려준다. */
export const RPS_INVITE_MS = 30_000;

/** NPC: 귀여운 쥐 딜러. 광장 카드 테이블에 앉아 있다. */
export const RPS_NPC = { id: 'npc_mouse', name: '치즈', title: '카드 딜러' } as const;

export type RpsMode = 'friend' | 'npc';
export type RpsMatchStatus = 'invited' | 'choosing' | 'revealing' | 'shootout' | 'finished' | 'declined' | 'expired' | 'cancelled';
export type RpsEndReason = 'wins' | 'shootout' | 'timeout' | 'left';

export interface RpsPlayerView {
  /** 사람이면 auth user id, NPC면 RPS_NPC.id */
  id: string;
  nickname: string;
  isNpc: boolean;
  /** 남은 카드 수 — 공개 정보(낸 카드는 판마다 공개되므로 계산 가능). */
  inventory: RpsInventory;
  wins: number;
  /** 이번 판(또는 승부차기 차례)에 이미 냈는지. 무엇을 냈는지는 둘 다 낼 때까지 서버가 숨긴다. */
  submitted: boolean;
}

/** 서버가 돌려주는 경기 상태. 항상 "나" 기준(me/opponent). */
export interface RpsMatchView {
  matchId: string;
  mode: RpsMode;
  status: RpsMatchStatus;
  /** 친구: 1인당 판돈, NPC: 0(무료) */
  stake: number;
  /** 이기면 받는 포인트(친구: stake×2, NPC: 오늘(KST) 첫 승리 전이면 RPS_NPC_REWARD, 그날은 그 뒤 0) */
  prize: number;
  me: RpsPlayerView;
  opponent: RpsPlayerView;
  /** 지금 몇 번째 판(1부터). 승부차기 중에도 마지막 판 번호. */
  round: number;
  /** 공개가 끝난 판들. resolveRound 결과와 같은 모양, a = 나, b = 상대. */
  rounds: RpsRoundResult[];
  /** 승부차기 기록(a = 나, b = 상대). */
  shootout: { a: RpsHand; b: RpsHand; result: 'a' | 'b' | 'draw' }[];
  /** 이번 차례 제출 마감 시각(ms, 서버 시계). */
  deadlineAt: number | null;
  winnerId: string | null;
  endReason: RpsEndReason | null;
  /** 끝났을 때 내 포인트 변화(+/-), 그 전엔 null. */
  pointDelta: number | null;
}

export interface RpsInvite { matchId: string; from: { id: string; nickname: string }; stake: number; expiresAt: number }

export type RpsErrorCode =
  | 'not_enough_points' | 'busy' | 'not_found' | 'not_your_turn' | 'invalid_cards'
  | 'expired' | 'self' | 'offline' | 'network';

export interface CardRpsAdapter {
  /** 친구에게 신청(판돈을 맡김). */
  invite(opponentId: string, stake: RpsFriendStake): Promise<RpsMatchView>;
  /** 받은 신청에 응답(수락하면 판돈을 맡김). */
  respond(matchId: string, accept: boolean): Promise<RpsMatchView>;
  /** 보낸 신청 취소(맡긴 판돈 돌려받음). */
  cancelInvite(matchId: string): Promise<void>;
  /** 쥐 딜러와 대결 시작(무료). */
  startNpc(): Promise<RpsMatchView>;
  /** 이번 판에 낼 카드(순서대로). */
  submitCards(matchId: string, cards: RpsHand[]): Promise<RpsMatchView>;
  /** 승부차기 한 손. */
  submitShootout(matchId: string, hand: RpsHand): Promise<RpsMatchView>;
  /** 나가기(기권). */
  leave(matchId: string): Promise<RpsMatchView>;
  getMatch(matchId: string): Promise<RpsMatchView>;
  /** 진행 중이거나 응답 대기 중인 내 경기(다시 들어왔을 때 이어 하기). */
  getActive(): Promise<RpsMatchView | null>;
  /** 나에게 온, 아직 답하지 않은 친구 신청(실시간 알림을 놓쳤을 때 확인용). 없으면 null. */
  pendingInvite?(): Promise<RpsInvite | null>;
  /** 내 경기 변화·받은 신청 알림. 해제 함수를 돌려준다. */
  subscribe(handlers: { onMatch?: (m: RpsMatchView) => void; onInvite?: (i: RpsInvite) => void }): () => void;
}

/** 광장 실시간 broadcast: 둘이 대결 중이면 두 캐릭터 머리 위에 가위바위보 말풍선(구경꾼 표시). */
export const RPS_DUEL_EVENT = 'rps-duel';
export interface RpsDuelPayload { matchId: string; sessionIds: [string, string] | [string]; active: boolean; at: number }
