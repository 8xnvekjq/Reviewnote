// Pixel World Phase 2A — 광장(Plaza) presence/broadcast의 순수 상태 관리자(reducer).
// Supabase도 React도 import하지 않는다 — usePlazaRealtime.ts가 이 reducer 위에 실시간 배선을
// 얹는다. 그래서 이 파일은 node --test로 라이브 연결 없이 그대로 단위 테스트할 수 있다.

import type { PlazaPlayerState } from './types';

// 실시간 이동 버그(순간이동/경로 스킵) 조사 결과 — usePlazaRealtime.ts 상단 주석 참고. React는
// 같은 태스크 안에서 여러 dispatch가 몰리면(예: presence의 leave+join 동시 diff, 브라우저가
// 네트워크 큐를 한꺼번에 배출하는 broadcast burst 등) 렌더를 1번만 커밋한다 — 즉 "players"
// 스냅샷은 그 사이의 중간 좌표들을 절대 보여주지 못한다. 하지만 reducer 자신은 배치 여부와
// 무관하게 dispatch된 액션을 빠짐없이 순서대로 처리하므로("players"에 반영되는 건 마지막
// 결과뿐이라도, 그 결과를 만드는 과정에서 모든 액션이 실제로 실행된다), 렌더와 별개로 "그
// 세션이 실제로 지나온 좌표 순서"를 여기 "paths"에 append-only로 누적해 두면 정보 손실이
// 전혀 없다. 소비자(useSmoothedPlayerPositions.ts)는 seq를 커서 삼아 "마지막으로 읽은 이후"
// 구간만 꺼내가면서 rAF로 재생한다 — 렌더 횟수와 완전히 무관하게 실제 이동 경로를 그대로
// 따라갈 수 있다.
export interface PathWaypoint {
  x: number;
  y: number;
  seq: number; // 소비자가 "마지막으로 읽은 지점"을 기억하는 커서 — sender가 채우는 단조증가 값을 그대로 재사용.
}

// 세션 하나가 오래 이동해도 메모리가 무한정 자라지 않도록 하는 방어적 상한. 실전에서는 거의
// 항상 매 dispatch마다 소비되므로(렌더가 배치되지 않는 한 즉시 비워짐) 이 상한에 닿을 일이
// 없다 — 정말 오래 배치가 밀리거나(탭이 백그라운드로 오래 머묾) 드문 상황에서만 오래된 좌표를
// 잘라내는 안전망이다. 170ms 간격 기준 약 5초 분량. export는 테스트에서 캡 동작을 정확히
// 검증하기 위함.
export const MAX_PATH_LENGTH = 30;

function appendPath(paths: Map<string, PathWaypoint[]>, sessionId: string, point: PathWaypoint): Map<string, PathWaypoint[]> {
  const next = new Map(paths);
  const existing = next.get(sessionId) ?? [];
  const updated = [...existing, point];
  next.set(sessionId, updated.length > MAX_PATH_LENGTH ? updated.slice(updated.length - MAX_PATH_LENGTH) : updated);
  return next;
}

export interface PlazaStoreState {
  // sessionId -> 그 세션의 마지막으로 승인된 상태(렌더링/appearance/roster 판정용 — "지금" 스냅샷).
  players: Map<string, PlazaPlayerState>;
  // sessionId -> 그 세션이 실제로 지나온 좌표들의 append-only 이력(스무딩 재생용 — 위 주석 참고).
  paths: Map<string, PathWaypoint[]>;
  // sessionId -> 그 sessionId를 "지금 실제로 소유하고 있다"고 우리가 믿는 presence_ref. Supabase
  // Presence는 track()을 다시 호출할 때마다(재연결, 재입장 등) 같은 key(sessionId)에 대해서도
  // 서버가 새 presence_ref를 발급한다 — 퇴장/재입장 lifecycle 버그(2026-09) 조사 결과, 이 값을
  // 버리면 두 가지 문제가 동시에 생긴다: (1) 광장을 나갔다가 빠르게 다시 들어왔을 때, 나갈 때
  // 보낸 untrack()의 leave가 네트워크를 거쳐 "새로 들어온 뒤"에야 도착할 수 있는데, leave가
  // sessionId만 보고 지우면 방금 재입장한 진짜 최신 세션까지 통째로 지워버린다("상대 화면에서
  // 사라짐" 버그). presence_ref를 대조해서 "지금 알고 있는 join과 다른, 이미 대체된 낡은 join의
  // leave 메아리"면 무시하는 것으로 고친다. (2) 두 개의 join이 같은 key 아래 잠깐 공존하는
  // 동안(퇴장의 leave가 아직 반영 안 된 채 재입장의 join이 먼저 도착) flattenPresenceState가
  // 배열의 [0]번째(=Phoenix Presence.syncDiff가 join 시 새 meta를 unshift로 "뒤에" 붙이므로
  // 실제로는 가장 오래된 meta)를 골라 쓰면, 화면에는 재입장 이전의 "낡은" 위치가 계속 보인다
  // ("입구에서 제자리걸음" 버그) — usePlazaRealtime.ts의 flattenPresenceState 주석 참고.
  presenceRefs: Map<string, string>;
}

export function createPlazaStoreState(): PlazaStoreState {
  return { players: new Map(), paths: new Map(), presenceRefs: new Map() };
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
  | { type: 'presence-sync'; players: Array<{ player: PlazaPlayerState; presenceRef: string }> }
  | { type: 'presence-join'; players: Array<{ player: PlazaPlayerState; presenceRef: string }> }
  | { type: 'presence-leave'; leaves: Array<{ sessionId: string; presenceRef: string }> }
  | { type: 'broadcast'; player: PlazaPlayerState };

// Supabase Presence/Broadcast가 콜백에 건네주는 raw payload는 우리가 보낸 PlazaPlayerState보다
// 필드가 더 많을 수 있다(대표적으로 Presence는 presence_ref를 얹는다 — usePlazaRealtime.ts가
// 그 값을 여기 도착하기 전에 따로 뽑아 각 액션의 presenceRef로 넘긴다). 저장/렌더링에 쓰이는
// 값은 반드시 PlazaPlayerState 필드만 남도록 화이트리스트 방식으로 재구성한다 — 장차 실수로
// 다른 필드(닉네임 등 개인식별정보)가 payload에 섞여도 여기서 걸러져 저장되지 않는다.
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
//   "presence가 말하는 현재 상태"가 곧 진실이다. 탭이 새로고침되면 PixelRoom.tsx가 sessionId 자체를
//   새로 발급하므로(crypto.randomUUID() 재실행 — 완전히 다른 사람으로 취급돼도 무해) 그 새
//   sessionId는 당연히 seq 0부터 새로 시작하는 무관한 key다. 반면 같은 sessionId를 유지한 채
//   채널만 끊겼다 재연결되는 경우(usePlazaRealtime.ts의 reconnect backoff)는 seq를 리셋하지
//   않는다 — 예전엔 리셋했었는데, presence 경로 자체는 seq를 안 보니 그건 "안전"해 보였지만
//   useSmoothedPlayerPositions.ts의 스무딩 커서가 "그 세션의 seq는 이 훅 인스턴스 동안 계속
//   커진다"에 기대고 있어서, 재연결로 seq가 작아지면 커서보다 계속 낮은 값으로 취급돼 새 좌표를
//   전혀 소비하지 못하는 버그("제자리 걷기")가 났다(usePlazaRealtime.ts의 seqRef 선언부 주석,
//   tests/plaza/reconnect.browser.mjs 참고). 어느 경우든 presence 경로는 여전히 seq를 판정에
//   쓰지 않고 "지금 이 순간의 상태"를 그대로 받아들인다 — 위 설명은 그 seq 값이 실제로 어떻게
//   변화하는지에 대한 것일 뿐, presence 판정 로직 자체는 바뀌지 않았다.
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
// - presence-leave만 예외적으로 sessionId 외에 presenceRef도 함께 검사한다: 그 sessionId를
//   "지금 소유하고 있다"고 기록해 둔 presenceRef와 이 leave의 presenceRef가 다르면(=이미 새
//   join으로 대체된 낡은 join의 뒤늦은 leave), 조용히 무시한다 — 위 PlazaStoreState.presenceRefs
//   주석 참고. 이건 seq 비교가 아니라 "이 leave가 지금 내가 아는 그 join이 맞는지" 신원 확인이다.
export function plazaStoreReducer(state: PlazaStoreState, action: PlazaStoreAction): PlazaStoreState {
  switch (action.type) {
    case 'presence-sync': {
      const players = new Map<string, PlazaPlayerState>();
      const paths = new Map<string, PathWaypoint[]>();
      const presenceRefs = new Map<string, string>();
      for (const { player, presenceRef } of action.players) {
        const sanitized = sanitizePlayerState(player);
        players.set(sanitized.sessionId, sanitized);
        presenceRefs.set(sanitized.sessionId, presenceRef);
        // sync는 "지금 이 순간의 완전한 명단"이다 — 그 이전 경로는 우리가 관측하지 못했던
        // 구간이므로 재생하지 않고, 이 좌표 하나를 새 출발점으로 삼는다(스푼 없이 그 자리에서
        // 시작). 기존에 알고 있던 이력은 sync로 대체되므로 함께 초기화한다.
        paths.set(sanitized.sessionId, [{ x: sanitized.x, y: sanitized.y, seq: sanitized.seq }]);
      }
      return { players, paths, presenceRefs };
    }
    case 'presence-join': {
      if (action.players.length === 0) return state;
      const players = new Map(state.players);
      const presenceRefs = new Map(state.presenceRefs);
      let paths = state.paths;
      for (const { player, presenceRef } of action.players) {
        const sanitized = sanitizePlayerState(player);
        players.set(sanitized.sessionId, sanitized);
        presenceRefs.set(sanitized.sessionId, presenceRef);
        // presence-join은 이동 시작/정지 전이, appearance 변경, 최초 입장에서만 온다(빈도 낮음,
        // 항상 신뢰). moving:false 전이의 경우 "실제 최종 도착 칸"을 담고 있으므로, 혹시 그 사이
        // broadcast 일부가 유실되더라도 경로의 마지막 지점은 반드시 정확하게 재생되도록 이
        // 좌표도 경로에 추가한다.
        paths = appendPath(paths, sanitized.sessionId, { x: sanitized.x, y: sanitized.y, seq: sanitized.seq });
      }
      return { players, paths, presenceRefs };
    }
    case 'presence-leave': {
      if (action.leaves.length === 0) return state;
      const players = new Map(state.players);
      const paths = new Map(state.paths);
      const presenceRefs = new Map(state.presenceRefs);
      let changed = false;
      for (const { sessionId, presenceRef } of action.leaves) {
        // 이 leave가 "지금 내가 그 sessionId의 주인이라고 아는 join"의 것이 아니면(이미 새
        // join으로 대체됨) 무시한다 — 퇴장(비동기 untrack)과 재입장(join)이 경합할 때, 늦게
        // 도착한 옛 leave가 방금 막 재입장한 진짜 최신 세션을 지워버리지 않도록 하는 지점.
        // 우리가 그 sessionId의 ref를 전혀 모르는 경우(join을 아직 못 본 채로 leave부터 온
        // 극히 드문 순서 — 그래도 안전하게)도 무시한다: 모르는 걸 지울 이유가 없다.
        if (presenceRefs.get(sessionId) !== presenceRef) continue;
        if (players.delete(sessionId)) changed = true;
        paths.delete(sessionId);
        presenceRefs.delete(sessionId);
      }
      return changed ? { players, paths, presenceRefs } : state;
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
      const paths = appendPath(state.paths, incoming.sessionId, { x: incoming.x, y: incoming.y, seq: incoming.seq });
      return { players, paths, presenceRefs: state.presenceRefs };
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

// sinceSeq보다 큰 seq를 가진, 아직 소비되지 않은 경로 구간만 순서대로 돌려준다. paths는
// PlazaStoreState.paths를 그대로 받는다(usePlazaRealtime.ts가 storeState 전체가 아니라 이 Map만
// 밖으로 내보내므로). 호출자(useSmoothedPlayerPositions.ts)는 이 반환값의 마지막 seq를 다음
// 호출의 sinceSeq로 기억해 두는 식으로 "커서"를 직접 들고 있는다 — 렌더가 몇 번 일어났든(배치로
// 1번이든 N번이든) 이 함수는 항상 "그 사이 실제로 지나온 좌표 전부"를 빠짐없이 돌려준다.
export function getPathSince(paths: Map<string, PathWaypoint[]>, sessionId: string, sinceSeq: number): PathWaypoint[] {
  const path = paths.get(sessionId);
  if (!path || path.length === 0) return [];
  return path.filter(point => point.seq > sinceSeq);
}
