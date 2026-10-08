import type { RodEquipment } from '../../pixel-room/shop/rods';
import type { FishSpecies } from './fishCatalog';

export interface ReelGame {
  difficulty: number;
  speed: number;
  rod?: RodEquipment;
  trophy?: boolean;
  big: boolean;
  seed: number;
  zoneSize: number;
  zone: number;
  velocity: number;
  fish: number;
  progress: number;
  elapsed: number;
  remainder: number;
  taps: number[];
  lastTap: number;
  tapCount: number;
  status: 'playing' | 'landed' | 'escaped';
}
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
export const reelSpeed = (speed: number = 1) => Number.isFinite(speed) && speed > 0 ? speed : 1;
export const minReelMs = (difficulty: number, speed = 1) => (1500 + (clamp(difficulty, 1, 5) - 1) * 375) / reelSpeed(speed);
/** 서버는 시작 후 biteDelay + minReelMs 전에 온 '잡음'을 거절한다. 시계 오차에 대비해 조금 더 기다린다. */
export const REEL_MARGIN_MS = 150;
export function createReelGame(difficulty = 1, duck = false, big = false, seed = 0, speed = 1, rod?: RodEquipment, trophy = false): ReelGame {
  const d = Number.isFinite(difficulty) ? clamp(difficulty, 1, 5) : 1;
  return { difficulty: d, speed: reelSpeed(speed), rod, trophy, big, seed, zoneSize: .30 - (d - 1) * .0225 + (duck ? .035 : 0), zone: .5,
    velocity: 0, fish: .5, progress: .35, elapsed: 0, remainder: 0, taps: [], lastTap: -1, tapCount: 0, status: 'playing' };
}
// 고정 시간 간격으로 계산하여 화면 주사율과 무관하게 같은 입력을 같은 결과로 처리한다.
export function stepReelGame(game: ReelGame, deltaMs: number, taps: readonly number[] = []): ReelGame {
  if (game.status !== 'playing' || !Number.isFinite(deltaMs) || deltaMs <= 0) return game;
  const next = { ...game, remainder: game.remainder + deltaMs / 1000, taps: [...game.taps, ...taps.filter(Number.isFinite)].sort((a, b) => a - b) };
  const dt = 1 / 120;
  while (next.remainder + 1e-10 >= dt && next.status === 'playing') {
    next.remainder -= dt;
    next.elapsed += dt;
    const d = next.difficulty - 1, t = next.elapsed;
    // 희귀하거나 큰 물고기는 주기적으로 몸부림치며 갑자기 방향을 바꾼다.
    const phase = t + next.seed * .73;
    const struggle = (next.big || d >= 2) && phase % (5.2 - d * .35) < .38;
    const dash = struggle ? .12 * Math.sin(phase * 13) : 0;
    const target = clamp(.5 + (.18 + d * .022) * Math.sin(phase * (.8 + d * .12))
      + (.025 + d * .015) * Math.sin(phase * (2.4 + d * .35)) + dash, .12, .88);
    const speed = .20 + d * .07 + (struggle ? .5 : 0);
    next.fish += clamp(target - next.fish, -speed * dt, speed * dt);
    // 빠른 연타는 칸을 위로 밀어 올려 물고기를 지나친다.
    const boost = .65 + d * .025;
    const gravity = 1.8 + d * .15;
    while (next.taps.length && next.taps[0] <= t * 1000 + 1e-7) {
      next.taps.shift();
      next.velocity = boost;
      next.lastTap = t; next.tapCount++;
    }
    next.velocity = clamp(next.velocity - gravity * dt, -1.2, 1.2);
    next.zone = clamp(next.zone + next.velocity * dt, next.zoneSize / 2, 1 - next.zoneSize / 2);
    if (next.zone === next.zoneSize / 2 || next.zone === 1 - next.zoneSize / 2) next.velocity = 0;
    const overlaps = Math.abs(next.zone - next.fish) <= next.zoneSize / 2;
    next.progress = clamp(next.progress + (overlaps ? (.12 - d * .01) * next.speed : -(.16 + d * .01)) * dt, 0, 1);
    if (next.progress >= 1 && t * 1000 >= minReelMs(next.difficulty, next.speed) + REEL_MARGIN_MS) next.status = 'landed';
    else if (next.progress <= 0 || t >= 75) next.status = 'escaped';
  }
  return next;
}

/** 서버의 fish_difficulty와 같은 희귀도·길이 공식. */
export function fishDifficulty(fish: Pick<FishSpecies, 'rarity' | 'minCm' | 'maxCm'>, lengthCm: number): number {
  const [base, span] = { common: [1, 1], uncommon: [1.8, 1.2], rare: [2.8, 1.4], legendary: [3.8, 1.2] }[fish.rarity];
  const ratio = clamp((lengthCm - fish.minCm) / (fish.maxCm - fish.minCm || 1), 0, 1);
  return Math.round(Math.min(5, base + span * ratio) * 100) / 100;
}
