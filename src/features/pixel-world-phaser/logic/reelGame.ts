import type { RodEquipment } from '../../pixel-room/shop/rods';
import type { FishSpecies } from './fishCatalog';

export interface ReelAxisInput { time: number; x: number }
export interface ReelGame {
  difficulty: number; speed: number; rod?: RodEquipment; trophy?: boolean; big: boolean; heavy: boolean;
  seed: number; random: number; arenaScale: number; zoneSize: number;
  // 좌표는 원 중심이 0이며 위쪽이 양수다. zone과 fish는 세로 좌표다.
  zoneX: number; zone: number; velocityX: number; velocity: number;
  fishX: number; fish: number; fishVX: number; fishVY: number;
  targetX: number; targetY: number; nextTarget: number; burstUntil: number; pauseUntil: number;
  motion: 'wander' | 'dart' | 'sweep' | 'feint' | HeavyPattern; motionStart: number; motionAngle: number; motionTurn: number; wanderFrequency: number;
  progress: number; elapsed: number; remainder: number; taps: number[];
  axes: ReelAxisInput[]; axis: number; lastTap: number; tapCount: number;
  // 비둘기: 진행이 바닥나도 1초 버텨 주기(남은 횟수·이번 판에 쓴 횟수·버티는 끝 시각).
  rescueLeft: number; rescuesUsed: number; rescueUntil: number;
  // 상어·고래: 패턴이 바뀐 뒤 잠깐 지쳐 느리게 헤엄치는 끝 시각.
  tiredUntil: number;
  status: 'playing' | 'landed' | 'escaped';
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** 상어·고래의 움직임 5가지(2026-10 선생님 의견). 무작위로 섞되 같은 것을 연달아 쓰지 않는다.
 * 위에 오래 머무는 패턴이 많고, 아래(dive)는 짧게 — 아래 있는 시간이 위의 절반쯤이 되게. */
export type HeavyPattern = 'climb' | 'topSweep' | 'wideSweep' | 'zigzag' | 'dive';
export const HEAVY_PATTERNS: readonly { kind: HeavyPattern; weight: number; seconds: [number, number] }[] = [
  { kind: 'climb', weight: .22, seconds: [1.6, 2.4] },      // 위로 치고 올라가 버틴다
  { kind: 'topSweep', weight: .22, seconds: [2, 3] },       // 위쪽에서 좌우로 크게 휩쓴다
  { kind: 'wideSweep', weight: .2, seconds: [2, 2.6] },     // 가운데 높이에서 원 끝에서 끝까지 좌우로
  { kind: 'zigzag', weight: .16, seconds: [1.6, 2.2] },     // 대각선으로 지그재그(위쪽 꼭짓점이 더 높다)
  { kind: 'dive', weight: .26, seconds: [1.6, 2.2] },       // 아래로 처박았다 돌아온다
];
function pickHeavyPattern(g: ReelGame, t: number) {
  const pool = HEAVY_PATTERNS.filter(p => p.kind !== g.motion);
  let roll = random(g) * pool.reduce((sum, p) => sum + p.weight, 0);
  const pattern = pool.find(p => (roll -= p.weight) < 0) ?? pool[pool.length - 1];
  // 첫 패턴(아직 wander)이 아니면 패턴 사이에 잠깐 지친다 — 돌진은 쉬고 난 뒤에.
  const rest = g.motion === 'wander' ? 0 : HEAVY.tiredSeconds;
  g.tiredUntil = t + rest;
  g.motion = pattern.kind; g.motionStart = t; g.motionTurn = random(g) < .5 ? -1 : 1;
  g.nextTarget = t + pattern.seconds[0] + random(g) * (pattern.seconds[1] - pattern.seconds[0]);
  if (pattern.kind === 'dive' || pattern.kind === 'zigzag') g.burstUntil = t + rest + .35 + random(g) * .25;
}
/** 지금 패턴이 향하는 목표점(원 중심 0, 위가 +). */
function heavyTarget(g: ReelGame, t: number): [number, number] {
  const s = t - g.motionStart, turn = g.motionTurn;
  switch (g.motion) {
    case 'climb': return [.15 * turn, .82];
    case 'topSweep': return [.75 * Math.sin(s * 1.6 * turn), .55];
    case 'wideSweep': return [.88 * Math.sin(s * 1.4 * turn), .1 + .12 * Math.cos(s * 1.4)];
    case 'zigzag': { const i = Math.floor(s / .6); return [(i % 2 ? .65 : -.65) * turn, i % 2 ? -.5 : .62]; }
    default: return [.1 * turn, -.85];
  }
}
export const reelSpeed = (speed = 1) => Number.isFinite(speed) && speed > 0 ? speed : 1;
export const minReelMs = (difficulty: number, speed = 1) => (1500 + (clamp(difficulty, 1, 5) - 1) * 375) / reelSpeed(speed);
// 서버 최소 릴 시간에 통신 여유를 더한다.
export const REEL_MARGIN_MS = 150;
/** 상어·고래 릴 설정: 위로 헤엄칠 때 속도 배율(0.85 = 15% 느리게), 내 원을 끌어내리는 힘과 최대 낙하 속도. */
// 2026-10 조정: 5가지 패턴(위 오래·아래 짧게, 좌우 크게)과 함께 끌어내리는 힘 6.1 — 실력 좋은 학생 약 80% 성공,
// 아래 머무는 시간은 위의 절반 정도, 탭은 보통 난이도 5의 약 1.6배.
// 2026-10-14 완화(학생들이 너무 어렵다고 함): 탭 점프 1.0(약 40% 높이), 원 밖 진행 감소 25% 느리게,
// 패턴이 바뀔 때마다 0.5초 지쳐서 절반 속도(그동안 돌진 없음). 끌어내리는 힘·최대 낙하는 그대로.
export const HEAVY = { upSpeed: .85, gravity: 6.1, maxFall: 2.2, tapVelocity: 1, lossScale: .75, tiredScale: .5, tiredSeconds: .5 };
/** 오리: 릴 원 +10%. 비둘기: 바닥나도 버텨 주는 시간(초). */
export const DUCK_ZONE_BONUS = 1.1;
export const PIGEON_RESCUE_S = 1;
export function createReelGame(difficulty = 1, duck = false, big = false, seed = 0, speed = 1, rod?: RodEquipment, trophy = false, rescues = 0, heavy = false): ReelGame {
  const d = Number.isFinite(difficulty) ? clamp(difficulty, 1, 5) : 1;
  return { difficulty: d, speed: reelSpeed(speed), rod, trophy, big, heavy, seed, random: (seed + 1) >>> 0,
    arenaScale: 1 - (d - 1) * .0625, zoneSize: (d <= 2 ? .42 - (d - 1) * .09 : .33 - (d - 2) * .01) * (duck ? DUCK_ZONE_BONUS : 1),
    zoneX: 0, zone: 0, velocityX: 0, velocity: 0, fishX: 0, fish: 0, fishVX: 0, fishVY: 0,
    targetX: 0, targetY: 0, nextTarget: 0, burstUntil: 0, pauseUntil: 0,
    motion: 'wander', motionStart: 0, motionAngle: 0, motionTurn: 1, wanderFrequency: 3,
    progress: .35, elapsed: 0, remainder: 0, taps: [], axes: [], axis: 0, lastTap: -1, tapCount: 0,
    rescueLeft: Math.max(0, Math.floor(rescues)), rescuesUsed: 0, rescueUntil: -1, tiredUntil: 0, status: 'playing' };
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
    const erratic = clamp((g.difficulty - 3.5) / 1.5, 0, 1);
    while (g.axes.length && g.axes[0].time <= t * 1000 + 1e-7) g.axis = clamp(g.axes.shift()!.x, -1, 1);
    while (g.taps.length && g.taps[0] <= t * 1000 + 1e-7) {
      g.taps.shift(); g.velocity = g.heavy ? HEAVY.tapVelocity : .85; g.lastTap = t; g.tapCount++;
    }
    g.velocityX += (g.axis * 1.8 - g.velocityX) * 9 * dt;
    g.velocity = Math.max(g.heavy ? -HEAVY.maxFall : -1.6, g.velocity - (g.heavy ? HEAVY.gravity : 2.3) * dt);
    [g.zoneX, g.zone, g.velocityX, g.velocity] = constrain(g.zoneX + g.velocityX * dt, g.zone + g.velocity * dt, g.velocityX, g.velocity, Math.max(0, 1 - g.zoneSize));
    if (g.heavy) {
      if (t >= g.nextTarget) pickHeavyPattern(g, t);
      [g.targetX, g.targetY] = heavyTarget(g, t);
    } else if (!g.heavy && t >= g.nextTarget) {
      const angle = random(g) * Math.PI * 2, radius = Math.sqrt(random(g)) * .76;
      g.targetX = Math.cos(angle) * radius; g.targetY = Math.sin(angle) * radius;
      g.nextTarget = t + .9 + random(g) * 1.2 - d * .10;
      if (random(g) < .18 + d * .12 + (g.big || g.trophy ? .18 : 0)) g.burstUntil = t + .22 + random(g) * .25;
      if (random(g) < .18) g.pauseUntil = t + .15 + random(g) * .2;
      if (erratic > 0) {
        // 시드 난수로 머무는 시간과 행동을 바꿔 규칙적인 반복을 피한다.
        const choice = random(g);
        g.motion = choice < .3 ? 'dart' : choice < .5 ? 'sweep' : choice < .75 ? 'feint' : 'wander';
        g.motionStart = t; g.motionAngle = Math.atan2(g.fish, g.fishX) + Math.PI + (random(g) - .5) * .8;
        g.motionTurn = random(g) < .5 ? -1 : 1;
        g.wanderFrequency = 1.5 + random(g) * 6;
        g.nextTarget = t + .35 + random(g) * (1.5 - erratic * .55);
        if (g.motion === 'sweep' && choice > .48) g.nextTarget = t + Math.PI * 2 / (1 + erratic);
        if (g.motion === 'dart' || g.motion === 'feint') {
          g.targetX = Math.cos(g.motionAngle) * .88; g.targetY = Math.sin(g.motionAngle) * .88;
          g.burstUntil = t + .25 + random(g) * .35;
          g.pauseUntil = t;
        }
      }
    }
    if (!g.heavy && erratic > 0 && g.motion === 'sweep') {
      // 가장자리를 따라 흐르는 호를 쫓되 좌표 자체는 순간 이동시키지 않는다.
      const angle = g.motionAngle + (t - g.motionStart) * g.motionTurn * (1 + erratic);
      g.targetX = Math.cos(angle) * .9; g.targetY = Math.sin(angle) * .9;
    } else if (!g.heavy && erratic > 0 && g.motion === 'feint' && t - g.motionStart >= .22) {
      g.targetX = -Math.cos(g.motionAngle) * .88; g.targetY = -Math.sin(g.motionAngle) * .88;
    }
    const dx = g.targetX - g.fishX, dy = g.targetY - g.fish, distance = Math.hypot(dx, dy);
    // 대물은 정기적인 몸부림을 추가한다. 일시 정지보다 몸부림이 우선한다.
    const struggle = (g.big || g.trophy) && (t + g.seed * .17) % 5.4 < .3;
    const swimmingSpeed = d <= 1 ? .24 + d * .21 : d <= 2 ? .45 + (d - 1) * .005 : .455 + (d - 2) * .0925;
    // 중간 난도는 속도로, 최고 난도는 짧은 머무름과 날카로운 회전으로 추적을 어렵게 한다.
    // 상어·고래는 좌우로 끝까지 휩쓸 만큼 빠르게(휩쓸기·아래 처박기는 더 빠르게).
    const cruiseSpeed = g.heavy ? (g.motion === 'climb' ? .8 : 1.15) : swimmingSpeed * (1 + erratic * (2.45 - 2.4 * erratic));
    const tired = g.heavy && t < g.tiredUntil;
    const speed = t < g.pauseUntil && !struggle ? .03 : cruiseSpeed * (tired ? HEAVY.tiredScale : t < g.burstUntil || struggle ? 1.9 : 1);
    const curve = Math.sin(t * g.wanderFrequency + g.seed) * (.12 + d * .04);
    const edge = g.heavy ? 0 : Math.max(0, Math.hypot(g.fishX, g.fish) - .72) * 3;
    const vx = dx / (distance || 1) * Math.min(speed, distance * 3) - g.fishVY * curve - g.fishX * edge;
    // 상어·고래가 위로 올라갈 때만 15% 느리게 — 탭으로 따라잡을 틈을 준다.
    const up = g.heavy && dy > 0 ? HEAVY.upSpeed : 1;
    const vy = dy / (distance || 1) * Math.min(speed * up, distance * 3) + g.fishVX * curve - g.fish * edge;
    g.fishVX += (vx - g.fishVX) * (3 + d + erratic * 16) * dt; g.fishVY += (vy - g.fishVY) * (3 + d + erratic * 16) * dt;
    if (erratic > 0) {
      // 가속 후에도 속도를 제한하여 고정 스텝당 이동 거리가 항상 유한하다.
      const magnitude = Math.hypot(g.fishVX, g.fishVY), cap = cruiseSpeed * 1.9;
      if (magnitude > cap) { g.fishVX *= cap / magnitude; g.fishVY *= cap / magnitude; }
    }
    [g.fishX, g.fish, g.fishVX, g.fishVY] = constrain(g.fishX + g.fishVX * dt, g.fish + g.fishVY * dt, g.fishVX, g.fishVY, .94);
    const inside = Math.hypot(g.zoneX - g.fishX, g.zone - g.fish) <= g.zoneSize;
    g.progress = clamp(g.progress + (inside ? (.105 - d * .006) * g.speed : -(d <= 1 ? .13 + d * .12 : d <= 2 ? .25 - (d - 1) * .06 : .19 - (d - 2) * .015) * (g.heavy ? HEAVY.lossScale : 1)) * dt, 0, 1);
    if (g.progress >= 1 && t * 1000 >= minReelMs(g.difficulty, g.speed) + REEL_MARGIN_MS) g.status = 'landed';
    else if (t >= 75) g.status = 'escaped';
    else if (g.progress <= 0) {
      // 비둘기가 1초 버텨 준다 — 그 사이 다시 원 안에 넣으면 이어서 낚는다.
      if (t < g.rescueUntil) continue;
      if (g.rescueLeft > 0) { g.rescueLeft--; g.rescuesUsed++; g.rescueUntil = t + PIGEON_RESCUE_S; }
      else g.status = 'escaped';
    }
  }
  return g;
}

export function fishDifficulty(fish: Pick<FishSpecies, 'rarity' | 'minCm' | 'maxCm'>, lengthCm: number): number {
  const [base, span] = { common: [1, 1], uncommon: [1.8, 1.2], rare: [2.8, 1.4], legendary: [3.8, 1.2], mythic: [5, 0] }[fish.rarity];
  const ratio = clamp((lengthCm - fish.minCm) / (fish.maxCm - fish.minCm || 1), 0, 1);
  return Math.round(Math.min(5, base + span * ratio) * 100) / 100;
}
