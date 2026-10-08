import type { RodEquipment } from '../../pixel-room/shop/rods';
import type { FishSpecies } from './fishCatalog';

export interface ReelAxisInput { time: number; x: number }
export interface ReelGame {
  difficulty: number; speed: number; rod?: RodEquipment; trophy?: boolean; big: boolean;
  seed: number; random: number; arenaScale: number; zoneSize: number;
  // 좌표는 원 중심이 0이며 위쪽이 양수다. zone과 fish는 세로 좌표다.
  zoneX: number; zone: number; velocityX: number; velocity: number;
  fishX: number; fish: number; fishVX: number; fishVY: number;
  targetX: number; targetY: number; nextTarget: number; burstUntil: number; pauseUntil: number;
  progress: number; elapsed: number; remainder: number; taps: number[];
  axes: ReelAxisInput[]; axis: number; lastTap: number; tapCount: number;
  status: 'playing' | 'landed' | 'escaped';
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const reelSpeed = (speed = 1) => Number.isFinite(speed) && speed > 0 ? speed : 1;
export const minReelMs = (difficulty: number, speed = 1) => (1500 + (clamp(difficulty, 1, 5) - 1) * 375) / reelSpeed(speed);
// 서버 최소 릴 시간에 통신 여유를 더한다.
export const REEL_MARGIN_MS = 150;
export function createReelGame(difficulty = 1, duck = false, big = false, seed = 0, speed = 1, rod?: RodEquipment, trophy = false): ReelGame {
  const d = Number.isFinite(difficulty) ? clamp(difficulty, 1, 5) : 1;
  return { difficulty: d, speed: reelSpeed(speed), rod, trophy, big, seed, random: (seed + 1) >>> 0,
    arenaScale: 1 - (d - 1) * .0625, zoneSize: (d <= 2 ? .42 - (d - 1) * .09 : .33 - (d - 2) * .01) + (duck ? .035 : 0),
    zoneX: 0, zone: 0, velocityX: 0, velocity: 0, fishX: 0, fish: 0, fishVX: 0, fishVY: 0,
    targetX: 0, targetY: 0, nextTarget: 0, burstUntil: 0, pauseUntil: 0,
    progress: .35, elapsed: 0, remainder: 0, taps: [], axes: [], axis: 0, lastTap: -1, tapCount: 0, status: 'playing' };
}
function random(g: ReelGame) {
  g.random = (Math.imul(g.random, 1664525) + 1013904223) >>> 0;
  return g.random / 4294967296;
}
// 원 경계에서는 바깥 방향 속도만 없애고 접선 방향으로 미끄러진다.
function constrain(x: number, y: number, vx: number, vy: number, radius: number) {
  const length = Math.hypot(x, y);
  if (length <= radius) return [x, y, vx, vy];
  const nx = x / length, ny = y / length, outward = Math.max(0, vx * nx + vy * ny);
  return [nx * radius, ny * radius, vx - nx * outward, vy - ny * outward];
}
// 120Hz 고정 간격과 시간표 입력으로 프레임 속도와 무관하게 계산한다.
export function stepReelGame(game: ReelGame, deltaMs: number, taps: readonly number[] = [], axes: readonly ReelAxisInput[] = []): ReelGame {
  if (game.status !== 'playing' || !Number.isFinite(deltaMs) || deltaMs <= 0) return game;
  const g = { ...game, remainder: game.remainder + deltaMs / 1000,
    taps: [...game.taps, ...taps.filter(Number.isFinite)].sort((a, b) => a - b),
    axes: [...game.axes, ...axes.filter(a => Number.isFinite(a.time) && Number.isFinite(a.x))].sort((a, b) => a.time - b.time) };
  const dt = 1 / 120;
  while (g.remainder + 1e-10 >= dt && g.status === 'playing') {
    g.remainder -= dt; g.elapsed += dt;
    const d = g.difficulty - 1, t = g.elapsed;
    while (g.axes.length && g.axes[0].time <= t * 1000 + 1e-7) g.axis = clamp(g.axes.shift()!.x, -1, 1);
    while (g.taps.length && g.taps[0] <= t * 1000 + 1e-7) {
      g.taps.shift(); g.velocity = .85; g.lastTap = t; g.tapCount++;
    }
    g.velocityX += (g.axis * 1.8 - g.velocityX) * 9 * dt;
    g.velocity = Math.max(-1.6, g.velocity - 2.3 * dt);
    [g.zoneX, g.zone, g.velocityX, g.velocity] = constrain(g.zoneX + g.velocityX * dt, g.zone + g.velocity * dt, g.velocityX, g.velocity, Math.max(0, 1 - g.zoneSize));
    if (t >= g.nextTarget) {
      const angle = random(g) * Math.PI * 2, radius = Math.sqrt(random(g)) * .76;
      g.targetX = Math.cos(angle) * radius; g.targetY = Math.sin(angle) * radius;
      g.nextTarget = t + .9 + random(g) * 1.2 - d * .10;
      if (random(g) < .18 + d * .12 + (g.big || g.trophy ? .18 : 0)) g.burstUntil = t + .22 + random(g) * .25;
      if (random(g) < .18) g.pauseUntil = t + .15 + random(g) * .2;
    }
    const dx = g.targetX - g.fishX, dy = g.targetY - g.fish, distance = Math.hypot(dx, dy);
    // 대물은 정기적인 몸부림을 추가한다. 일시 정지보다 몸부림이 우선한다.
    const struggle = (g.big || g.trophy) && (t + g.seed * .17) % 5.4 < .3;
    const swimmingSpeed = d <= 1 ? .24 + d * .21 : d <= 2 ? .45 + (d - 1) * .005 : .455 + (d - 2) * .0925;
    const speed = t < g.pauseUntil && !struggle ? .03 : swimmingSpeed * (t < g.burstUntil || struggle ? 1.9 : 1);
    const curve = Math.sin(t * 3 + g.seed) * (.12 + d * .04);
    const edge = Math.max(0, Math.hypot(g.fishX, g.fish) - .72) * 3;
    const vx = dx / (distance || 1) * Math.min(speed, distance * 3) - g.fishVY * curve - g.fishX * edge;
    const vy = dy / (distance || 1) * Math.min(speed, distance * 3) + g.fishVX * curve - g.fish * edge;
    g.fishVX += (vx - g.fishVX) * (3 + d) * dt; g.fishVY += (vy - g.fishVY) * (3 + d) * dt;
    [g.fishX, g.fish, g.fishVX, g.fishVY] = constrain(g.fishX + g.fishVX * dt, g.fish + g.fishVY * dt, g.fishVX, g.fishVY, .94);
    const inside = Math.hypot(g.zoneX - g.fishX, g.zone - g.fish) <= g.zoneSize;
    g.progress = clamp(g.progress + (inside ? (.105 - d * .006) * g.speed : -(d <= 1 ? .13 + d * .12 : d <= 2 ? .25 - (d - 1) * .06 : .19 - (d - 2) * .015)) * dt, 0, 1);
    if (g.progress >= 1 && t * 1000 >= minReelMs(g.difficulty, g.speed) + REEL_MARGIN_MS) g.status = 'landed';
    else if (g.progress <= 0 || t >= 75) g.status = 'escaped';
  }
  return g;
}

export function fishDifficulty(fish: Pick<FishSpecies, 'rarity' | 'minCm' | 'maxCm'>, lengthCm: number): number {
  const [base, span] = { common: [1, 1], uncommon: [1.8, 1.2], rare: [2.8, 1.4], legendary: [3.8, 1.2] }[fish.rarity];
  const ratio = clamp((lengthCm - fish.minCm) / (fish.maxCm - fish.minCm || 1), 0, 1);
  return Math.round(Math.min(5, base + span * ratio) * 100) / 100;
}
