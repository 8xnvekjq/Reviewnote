import assert from 'node:assert/strict';
import test from 'node:test';
import { cancelFishingGame, fishingActive, idleFishingGame, reelFishingGame, startFishingGame, tickFishingGame } from '../../src/features/pixel-world-phaser/logic/fishingGame.ts';
import type { CastStart } from '../../src/features/pixel-world-phaser/ui/fishingAdapter.ts';
const cast = (pattern: 'quick' | 'double' | 'long' = 'quick'): CastStart => ({ ok: true, castId: 'cast-1', shadow: 'M', biteDelayMs: 3000, pattern, hint: null });
for (const pattern of ['quick', 'double', 'long'] as const) {
  test(`${pattern}: 캐스팅, 가짜 입질, 실제 입질`, () => {
    const game = startFishingGame(cast(pattern), null, 100);
    assert.equal(tickFishingGame(game, 100).phase, 'casting');
    assert.equal(tickFishingGame(game, 550).phase, 'waiting');
    assert.equal(game.nibbles.length, pattern === 'quick' ? 0 : pattern === 'double' ? 2 : 1);
    if (pattern === 'double') assert.ok(game.nibbles[1] - game.nibbles[0] >= 400 && game.nibbles[1] - game.nibbles[0] <= 600);
    for (const [index, at] of game.nibbles.entries()) {
      assert.equal(tickFishingGame(game, 100 + at).nibble, index);
      assert.equal(reelFishingGame(game, 100 + at).phase, 'tooEarly');
      assert.equal(tickFishingGame(game, 100 + at + 160).nibble, -1);
    }
    assert.equal(tickFishingGame(game, 3099).phase, 'waiting');
    assert.equal(tickFishingGame(game, 3100).phase, 'bite');
    assert.equal(reelFishingGame(game, 200).phase, 'tooEarly');
    assert.equal(reelFishingGame(game, 3099).phase, 'tooEarly');
    assert.equal(reelFishingGame(game, 3100).phase, 'reeling');
    assert.equal(reelFishingGame(game, 4000).phase, 'reeling');
    assert.equal(reelFishingGame(game, 4001).phase, 'missed');
    assert.equal(tickFishingGame(game, 4001).phase, 'missed');
  });
  test(`${pattern}: 30/60 fps와 건너뛴 프레임의 판정 일치`, () => {
    const initial = startFishingGame(cast(pattern), null, 0);
    for (const tap of [100, 2999, 3000, 3450, 3900, 3901]) {
      const outcomes = [30, 60].map(fps => {
        let game = initial;
        for (let at = 0; at < tap; at += 1000 / fps) game = tickFishingGame(game, at);
        return reelFishingGame(game, tap).phase;
      });
      assert.deepEqual(outcomes, [reelFishingGame(initial, tap).phase, reelFishingGame(initial, tap).phase]);
    }
  });
}
test('오리도 입질 창은 같고 첫 시도는 전체 창 두 배', () => {
  for (const [pet, first, expected] of [[null, false, 900], ['pet_duck', false, 900], [null, true, 1800], ['pet_duck', true, 1800], ['loan_duck', false, 900], ['pet_dog', false, 900]] as const) {
    const game = startFishingGame(cast(), pet, 0, first);
    assert.equal(game.deadline - game.biteAt, expected);
    assert.equal(reelFishingGame(game, game.deadline).phase, 'reeling');
    assert.equal(reelFishingGame(game, game.deadline + 1).phase, 'missed');
  }
});
test('취소와 종료 상태는 이후 입력으로 바뀌지 않는다', () => {
  const game = startFishingGame(cast(), null, 0);
  const hooked = reelFishingGame(game, 3000);
  assert.equal(hooked.phase, 'reeling');
  assert.equal(fishingActive(hooked), true);
  assert.strictEqual(tickFishingGame(hooked, 9000), hooked);
  assert.equal(cancelFishingGame(hooked).phase, 'cancelled');
  for (const at of [0, 500, 3000]) {
    const cancelled = cancelFishingGame(tickFishingGame(game, at));
    assert.equal(cancelled.phase, 'cancelled');
    assert.equal(fishingActive(cancelled), false);
    assert.strictEqual(reelFishingGame(cancelled, 3500), cancelled);
    assert.strictEqual(tickFishingGame(cancelled, 9000), cancelled);
  }
  for (const end of [reelFishingGame(game, 1), tickFishingGame(game, 4000), idleFishingGame()]) {
    assert.strictEqual(cancelFishingGame(end), end);
    assert.strictEqual(reelFishingGame(end, 3500), end);
  }
});
test('거절된 캐스트와 짧은 지연, 순수 입력 보존', () => {
  assert.equal(startFishingGame({ ok: false, reason: 'budget' }, null, 0).phase, 'idle');
  const response = Object.freeze({ ...cast('double'), biteDelayMs: 0 }) as CastStart;
  const game = Object.freeze(startFishingGame(response, null, 500));
  assert.equal(reelFishingGame(game, 500).phase, 'reeling');
  assert.equal(game.phase, 'casting');
});
