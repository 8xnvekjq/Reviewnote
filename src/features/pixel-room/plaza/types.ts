import type { PublicAvatarAppearance } from '../shop/types';

// Pixel World Phase 2A — 광장(Plaza) 공유 계약. Worker A(Realtime)와 Worker B(UI/Movement)가
// 병렬로 이 타입/상수만 신뢰하고 각자 구현한다. 여기 없는 세부 구현(채널 이름 외 내부 payload
// 형태, throttle 처리 방식 등)은 각 Worker의 담당 영역 재량 — 단, 아래 export되는 값/시그니처는
// 반드시 그대로 쓴다(임의로 새 타입을 만들지 말 것).

// 기존 pixel-room의 Direction과 동일한 4방향 — 새 이름을 만들지 않고 그대로 재사용.
export type PlazaDirection = 'Front' | 'Back' | 'Left' | 'Right';

// 광장에만 존재하는, 서버에 절대 저장하지 않는 순간 상태. 닉네임/이메일/이름/칭호 등 개인식별
// 정보는 절대 포함하지 않는다 — 다른 사용자는 이 shape만 보고, sessionId로는 실제 계정을
// 역추적할 수 없어야 한다(랜덤 값, user_id 아님).
export interface PlazaPlayerState {
  sessionId: string;   // 이 탭 하나의 고유 id(crypto.randomUUID() 등) — 같은 계정 여러 탭 구분용
  x: number;
  y: number;
  direction: PlazaDirection;
  moving: boolean;
  appearance: PublicAvatarAppearance; // Phase 1 서버 장착 상태 그대로(src/utils/pixelShop.ts의 fetchEquippedAppearance)
  seq: number;          // 이 세션 안에서 단조증가하는 시퀀스 — out-of-order/오래된 메시지 방어용
  updatedAt: number;    // Date.now() — 참고용 타임스탬프(1차 판정 기준은 seq)
}

// 광장은 하나뿐 — 채널 이름을 두 Worker가 각자 다르게 짓지 않도록 고정.
export const PLAZA_CHANNEL_NAME = 'pixel-world-plaza';

// 기존 방 이동 tick(PixelRoom.tsx의 setInterval(step, 170))과 같은 cadence를 그대로 재사용 —
// 새 숫자를 만들지 않고 이미 검증된 "실시간처럼 느껴지는" 값을 그대로 따른다. Broadcast는
// 이동 중 이 주기로, Presence(현재 위치의 진실)는 이동 시작/종료·appearance 변경 시에만 갱신.
export const PLAZA_MOVE_TICK_MS = 170;

// 방(10x8)보다 넓은 단일 맵 — 새 카메라/스크롤 시스템 없이 화면 하나에 그대로 들어가는 크기.
export const PLAZA_WIDTH = 16;
export const PLAZA_HEIGHT = 12;
