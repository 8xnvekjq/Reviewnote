import { BUG_GAME_MS } from './bugCatalog';
import type { NetSwingPayload } from './bugCatalog';
import type { Point } from './joystick';
import type { Grid } from './world';
import { cellOf, moveFeet } from './world';

export const BUG_RECOVERY_MS = 350;
export const BUG_ARENA_RADIUS = 100;
export interface BugGame {
  stars: number; elapsed: number; status: 'playing' | 'caught' | 'missed';
  position: Point; velocity: Point; seed: number; turnAt: number; recoveryUntil: number;
  stamina: number; dodgeAt: number; dodge: Point | null; pointerAt: number;
}
function random(g: BugGame) {
  g.seed = (Math.imul(g.seed, 1664525) + 1013904223) >>> 0;
  return g.seed / 4294967296;
}
const speed = [0, 18, 45, 115, 165, 185];
const radius = [0, 24, 19, 13, 11, 9];
export function createBugGame(stars: number, seed = 1): BugGame {
  const g: BugGame = { stars: Math.max(1, Math.min(5, Math.round(stars) || 1)), elapsed: 0, status: 'playing',
    position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, seed: seed >>> 0, turnAt: 0,
    recoveryUntil: 0, stamina: 3, dodgeAt: Infinity, dodge: null, pointerAt: -Infinity };
  const angle = random(g) * Math.PI * 2, distance = Math.sqrt(random(g)) * 70;
  g.position = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  return g;
}
export function segmentDistance(p: Point, a: Point, b: Point): number {
  if (![p.x, p.y, a.x, a.y, b.x, b.y].every(Number.isFinite)) return Infinity;
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
// 입력을 처음 본 뒤 120ms를 기다린다. 첫 60ms의 드래그만 예측에 쓰고 세 번만 피한다.
export function predictBugSwipe(game: BugGame, from: Point, to: Point, down = false): BugGame {
  const g = { ...game };
  if (g.status !== 'playing' || g.stars !== 5 || g.stamina <= 0 || g.elapsed < g.recoveryUntil) return g;
  if (down) { g.pointerAt = g.elapsed; g.dodgeAt = g.elapsed + 120; }
  if (g.elapsed - g.pointerAt > 60) return g;
  const dx = to.x - from.x || g.position.x - from.x || 1, dy = to.y - from.y;
  const length = Math.hypot(dx, dy), sign = (dx * (g.position.y - from.y) - dy * (g.position.x - from.x)) >= 0 ? 1 : -1;
  g.dodge = { x: -dy / length * sign, y: dx / length * sign };
  return g;
}
export function stepBugGame(game: BugGame, delta: number): BugGame {
  if (game.status !== 'playing' || !Number.isFinite(delta) || delta <= 0) return game;
  const g = { ...game, position: { ...game.position }, velocity: { ...game.velocity } };
  const end = Math.min(BUG_GAME_MS, g.elapsed + delta);
  while (g.elapsed < end) {
    const dt = Math.min(16, end - g.elapsed); g.elapsed += dt;
    if (g.dodge && g.elapsed >= g.dodgeAt) {
      const feint = random(g) < .2 ? -.5 : 1;
      g.velocity = { x: g.dodge.x * 310 * feint, y: g.dodge.y * 310 * feint };
      g.stamina--; g.dodge = null; g.dodgeAt = Infinity; g.turnAt = g.elapsed + 300;
    }
    if (g.elapsed >= g.turnAt) {
      const angle = random(g) * Math.PI * 2;
      const paused = random(g) < (g.stars === 1 ? .65 : g.stars === 3 ? .2 : .08);
      const v = paused ? 0 : speed[g.stars];
      g.velocity = { x: Math.cos(angle) * v, y: Math.sin(angle) * v };
      g.turnAt = g.elapsed + (g.stars === 1 ? 1400 : g.stars === 2 ? 850 : g.stars === 3 ? 450 : 190) * (.7 + random(g));
    }
    g.position.x += g.velocity.x * dt / 1000; g.position.y += g.velocity.y * dt / 1000;
    const distance = Math.hypot(g.position.x, g.position.y);
    if (distance > BUG_ARENA_RADIUS - 8) {
      const nx = g.position.x / distance, ny = g.position.y / distance;
      g.position = { x: nx * 92, y: ny * 92 };
      const dot = g.velocity.x * nx + g.velocity.y * ny;
      if (dot > 0) g.velocity = { x: g.velocity.x - 2 * dot * nx, y: g.velocity.y - 2 * dot * ny };
    }
  }
  if (g.elapsed >= BUG_GAME_MS) g.status = 'missed';
  return g;
}
export function swingBugNet(game: BugGame, from: Point, to: Point, minimumLength = 8): BugGame {
  if (game.status !== 'playing' || game.elapsed < game.recoveryUntil || ![from.x, from.y, to.x, to.y].every(Number.isFinite) || Math.hypot(to.x - from.x, to.y - from.y) < minimumLength) return game;
  const caught = segmentDistance(game.position, from, to) <= radius[game.stars];
  return { ...game, status: caught ? 'caught' : 'playing', recoveryUntil: game.elapsed + BUG_RECOVERY_MS };
}

export function parseNetSwing(payload: unknown): NetSwingPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Partial<NetSwingPayload>;
  if (typeof p.sessionId !== 'string' || !p.sessionId || p.sessionId.length > 128 ||
    !['Front', 'Back', 'Left', 'Right'].includes(p.direction ?? '') || typeof p.at !== 'number' || !Number.isFinite(p.at)) return null;
  return { sessionId: p.sessionId, direction: p.direction!, at: p.at };
}

export interface RoamingBug { position: Point | null; target: Point | null; nextAt: number; leaveAt: number }
export function emptyRoamingBug(): RoamingBug { return { position: null, target: null, nextAt: 0, leaveAt: 0 }; }
export function removeRoamingBug(now: number, random = Math.random): RoamingBug {
  return { ...emptyRoamingBug(), nextAt: now + 30000 + random() * 30000 };
}
export function stepRoamingBug(bug: RoamingBug, grid: Grid, now: number, delta: number, random = Math.random): RoamingBug {
  let b = { ...bug };
  if (!b.position) {
    if (now < b.nextAt) return b;
    for (let i = 0; i < 80; i++) {
      const position = { x: (Math.floor(random() * grid.cols) + .5) * 16, y: (Math.floor(random() * grid.rows) + .5) * 16 };
      if (!grid.solid(cellOf(position))) { b = { position, target: null, nextAt: now + 1500, leaveAt: now + 45000 + random() * 60000 }; break; }
    }
    return b;
  }
  if (now >= b.leaveAt) return removeRoamingBug(now, random);
  if (!b.target && now >= b.nextAt) {
    const target = { x: b.position.x + (random() - .5) * 80, y: b.position.y + (random() - .5) * 80 };
    if (target.x >= 8 && target.y >= 8 && target.x < grid.cols * 16 - 8 && target.y < grid.rows * 16 - 8 && !grid.solid(cellOf(target))) b.target = target;
    else b.nextAt = now + 700;
  }
  if (b.target) {
    const dx = b.target.x - b.position.x, dy = b.target.y - b.position.y, distance = Math.hypot(dx, dy);
    const amount = Math.min(distance, 12 * Math.max(0, Math.min(delta, 100)) / 1000);
    const position = moveFeet(b.position, dx / (distance || 1) * amount, dy / (distance || 1) * amount, grid.solid);
    if (distance < 2 || Math.hypot(position.x - b.position.x, position.y - b.position.y) < .01) { b.target = null; b.nextAt = now + 900 + random() * 2400; }
    b.position = position;
  }
  return b;
}
