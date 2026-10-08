import assert from 'node:assert/strict';
import test from 'node:test';
import { createReelGame, minReelMs, stepReelGame } from '../../src/features/pixel-world-phaser/logic/reelGame.ts';
import type { ReelGame } from '../../src/features/pixel-world-phaser/logic/reelGame.ts';
function simulate(difficulty: number, fps: number, control: (game: ReelGame) => boolean, seconds = 20) {
  let game = createReelGame(difficulty);
  for (let frame = 0; frame < fps * seconds && game.status === 'playing'; frame++) game = stepReelGame(game, 1000 / fps, control(game));
  return game;
}
test('쉬운 물고기는 누르고만 있어도 잡히고 손을 떼면 도망간다', () => {
  const win = simulate(1, 60, () => true);
  assert.equal(win.status, 'landed');
  assert.ok(win.elapsed * 1000 >= minReelMs(1));
  assert.equal(simulate(1, 60, () => false).status, 'escaped');
});
test('난이도가 오르면 영역이 작아지고 이동과 방향 변화가 늘어난다', () => {
  assert.ok(createReelGame(1).zoneSize > createReelGame(5).zoneSize * 2);
  const travel = (difficulty: number) => {
    let game = createReelGame(difficulty), distance = 0, changes = 0, sign = 0;
    for (let i = 0; i < 600; i++) {
      const next = stepReelGame({ ...game, progress: .5 }, 1000 / 60, true);
      const diff = next.fish - game.fish;
      distance += Math.abs(diff);
      if (Math.sign(diff) && sign && sign !== Math.sign(diff)) changes++;
      sign = Math.sign(diff); game = next;
    }
    return { distance, changes };
  };
  const easy = travel(1), hard = travel(5);
  assert.ok(hard.distance > easy.distance * 4);
  assert.ok(hard.changes > easy.changes);
  assert.equal(simulate(5, 60, () => true).status, 'escaped');
  assert.equal(simulate(5, 60, game => game.zone + game.velocity * .1 < game.fish, 60).status, 'landed');
});
test('30/60fps와 불규칙 프레임에서도 같은 시간과 입력은 같은 결과', () => {
  const run = (deltas: number[]) => {
    let game = createReelGame(4);
    for (let block = 0; block < 8; block++) for (const delta of deltas) game = stepReelGame(game, delta, block % 2 === 0);
    return game;
  };
  const a = run(Array(30).fill(1000 / 30));
  const b = run(Array(60).fill(1000 / 60));
  const c = run([100, 200, 400, 300]);
  for (const game of [b, c]) {
    assert.equal(game.status, a.status);
    for (const field of ['elapsed', 'zone', 'fish', 'progress'] as const) assert.ok(Math.abs(game[field] - a[field]) < 1e-9, field);
  }
});
test('오리 영역, 순수 입력, 경계와 끝난 게임', () => {
  assert.ok(createReelGame(3, true).zoneSize > createReelGame(3).zoneSize);
  assert.equal(createReelGame(99).difficulty, 5);
  assert.equal(createReelGame(NaN).difficulty, 1);
  const initial = Object.freeze(createReelGame());
  const next = stepReelGame(initial, 1000, true);
  assert.equal(initial.elapsed, 0);
  assert.ok(next.zone <= 1 - next.zoneSize / 2);
  assert.strictEqual(stepReelGame(initial, NaN, true), initial);
  const win = simulate(1, 30, () => true);
  assert.strictEqual(stepReelGame(win, 10000, false), win);
});
