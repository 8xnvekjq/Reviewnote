// 손 칸 → 캐릭터 손에 그릴 도구(친구 화면에 보내는 값도 같다). 가방이 아직 없으면 그리지 않는다.
import { rodDisplay } from '../../pixel-room/shop/rods';
import type { Hand } from './bag';
import type { HeldToolSpec } from '../game/heldTool';
import type { Facing } from './joystick';

export type HeldToolMode = 'carry' | 'windup' | 'cast';
type Pt = { x: number; y: number };
/** 손 위치와 낚싯대 끝(발 기준). behind: 몸 뒤라 캐릭터보다 먼저 그린다. */
export function heldToolPose(facing: Facing, mode: HeldToolMode = 'carry'): { hand: Pt; tip: Pt; behind: boolean } {
  const side = facing === 'Left' ? -1 : 1;
  if (facing === 'Left' || facing === 'Right') {
    const hand = { x: 6 * side, y: -11 };
    if (mode === 'windup') return { hand, tip: { x: -16 * side, y: -33 }, behind: true };   // 머리 뒤로 젖힘
    if (mode === 'cast') return { hand, tip: { x: 24 * side, y: -19 }, behind: false };     // 물 쪽으로 내밂
    return { hand, tip: { x: 13 * side, y: -31 }, behind: false };
  }
  if (facing === 'Back') {
    const hand = { x: -6, y: -12 };
    if (mode === 'windup') return { hand, tip: { x: -4, y: 2 }, behind: false };            // 화면 쪽으로 젖힘
    if (mode === 'cast') return { hand, tip: { x: -5, y: -38 }, behind: true };             // 위(물 쪽)로 내밂
    return { hand, tip: { x: -10, y: -31 }, behind: true };
  }
  const hand = { x: 6, y: -11 };
  if (mode === 'windup') return { hand, tip: { x: 4, y: -36 }, behind: true };              // 머리 위 뒤로
  if (mode === 'cast') return { hand, tip: { x: 8, y: 9 }, behind: false };                 // 아래(물 쪽)로 내밂
  return { hand, tip: { x: 10, y: -30 }, behind: false };
}
/** 낚싯줄이 나가는 곳(낚싯대 끝, 발 기준 → 월드 좌표). */
export const rodTip = (feet: Pt, facing: Facing, mode: HeldToolMode): Pt => {
  const { tip } = heldToolPose(facing, mode);
  return { x: feet.x + tip.x, y: feet.y + tip.y };
};


export function heldToolFor(hand: Hand | null | undefined, rodId: string | null): HeldToolSpec | null {
  if (hand === 'net') return { kind: 'net', color: 0 };
  if (hand === 'rod') return { kind: 'rod', color: rodDisplay({ id: rodId, tier: 0 }).color };
  return null;
}
/** 친구에게 보내는 짧은 표시: 'net' | 'rod_basic' | 'rod_gold' … (맨손은 보내지 않는다). */
export const heldToolTag = (tool: HeldToolSpec | null, rodId: string | null) => !tool ? undefined : tool.kind === 'net' ? 'net' : rodId ?? 'rod_basic';
/** 받은 표시 → 그릴 도구. 모르는 값은 무시한다. */
export function heldToolFromTag(tag: unknown): HeldToolSpec | null {
  if (tag === 'net') return { kind: 'net', color: 0 };
  if (typeof tag === 'string' && /^rod_[a-z]{2,12}$/.test(tag)) return { kind: 'rod', color: rodDisplay({ id: tag, tier: 0 }).color };
  return null;
}
