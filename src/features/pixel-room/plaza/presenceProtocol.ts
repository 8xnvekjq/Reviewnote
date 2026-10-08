// v2는 연속 칸 좌표를 덧붙인다. x/y는 구형 광장용 가장 가까운 칸으로 유지한다.
import type { PlazaPlayerState } from './types';
import { isPetId } from '../pet/petKinds';
/** 연속 좌표가 믿을 만한 범위(칸 단위). 광장은 16×12, 강가처럼 다른 채널은 자기 크기를 넘긴다. */
export interface PresenceBounds { width: number; height: number }
export const PLAZA_BOUNDS: PresenceBounds = { width: 16, height: 12 };
export function continuousPosition(p: Pick<PlazaPlayerState, 'x' | 'y' | 'version' | 'position'>, bounds: PresenceBounds = PLAZA_BOUNDS) {
  const q = p.position;
  return p.version === 2 && q && Number.isFinite(q.x) && Number.isFinite(q.y)
    && q.x >= -.5 && q.x < bounds.width && q.y >= -.5 && q.y < bounds.height ? { x: q.x, y: q.y } : { x: p.x, y: p.y };
}
export function protocolExtras(p: Pick<PlazaPlayerState, 'x' | 'y' | 'version' | 'position' | 'pet'>, bounds: PresenceBounds = PLAZA_BOUNDS): Partial<PlazaPlayerState> {
  if (p.version !== 2) return {};
  const q = continuousPosition(p, bounds);
  return { version: 2, position: q, pet: isPetId(p.pet) ? p.pet : null };
}
export function continuousPayload(feet: { x: number; y: number }, margin = 5, bounds: PresenceBounds = PLAZA_BOUNDS) {
  const position = { x: feet.x / 16 - margin - .5, y: feet.y / 16 - margin - .5 };
  return { version: 2 as const, position, x: Math.max(0, Math.min(bounds.width - 1, Math.round(position.x))), y: Math.max(0, Math.min(bounds.height - 1, Math.round(position.y))) };
}
