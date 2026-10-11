// 손 칸 → 캐릭터 손에 그릴 도구(친구 화면에 보내는 값도 같다). 가방이 아직 없으면 그리지 않는다.
import { rodDisplay } from '../../pixel-room/shop/rods';
import type { Hand } from './bag';
import type { HeldToolSpec } from '../game/heldTool';

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
