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
import type { PetId } from '../../pixel-room/pet/petKinds';
import type { WorldGameHandle } from '../game/boot';
import type { PlazaBubble } from '../game/plazaBubbles';
import { Window } from './GamePanels';
import { PlazaChat } from './PlazaChat';
export type PlazaPanel = 'contest' | 'well' | 'bench';
export function PlazaBridge({ handle, appearance, pet, riding, userId, panel, onClose }: {
  handle: RefObject<WorldGameHandle | null>; appearance: PublicAvatarAppearance; pet: PetId | null; riding: boolean;
  userId: string; panel: string | null; onClose: () => void;
}) {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [initial] = useState(() => {
    const d = handle.current?.debug();
    return { ...continuousPayload(d ?? { x: 216, y: 248 }), direction: d?.facing ?? 'Back' as const, moving: d?.moving ?? false, pet, riding: d?.riding ?? false };
  });
  const realtime = usePlazaRealtime(sessionId, appearance, initial);
  const { updateMyState } = realtime;
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
      const state = { ...continuousPayload(d), direction: d.facing, moving: d.moving, pet, riding: d.riding };
      const key = JSON.stringify(state);
      if (key !== last) { updateMyState(state); last = key; }
    };
    update(); const timer = window.setInterval(update, 170);
    return () => window.clearInterval(timer);
  }, [handle, updateMyState, pet, riding]);
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
    return out;
  }, [realtime.reactions, realtime.chats]);
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
      {(['wave', 'cheer', 'rest'] as const).map(kind => <button type="button" className="pwp-chip" key={kind} aria-label={REACTIONS[kind].label}
        disabled={!realtime.ready || now < coolUntil || !!panel} onClick={() => {
          setCoolUntil(Date.now() + 4000);
          void realtime.sendReaction(kind).then(sent => setMessage(sent ? REACTIONS[kind].label : '반응을 보내지 못했어요. 잠시 후 다시 해 주세요.'));
        }}>{REACTIONS[kind].emoji}</button>)}
      <PlazaChat disabled={!realtime.ready || !!panel} onSend={realtime.sendChat} onStatus={setMessage} />
      <span role="status">{!realtime.ready ? '다시 연결하는 중…' : now < coolUntil ? '잠깐 쉬었다 보내요' : message}</span>
    </div>
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
