import type { Point } from './joystick';
import { PET_SHEETS } from './petSheets';

export type FlightPhase = 'ground' | 'takeoff' | 'fly' | 'land';
export interface PetFlightState {
  phase: FlightPhase;
  elapsedMs: number;
  position: Point;
  target: Point;
  altitude: number;
  landingAltitude: number;
  flipX: boolean;
  cooldownMs: number;
}
export interface FlightWorld {
  blocked(point: Point): boolean;
  landing(point: Point): Point | null;
}
export const PIGEON_FLIGHT_DISTANCE = 64;
const TRANSITION_MS = 240;
const HEIGHT = 12;

export function createPetFlightState(position: Point, flipX = false): PetFlightState {
  return { phase: 'ground', elapsedMs: 0, position: { ...position }, target: { ...position }, altitude: 0, landingAltitude: HEIGHT, flipX, cooldownMs: 0 };
}

export function startPetFlight(state: PetFlightState, target: Point, world: FlightWorld): PetFlightState {
  const landing = world.landing(target);
  if (state.phase !== 'ground' || state.cooldownMs > 0 || !landing || world.blocked(landing)) return state;
  const dx = landing.x - state.position.x;
  return { ...state, phase: 'takeoff', elapsedMs: 0, target: { ...landing }, flipX: Math.abs(dx) > 4 ? dx > 0 : state.flipX };
}

/** 지상 좌표와 높이를 따로 유지하고 착륙 위치를 매번 검증한다. */
export function stepPetFlight(state: PetFlightState, deltaMs: number, world: FlightWorld, followTarget?: Point): PetFlightState {
  let next = { ...state, position: { ...state.position }, target: { ...state.target } };
  let remaining = Math.max(0, Math.min(deltaMs, 50));
  // 30/60fps에서 같은 작은 시간 간격으로 적분하고 전환 후 남은 시간도 사용한다.
  while (remaining > 1e-6) {
    const dt = Math.min(remaining, 1000 / 60,
      next.phase === 'takeoff' || next.phase === 'land' ? TRANSITION_MS - next.elapsedMs : remaining);
    remaining -= dt;
    next.cooldownMs = Math.max(0, next.cooldownMs - dt);
    if (next.phase === 'ground') continue;
    next.elapsedMs += dt;
    if (next.phase === 'takeoff') {
      next.altitude = HEIGHT * Math.max(0, (next.elapsedMs - 120) / 120);
      if (next.elapsedMs >= TRANSITION_MS - 1e-6) { next.phase = 'fly'; next.elapsedMs = 0; }
    } else if (next.phase === 'fly') {
      const desired = world.landing(followTarget ?? next.target);
      if (desired && !world.blocked(desired)) {
        if (followTarget) {
          const ease = 1 - Math.exp(-12 * dt / 1000);
          next.target.x += (desired.x - next.target.x) * ease;
          next.target.y += (desired.y - next.target.y) * ease;
        } else next.target = { ...desired };
      }
      const dx = next.target.x - next.position.x, dy = next.target.y - next.position.y;
      const distance = Math.hypot(dx, dy), step = Math.min(distance, 220 * dt / 1000);
      // 비행 중에는 지상 충돌을 적용하지 않으며 좌표를 반올림하지 않는다.
      if (distance > 0) {
        next.position.x += dx / distance * step;
        next.position.y += dy / distance * step;
      }
      if (Math.abs(dx) > 4) next.flipX = dx > 0;
      const height = HEIGHT + 1.5 * Math.sin(next.elapsedMs / 180);
      next.altitude += Math.max(-dt / 10, Math.min(dt / 10, height - next.altitude));
      if (desired && Math.hypot(desired.x - next.position.x, desired.y - next.position.y) < 0.5 && !world.blocked(next.position)) {
        next.phase = 'land'; next.elapsedMs = 0; next.landingAltitude = next.altitude;
      }
    } else {
      // 가구가 착륙 도중 생기면 다시 떠서 안전한 칸으로 이동한다.
      if (world.blocked(next.position)) { next.phase = 'fly'; next.elapsedMs = 0; continue; }
      next.altitude = next.landingAltitude * Math.max(0, 1 - next.elapsedMs / 120);
      if (next.elapsedMs >= TRANSITION_MS - 1e-6) {
        next.phase = 'ground'; next.elapsedMs = 0; next.altitude = 0; next.cooldownMs = 10000;
      }
    }
  }
  return next;
}

export function petFlightFrame(state: PetFlightState): number {
  const sheet = PET_SHEETS.pet_pigeon;
  if (state.phase === 'ground') return sheet.land!.row * sheet.columns + sheet.land!.frames[1];
  const anim = state.phase === 'takeoff' ? sheet.takeoff! : state.phase === 'land' ? sheet.land! : sheet.fly!;
  const index = Math.floor(state.elapsedMs / anim.frameMs);
  return anim.row * sheet.columns + anim.frames[state.phase === 'fly' ? index % anim.frames.length : Math.min(index, anim.frames.length - 1)];
}
