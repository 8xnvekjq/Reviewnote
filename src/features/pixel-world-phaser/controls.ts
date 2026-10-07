// DOM 입력(조이스틱·A/B·키보드) → Phaser 장면이 매 프레임 읽는 공유 상태. React state가 아니라
// 그냥 객체라서 손가락이 움직여도 React가 다시 그리지 않는다.
import { ZERO_STICK } from './logic/joystick';
import type { StickVector } from './logic/joystick';

export interface ControlState {
  /** 조이스틱(또는 키보드) 방향. */
  stick: StickVector;
  /** B를 누르고 있는 동안(또는 Shift) 달리기. */
  run: boolean;
  /** 대화창이 열려 있으면 캐릭터가 멈춘다. */
  frozen: boolean;
}
export function createControls(): ControlState {
  return { stick: ZERO_STICK, run: false, frozen: false };
}
