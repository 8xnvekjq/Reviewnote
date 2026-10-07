// 화면 크기·안전영역(노치/홈 인디케이터) → 카메라 배율과 HUD/버튼 배치. 순수 함수(단위 테스트 대상).
export type Insets = { top: number; right: number; bottom: number; left: number };
export type Circle = { x: number; y: number; size: number };
export type Rect = { x: number; y: number; width: number; height: number };
export interface GameLayout {
  width: number; height: number;
  orientation: 'portrait' | 'landscape';
  device: 'phone' | 'tablet';
  /** 카메라 정수 배율(CSS px / 월드 px) — 도트가 고르게 보이도록 항상 정수. */
  zoom: number;
  /** 상단 HUD 띠(포인트·버튼) 영역. 조이스틱 영역은 이 아래부터. */
  hud: Rect;
  a: Circle; b: Circle;
  /** 조이스틱이 생길 수 있는 영역(화면 왼쪽 절반, HUD 아래). */
  stickZone: Rect;
  /** 대화창 영역 — 하단 버튼과 겹치지 않게 그 위에 둔다. */
  dialogue: Rect;
}
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
/** 짧은 변이 이 값보다 작으면 폰으로 본다(갤럭시 탭/아이패드 미니의 짧은 변은 600 이상). */
export const PHONE_SHORT_SIDE = 600;
/** 화면 짧은 변에 보이는 월드 픽셀 목표치 — 약 9~10타일(16px). */
const TARGET_WORLD_SHORT_SIDE = 150;
const HUD_HEIGHT = 52;
const EDGE = 14;

export function cameraZoom(width: number, height: number): number {
  const short = Math.max(1, Math.min(width, height));
  return Math.max(2, Math.min(8, Math.round(short / TARGET_WORLD_SHORT_SIDE)));
}

export function gameLayout(width: number, height: number, insets: Insets = NO_INSETS): GameLayout {
  const w = Math.max(1, width), h = Math.max(1, height);
  const device = Math.min(w, h) < PHONE_SHORT_SIDE ? 'phone' : 'tablet';
  const orientation = h >= w ? 'portrait' : 'landscape';
  // 버튼은 엄지가 닿는 아래 모서리. 56px 이상(폰 64, 태블릿 76).
  const size = device === 'phone' ? 64 : 76;
  const right = w - insets.right - EDGE, bottom = h - insets.bottom - EDGE;
  // 게임보이식 배치: A는 오른쪽 위, B는 그 왼쪽 아래 — 엄지를 굴려 A↔B를 오갈 수 있다.
  const a: Circle = { x: right - size / 2, y: bottom - size * 1.05, size };
  const b: Circle = { x: a.x - size * 1.1, y: bottom - size / 2, size };
  // 아주 좁은 화면에서도 B가 왼쪽 절반(조이스틱 영역)으로 넘어가지 않게 한다.
  b.x = Math.max(b.x, w / 2 + size / 2 + 4);
  const hud: Rect = { x: insets.left, y: insets.top, width: w - insets.left - insets.right, height: HUD_HEIGHT };
  const stickTop = insets.top + HUD_HEIGHT;
  const stickZone: Rect = { x: 0, y: stickTop, width: Math.floor(w / 2), height: Math.max(0, h - stickTop) };
  const dialogueWidth = Math.min(w - insets.left - insets.right - EDGE * 2, 560);
  const dialogueHeight = device === 'phone' ? 104 : 118;
  const dialogueBottom = Math.min(a.y, b.y) - size / 2 - 10;
  const dialogue: Rect = {
    x: Math.round((w - dialogueWidth) / 2), width: Math.max(0, Math.round(dialogueWidth)),
    y: Math.round(Math.max(stickTop + 8, dialogueBottom - dialogueHeight)), height: dialogueHeight,
  };
  return { width: w, height: h, orientation, device, zoom: cameraZoom(w, h), hud, a, b, stickZone, dialogue };
}

/** 카메라 중심 한 축: 맵이 화면보다 크면 맵 밖이 보이지 않게 자르고, 작으면 가운데에 둔다. */
export function cameraCenterAxis(target: number, view: number, world: number): number {
  if (world <= view) return world / 2;
  return Math.min(world - view / 2, Math.max(view / 2, target));
}

export function insideCircle(point: { x: number; y: number }, circle: Circle, slop = 6): boolean {
  return Math.hypot(point.x - circle.x, point.y - circle.y) <= circle.size / 2 + slop;
}
export function insideRect(point: { x: number; y: number }, rect: Rect): boolean {
  return point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height;
}
