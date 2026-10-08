import assert from 'node:assert/strict';
import test from 'node:test';
import { createReelGame, minReelMs, REEL_MARGIN_MS, stepReelGame } from '../../src/features/pixel-world-phaser/logic/reelGame.ts';
import type { ReelGame } from '../../src/features/pixel-world-phaser/logic/reelGame.ts';
type Tapper = 'lazy' | 'spam' | 'good' | 'novice';
function simulate(difficulty: number, mode: Tapper, seed: number, big = false) {
  let game = createReelGame(difficulty, false, big, seed), last = -1000;
  const taps: number[] = [];
  for (let tick = 0; tick < 7200 && game.status === 'playing'; tick++) {
    const time = (tick + 1) * 1000 / 120;
    const interval = mode === 'spam' ? 80 : mode === 'lazy' ? 700 + seed * 15 : mode === 'novice' ? 350 + seed % 10 * 60 : 150;
    const tap = time - last >= interval && (mode === 'lazy' || mode === 'spam' || game.zone < game.fish - .06 && game.velocity < .1);
    if (tap) { last = time; taps.push(time); }
    game = stepReelGame(game, 1000 / 120, tap ? [time] : []);
  }
  return { game, taps };
}
function replay(game: ReelGame, deltas: number[], taps: number[]) {
  let wall = 0, index = 0, frame = 0;
  while (wall < 60000 && game.status === 'playing') {
    const delta = deltas[frame++ % deltas.length], inputs: number[] = [];
    while (index < taps.length && taps[index] <= wall + delta + 1e-7) inputs.push(taps[index++]);
    game = stepReelGame(game, delta, inputs); wall += delta;
  }
  return game;
}
test('게으른 탭과 연타는 실패하고 집중해서 추적하면 높은 난이도도 잡는다', () => {
  const means: number[] = [];
  for (const difficulty of [1, 3, 5]) {
    for (const mode of ['lazy', 'spam', 'good', 'novice'] as const) {
      const games = Array.from({ length: 40 }, (_, seed) => simulate(difficulty, mode, seed).game);
      const wins = games.filter(game => game.status === 'landed');
      const mean = wins.length ? wins.reduce((sum, g) => sum + g.elapsed, 0) / wins.length : 0;
      console.log(`SIM difficulty=${difficulty} tapper=${mode} wins=${wins.length}/40 meanSeconds=${mean.toFixed(2)}`);
      if (mode === 'lazy' && difficulty === 1) assert.ok(wins.length <= 10);
      if (mode === 'spam') assert.equal(wins.length, 0);
      if (mode === 'good') {
        assert.equal(wins.length, 40); assert.ok(wins.every(g => g.elapsed < 60)); means.push(mean);
        if (difficulty === 5) assert.ok(mean >= 20 && mean <= 35);
      }
      if (mode === 'novice' && difficulty === 1) assert.ok(wins.length >= 24 && wins.length <= 28);
    }
  }
  assert.ok(means[0] < means[1] && means[1] < means[2]);
});
test('큰 물고기는 낮은 난이도에서도 몸부림치며 추적해서 잡을 수 있다', () => {
  const plain = simulate(1, 'good', 0), big = simulate(1, 'good', 0, true);
  assert.equal(big.game.status, 'landed'); assert.notEqual(big.game.fish, plain.game.fish);
});
test('타임스탬프 탭은 30/60/120fps와 불규칙 프레임에서 같은 결과를 낸다', () => {
  for (const difficulty of [1, 3, 5]) {
    const { game, taps } = simulate(difficulty, 'good', 5);
    for (const deltas of [[1000 / 30], [1000 / 60], [17, 93, 250, 41, 99]]) {
      const other = replay(createReelGame(difficulty, false, false, 5), deltas, taps);
      assert.equal(other.status, game.status);
      for (const field of ['elapsed', 'zone', 'velocity', 'fish', 'progress', 'tapCount'] as const) assert.equal(other[field], game[field], field);
    }
  }
  const queued = stepReelGame(createReelGame(), 100, [150]);
  assert.equal(queued.tapCount, 0); assert.equal(stepReelGame(queued, 100).tapCount, 1);
});
test('진행도가 가득 차도 서버 최소 시간과 여유 시간을 기다린다', () => {
  for (const difficulty of [1, 1.63, 3, 4.79, 5]) {
    const minimum = minReelMs(difficulty) + REEL_MARGIN_MS;
    let game = { ...createReelGame(difficulty), progress: 1, zoneSize: 1 };
    game = stepReelGame(game, minimum - 1); assert.equal(game.status, 'playing');
    game = stepReelGame(game, 20); assert.equal(game.status, 'landed');
    assert.ok(game.elapsed * 1000 + 1e-7 >= minimum);
    assert.ok(game.elapsed * 1000 < minimum + 1000 / 120 + 1e-7);
  }
});
test('오리 보너스, 입력 경계와 불변 상태를 지킨다', () => {
  assert.ok(createReelGame(3, true).zoneSize > createReelGame(3).zoneSize);
  assert.equal(createReelGame(99).difficulty, 5); assert.equal(createReelGame(NaN).difficulty, 1);
  const initial = Object.freeze(createReelGame()), next = stepReelGame(initial, 1000, [0, 50, NaN]);
  assert.equal(initial.elapsed, 0); assert.deepEqual(initial.taps, []); assert.equal(next.tapCount, 2);
  assert.ok(next.zone <= 1 - next.zoneSize / 2); assert.strictEqual(stepReelGame(initial, NaN), initial);
  for (const taps of [[], [0]]) assert.equal(replay(createReelGame(), [1000 / 60], taps).status, 'escaped');
  const win = simulate(1, 'good', 0).game;
  assert.strictEqual(stepReelGame(win, 10000, [10000]), win);
});
test('난이도가 높을수록 이동량과 방향 전환이 늘고 칸과 충전량은 줄어든다', () => {
  const motion = (difficulty: number) => {
    let game = createReelGame(difficulty), distance = 0, changes = 0, sign = 0;
    for (let tick = 0; tick < 2400; tick++) {
      const next = stepReelGame({ ...game, progress: .5 }, 1000 / 120);
      const diff = next.fish - game.fish, direction = Math.sign(diff);
      distance += Math.abs(diff);
      if (direction && sign && direction !== sign) changes++;
      if (direction) sign = direction;
      game = next;
    }
    return { distance, changes };
  };
  const easy = motion(1), hard = motion(5);
  assert.ok(hard.distance > easy.distance * 1.5);
  assert.ok(hard.changes > easy.changes);
  assert.ok(createReelGame(1).zoneSize > createReelGame(3).zoneSize);
  assert.ok(createReelGame(3).zoneSize > createReelGame(5).zoneSize);
  const fill = (difficulty: number) => stepReelGame({ ...createReelGame(difficulty), zoneSize: 1 }, 1000).progress;
  assert.ok(fill(1) > fill(3) && fill(3) > fill(5));
  const drain = (difficulty: number) => stepReelGame({ ...createReelGame(difficulty), zone: .1, zoneSize: .01 }, 500).progress;
  assert.ok(drain(1) > drain(3) && drain(3) > drain(5));
});
