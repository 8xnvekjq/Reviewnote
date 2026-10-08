import assert from 'node:assert/strict';
import test from 'node:test';
import { createReelGame, minReelMs, REEL_MARGIN_MS, stepReelGame } from '../../src/features/pixel-world-phaser/logic/reelGame.ts';
import type { ReelGame } from '../../src/features/pixel-world-phaser/logic/reelGame.ts';
const regularTaps = (interval: number) => Array.from({ length: Math.ceil(60000 / interval) }, (_, i) => i * interval);
function run(game: ReelGame, deltas: number[], taps: number[]) {
  let wall = 0, index = 0, frame = 0;
  while (wall < 60000 && game.status === 'playing') {
    const delta = deltas[frame++ % deltas.length], inputs: number[] = [];
    while (index < taps.length && taps[index] <= wall + delta + 1e-7) inputs.push(taps[index++]);
    game = stepReelGame(game, delta, inputs); wall += delta;
  }
  return game;
}
test('0.5~0.7초마다 탭하면 쉬운 물고기를 잡는다', () => {
  for (const interval of [500, 600, 700]) {
    const game = run(createReelGame(), [1000 / 60], regularTaps(interval));
    assert.equal(game.status, 'landed'); assert.ok(game.elapsed < 7);
  }
});
test('탭하지 않거나 한 번만 누르고 있으면 놓친다', () => {
  for (const taps of [[], [0]]) assert.equal(run(createReelGame(), [1000 / 60], taps).status, 'escaped');
});
test('추적 탭으로 난이도 5를 잡고 물고기 속도와 방향 변화는 유지한다', () => {
  let game = createReelGame(5), last = -1000;
  const taps: number[] = [];
  for (let tick = 0; tick < 7200 && game.status === 'playing'; tick++) {
    const time = (tick + 1) * 1000 / 120;
    const tap = time - last >= 250 && game.zone < game.fish + .04;
    if (tap) { last = time; taps.push(time); }
    game = stepReelGame(game, 1000 / 120, tap ? [time] : []);
  }
  assert.equal(game.status, 'landed'); assert.ok(game.elapsed < 30);
  const replay = run(createReelGame(5), [1000 / 30], taps);
  assert.equal(replay.status, 'landed'); assert.equal(replay.elapsed, game.elapsed);
  const travel = (difficulty: number) => {
    let state = createReelGame(difficulty), distance = 0, changes = 0, sign = 0;
    for (let i = 0; i < 600; i++) {
      const next = stepReelGame({ ...state, progress: .5 }, 1000 / 60);
      const diff = next.fish - state.fish;
      distance += Math.abs(diff);
      if (Math.sign(diff) && sign && sign !== Math.sign(diff)) changes++;
      sign = Math.sign(diff); state = next;
    }
    return { distance, changes };
  };
  assert.ok(createReelGame(1).zoneSize > createReelGame(5).zoneSize * 2);
  assert.ok(travel(5).distance > travel(1).distance * 4);
  assert.ok(travel(5).changes > travel(1).changes);
});
test('시각을 기록한 탭은 30/60fps와 불규칙 프레임에서 동일하다', () => {
  const taps = regularTaps(613), a = run(createReelGame(), [1000 / 30], taps);
  for (const deltas of [[1000 / 60], [17, 93, 250, 41, 99]]) {
    const b = run(createReelGame(), deltas, taps);
    assert.equal(a.status, b.status);
    for (const field of ['elapsed', 'zone', 'velocity', 'fish', 'progress', 'tapCount'] as const) assert.equal(a[field], b[field], field);
  }
  const queued = stepReelGame(createReelGame(), 100, [150]);
  assert.equal(queued.tapCount, 0); assert.equal(stepReelGame(queued, 100).tapCount, 1);
});
test('진행도가 가득 차도 서버 최소 시간과 여유 시간을 기다린다', () => {
  for (let difficulty = 1; difficulty <= 5; difficulty++) {
    const minimum = minReelMs(difficulty) + REEL_MARGIN_MS;
    let game = { ...createReelGame(difficulty), progress: 1, zoneSize: 1 };
    game = stepReelGame(game, minimum - 1, regularTaps(100)); assert.equal(game.status, 'playing');
    game = stepReelGame(game, 20); assert.equal(game.status, 'landed');
    assert.ok(game.elapsed * 1000 + 1e-7 >= minimum);
    assert.ok(game.elapsed * 1000 < minimum + 1000 / 120 + 1e-7);
  }
});
test('오리 영역, 잘못된 입력, 경계와 끝난 게임', () => {
  assert.ok(createReelGame(3, true).zoneSize > createReelGame(3).zoneSize);
  assert.equal(createReelGame(99).difficulty, 5); assert.equal(createReelGame(NaN).difficulty, 1);
  const initial = Object.freeze(createReelGame()), next = stepReelGame(initial, 1000, [0, 50, NaN]);
  assert.equal(initial.elapsed, 0); assert.deepEqual(initial.taps, []); assert.equal(next.tapCount, 2);
  assert.ok(next.zone <= 1 - next.zoneSize / 2); assert.strictEqual(stepReelGame(initial, NaN), initial);
  const win = run(createReelGame(), [1000 / 30], regularTaps(600));
  assert.strictEqual(stepReelGame(win, 10000, [10000]), win);
});
