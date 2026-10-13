import { NET_SWING_EVENT } from '../logic/bugCatalog';
import { parseNetSwing } from '../logic/bugGame';
import { dragonfliesFor } from '../game/dragonflies';
import type { NetSwingReporter } from './useBugCatching';
import type { MutableRefObject as SwingRef } from 'react';
// 광장에 있을 때만 마운트한다. 기존 훅의 구독/재연결/퇴장 정리를 그대로 재사용한다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { usePlazaRealtime } from '../../pixel-room/plaza/usePlazaRealtime';
import { useSmoothedPlayerPositions } from '../../pixel-room/plaza/useSmoothedPlayerPositions';
import { continuousPayload, continuousPosition } from '../../pixel-room/plaza/presenceProtocol';
import { REACTIONS, REACTION_MS, dailyWellMessage, plazaDay, wellStorageKey } from '../../pixel-room/plaza/plazaInteractions';
import { fetchWeeklyCropContest } from '../../../utils/pixelFarm';
import { weeklyRankLabel } from '../../pixel-room/farm/farmModel';
import type { WeeklyCropContest } from '../../pixel-room/farm/farmModel';
import type { PublicAvatarAppearance } from '../../pixel-room/shop/types';
import type { PlazaPlayerState } from '../../pixel-room/plaza/types';
import type { PetId } from '../../pixel-room/pet/petKinds';
import type { WorldGameHandle } from '../game/boot';
import type { PlazaBubble } from '../game/plazaBubbles';
import { Window } from './GamePanels';
import { PlazaChat } from './PlazaChat';
import { pickDuelTarget } from '../logic/plazaDuel';
import { RPS_DUEL_EVENT, RPS_FRIEND_STAKES, type CardRpsAdapter, type RpsDuelPayload, type RpsFriendStake, type RpsInvite, type RpsMatchView } from '../logic/cardRpsContract';
import { EMPTY_INBOX, RPS_DIALOG_GUARD_MS, RPS_INVITE_EVENT, RPS_INVITE_POLL_MS, RPS_NOT_ENOUGH_POINTS, canAffordStake, expireInvite, offerInvite, parseInvitePayload, rpsInviteErrorText, settleInvite, type InviteInbox, type RpsInvitePayload } from '../logic/rpsInvite';
import { EMPTY_DUELS, RPS_DUEL_HEARTBEAT_MS, applyDuel, duelSessionsFor, duelStamps, endDuel, expireDuels, leaveDuels, parseDuelPayload, type DuelRegistry } from '../logic/duelRegistry';
export type PlazaPanel = 'contest' | 'well' | 'bench';
const RPS_LIVE: readonly RpsMatchView['status'][] = ['choosing', 'revealing', 'shootout'];
const RPS_OVER: readonly RpsMatchView['status'][] = ['finished', 'declined', 'expired', 'cancelled'];
/** 대결 장부 점검(TTL·하트비트·못 보낸 끝 알림 다시 보내기) 간격. */
const DUEL_TICK_MS = 5_000;
const errorCode = (error: unknown) => {
  const value = error && typeof error === 'object' ? (error as { code?: unknown; message?: unknown }) : null;
  return typeof value?.code === 'string' ? value.code : typeof value?.message === 'string' ? value.message : 'network';
};
export function PlazaBridge({ handle, appearance, pet, riding, face, tool, userId, panel, blocked = false, balance, onClose, swingReporter, rpsEndReporter, rpsAdapter, onOpenRps }: {
  /** HUD 포인트(서버와 같은 정의) — 걸 수 없는 판돈을 미리 막는다. 모르면 막지 않는다(서버가 다시 확인). */
  balance?: number;
  swingReporter: SwingRef<NetSwingReporter | null>;
  /** 카드 대결 화면이 경기 끝(결과)을 알릴 때 부른다 — 광장 구독이 끝 소식을 놓쳐도 말풍선을 지운다. */
  rpsEndReporter?: SwingRef<((matchId: string) => void) | null>;
  handle: RefObject<WorldGameHandle | null>; appearance: PublicAvatarAppearance; pet: PetId | null; riding: boolean; face?: string; /** 손에 든 도구 표시(친구 화면에 그린다). */ tool?: string;
  userId: string; panel: string | null; /** 대화창 등 패널 말고도 화면을 막는 것이 열려 있다. */ blocked?: boolean; onClose: () => void; rpsAdapter: CardRpsAdapter; onOpenRps(opponentAppearance?: PublicAvatarAppearance): void;
}) {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [initial] = useState(() => {
    const d = handle.current?.debug();
    return { ...continuousPayload(d ?? { x: 216, y: 248 }), direction: d?.facing ?? 'Back' as const, moving: d?.moving ?? false, pet, face, riding: d?.riding ?? false };
  });
  const roster = useRef(new Set<string>());
  const [challenge, setChallenge] = useState<{ token: string; appearance: PublicAvatarAppearance; sessionId: string } | null>(null);
  /** 판돈 창: 보내는 중(버튼 막기)과 실패 안내(창 안에 보여 준다 — 예전엔 조용히 닫혀 "신청했는데 친구 창이 안 뜬다"로 보였다). */
  const [challengeState, setChallengeState] = useState<{ sending: boolean; error: string }>({ sending: false, error: '' });
  // 받은 신청함(같은 경기는 한 번만 띄운다). 실시간 알림·광장 broadcast·4초 확인 세 길이 모두 여기로 온다.
  const inboxRef = useRef<InviteInbox>(EMPTY_INBOX);
  const [inbox, setInbox] = useState<InviteInbox>(EMPTY_INBOX);
  const changeInbox = useCallback((change: (box: InviteInbox) => InviteInbox) => {
    const next = change(inboxRef.current);
    if (next !== inboxRef.current) { inboxRef.current = next; setInbox(next); }
  }, []);
  const offer = useCallback((value: RpsInvite) => changeInbox(box => offerInvite(box, value, Date.now())), [changeInbox]);
  const invite = inbox.current;
  const [inviteState, setInviteState] = useState<{ matchId: string; sending: boolean; error: string; short: boolean } | null>(null);
  const [notice, setNotice] = useState('');
  const inviteCheck = useRef<(matchId?: string) => void>(() => {});
  const duelOpponents = useRef(new Map<string, PublicAvatarAppearance>());
  const plazaPlayers = useRef(new Map<string, PlazaPlayerState>());
  const [duelToken, setDuelToken] = useState<string>();
  // 대결 말풍선 장부(경기별 참가자). 콜백에서 바로 읽도록 ref가 원본, state는 다시 그리기용.
  const duelBook = useRef<DuelRegistry>(EMPTY_DUELS);
  const [duelRegistry, setDuelRegistry] = useState<DuelRegistry>(EMPTY_DUELS);
  const changeDuels = useCallback((change: (book: DuelRegistry) => DuelRegistry) => {
    const next = change(duelBook.current);
    if (next !== duelBook.current) { duelBook.current = next; setDuelRegistry(next); }
  }, []);
  const duels = useMemo(() => duelStamps(duelRegistry), [duelRegistry]);
  /** 내가 참가한 친구 경기: 끝 알림·하트비트에 실을 참가자와, 지금 진행 중(하트비트 대상)인지. */
  const myDuel = useRef<{ matchId: string; sessionIds: RpsDuelPayload['sessionIds']; live: boolean; beatAt: number } | null>(null);
  /** 끝 알림: 보내지 못한 것(다시 보낸다)과 이미 보낸 경기. */
  const pendingEnds = useRef(new Map<string, { sessionIds: RpsDuelPayload['sessionIds']; since: number }>());
  const endedSent = useRef(new Set<string>());
  const openRps = useRef(onOpenRps); openRps.current = onOpenRps;
  const events = useMemo(() => ({ [NET_SWING_EVENT]: (raw: unknown) => {
    const payload = parseNetSwing(raw);
    if (payload && payload.sessionId !== sessionId && roster.current.has(payload.sessionId)) dragonfliesFor('plaza')?.peerSwing(payload);
  }, [RPS_DUEL_EVENT]: (raw: unknown) => {
    const payload = parseDuelPayload(raw);
    if (!payload) return;
    if (payload.active) {
      const other = payload.sessionIds.find(id => id !== sessionId);
      const player = other ? plazaPlayers.current.get(other) : undefined;
      if (player) duelOpponents.current.set(payload.matchId, player.appearance);
    } else duelOpponents.current.delete(payload.matchId);
    changeDuels(book => applyDuel(book, payload, Date.now()));
    // 내 경기면 상대 세션을 기억해 둔다(끝 알림에 둘 다 실어 구경꾼이 한 번에 지우게).
    const mine = myDuel.current;
    if (payload.active && mine?.matchId === payload.matchId) mine.sessionIds = duelSessionsFor(duelBook.current, payload.matchId, sessionId);
  }, [RPS_INVITE_EVENT]: (raw: unknown) => {
    // 두 번째 전달 길: 신청한 친구가 광장에 바로 알려 준다. 실시간 DB 알림을 놓쳐도 서버에서 다시 확인해 창을 띄운다.
    const payload = parseInvitePayload(raw);
    if (payload?.toSessionId === sessionId) inviteCheck.current(payload.matchId);
  } }), [sessionId, changeDuels]);
  const realtime = usePlazaRealtime(sessionId, appearance, initial, { events });
  plazaPlayers.current = new Map(realtime.players.map(player => [player.sessionId, player]));
  useEffect(() => {
    const register = (rpsAdapter as CardRpsAdapter & { registerPresenceToken?: () => Promise<string> }).registerPresenceToken;
    if (register) void register().then(setDuelToken).catch(() => setMessage('카드 대결 연결을 준비하지 못했어요.'));
  }, [rpsAdapter]);
  roster.current = new Set(realtime.players.map(p => p.sessionId));
  // 광장을 떠난 사람(presence leave·bye)이 낀 대결은 지운다. 한 번이라도 보였던 사람만 — 접속 직후 아직
  // presence에 안 잡힌 사람의 대결 알림까지 지우지 않게.
  const seenPlayers = useRef(new Set<string>());
  useEffect(() => {
    const present = new Set(realtime.players.map(p => p.sessionId));
    const gone = [...seenPlayers.current].filter(id => !present.has(id));
    seenPlayers.current = present;
    if (gone.length) changeDuels(book => leaveDuels(book, gone));
  }, [realtime.players, changeDuels]);
  const { updateMyState } = realtime;
  const swingSend = useRef(realtime.sendEvent); swingSend.current = realtime.sendEvent;
  const rpsSend = useRef(realtime.sendEvent); rpsSend.current = realtime.sendEvent;
  // ── 카드 대결 말풍선 알리기 ──
  // 예전엔 각자 "끝"을 자기 세션에만 보냈고, broadcast는 보낸 사람에게 돌아오지 않는다. 그래서 수락한 쪽 화면에서는
  // 신청한 쪽이 실어 보낸 "수락한 쪽도 대결 중" 이 영영 지워지지 않았다. 이제 끝은 내 화면에서도 바로 지우고,
  // 경기 참가자 둘 다를 실어 보내며, 진행 중엔 하트비트를 보낸다(받는 쪽은 TTL로 정리).
  const sendDuel = useCallback((matchId: string, sessionIds: RpsDuelPayload['sessionIds'], active: boolean) =>
    rpsSend.current(RPS_DUEL_EVENT, { matchId, sessionIds, active, at: Date.now() } satisfies RpsDuelPayload), []);
  const flushEnds = useCallback(() => {
    for (const [matchId, end] of pendingEnds.current) {
      if (Date.now() - end.since > 120_000) { pendingEnds.current.delete(matchId); continue; } // 그 뒤엔 받는 쪽 TTL이 지운다.
      void sendDuel(matchId, end.sessionIds, false).then(ok => { if (ok) pendingEnds.current.delete(matchId); });
    }
  }, [sendDuel]);
  const endMine = useCallback((matchId: string) => {
    const mine = myDuel.current?.matchId === matchId ? myDuel.current : null;
    if (mine) myDuel.current = null;
    const sessionIds = mine ? mine.sessionIds : duelSessionsFor(duelBook.current, matchId, sessionId);
    changeDuels(book => endDuel(book, matchId, Date.now()));
    if (endedSent.current.has(matchId)) return;
    endedSent.current.add(matchId);
    pendingEnds.current.set(matchId, { sessionIds, since: Date.now() });
    flushEnds();
  }, [sessionId, changeDuels, flushEnds]);
  /** 친구 경기 상태를 들었을 때: 진행 중이면 내 경기로 기억(하트비트), 끝났으면 끝 알림. */
  const trackMine = useCallback((match: RpsMatchView) => {
    if (match.mode !== 'friend') return;
    if (RPS_OVER.includes(match.status)) { endMine(match.matchId); return; }
    if (endedSent.current.has(match.matchId)) return;
    const mine = myDuel.current;
    if (mine?.matchId === match.matchId) { mine.live = RPS_LIVE.includes(match.status); return; }
    // 광장에 다시 들어왔거나 수락한 직후 — 아는 참가자를 모아 기억한다(진행 중이면 다음 점검 때 바로 알린다).
    myDuel.current = { matchId: match.matchId, sessionIds: duelSessionsFor(duelBook.current, match.matchId, sessionId), live: RPS_LIVE.includes(match.status), beatAt: 0 };
  }, [sessionId, endMine]);
  useEffect(() => rpsAdapter.subscribe({ onInvite: offer, onMatch: trackMine }), [rpsAdapter, trackMine, offer]);
  // 받은 신청 확인: 서버에 "나에게 온, 아직 답하지 않은 신청"을 묻는다(내가 보낸 신청은 서버가 가려 준다).
  // pendingInvite가 없는 어댑터(예전 목)는 broadcast로 받은 경기만 getMatch로 확인한다.
  const checking = useRef(false);
  inviteCheck.current = matchId => {
    if (checking.current) return;
    const pending = rpsAdapter.pendingInvite?.bind(rpsAdapter);
    if (!pending && !matchId) return;
    checking.current = true;
    const found = pending ? pending() : rpsAdapter.getMatch(matchId!).then(m => m.status === 'invited' && m.mode === 'friend'
      ? { matchId: m.matchId, from: { id: m.opponent.id, nickname: m.opponent.nickname }, stake: m.stake, expiresAt: m.deadlineAt ?? Date.now() + 30_000 } : null);
    void found.then(value => { if (value) offer(value); }).catch(() => {}).finally(() => { checking.current = false; });
  };
  // 세 번째 길: 광장에서 쉬는 동안 4초마다 확인(실시간 연결이 끊겼던 태블릿·놓친 알림). 경기 중·신청 창이 떠 있으면 쉰다.
  const pollIdle = useRef(true);
  pollIdle.current = panel !== 'card-rps' && !invite && !challenge && !myDuel.current?.live;
  useEffect(() => {
    const timer = window.setInterval(() => { if (pollIdle.current && document.visibilityState !== 'hidden') inviteCheck.current(); }, RPS_INVITE_POLL_MS);
    const visible = () => { if (document.visibilityState === 'visible') inviteCheck.current(); };
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, []);
  useEffect(() => {
    if (!rpsEndReporter) return;
    rpsEndReporter.current = matchId => { if (myDuel.current?.matchId === matchId || matchId in duelBook.current.matches) endMine(matchId); };
    return () => { rpsEndReporter.current = null; };
  }, [rpsEndReporter, endMine]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      changeDuels(book => expireDuels(book, now));
      flushEnds();
      const mine = myDuel.current;
      if (mine?.live && now - mine.beatAt >= RPS_DUEL_HEARTBEAT_MS) {
        void sendDuel(mine.matchId, mine.sessionIds, true).then(ok => { if (ok && myDuel.current === mine) mine.beatAt = now; });
      }
    }, DUEL_TICK_MS);
    return () => window.clearInterval(timer);
  }, [changeDuels, flushEnds, sendDuel]);
  // 카드 대결 화면을 닫았는데 서버에 내 경기가 더 없으면(끝 소식을 놓쳤어도) 끝으로 친다.
  const lastPanel = useRef(panel);
  useEffect(() => {
    const was = lastPanel.current; lastPanel.current = panel;
    const mine = myDuel.current;
    if (was !== 'card-rps' || panel === 'card-rps' || !mine) return;
    void rpsAdapter.getActive().then(active => { if (!active || active.matchId !== mine.matchId) endMine(mine.matchId); }).catch(() => {});
  }, [panel, rpsAdapter, endMine]);
  useEffect(() => { void rpsAdapter.getActive().then(match => {
    if (!match) return;
    trackMine(match);
    // 광장에 다시 들어왔는데 받은 신청이 기다리고 있으면(예전엔 버려졌다) 신청 창을 다시 띄운다.
    if (match.status === 'invited') inviteCheck.current(match.matchId);
    else openRps.current();
  }).catch(() => {}); }, [rpsAdapter, trackMine]);
  useEffect(() => {
    if (!invite) return;
    const delay = Math.max(0, invite.expiresAt - Date.now());
    const timer = window.setTimeout(() => {
      changeInbox(box => expireInvite(box, Date.now()));
      if (inboxRef.current.current?.matchId !== invite.matchId) setNotice('신청 시간이 지났어요.');
    }, delay);
    return () => window.clearTimeout(timer);
  }, [invite, changeInbox]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 4000); return () => window.clearTimeout(timer); }, [notice]);
  /** 수락·거절. 실패하면 창 안에 이유를 보여 주고(포인트 부족 등) 창은 열어 둔다 — 이미 끝난 신청이면 닫는다. */
  const answer = (current: RpsInvite, accept: boolean) => {
    if (inviteState?.matchId === current.matchId && inviteState.sending) return;
    setInviteState({ matchId: current.matchId, sending: true, error: '', short: false });
    void rpsAdapter.respond(current.matchId, accept).then(match => {
      changeInbox(box => settleInvite(box, current.matchId)); setInviteState(null);
      if (!accept) return;
      if (RPS_OVER.includes(match.status)) { endMine(match.matchId); setNotice(match.status === 'expired' ? '신청 시간이 지났어요.' : '신청이 취소됐어요.'); return; }
      const sessionIds = duelSessionsFor(duelBook.current, match.matchId, sessionId);
      myDuel.current = { matchId: match.matchId, sessionIds, live: true, beatAt: Date.now() };
      void sendDuel(match.matchId, sessionIds, true);
      onOpenRps(duelOpponents.current.get(match.matchId));
    }).catch(error => {
      const code = errorCode(error);
      if (code === 'not_enough_points' || code === 'busy' || code === 'network') {
        setInviteState({ matchId: current.matchId, sending: false, error: accept ? rpsInviteErrorText(code, 'accept') : '연결이 불안정해요. 다시 눌러 주세요.', short: code === 'not_enough_points' });
        return;
      }
      // 이미 끝난 신청(만료·취소) — 창을 닫고 알린다.
      changeInbox(box => settleInvite(box, current.matchId)); setInviteState(null);
      setNotice(rpsInviteErrorText(code, 'accept'));
    });
  };
  const sendChallenge = (opponent: { token: string; appearance: PublicAvatarAppearance; sessionId: string }, stake: RpsFriendStake) => {
    if (challengeState.sending) return;
    setChallengeState({ sending: true, error: '' });
    void rpsAdapter.invite(opponent.token, stake).then(match => {
      setChallenge(null); setChallengeState({ sending: false, error: '' });
      myDuel.current = { matchId: match.matchId, sessionIds: [sessionId, opponent.sessionId], live: RPS_LIVE.includes(match.status), beatAt: Date.now() };
      void sendDuel(match.matchId, [sessionId, opponent.sessionId], true);
      // 친구 화면에 바로 알린다(실시간 DB 알림과 별개의 두 번째 길). 사용자 id는 싣지 않는다.
      if (match.status === 'invited') void rpsSend.current(RPS_INVITE_EVENT, { matchId: match.matchId, toSessionId: opponent.sessionId, at: Date.now() } satisfies RpsInvitePayload);
      onOpenRps(opponent.appearance);
    }).catch(error => setChallengeState({ sending: false, error: rpsInviteErrorText(errorCode(error), 'invite') }));
  };
  useEffect(() => {
    swingReporter.current = direction => { void swingSend.current(NET_SWING_EVENT, { sessionId, direction, at: Date.now() }); };
    return () => { swingReporter.current = null; };
  }, [swingReporter, sessionId]);
  const reactionRef = useRef(realtime.sendReaction); reactionRef.current = realtime.sendReaction;
  const players = useMemo(() => realtime.players.map(p => ({ ...p, ...continuousPosition(p) })), [realtime.players]);
  const paths = useMemo(() => new Map([...realtime.paths].map(([id, points]) => [id, points.map(p => ({ ...p, ...continuousPosition(p) }))])), [realtime.paths]);
  const smoothed = useSmoothedPlayerPositions(players, paths);
  const [contest, setContest] = useState<WeeklyCropContest | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [message, setMessage] = useState('');
  const [coolUntil, setCoolUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let last = '';
    const update = () => {
      const d = handle.current?.debug();
      if (!d || d.scene !== 'plaza' || d.transitioning) return;
      const state = { ...continuousPayload(d), direction: d.facing, moving: d.moving, pet, face, riding: d.riding, ...(tool ? { tool } : {}), ...(duelToken ? { duelToken } : {}) };
      const key = JSON.stringify(state);
      if (key !== last) { updateMyState(state); last = key; }
    };
    update(); const timer = window.setInterval(update, 170);
    return () => window.clearInterval(timer);
  }, [handle, updateMyState, pet, riding, face, tool, duelToken]);
  useEffect(() => {
    let cancelled = false; setFailed(false);
    void fetchWeeklyCropContest().then(value => { if (!cancelled) setContest(value); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [retry]);
  useEffect(() => { handle.current?.setExhibit(!!contest?.top.length); }, [handle, contest]);
  // 머리 위 말풍선: 인사(안녕!/응원해!)와 한마디를 같은 구름 모양으로. 한 사람에겐 가장 최근 것 하나만,
  // 먼저 끝난 새 말 뒤에 오래된 말이 되살아나지 않게 사람마다 본 적 있는 가장 늦은 시각을 기억한다.
  // 시각은 모두 내 시계(받은 시각) — 보낸 기기 시계가 어긋나거나 뒤로 가도 새 말이 막히지 않는다.
  const latest = useRef(new Map<string, number>());
  const bubbles = useMemo(() => {
    const out: Record<string, PlazaBubble> = {};
    const offer = (id: string, text: string, stamp: number) => {
      if (stamp > (latest.current.get(id) ?? -Infinity)) latest.current.set(id, stamp);
      if (stamp === latest.current.get(id)) out[id] = { text, stamp };
    };
    for (const [id, r] of realtime.reactions) offer(id, REACTIONS[r.kind].label, r.expires - REACTION_MS);
    for (const [id, c] of realtime.chats) offer(id, c.text, c.receivedAt);
    for (const [id, stamp] of Object.entries(duels)) offer(id, '✊ ✌️ ✋', stamp);
    return out;
  }, [realtime.reactions, realtime.chats, duels]);
  useEffect(() => {
    handle.current?.setClassmates(smoothed, bubbles, sessionId);
  }, [handle, smoothed, bubbles, sessionId]);
  // 가까이 선 친구 머리 위 "카드 대결" 버튼. 대상 고르기는 순수 함수(pickDuelTarget), 자리는 장면이
  // 매 프레임 그린 뒤 알려 주는 머리 위 화면 좌표를 DOM에 바로 적는다(React를 매 프레임 다시 그리지 않는다).
  const [duelNear, setDuelNear] = useState<string | null>(null);
  const duelNearRef = useRef<string | null>(null);
  const duelHead = useRef<{ x: number; y: number } | null>(null);
  const duelButton = useRef<HTMLButtonElement | null>(null);
  const duelAllowed = useRef(new Set<string>());
  duelAllowed.current = panel || blocked || challenge || invite || duels[sessionId] ? new Set()
    : new Set(smoothed.filter(p => p.duelToken && !duels[p.sessionId]).map(p => p.sessionId));
  const placeDuel = useCallback((element: HTMLButtonElement | null) => {
    duelButton.current = element;
    const head = duelHead.current;
    if (element && head) element.style.transform = `translate3d(${Math.round(head.x)}px, ${Math.round(head.y)}px, 0) translate(-50%, -100%)`;
  }, []);
  useEffect(() => {
    const game = handle.current;
    if (!game) return;
    game.setPlazaFrameListener(frame => {
      const allowed = duelAllowed.current;
      const next = pickDuelTarget(frame.me, frame.peers.filter(p => allowed.has(p.id)).map(p => ({ id: p.id, ...p.feet })), duelNearRef.current);
      duelHead.current = next ? frame.peers.find(p => p.id === next)!.head : null;
      if (next !== duelNearRef.current) { duelNearRef.current = next; setDuelNear(next); }
      placeDuel(duelButton.current);
    });
    return () => game.setPlazaFrameListener(null);
  }, [handle, placeDuel]);
  const duelPlayer = duelNear && duelAllowed.current.has(duelNear) ? smoothed.find(p => p.sessionId === duelNear) : undefined;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (panel !== 'well') return;
    const day = plazaDay();
    try {
      if (localStorage.getItem(wellStorageKey(userId)) !== day) {
        localStorage.setItem(wellStorageKey(userId), day);
        void reactionRef.current('wish');
      }
    } catch { /* 기기 기록이 안 되어도 한마디는 보여 준다. */ }
  }, [panel, userId]);
  const title = panel === 'contest' ? '이번 주 토마토 대회' : panel === 'well' ? '우물의 오늘 한마디' : '광장 벤치';
  return <>
    <div className="pwp-plaza-reactions" role="group" aria-label="리액션 선택" data-ready={realtime.ready} data-players={smoothed.length}>
      <PlazaChat disabled={!realtime.ready || !!panel} onSend={realtime.sendChat} onStatus={setMessage}
      status={!realtime.ready ? '다시 연결하는 중…' : now < coolUntil ? '잠깐 쉬었다 보내요' : message}
      reactions={<>{(['wave', 'cheer', 'rest'] as const).map(kind => <button type="button" className="pwp-chip" key={kind} aria-label={REACTIONS[kind].label}
        disabled={!realtime.ready || now < coolUntil || !!panel} onClick={() => {
          setCoolUntil(Date.now() + 4000);
          void realtime.sendReaction(kind).then(sent => setMessage(sent ? REACTIONS[kind].label : '반응을 보내지 못했어요. 잠시 후 다시 해 주세요.'));
        }}>{REACTIONS[kind].emoji}</button>)}</>} />
    </div>
    {duelPlayer?.duelToken && <button type="button" ref={placeDuel} className="pwp-rps-near" data-session={duelPlayer.sessionId} aria-label="이 친구에게 카드 대결 신청"
      onPointerDown={event => event.stopPropagation()} onClick={() => { if (!duelPlayer.duelToken) return; setChallengeState({ sending: false, error: '' }); setChallenge({ token: duelPlayer.duelToken, appearance: duelPlayer.appearance, sessionId: duelPlayer.sessionId }); }}>
      <span aria-hidden="true">🃏</span> 카드 대결</button>}
    {(panel === 'contest' || panel === 'well' || panel === 'bench') && <Window title={title} onClose={onClose} compact small>
      <div className="pwp-panel-content">
        {panel === 'well' ? <p role="status">{dailyWellMessage(plazaDay(now))}</p> : panel === 'bench' ? <p>잠깐 앉아 쉬어 가요. 천천히 가도 괜찮아요.</p>
          : failed ? <div role="alert"><p>대회를 불러오지 못했어요.</p><button type="button" onClick={() => setRetry(n => n + 1)}>다시 시도</button></div>
          : !contest ? <p role="status">대회를 불러오는 중…</p> : <>
            {contest.top.length ? <ol>{contest.top.map((entry, i) => <li key={i}>{weeklyRankLabel(entry.rank, contest.top.map(p => p.rank))} · {entry.submitterLabel} · {entry.sizeScore}/100</li>)}</ol>
              : <p>아직 이번 주 출품이 없어요. 농장에서 토마토를 키워 출품해 보세요!</p>}
            <p>{contest.mine.rank === null ? '이번 주 내 출품 기록이 아직 없어요.' : '내 이번 주 최고 기록 · ' + contest.mine.sizeScore + '/100 · ' + contest.mine.rank + '위'}</p>
          </>}
      </div>
    </Window>}
    {challenge && <Window title="카드 대결 신청" modal="sticky" guardMs={RPS_DIALOG_GUARD_MS} onClose={() => { if (!challengeState.sending) { setChallenge(null); setChallengeState({ sending: false, error: '' }); } }} compact small>
      <div className="pwp-panel-content"><p>판돈을 골라 친구에게 신청해요.</p>
        <div className="pwp-rps-stakes">{RPS_FRIEND_STAKES.map(stake => {
          const short = balance !== undefined && !canAffordStake(stake, balance);
          return <button type="button" key={stake} data-stake={stake} data-short={short} disabled={short || challengeState.sending} aria-label={short ? `${stake}P · ${RPS_NOT_ENOUGH_POINTS}` : `${stake}P`}
            onClick={() => sendChallenge(challenge, stake as RpsFriendStake)}>{stake}P</button>;
        })}</div>
        {balance !== undefined && RPS_FRIEND_STAKES.some(stake => !canAffordStake(stake, balance)) && <p className="pwp-short">{RPS_NOT_ENOUGH_POINTS} · 지금 {Math.max(0, balance).toLocaleString()}P</p>}
        {challengeState.sending ? <p role="status">신청하는 중…</p> : challengeState.error && <p role="alert" className="pwp-short">{challengeState.error}</p>}
      </div></Window>}
    {/* 받은 신청: 바깥 터치·B·Esc·뜨기 전부터 누르던 손가락으로는 닫히지 않는다. 수락/거절/시간 끝만 닫는다. 다른 창이 열려 있어도 그 위에 뜬다. */}
    {invite && (() => {
      const state = inviteState?.matchId === invite.matchId ? inviteState : null;
      const short = state?.short || (balance !== undefined && !canAffordStake(invite.stake, balance));
      return <Window key={invite.matchId} title="카드 대결 신청" modal="strict" hideClose guardMs={RPS_DIALOG_GUARD_MS} onClose={() => {}} compact small>
        <div className="pwp-panel-content" data-rps-invite={invite.matchId}>
          <p>친구가 {invite.stake}P 카드 대결을 신청했어요. {Math.max(0, Math.ceil((invite.expiresAt - now) / 1000))}초 안에 골라 주세요.</p>
          {short && !state?.error && <p className="pwp-short" role="alert">포인트가 부족해서 수락할 수 없어요</p>}
          {state?.error && <p className="pwp-short" role="alert">{state.error}</p>}
          <div className="pwp-rps-stakes">
            <button type="button" disabled={short || !!state?.sending} onClick={() => answer(invite, true)}>수락</button>
            <button type="button" disabled={!!state?.sending} onClick={() => answer(invite, false)}>거절</button>
          </div>
        </div></Window>;
    })()}
    {notice && <p className="pwp-rps-notice" role="status">{notice}</p>}
  </>;
}
