// 이미지 보기 창(ExamImageViewer)의 제스처 계산. DOM 없이 순수 함수로 두어 단위 테스트한다.
// 좌표는 모두 보기 창 가운데를 (0,0)으로 둔 CSS px, 이미지는 transform: translate(x,y) scale(scale) (origin 가운데).

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
/** 손가락·마우스가 이만큼 넘게 움직이면 탭이 아니라 드래그다. */
export const TAP_MOVE_PX = 10;
/** 이보다 오래 누르고 있으면 탭으로 보지 않는다(길게 눌러 살펴보다 뗀 경우). */
export const TAP_MAX_MS = 500;

export interface ViewState { scale: number; x: number; y: number }
export interface Point { x: number; y: number }
export interface Size { w: number; h: number }

export const IDENTITY: ViewState = { scale: 1, x: 0, y: 0 };

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_SCALE;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

/** 확대된 이미지가 화면 밖으로 빠져 빈 곳이 보이지 않도록 이동량을 제한한다. 1배면 항상 가운데. */
export function clampPan(view: ViewState, base: Size, viewport: Size): ViewState {
  const limitX = Math.max(0, (base.w * view.scale - viewport.w) / 2);
  const limitY = Math.max(0, (base.h * view.scale - viewport.h) / 2);
  return {
    scale: view.scale,
    x: Math.max(-limitX, Math.min(limitX, view.x)) || 0,
    y: Math.max(-limitY, Math.min(limitY, view.y)) || 0,
  };
}

/** focal(화면 가운데 기준) 아래의 이미지 지점이 그대로 머물도록 배율을 바꾼다. */
export function zoomAt(view: ViewState, nextScale: number, focal: Point, base: Size, viewport: Size): ViewState {
  const scale = clampScale(nextScale);
  const ratio = scale / view.scale;
  return clampPan({ scale, x: focal.x - (focal.x - view.x) * ratio, y: focal.y - (focal.y - view.y) * ratio }, base, viewport);
}

export interface PinchStart { view: ViewState; mid: Point; distance: number }

/** 두 손가락 핀치: 시작 거리 대비 배율 + 두 손가락 가운데 이동만큼 함께 끌기. */
export function pinchView(start: PinchStart, mid: Point, distance: number, base: Size, viewport: Size): ViewState {
  if (!(start.distance > 0)) return start.view;
  const scale = clampScale(start.view.scale * (distance / start.distance));
  const ratio = scale / start.view.scale;
  return clampPan({
    scale,
    x: mid.x - (start.mid.x - start.view.x) * ratio,
    y: mid.y - (start.mid.y - start.view.y) * ratio,
  }, base, viewport);
}

/** 한 손가락(또는 마우스) 드래그 — 확대 상태에서만 이동한다. */
export function dragView(start: ViewState, delta: Point, base: Size, viewport: Size): ViewState {
  if (start.scale <= MIN_SCALE) return start;
  return clampPan({ scale: start.scale, x: start.x + delta.x, y: start.y + delta.y }, base, viewport);
}

/** 휠/트랙패드 한 번에 바뀌는 배율. ctrl+휠(트랙패드 핀치)은 deltaY가 작아 더 민감하게 받는다. */
export function wheelScale(scale: number, deltaY: number, ctrlKey: boolean): number {
  const factor = Math.exp(-deltaY * (ctrlKey ? 0.01 : 0.002));
  return clampScale(scale * factor);
}

export interface GestureTrack {
  /** 이번 제스처(첫 포인터 down ~ 마지막 포인터 up) 동안 동시에 닿았던 최대 포인터 수 */
  maxPointers: number;
  /** 첫 포인터 시작점에서 가장 멀리 움직인 거리 */
  maxMove: number;
  startedAt: number;
}

export function startGesture(now: number): GestureTrack {
  return { maxPointers: 1, maxMove: 0, startedAt: now };
}

export function trackPointers(track: GestureTrack, count: number): GestureTrack {
  return count > track.maxPointers ? { ...track, maxPointers: count } : track;
}

export function trackMove(track: GestureTrack, from: Point, to: Point): GestureTrack {
  const move = Math.hypot(to.x - from.x, to.y - from.y);
  return move > track.maxMove ? { ...track, maxMove: move } : track;
}

/** 한 손가락으로 거의 안 움직이고 짧게 누른 것만 탭(=닫기). 핀치·드래그·길게 누르기는 닫지 않는다. */
export function isTap(track: GestureTrack, endedAt: number): boolean {
  return track.maxPointers === 1 && track.maxMove <= TAP_MOVE_PX && endedAt - track.startedAt <= TAP_MAX_MS;
}
