import { NET_SWING_EVENT } from '../logic/bugCatalog';
import { parseNetSwing } from '../logic/bugGame';
import { dragonfliesFor } from '../game/dragonflies';
import type { NetSwingReporter } from './useBugCatching';
import type { MutableRefObject as SwingRef } from 'react';
// 광장에 있을 때만 마운트한다. 기존 훅의 구독/재연결/퇴장 정리를 그대로 재사용한다.
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { RPS_DUEL_EVENT, RPS_FRIEND_STAKES, type CardRpsAdapter, type RpsDuelPayload, type RpsFriendStake, type RpsInvite } from '../logic/cardRpsContract';
export type PlazaPanel = 'contest' | 'well' | 'bench';
export function PlazaBridge({ handle, appearance, pet, riding, face, tool, userId, panel, onClose, swingReporter, rpsAdapter, onOpenRps }: {
  swingReporter: SwingRef<NetSwingReporter | null>;
  handle: RefObject<WorldGameHandle | null>; appearance: PublicAvatarAppearance; pet: PetId | null; riding: boolean; face?: string; /** 손에 든 도구 표시(친구 화면에 그린다). */ tool?: string;
  userId: string; panel: string | null; onClose: () => void; rpsAdapter: CardRpsAdapter; onOpenRps(opponentAppearance?: PublicAvatarAppearance): void;
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
  const [duels, setDuels] = useState<Record<string, number>>({});
  const openRps = useRef(onOpenRps); openRps.current = onOpenRps;
  const events = useMemo(() => ({ [NET_SWING_EVENT]: (raw: unknown) => {
    const payload = parseNetSwing(raw);
    if (payload && payload.sessionId !== sessionId && roster.current.has(payload.sessionId)) dragonfliesFor('plaza')?.peerSwing(payload);
  }, [RPS_DUEL_EVENT]: (raw: unknown) => {
    const payload = raw as Partial<RpsDuelPayload>;
    if (!Array.isArray(payload.sessionIds) || typeof payload.active !== 'boolean') return;
    if (payload.active && typeof payload.matchId === 'string') {
      const other = payload.sessionIds.find(id => id !== sessionId);
      const player = other ? plazaPlayers.current.get(other) : undefined;
      if (player) duelOpponents.current.set(payload.matchId, player.appearance);
    } else if (typeof payload.matchId === 'string') duelOpponents.current.delete(payload.matchId);
    setDuels(current => {
      const next = { ...current };
      for (const id of payload.sessionIds!) {
        if (payload.active) next[id] = Date.now();
        else delete next[id];
      }
      return next;
    });
  } }), [sessionId]);
  const realtime = usePlazaRealtime(sessionId, appearance, initial, { events });
  plazaPlayers.current = new Map(realtime.players.map(player => [player.sessionId, player]));
  useEffect(() => {
    const register = (rpsAdapter as CardRpsAdapter & { registerPresenceToken?: () => Promise<string> }).registerPresenceToken;
    if (register) void register().then(setDuelToken).catch(() => setMessage('카드 대결 연결을 준비하지 못했어요.'));
  }, [rpsAdapter]);
  roster.current = new Set(realtime.players.map(p => p.sessionId));
  const { updateMyState } = realtime;
  const swingSend = useRef(realtime.sendEvent); swingSend.current = realtime.sendEvent;
  const rpsSend = useRef(realtime.sendEvent); rpsSend.current = realtime.sendEvent;
  useEffect(() => rpsAdapter.subscribe({ onInvite: setInvite, onMatch: match => {
    if (match.status === 'finished' || match.status === 'declined' || match.status === 'expired' || match.status === 'cancelled') {
      void rpsSend.current(RPS_DUEL_EVENT, { matchId: match.matchId, sessionIds: [sessionId], active: false, at: Date.now() } satisfies RpsDuelPayload);
    }
  } }), [rpsAdapter, sessionId]);
  useEffect(() => { void rpsAdapter.getActive().then(match => { if (match && match.status !== 'invited') openRps.current(); }).catch(() => {}); }, [rpsAdapter]);
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
    {smoothed.length > 0 && <div className="pwp-rps-friends" role="group" aria-label="친구 카드 대결">
      {smoothed.map(player => <button type="button" className="pwp-chip" key={player.sessionId} disabled={!!panel || !player.duelToken} onClick={() => player.duelToken && setChallenge({ token: player.duelToken, appearance: player.appearance, sessionId: player.sessionId })}>{player.face ?? '🙂'} 카드 대결</button>)}
    </div>}
    {challenge && <Window title="카드 대결 신청" onClose={() => setChallenge(null)} compact small><div className="pwp-panel-content"><p>판돈을 골라 친구에게 신청해요.</p>{RPS_FRIEND_STAKES.map(stake => <button type="button" key={stake} onClick={() => {
      const opponent = challenge; setChallenge(null);
      void rpsAdapter.invite(opponent.token, stake as RpsFriendStake).then(match => {
        void realtime.sendEvent(RPS_DUEL_EVENT, { matchId: match.matchId, sessionIds: [sessionId, opponent.sessionId], active: true, at: Date.now() } satisfies RpsDuelPayload);
        onOpenRps(opponent.appearance);
      });
    }}>{stake}P</button>)}</div></Window>}
    {invite && <Window title="카드 대결 신청" onClose={() => setInvite(null)} compact small><div className="pwp-panel-content"><p>친구가 {invite.stake}P 카드 대결을 신청했어요. {Math.max(0, Math.ceil((invite.expiresAt - now) / 1000))}초 안에 골라 주세요.</p><button type="button" onClick={() => { const current = invite; setInvite(null); void rpsAdapter.respond(current.matchId, true).then(match => { void realtime.sendEvent(RPS_DUEL_EVENT, { matchId: match.matchId, sessionIds: [sessionId], active: true, at: Date.now() } satisfies RpsDuelPayload); onOpenRps(duelOpponents.current.get(match.matchId)); }); }}>수락</button><button type="button" onClick={() => { const current = invite; setInvite(null); void rpsAdapter.respond(current.matchId, false); }}>거절</button></div></Window>}
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
