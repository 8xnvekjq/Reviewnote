import type { Point } from './joystick';

export const PERSON_RADIUS = 7;
export const RIDING_RADIUS = 10;
export const PASS_THROUGH_MS = 600;
export const SEPARATION_SPEED = 20;
export interface PersonObstacle extends Point { id: string; radius?: number; moving?: boolean }
export interface CollisionState { contacts: number; passThrough: number; pushes: Record<string, number> }
export const createCollisionState = (): CollisionState => ({ contacts: 0, passThrough: 0, pushes: {} });
export interface CollisionWorld { blocked(point: Point): boolean }
export interface CollisionGate { frozen?: boolean; fishing?: boolean; indoor?: boolean; transitioning?: boolean }
export const collisionEnabled = (gate: CollisionGate) => !gate.frozen && !gate.fishing && !gate.indoor && !gate.transitioning;

/** 작은 밀어내기는 벽 모서리 보정 없이 처리하여 속도 상한을 지킨다. */
export function safeSeparation(from: Point, delta: Point, world: CollisionWorld): Point {
  let position = { ...from };
  const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y)));
  for (let i = 0; i < steps; i++) {
    const x = { x: position.x + delta.x / steps, y: position.y };
    if (!world.blocked(x)) position = x;
    const y = { x: position.x, y: position.y + delta.y / steps };
    if (!world.blocked(y)) position = y;
  }
  return position;
}

/** 발 원으로 향하는 성분만 제거하고, 오래 누르면 해당 친구를 통과한다. */
export function stepSoftCollision(from: Point, velocity: Point, obstacles: readonly PersonObstacle[],
  state: CollisionState, deltaMs: number, radius = PERSON_RADIUS, gate: CollisionGate = {}) {
  const elapsed = Math.max(0, Math.min(deltaMs, 50)), dt = elapsed / 1000;
  const next = createCollisionState();
  let vx = velocity.x, vy = velocity.y, sx = 0, sy = 0;
  if (!collisionEnabled(gate) || !Math.hypot(vx, vy)) return { delta: { x: vx * dt, y: vy * dt }, separation: { x: 0, y: 0 }, state: next };
  for (const peer of obstacles) {
    const dx = from.x - peer.x, dy = from.y - peer.y, distance = Math.hypot(dx, dy);
    const reach = radius + (peer.radius ?? PERSON_RADIUS);
    const speed = Math.hypot(velocity.x, velocity.y);
    const nx = distance > 0.001 ? dx / distance : -velocity.x / speed;
    const ny = distance > 0.001 ? dy / distance : -velocity.y / speed;
    const into = velocity.x * nx + velocity.y * ny;
    // 통과 중에는 원 밖으로 완전히 나올 때까지 허용한다.
    const passing = (state.pushes[peer.id] ?? 0) >= PASS_THROUGH_MS && distance < reach + 3;
    const projected = Math.hypot(dx + velocity.x * dt, dy + velocity.y * dt);
    const contact = distance < reach - 0.05 || (into < -0.01 && projected < reach);
    if (!contact && !passing) continue;
    next.contacts++;
    const pushing = into < -0.01;
    const held = passing ? PASS_THROUGH_MS : pushing ? (state.pushes[peer.id] ?? 0) + elapsed : 0;
    next.pushes[peer.id] = held;
    if (held >= PASS_THROUGH_MS) { next.passThrough++; continue; }
    const component = vx * nx + vy * ny;
    if (component < 0) { vx -= component * nx; vy -= component * ny; }
    if (distance < reach - 0.05) {
      const push = Math.min(SEPARATION_SPEED, (reach - distance) * 4);
      sx += nx * push; sy += ny * push;
    }
  }
  const scale = Math.min(1, SEPARATION_SPEED / (Math.hypot(sx, sy) || 1));
  return { delta: { x: vx * dt, y: vy * dt }, separation: { x: sx * scale * dt, y: sy * scale * dt }, state: next };
}

/** 펫만 양보한다. 비행·탑승 펫은 호출 측에서 제외한다. */
export function stepPetSpacing(from: Point, people: readonly Point[], pets: readonly Point[], deltaMs: number,
  world: CollisionWorld, gate: CollisionGate = {}): Point {
  if (!collisionEnabled(gate)) return from;
  let dx = 0, dy = 0;
  for (const [spots, radius] of [[people, 10], [pets, 8]] as const) for (const point of spots) {
    const x = from.x - point.x, y = from.y - point.y, distance = Math.hypot(x, y);
    if (distance >= radius) continue;
    const push = Math.min(SEPARATION_SPEED, (radius - distance) * 6);
    dx += (distance > 0.001 ? x / distance : 1) * push;
    dy += (distance > 0.001 ? y / distance : 0) * push;
  }
  const dt = Math.max(0, Math.min(deltaMs, 50)) / 1000;
  const scale = Math.min(1, SEPARATION_SPEED / (Math.hypot(dx, dy) || 1));
  return safeSeparation(from, { x: dx * scale * dt, y: dy * scale * dt }, world);
}
