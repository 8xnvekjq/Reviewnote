export interface ReelGame {
  difficulty: number;
  zoneSize: number;
  zone: number;
  velocity: number;
  fish: number;
  progress: number;
  elapsed: number;
  remainder: number;
  status: 'playing' | 'landed' | 'escaped';
}
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
export const minReelMs = (difficulty: number) => 1500 + (clamp(difficulty, 1, 5) - 1) * 375;
export function createReelGame(difficulty = 1, duck = false): ReelGame {
  const d = Number.isFinite(difficulty) ? clamp(difficulty, 1, 5) : 1;
  return { difficulty: d, zoneSize: .48 - (d - 1) * .075 + (duck ? .045 : 0), zone: .5,
    velocity: 0, fish: .76, progress: .28, elapsed: 0, remainder: 0, status: 'playing' };
}
// 고정 시간 간격으로 계산하여 화면 주사율과 무관하게 같은 입력을 같은 결과로 처리한다.
export function stepReelGame(game: ReelGame, deltaMs: number, held: boolean): ReelGame {
  if (game.status !== 'playing' || !Number.isFinite(deltaMs) || deltaMs <= 0) return game;
  const next = { ...game, remainder: game.remainder + deltaMs / 1000 };
  const dt = 1 / 120;
  while (next.remainder + 1e-10 >= dt && next.status === 'playing') {
    next.remainder -= dt;
    next.elapsed += dt;
    const d = next.difficulty - 1, t = next.elapsed;
    // 쉬운 물고기는 위쪽에서 차분히 헤엄치고, 어려운 물고기는 자주 방향을 바꾼다.
    const target = clamp(.76 - d * .045 + .035 * Math.sin(t * .9) + d * .075 * Math.sin(t * (1 + d * .4))
      + d * .027 * Math.sin(t * (3 + d * 1.5)), .08, .92);
    const speed = .07 + d * .17;
    next.fish += clamp(target - next.fish, -speed * dt, speed * dt);
    next.velocity = clamp(next.velocity + (held ? 3.2 : -3) * dt, -.9, .9);
    next.zone = clamp(next.zone + next.velocity * dt, next.zoneSize / 2, 1 - next.zoneSize / 2);
    if (next.zone === next.zoneSize / 2 || next.zone === 1 - next.zoneSize / 2) next.velocity = 0;
    const overlaps = Math.abs(next.zone - next.fish) <= next.zoneSize / 2;
    next.progress = clamp(next.progress + (overlaps ? .18 : -(.12 + d * .01)) * dt, 0, 1);
    if (next.progress >= 1 && t * 1000 >= minReelMs(next.difficulty)) next.status = 'landed';
    else if (next.progress <= 0 || t >= 75) next.status = 'escaped';
  }
  return next;
}
