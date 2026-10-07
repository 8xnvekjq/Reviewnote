import type { Facing, Point } from './joystick';
import { petFollowSpot } from './petSheets';
import type { PetSheet } from './petSheets';

export const PET_START_RADIUS = 12;
export const PET_STOP_RADIUS = 4;

export interface PetFollowState {
  target: Point;
  walking: boolean;
  flipX: boolean;
  stuckMs: number;
  cooldownMs: number;
}

interface FollowWorld {
  move(from: Point, dx: number, dy: number): Point;
  blocked(point: Point): boolean;
}

export function createPetFollowState(position: Point, flipX = false): PetFollowState {
  return { target: { ...position }, walking: false, flipX, stuckMs: 0, cooldownMs: 0 };
}

/** 목표 완화와 출발/도착 반경을 분리해 방향 전환과 제자리 떨림을 줄인다. */
export function stepPetFollow(
  state: PetFollowState, here: Point, feet: Point, facing: Facing,
  sheet: Pick<PetSheet, 'pace' | 'facesLeft'>, deltaMs: number, runSpeed: number,
  world: FollowWorld,
): { state: PetFollowState; position: Point; walking: boolean; teleported: boolean } {
  const elapsed = Math.max(0, Math.min(deltaMs, 50));
  const dt = elapsed / 1000;
  const spot = petFollowSpot(feet, facing);
  // 벽 안의 추종 위치를 계속 쫓지 않도록 안전한 발 위치를 목표로 삼는다.
  const recovery = !world.blocked(spot) ? spot : !world.blocked(feet) ? feet : null;
  const desired = recovery ?? spot;
  const ease = 1 - Math.exp(-12 * dt);
  const target = {
    x: state.target.x + (desired.x - state.target.x) * ease,
    y: state.target.y + (desired.y - state.target.y) * ease,
  };
  const dx = target.x - here.x, dy = target.y - here.y;
  const distance = Math.hypot(dx, dy);
  const walking = state.walking ? distance > PET_STOP_RADIUS + 0.1 : distance > PET_START_RADIUS;
  // 가까워질수록 감속하고, 모든 펫의 최고 속도는 플레이어 달리기보다 빠르게 한다.
  const speed = Math.min(runSpeed * 1.6 * sheet.pace, Math.max(0, distance - PET_STOP_RADIUS) * 7 * sheet.pace);
  const step = walking ? Math.min(distance - PET_STOP_RADIUS, speed * dt) : 0;
  let position = step > 0 ? world.move(here, dx / distance * step, dy / distance * step) : here;
  const moved = Math.hypot(position.x - here.x, position.y - here.y);
  const cooldownMs = Math.max(0, state.cooldownMs - elapsed);
  // 도착 부근에서는 막힘 시간을 쌓지 않고, 벽 뒤 목표 대신 안전한 플레이어 발 위치도 사용한다.
  const stuckMs = step > 0 && distance > PET_START_RADIUS && moved < step * 0.3 && cooldownMs === 0
    ? state.stuckMs + elapsed : 0;
  const teleported = stuckMs >= 900 && recovery !== null;
  if (teleported) position = { ...recovery! };
  let flipX = state.flipX;
  if (!teleported && moved > 0.01 && Math.abs(dx) > 4 && Math.abs(position.x - here.x) > 0.01) {
    flipX = sheet.facesLeft ? dx > 0 : dx < 0;
  }
  return {
    position, teleported, walking: walking && moved > 0.01 && !teleported,
    state: {
      target: teleported ? { ...position } : target,
      walking: walking && !teleported, flipX,
      stuckMs: teleported ? 0 : stuckMs,
      cooldownMs: teleported ? 1500 : cooldownMs,
    },
  };
}
