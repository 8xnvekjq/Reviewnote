// 광장에서 가까이 선 친구 머리 위 "카드 대결" 버튼의 대상 고르기(순수 모듈).
import type { Point } from './joystick';
import { NET_REACH } from './netHit';

/** 이만큼(발↔발, 월드 px) 가까우면 버튼이 뜬다 — 잠자리채 그물 반지름의 두 배. */
export const RPS_DUEL_NEAR_PX = NET_REACH.radius * 2;
/** 이미 떠 있는 버튼은 이보다 멀어져야 숨긴다(경계에서 깜박이지 않게). */
export const RPS_DUEL_HIDE_PX = RPS_DUEL_NEAR_PX + 6;
/** 다른 친구가 이만큼 더 가까워야 버튼이 옮겨 간다. */
const SWITCH_MARGIN_PX = 2;

export interface DuelCandidate { id: string; x: number; y: number }

/** me(내 발)와 대결할 수 있는 친구들 중 버튼을 띄울 한 명. current = 지금 버튼이 떠 있는 친구. */
export function pickDuelTarget(me: Point, candidates: readonly DuelCandidate[], current: string | null): string | null {
  let nearest: { id: string; d: number } | null = null, kept: number | null = null;
  for (const c of candidates) {
    const d = Math.hypot(c.x - me.x, c.y - me.y);
    if (c.id === current && d <= RPS_DUEL_HIDE_PX) kept = d;
    if (d <= RPS_DUEL_NEAR_PX && (!nearest || d < nearest.d)) nearest = { id: c.id, d };
  }
  if (kept !== null && (!nearest || nearest.d > kept - SWITCH_MARGIN_PX)) return current;
  return nearest?.id ?? null;
}
