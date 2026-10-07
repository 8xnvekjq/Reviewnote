// v2는 연속 칸 좌표를 덧붙인다. x/y는 구형 광장용 가장 가까운 칸으로 유지한다.
import type { PlazaPlayerState } from './types';
import { isPetId } from '../pet/petKinds';
export function continuousPosition(p: Pick<PlazaPlayerState, 'x' | 'y' | 'version' | 'position'>) {
  const q = p.position;
  return p.version === 2 && q && Number.isFinite(q.x) && Number.isFinite(q.y)
    && q.x >= -.5 && q.x < 16 && q.y >= -.5 && q.y < 12 ? { x: q.x, y: q.y } : { x: p.x, y: p.y };
}
export function protocolExtras(p: Pick<PlazaPlayerState, 'x' | 'y' | 'version' | 'position' | 'pet'>): Partial<PlazaPlayerState> {
  if (p.version !== 2) return {};
  const q = continuousPosition(p);
  return { version: 2, position: q, pet: isPetId(p.pet) ? p.pet : null };
}
export function continuousPayload(feet: { x: number; y: number }, margin = 5) {
  const position = { x: feet.x / 16 - margin - .5, y: feet.y / 16 - margin - .5 };
  return { version: 2 as const, position, x: Math.max(0, Math.min(15, Math.round(position.x))), y: Math.max(0, Math.min(11, Math.round(position.y))) };
}
