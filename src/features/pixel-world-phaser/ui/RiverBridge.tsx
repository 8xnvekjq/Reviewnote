// 강가에 있을 때만 마운트한다. 광장 훅(usePlazaRealtime)을 강가 채널·강가 좌표 범위로 그대로 재사용하고
// (구독/재연결/퇴장 정리 동일), 그 위에 낚시 상태 broadcast('fish')를 얹는다. 낚시 상태는 저장하지 않는다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { usePlazaRealtime } from '../../pixel-room/plaza/usePlazaRealtime';
import { useSmoothedPlayerPositions } from '../../pixel-room/plaza/useSmoothedPlayerPositions';
import { continuousPosition } from '../../pixel-room/plaza/presenceProtocol';
import { REACTIONS, REACTION_MS } from '../../pixel-room/plaza/plazaInteractions';
import type { PublicAvatarAppearance } from '../../pixel-room/shop/types';
import type { PetId } from '../../pixel-room/pet/petKinds';
import type { WorldGameHandle } from '../game/boot';
import type { PlazaBubble } from '../game/plazaBubbles';
import {
  FISH_EVENT, FISH_SEND_LIMIT, RIVER_BOUNDS, RIVER_CHANNEL_NAME, applyFishEvent, buildFishEvent, catchBubbleText,
  createRiverFishStore, expireFishStore, peerFishingView, riverPayload, takeFishToken,
} from '../logic/riverPresence';
import type { FishBucket, RiverFishEvent, RiverFishReporter } from '../logic/riverPresence';
import { PlazaChat } from './PlazaChat';

export function RiverBridge({ handle, appearance, pet, panel, reporter }: {
  handle: RefObject<WorldGameHandle | null>; appearance: PublicAvatarAppearance; pet: PetId | null; panel: string | null;
  /** useFishing의 낚시 보고가 들어오는 자리. 마운트 동안만 채운다. */
  reporter: MutableRefObject<RiverFishReporter | null>;
}) {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [initial] = useState(() => {
    const d = handle.current?.debug();
    return { ...riverPayload(d ?? { x: 56, y: 184 }), direction: d?.facing ?? 'Right' as const, moving: d?.moving ?? false, pet };
  });
  const [fish, setFish] = useState(createRiverFishStore);
  const roster = useRef<Set<string>>(new Set([sessionId]));
  const receiveFish = useCallback((payload: unknown) => {
    const now = Date.now();
    setFish(store => applyFishEvent(store, payload, now, roster.current));
  }, []);
  const events = useMemo(() => ({ [FISH_EVENT]: receiveFish }), [receiveFish]);
  const realtime = usePlazaRealtime(sessionId, appearance, initial, { channel: RIVER_CHANNEL_NAME, bounds: RIVER_BOUNDS, events });
  roster.current = new Set([sessionId, ...realtime.players.map(p => p.sessionId)]);
  const { updateMyState } = realtime;
  const sendRef = useRef(realtime.sendEvent); sendRef.current = realtime.sendEvent;
  const players = useMemo(() => realtime.players.map(p => ({ ...p, ...continuousPosition(p, RIVER_BOUNDS) })), [realtime.players]);
  const paths = useMemo(() => new Map([...realtime.paths].map(([id, points]) => [id, points.map(p => ({ ...p, ...continuousPosition(p, RIVER_BOUNDS) }))])), [realtime.paths]);
  const smoothed = useSmoothedPlayerPositions(players, paths);
  const [message, setMessage] = useState('');
  const [coolUntil, setCoolUntil] = useState(0);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let last = '';
    const update = () => {
      const d = handle.current?.debug();
      if (!d || d.scene !== 'river' || d.transitioning) return;
      const state = { ...riverPayload(d), direction: d.facing, moving: d.moving, pet };
      const key = JSON.stringify(state);
      if (key !== last) { updateMyState(state); last = key; }
    };
    update(); const timer = window.setInterval(update, 170);
    return () => window.clearInterval(timer);
  }, [handle, updateMyState, pet]);

  // 내 낚시 보고 → (찌 좌표를 붙여) 친구들에게. 몰아서 오면 마지막 상태만 조금 뒤에 보낸다(토큰 통).
  const seq = useRef(0);
  const bucket = useRef<FishBucket | undefined>(undefined);
  const pending = useRef<RiverFishEvent | null>(null);
  const flushTimer = useRef<number | null>(null);
  useEffect(() => {
    const flush = () => {
      flushTimer.current = null;
      const event = pending.current;
      if (!event) return;
      const gate = takeFishToken(bucket.current, Date.now(), FISH_SEND_LIMIT);
      bucket.current = gate.bucket;
      if (!gate.ok) { flushTimer.current = window.setTimeout(flush, FISH_SEND_LIMIT.refillMs); return; }
      pending.current = null;
      void sendRef.current(FISH_EVENT, event);
    };
    reporter.current = report => {
      const target = report.phase === 'casting' ? handle.current?.shadowPoint(report.shadow) ?? null : null;
      seq.current += 1;
      const event = buildFishEvent(sessionId, seq.current, report, target);
      if (!event) return;
      // 내 화면에도 같은 소식을 반영한다(머리 위 "붕어 23.4cm!"와 반짝임). 내 줄·찌는 장면이 직접 그린다.
      const at = Date.now();
      setFish(store => applyFishEvent(store, event, at, roster.current));
      pending.current = event;
      if (flushTimer.current === null) flush();
    };
    return () => {
      reporter.current = null;
      if (flushTimer.current !== null) window.clearTimeout(flushTimer.current);
      flushTimer.current = null; pending.current = null;
    };
  }, [handle, reporter, sessionId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      setFish(store => expireFishStore(store, at, roster.current));
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  // 머리 위 구름: 인사·한마디·잡은 물고기. 한 사람에겐 가장 최근 것 하나만(PlazaBridge와 같은 규칙).
  const latest = useRef(new Map<string, number>());
  const bubbles = useMemo(() => {
    const out: Record<string, PlazaBubble> = {};
    const offer = (id: string, text: string, stamp: number) => {
      if (stamp > (latest.current.get(id) ?? -Infinity)) latest.current.set(id, stamp);
      if (stamp === latest.current.get(id)) out[id] = { text, stamp };
    };
    for (const [id, r] of realtime.reactions) offer(id, REACTIONS[r.kind].label, r.expires - REACTION_MS);
    for (const [id, c] of realtime.chats) offer(id, c.text, c.receivedAt);
    for (const [id, p] of fish.peers) if (p.catch) offer(id, catchBubbleText(p.catch), p.catch.at);
    return out;
  }, [realtime.reactions, realtime.chats, fish]);
  const fishView = useMemo(() => peerFishingView(fish), [fish]);
  useEffect(() => { handle.current?.setClassmates(smoothed, bubbles, sessionId); }, [handle, smoothed, bubbles, sessionId, now]);
  useEffect(() => { handle.current?.setRiverFishing(fishView); }, [handle, fishView, now]);

  return <div className="pwp-plaza-reactions" role="group" aria-label="리액션 선택" data-ready={realtime.ready} data-players={smoothed.length}>
    {(['wave', 'cheer', 'rest'] as const).map(kind => <button type="button" className="pwp-chip" key={kind} aria-label={REACTIONS[kind].label}
      disabled={!realtime.ready || now < coolUntil || !!panel} onClick={() => {
        setCoolUntil(Date.now() + 4000);
        void realtime.sendReaction(kind).then(sent => setMessage(sent ? REACTIONS[kind].label : '반응을 보내지 못했어요. 잠시 후 다시 해 주세요.'));
      }}>{REACTIONS[kind].emoji}</button>)}
    <PlazaChat disabled={!realtime.ready || !!panel} onSend={realtime.sendChat} onStatus={setMessage} />
    <span role="status">{!realtime.ready ? '다시 연결하는 중…' : now < coolUntil ? '잠깐 쉬었다 보내요' : message}</span>
  </div>;
}
