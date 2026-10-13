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
import { EMPTY_DUELS, RPS_DUEL_HEARTBEAT_MS, applyDuel, duelSessionsFor, duelStamps, endDuel, expireDuels, leaveDuels, parseDuelPayload, type DuelRegistry } from '../logic/duelRegistry';
export type PlazaPanel = 'contest' | 'well' | 'bench';
const RPS_LIVE: readonly RpsMatchView['status'][] = ['choosing', 'revealing', 'shootout'];
const RPS_OVER: readonly RpsMatchView['status'][] = ['finished', 'declined', 'expired', 'cancelled'];
/** 대결 장부 점검(TTL·하트비트·못 보낸 끝 알림 다시 보내기) 간격. */
const DUEL_TICK_MS = 5_000;
export function PlazaBridge({ handle, appearance, pet, riding, face, tool, userId, panel, blocked = false, onClose, swingReporter, rpsEndReporter, rpsAdapter, onOpenRps }: {
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
  const [invite, setInvite] = useState<RpsInvite | null>(null);
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
  useEffect(() => rpsAdapter.subscribe({ onInvite: setInvite, onMatch: trackMine }), [rpsAdapter, trackMine]);
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
    if (match.status !== 'invited') openRps.current();
  }).catch(() => {}); }, [rpsAdapter, trackMine]);
  useEffect(() => {
    if (!invite) return;
    const delay = Math.max(0, invite.expiresAt - Date.now());
    const timer = window.setTimeout(() => setInvite(current => current?.matchId === invite.matchId ? null : current), delay);
    return () => window.clearTimeout(timer);
  }, [invite]);
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
      onPointerDown={event => event.stopPropagation()} onClick={() => duelPlayer.duelToken && setChallenge({ token: duelPlayer.duelToken, appearance: duelPlayer.appearance, sessionId: duelPlayer.sessionId })}>
      <span aria-hidden="true">🃏</span> 카드 대결</button>}
    {challenge && <Window title="카드 대결 신청" onClose={() => setChallenge(null)} compact small><div className="pwp-panel-content"><p>판돈을 골라 친구에게 신청해요.</p>{RPS_FRIEND_STAKES.map(stake => <button type="button" key={stake} onClick={() => {
      const opponent = challenge; setChallenge(null);
      void rpsAdapter.invite(opponent.token, stake as RpsFriendStake).then(match => {
        myDuel.current = { matchId: match.matchId, sessionIds: [sessionId, opponent.sessionId], live: RPS_LIVE.includes(match.status), beatAt: Date.now() };
        void sendDuel(match.matchId, [sessionId, opponent.sessionId], true);
        onOpenRps(opponent.appearance);
      });
    }}>{stake}P</button>)}</div></Window>}
    {invite && <Window title="카드 대결 신청" onClose={() => setInvite(null)} compact small><div className="pwp-panel-content"><p>친구가 {invite.stake}P 카드 대결을 신청했어요. {Math.max(0, Math.ceil((invite.expiresAt - now) / 1000))}초 안에 골라 주세요.</p><button type="button" onClick={() => { const current = invite; setInvite(null); void rpsAdapter.respond(current.matchId, true).then(match => { if (RPS_OVER.includes(match.status)) { endMine(match.matchId); return; } const sessionIds = duelSessionsFor(duelBook.current, match.matchId, sessionId); myDuel.current = { matchId: match.matchId, sessionIds, live: true, beatAt: Date.now() }; void sendDuel(match.matchId, sessionIds, true); onOpenRps(duelOpponents.current.get(match.matchId)); }); }}>수락</button><button type="button" onClick={() => { const current = invite; setInvite(null); void rpsAdapter.respond(current.matchId, false); }}>거절</button></div></Window>}
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
  </>;
}
