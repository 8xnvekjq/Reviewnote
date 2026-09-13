import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { RealtimeChannel, RealtimePresenceState } from '@supabase/supabase-js';
import { supabase } from '../../../services/supabase';
import type { PublicAvatarAppearance } from '../shop/types';
import { createPlazaStoreState, getOtherPlayers, plazaStoreReducer } from './presenceStore';
import type { PathWaypoint } from './presenceStore';
import type { PlazaDirection, PlazaPlayerState } from './types';
import { PLAZA_CHANNEL_NAME } from './types';
import { plazaDebugLog } from './plazaDebug';

const MOVE_BROADCAST_EVENT = 'move';

// Reconnect backoff (Worker B rework, issue #2 — a channel that hits CHANNEL_ERROR/TIMED_OUT/
// CLOSED used to stay silently dead for the rest of the session because only 'SUBSCRIBED' was
// handled). Exponential with a low ceiling: doubles from 500ms up to a 10s cap, then keeps retrying
// at the cap indefinitely for as long as this hook stays mounted — a live plaza screen should keep
// trying to come back rather than ever giving up outright (a hard retry-count cap would just leave
// the student staring at a frozen plaza with no way back short of a manual refresh).
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 10_000;

function reconnectDelayFor(attempt: number): number {
  return Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS);
}

export interface UsePlazaRealtimeResult {
  players: PlazaPlayerState[]; // everyone else currently in the plaza (not me)
  // sessionId -> every waypoint that session has actually passed through, in order (append-only —
  // see presenceStore.ts's PathWaypoint/getPathSince). useSmoothedPlayerPositions.ts consumes this
  // instead of only the latest `players` snapshot so a burst of same-task updates (real risk — see
  // that hook's header comment) never loses an in-between waypoint.
  paths: Map<string, PathWaypoint[]>;
  ready: boolean;              // channel subscribed + initial presence sync received (false while reconnecting)
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

/** 채널을 정말로 안전하게 정리한다: untrack()의 leave push가 실제로 나갈 기회를 갖기 전에
 * removeChannel()이 소켓/채널을 뜯어버리는 경합(Worker B rework, issue #3 — 기존에는
 * `void channel.untrack(); void supabase.removeChannel(channel);`처럼 둘 다 기다리지 않고 쐈다)을
 * 없애기 위해 untrack()을 먼저 await한 뒤에만 removeChannel()을 호출한다.
 *
 * (removeChannel 자체는 채널의 leave를 push한 뒤 소켓 연결을 정리하므로, untrack을 기다리지
 * 않고 바로 이어 불러도 실전에서 유실되는 경우는 드물 것으로 보인다 — untrack의 push와
 * removeChannel이 트리거하는 leave push가 같은 큐에 순서대로 올라가기 때문. 그래도 "기다리지
 * 않아도 대체로 괜찮다"에 기대는 것과 "명시적으로 기다려서 보장한다"는 다르므로, 실질적 차이가
 * 크든 작든 더 올바른 순서를 굳이 마다할 이유가 없어 이렇게 구현한다.) untrack이 실패해도(예:
 * 이미 끊긴 소켓) removeChannel은 반드시 이어져야 하므로 catch로 삼킨다. */
async function leaveChannelSafely(channel: RealtimeChannel): Promise<void> {
  try {
    await channel.untrack();
  } catch {
    // best-effort — 소켓이 이미 죽어 있으면 untrack 자체가 실패할 수 있다. 그래도 아래
    // removeChannel은 반드시 실행되어야 로컬 채널 핸들/리스너가 남지 않는다.
  }
  void supabase.removeChannel(channel);
}

/** Pixel World Phase 2A — 광장(Plaza) 실시간 배선. presenceStore.ts의 순수 reducer 위에
 * Supabase Presence(현재 위치의 진실, 느림/무거움)와 Broadcast(이동 중 보간용, 빠름/가벼움)를
 * 얹는다. 정확한 라우팅 정책은 updateMyState 안의 주석 참고. */
export function usePlazaRealtime(sessionId: string, appearance: PublicAvatarAppearance): UsePlazaRealtimeResult {
  const [storeState, dispatch] = useReducer(plazaStoreReducer, undefined, createPlazaStoreState);
  const [ready, setReady] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  // 이 세션(=이 훅 인스턴스, 탭 하나) 안에서 단조증가하는 시퀀스 — PlazaPlayerState.seq를 우리가
  // 소유하고 채운다. 최초 마운트에서만 0부터 시작하고, 그 뒤로는 채널 재연결(reconnect)이 일어나도
  // 리셋하지 않는다 — 실시간 이동 재현 테스트(tests/plaza/reconnect.browser.mjs)로 확인된 버그:
  // 예전엔 connect()가 호출될 때마다(재연결 포함) 0으로 되돌렸는데, presence-join 경로 자체는
  // seq를 안 보니 그건 "안전"했지만, useSmoothedPlayerPositions.ts의 스무딩 커서(그 세션에서
  // 마지막으로 소비한 seq를 기억)는 seq가 이 훅 인스턴스 동안 계속 커진다는 가정에 기대고
  // 있었다. 재연결로 seq가 0 근처로 되돌아가면 새로 들어오는 broadcast의 seq가 커서보다 한동안
  // 계속 작아서(stale 취급) getPathSince가 빈 배열만 돌려주고, 상대는 moving:true인데도 좌표가
  // 갱신되지 않는 "제자리 걷기"로 보였다 — 로컬 seq가 그 커서를 다시 추월할 때까지. 재연결도
  // sessionId는 그대로 유지되는 같은 세션이므로(새 sessionId를 받는 건 완전히 다른 탭/재입장뿐),
  // seq를 이 훅 인스턴스 생애 동안 계속 단조증가시키는 쪽이 올바른 모델이다.
  const seqRef = useRef(0);
  // 최근에 실제로 전송한 내 위치/방향/이동여부 — appearance만 바뀌어서 재track할 때도, 그리고
  // 재연결로 새 채널을 만들 때도 최신 위치를 그대로 실어 보내기 위해 필요하다.
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
  // 동안 고정값이다). 이 안에서 채널 (재)연결, 재연결 backoff까지 전부 소유한다. 접속 여부의
  // 판정은 오직 presence-leave/sync와 이 effect의 확정적 cleanup(leaveChannelSafely)뿐이다 —
  // "마지막 이동 시각" 기반 별도 stale sweep은 폐기했다(presenceStore.ts 상단 주석 참고).
  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let reconnectAttempt = 0;
    let reconnectTimer: number | null = null;

    function clearReconnectTimer() {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function scheduleReconnect() {
      if (cancelled || reconnectTimer !== null) return;
      const delay = reconnectDelayFor(reconnectAttempt);
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        if (cancelled) return;
        connect();
      }, delay);
    }

    function connect() {
      if (cancelled) return;
      plazaDebugLog('channel:connect', sessionId, { previousSeq: seqRef.current, reconnectAttempt });
      // seqRef는 여기서 리셋하지 않는다 — 위 seqRef 선언부 주석 참고(리셋하면 재연결 후 seq가
      // 스무딩 커서보다 작아져 상대 화면에서 "제자리 걷기"가 재현된다). movingRef만 리셋한다:
      // 새 채널은 presence 상태가 텅 비어 있으므로, 재연결 직후 내 실제 moving 값이 바뀌지 않아도
      // (이미 움직이고 있던 중이었어도) 다음 updateMyState 호출에서 새 채널에 대한 track()이 한 번
      // 더 나가도록 "이 채널엔 아직 아무것도 track 안 했다"는 상태로 되돌려 둔다.
      movingRef.current = false;
      setReady(false);

      // presence: { key: sessionId } — 같은 계정으로 연 여러 탭도 sessionId가 서로 달라서 독립된
      // presence 항목으로 잡힌다(서로 덮어쓰지 않음).
      const nextChannel = supabase.channel(PLAZA_CHANNEL_NAME, {
        config: { presence: { key: sessionId } },
      });
      channel = nextChannel;
      channelRef.current = nextChannel;

      nextChannel.on('presence', { event: 'sync' }, () => {
        const players = flattenPresenceState(nextChannel.presenceState<PlazaPlayerState>());
        plazaDebugLog('recv:presence-sync', { count: players.length, t: performance.now().toFixed(1) });
        dispatch({ type: 'presence-sync', players });
        // 늦게 들어온 학생이 '현재' 모두의 위치를 읽는 지점 — sync를 한 번이라도 받으면 광장의
        // 초기 상태를 확보한 것이므로 여기서 ready로 전환한다.
        if (!cancelled) setReady(true);
      });

      nextChannel.on<PlazaPlayerState>('presence', { event: 'join' }, ({ newPresences }) => {
        plazaDebugLog('recv:presence-join', newPresences.map(p => `${p.sessionId}(${p.x},${p.y})#${p.seq} moving=${p.moving}`), { t: performance.now().toFixed(1) });
        dispatch({ type: 'presence-join', players: newPresences });
      });

      nextChannel.on<PlazaPlayerState>('presence', { event: 'leave' }, ({ leftPresences }) => {
        plazaDebugLog('recv:presence-leave', leftPresences.map(p => p.sessionId), { t: performance.now().toFixed(1) });
        dispatch({ type: 'presence-leave', sessionIds: leftPresences.map(presence => presence.sessionId) });
      });

      nextChannel.on<PlazaPlayerState>('broadcast', { event: MOVE_BROADCAST_EVENT }, ({ payload }) => {
        plazaDebugLog('recv:broadcast', payload.sessionId, `(${payload.x},${payload.y})#${payload.seq}`, { t: performance.now().toFixed(1) });
        dispatch({ type: 'broadcast', player: payload });
      });

      nextChannel.subscribe(status => {
        if (cancelled) return;
        // 이 채널이 이미 다른 connect()/teardown에 의해 교체된 뒤 뒤늦게 도착한 이벤트라면
        // 무시한다 — 그렇지 않으면 옛 채널의 트레일링 CLOSED 같은 이벤트가 "channel"이라는
        // effect-scope 공유 변수를 통해 방금 새로 만든(진짜 살아있는) 채널을 잘못 죽이고 또
        // 재연결을 스케줄하는 경합이 생긴다. nextChannel은 이 connect() 호출 하나에만 묶인
        // const라 정확한 신원 확인이 된다.
        if (channel !== nextChannel) return;
        plazaDebugLog('channel:status', sessionId, { status, seq: seqRef.current });
        if (status === 'SUBSCRIBED') {
          reconnectAttempt = 0; // 정상적으로 붙었으니 다음에 다시 끊기면 backoff를 처음부터 센다
          seqRef.current += 1;
          void nextChannel.track(buildSelfState(seqRef.current));
          return;
        }
        // CHANNEL_ERROR / TIMED_OUT / CLOSED — 예전에는 여기서 아무것도 하지 않아서(issue #2) 한
        // 번 끊기면 그 세션 내내 조용히 죽어 있었다. ready를 내려서 "재연결 중"임을 알 수 있게
        // 하고, backoff를 두고 새 채널로 재연결을 시도한다. 지금 죽어가는 채널 자체는 다시
        // subscribe()하지 않는다 — 이 라이브러리 버전은 채널이 'closed' 상태일 때만 subscribe()가
        // 실제로 join을 재시도하므로(channelAdapter.isClosed() 가드), errored 상태에서 같은
        // 인스턴스에 재호출하는 것보다 깨끗하게 새 채널을 만들어 스스로 재연결을 책임지는 쪽이
        // 더 예측 가능하다.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setReady(false);
          channel = null;
          channelRef.current = null;
          void leaveChannelSafely(nextChannel);
          scheduleReconnect();
        }
      });
    }

    connect();

    // beforeunload에서의 untrack은 best-effort일 뿐이다(브라우저가 네트워크 요청을 끝까지
    // 보장해주지 않는다) — 진짜 안전망은 Supabase Presence 자신의 연결 끊김 감지(소켓이 끊기면
    // 서버가 자동으로 그 presence를 leave 처리)다. 여기서는 정상 종료 시 정리를 한 틱이라도
    // 앞당기는 정도의 역할만 한다.
    const handleBeforeUnload = () => { void channel?.untrack(); };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelled = true;
      clearReconnectTimer();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      channelRef.current = null;
      setReady(false);
      const dying = channel;
      channel = null;
      if (dying) void leaveChannelSafely(dying);
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
      plazaDebugLog('send:broadcast', sessionId, `(${state.x},${state.y})#${state.seq}`, { moving: state.moving, t: performance.now().toFixed(1) });
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

  return { players, paths: storeState.paths, ready, updateMyState };
}
