import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { RealtimeChannel, RealtimePresenceState } from '@supabase/supabase-js';
import { supabase } from '../../../services/supabase';
import type { PublicAvatarAppearance } from '../shop/types';
import { createPlazaStoreState, getOtherPlayers, plazaStoreReducer } from './presenceStore';
import type { PlazaDirection, PlazaPlayerState } from './types';
import { PLAZA_CHANNEL_NAME } from './types';

const MOVE_BROADCAST_EVENT = 'move';

export interface UsePlazaRealtimeResult {
  players: PlazaPlayerState[]; // everyone else currently in the plaza (not me)
  ready: boolean;              // channel subscribed + initial presence sync received
  updateMyState: (partial: { x: number; y: number; direction: PlazaDirection; moving: boolean }) => void;
}

// Supabase Presence는 우리가 track()에 넘긴 값 위에 presence_ref 같은 자체 필드를 얹어서 돌려준다
// (RealtimePresence.d.ts의 Presence<T> = { presence_ref: string } & T 참고). presenceStore의
// reducer가 어차피 PlazaPlayerState 필드만 화이트리스트로 골라 저장하므로, 여기서는 그대로
// 넘겨도 안전하다.
function flattenPresenceState(state: RealtimePresenceState<PlazaPlayerState>): PlazaPlayerState[] {
  const players: PlazaPlayerState[] = [];
  for (const key of Object.keys(state)) {
    const entries = state[key];
    if (entries && entries.length > 0) players.push(entries[0]);
  }
  return players;
}

/** Pixel World Phase 2A — 광장(Plaza) 실시간 배선. presenceStore.ts의 순수 reducer 위에
 * Supabase Presence(현재 위치의 진실, 느림/무거움)와 Broadcast(이동 중 보간용, 빠름/가벼움)를
 * 얹는다. 정확한 라우팅 정책은 updateMyState 안의 주석 참고. */
export function usePlazaRealtime(sessionId: string, appearance: PublicAvatarAppearance): UsePlazaRealtimeResult {
  const [storeState, dispatch] = useReducer(plazaStoreReducer, undefined, createPlazaStoreState);
  const [ready, setReady] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  // 이 세션 안에서 단조증가하는 시퀀스 — PlazaPlayerState.seq를 우리가 소유하고 채운다. 마운트마다
  // (재접속마다) 0부터 다시 시작한다 — presenceStore.ts의 재접속 정책 주석 참고.
  const seqRef = useRef(0);
  // 최근에 실제로 전송한 내 위치/방향/이동여부 — appearance만 바뀌어서 재track할 때도 최신 위치를
  // 그대로 실어 보내기 위해 필요하다(updateMyState 호출 없이도 track 페이로드를 완성할 수 있게).
  const selfRef = useRef<{ x: number; y: number; direction: PlazaDirection; moving: boolean }>({
    x: 0,
    y: 0,
    direction: 'Front',
    moving: false,
  });
  const movingRef = useRef(false);
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;

  function buildSelfState(seq: number): PlazaPlayerState {
    const self = selfRef.current;
    return {
      sessionId,
      x: self.x,
      y: self.y,
      direction: self.direction,
      moving: self.moving,
      appearance: appearanceRef.current,
      seq,
      updatedAt: Date.now(),
    };
  }

  // 채널 생성/구독/해체는 sessionId가 바뀔 때만 다시 한다(탭 하나에 sessionId 하나 — 보통 마운트
  // 동안 고정값이다).
  useEffect(() => {
    let cancelled = false;
    seqRef.current = 0;
    movingRef.current = false;
    setReady(false);

    // presence: { key: sessionId } — 같은 계정으로 연 여러 탭도 sessionId가 서로 달라서 독립된
    // presence 항목으로 잡힌다(서로 덮어쓰지 않음).
    const channel = supabase.channel(PLAZA_CHANNEL_NAME, {
      config: { presence: { key: sessionId } },
    });
    channelRef.current = channel;

    channel.on('presence', { event: 'sync' }, () => {
      const players = flattenPresenceState(channel.presenceState<PlazaPlayerState>());
      dispatch({ type: 'presence-sync', players });
      // 늦게 들어온 학생이 '현재' 모두의 위치를 읽는 지점 — sync를 한 번이라도 받으면 광장의
      // 초기 상태를 확보한 것이므로 여기서 ready로 전환한다.
      if (!cancelled) setReady(true);
    });

    channel.on<PlazaPlayerState>('presence', { event: 'join' }, ({ newPresences }) => {
      dispatch({ type: 'presence-join', players: newPresences });
    });

    channel.on<PlazaPlayerState>('presence', { event: 'leave' }, ({ leftPresences }) => {
      dispatch({ type: 'presence-leave', sessionIds: leftPresences.map(presence => presence.sessionId) });
    });

    channel.on<PlazaPlayerState>('broadcast', { event: MOVE_BROADCAST_EVENT }, ({ payload }) => {
      dispatch({ type: 'broadcast', player: payload });
    });

    channel.subscribe(status => {
      if (cancelled) return;
      if (status === 'SUBSCRIBED') {
        seqRef.current += 1;
        void channel.track(buildSelfState(seqRef.current));
      }
    });

    // beforeunload에서의 untrack은 best-effort일 뿐이다(브라우저가 네트워크 요청을 끝까지
    // 보장해주지 않는다) — 진짜 안전망은 Supabase Presence 자신의 연결 끊김 감지(소켓이 끊기면
    // 서버가 자동으로 그 presence를 leave 처리)다. 여기서는 정상 종료 시 정리를 한 틱이라도
    // 앞당기는 정도의 역할만 한다.
    const handleBeforeUnload = () => { void channel.untrack(); };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelled = true;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      void channel.untrack();
      void supabase.removeChannel(channel);
      channelRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // appearance가 바뀌면(옷 갈아입기) presence만 갱신한다 — 매 tick마다 도는 게 아니라 실제로
  // 값이 바뀐 순간에만이므로 브리핑이 요구한 "appearance 변경 시" 조건과 정확히 일치한다.
  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || !ready) return;
    seqRef.current += 1;
    void channel.track(buildSelfState(seqRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearance, ready]);

  const updateMyState = useMemo(() => {
    return (partial: { x: number; y: number; direction: PlazaDirection; moving: boolean }) => {
      selfRef.current = partial;
      const channel = channelRef.current;
      if (!channel) return;
      seqRef.current += 1;
      const state = buildSelfState(seqRef.current);

      // Broadcast: 매 호출(=UI가 이미 PLAZA_MOVE_TICK_MS 간격으로 부르는 이동 tick)마다 보낸다.
      // 170ms 간격은 이미 "실시간처럼 느껴지는" 값으로 검증된 기존 방 이동 cadence라, 이보다
      // 더 줄일(throttle) 필요는 없다고 판단했다 — Broadcast는 가벼운 fire-and-forget이라 30명
      // 미만 규모에서 매 tick 전송이 부담될 정도는 아니다.
      void channel.send({ type: 'broadcast', event: MOVE_BROADCAST_EVENT, payload: state });

      // Presence(track): 무거운 경로이므로 매 tick이 아니라 "이동 시작"과 "이동 정지"
      // 전이(transition)에서만 갱신한다 — moving 값이 실제로 바뀔 때만 track을 호출한다.
      if (partial.moving !== movingRef.current) {
        movingRef.current = partial.moving;
        void channel.track(state);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const players = useMemo(() => getOtherPlayers(storeState, sessionId), [storeState, sessionId]);

  return { players, ready, updateMyState };
}
