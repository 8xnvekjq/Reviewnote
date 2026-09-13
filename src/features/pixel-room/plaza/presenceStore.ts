// Pixel World Phase 2A — 광장(Plaza) presence/broadcast의 순수 상태 관리자(reducer).
// Supabase도 React도 import하지 않는다 — usePlazaRealtime.ts가 이 reducer 위에 실시간 배선을
// 얹는다. 그래서 이 파일은 node --test로 라이브 연결 없이 그대로 단위 테스트할 수 있다.

import type { PlazaPlayerState } from './types';

export interface PlazaStoreState {
  // sessionId -> 그 세션의 마지막으로 승인된 상태.
  players: Map<string, PlazaPlayerState>;
}

export function createPlazaStoreState(): PlazaStoreState {
  return { players: new Map() };
}

// Presence(sync/join)와 Broadcast(move)를 분리한 이유: 정책이 서로 다르기 때문이다(아래 reducer
// 주석 참고). 'leave'는 presence의 명시적 퇴장 이벤트만 소비한다 — broadcast에는 leave 개념이
// 없다(플레이어가 사라지는 유일한 신호는 presence leave 또는 sync에서의 누락).
//
// (과거에 있었던 'sweep-stale' — updatedAt 기준 마지막 안전망 — 은 폐기했다. 정지한 플레이어는
// moving 전이가 없는 한 track()도 broadcast도 다시 안 보내므로 updatedAt이 그 시점에서 멈추고,
// 그 결과 "가만히 있기만 해도 얼마 뒤 사라졌다가 다시 움직이면 나타나는" 실사용 버그를 냈다 —
// 이건 Supabase 문제가 아니라 "마지막 이동 시각"을 "접속 여부"로 오독한 클라이언트 상태 모델
// 버그였다. 접속 여부의 유일한 기준은 이제 presence-leave/sync, untrack→removeChannel cleanup,
// reconnect뿐이다. <30명 규모의 내부 도구에서 탭이 강제 종료돼 leave 이벤트 자체가 유실되는
// 극단적 경우까지 로컬에서 따로 방어할 필요는 없다고 판단해 추가하지 않았다 — 정말 필요해지면
// "마지막 이동 시각"이 아니라 실제 connection/heartbeat 신호를 기준으로 다시 설계할 것.)
export type PlazaStoreAction =
  | { type: 'presence-sync'; players: PlazaPlayerState[] }
  | { type: 'presence-join'; players: PlazaPlayerState[] }
  | { type: 'presence-leave'; sessionIds: string[] }
  | { type: 'broadcast'; player: PlazaPlayerState };

// Supabase Presence/Broadcast가 콜백에 건네주는 raw payload는 우리가 보낸 PlazaPlayerState보다
// 필드가 더 많을 수 있다(대표적으로 Presence는 presence_ref를 얹는다). 저장/렌더링에 쓰이는 값은
// 반드시 PlazaPlayerState 필드만 남도록 화이트리스트 방식으로 재구성한다 — 장차 실수로 다른
// 필드(닉네임 등 개인식별정보)가 payload에 섞여도 여기서 걸러져 저장되지 않는다.
function sanitizePlayerState(raw: PlazaPlayerState): PlazaPlayerState {
  const appearance = raw.appearance ?? { top: null, bottom: null, shoes: null, hair: null, eyes: null };
  return {
    sessionId: raw.sessionId,
    x: raw.x,
    y: raw.y,
    direction: raw.direction,
    moving: raw.moving,
    appearance: {
      top: appearance.top ?? null,
      bottom: appearance.bottom ?? null,
      shoes: appearance.shoes ?? null,
      hair: appearance.hair ?? null,
      eyes: appearance.eyes ?? null,
    },
    seq: raw.seq,
    updatedAt: raw.updatedAt,
  };
}

// 정책 요약(중복/재접속 세션 처리):
//
// - presence-sync / presence-join은 항상 그대로 반영한다(seq 비교 없음). Supabase Presence는
//   서버가 "이 key의 현재 상태"로 이미 합의를 끝낸 값을 밀어주는 채널이라, 클라이언트 입장에서는
//   "presence가 말하는 현재 상태"가 곧 진실이다. 탭이 새로고침/재접속되면 이 훅은 seq 카운터를
//   0(또는 1)부터 다시 시작하므로, 같은 sessionId가 이전보다 낮은 seq로 "재등장"하는 일이 정상
//   케이스로 발생한다 — 이걸 막으면 재접속한 사람이 영영 안 보이거나 낡은 위치에 박제된다. 그래서
//   presence 경로는 의도적으로 seq를 판정에 쓰지 않고, 재접속 시의 seq 리셋을 새 기준선으로
//   받아들인다.
// - broadcast(move)만 seq 단조증가를 엄격히 검사해서 낡은/순서 뒤바뀐 메시지를 버린다. 같은 접속
//   안에서 온 이동 이벤트들은 seq가 항상 커지므로, "저장된 seq보다 크지 않으면 버린다"가 곧
//   "네트워크상에서 늦게 도착한 예전 이동값이 최신 위치를 되돌리지 못하게 한다"는 뜻이 된다.
// - 알려진 한계: broadcast payload에는 세대(epoch) 정보가 없다(공유 계약인 PlazaPlayerState에
//   seq/updatedAt 외의 필드를 추가하지 않기로 했으므로). 이론적으로 "재접속 이전 연결에서 아주
//   늦게 도착한 broadcast"가 재접속 이후의 낮아진 seq보다 커서 통과하는 경우가 있을 수 있다.
//   같은 WebSocket 연결 내 메시지는 순서가 보장되고, 재접속은 새 연결이므로 이전 연결의 메시지가
//   그 이후에 도착하는 상황은 사실상 발생하지 않는다(30명 미만의 내부용 도구, 적대적 사용자를
//   가정하지 않음) — 최악의 경우에도 다음 tick(170ms)에서 바로 정정되는 한 프레임짜리 시각적
//   흠으로 그친다. 이 정도는 감수하기로 하고, 굳이 공유 타입에 epoch 필드를 추가하지 않았다.
export function plazaStoreReducer(state: PlazaStoreState, action: PlazaStoreAction): PlazaStoreState {
  switch (action.type) {
    case 'presence-sync': {
      const players = new Map<string, PlazaPlayerState>();
      for (const player of action.players) {
        players.set(player.sessionId, sanitizePlayerState(player));
      }
      return { players };
    }
    case 'presence-join': {
      if (action.players.length === 0) return state;
      const players = new Map(state.players);
      for (const player of action.players) {
        players.set(player.sessionId, sanitizePlayerState(player));
      }
      return { players };
    }
    case 'presence-leave': {
      if (action.sessionIds.length === 0) return state;
      const players = new Map(state.players);
      let changed = false;
      for (const sessionId of action.sessionIds) {
        if (players.delete(sessionId)) changed = true;
      }
      return changed ? { players } : state;
    }
    case 'broadcast': {
      const incoming = sanitizePlayerState(action.player);
      const existing = state.players.get(incoming.sessionId);
      if (existing && incoming.seq <= existing.seq) {
        // Stale/out-of-order defense: never roll a visible position backward.
        return state;
      }
      const players = new Map(state.players);
      players.set(incoming.sessionId, incoming);
      return { players };
    }
    default:
      return state;
  }
}

// 나(this is me) sessionId는 제외하고 나머지 플레이어만 돌려준다 — 호출자는 자신을 로컬에서
// 직접 렌더링하므로, 서버가 에코한 내 자신까지 중복으로 그리지 않기 위함.
export function getOtherPlayers(state: PlazaStoreState, meSessionId: string): PlazaPlayerState[] {
  const result: PlazaPlayerState[] = [];
  for (const player of state.players.values()) {
    if (player.sessionId !== meSessionId) result.push(player);
  }
  return result;
}
