import assert from 'node:assert/strict';
import test from 'node:test';
import { cancelFishingGame, fishingActive, idleFishingGame, reelFishingGame, startFishingGame, tickFishingGame } from '../../src/features/pixel-world-phaser/logic/fishingGame.ts';
import type { CastStart, FishingAdapter } from '../../src/features/pixel-world-phaser/ui/fishingAdapter.ts';
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
    assert.equal(reelFishingGame(game, 3100).phase, 'landed');
    assert.equal(reelFishingGame(game, 4000).phase, 'landed');
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
test('소유한 오리만 200ms 추가, 첫 시도는 전체 창 두 배', () => {
  for (const [pet, first, expected] of [[null, false, 900], ['pet_duck', false, 1100], [null, true, 1800], ['pet_duck', true, 2200], ['loan_duck', false, 900], ['pet_dog', false, 900]] as const) {
    const game = startFishingGame(cast(), pet, 0, first);
    assert.equal(game.deadline - game.biteAt, expected);
    assert.equal(reelFishingGame(game, game.deadline).phase, 'landed');
    assert.equal(reelFishingGame(game, game.deadline + 1).phase, 'missed');
  }
});
test('취소와 종료 상태는 이후 입력으로 바뀌지 않는다', () => {
  const game = startFishingGame(cast(), null, 0);
  for (const at of [0, 500, 3000]) {
    const cancelled = cancelFishingGame(tickFishingGame(game, at));
    assert.equal(cancelled.phase, 'cancelled');
    assert.equal(fishingActive(cancelled), false);
    assert.strictEqual(reelFishingGame(cancelled, 3500), cancelled);
    assert.strictEqual(tickFishingGame(cancelled, 9000), cancelled);
  }
  for (const end of [reelFishingGame(game, 1), reelFishingGame(game, 3000), tickFishingGame(game, 4000), idleFishingGame()]) {
    assert.strictEqual(cancelFishingGame(end), end);
    assert.strictEqual(reelFishingGame(end, 3500), end);
  }
});
test('거절된 캐스트와 짧은 지연, 순수 입력 보존', () => {
  assert.equal(startFishingGame({ ok: false, reason: 'budget' }, null, 0).phase, 'idle');
  const response = Object.freeze({ ...cast('double'), biteDelayMs: 0 }) as CastStart;
  const game = Object.freeze(startFishingGame(response, null, 500));
  assert.equal(reelFishingGame(game, 500).phase, 'landed');
  assert.equal(game.phase, 'casting');
});
test('어댑터 계약: 실패/취소는 무료, 성공 후 상태 새로고침', async () => {
  // 다른 작업자의 모듈이 있으면 실제 공유 mock을 사용한다.
  let factory: () => FishingAdapter;
  try {
    const path = '../../src/features/pixel-world-phaser/ui/fishingAdapterMock.ts';
    factory = (await import(path)).createMockFishingAdapter;
  } catch (error) {
    if ((error as { code?: string }).code !== 'ERR_MODULE_NOT_FOUND') throw error;
    factory = () => {
      let remaining = 6, pending: string | null = null;
      return {
        state: async () => ({ kstDate: '2026-10-08', phase: 'day', weather: 'clear', remaining, sparkleShadow: null, pigeonHint: null, album: [] }),
        start: async () => { if (remaining === 0) return { ok: false, reason: 'budget' }; if (pending) return { ok: false, reason: 'pending' }; pending = 'cast-1'; return cast(); },
        finish: async (id, landed) => { if (id !== pending) return { ok: false }; pending = null; if (!landed) return { ok: true, landed: false }; remaining--; return { ok: true, landed: true, speciesId: 'pirami', lengthCm: 9, rarity: 'common', isNew: true, isBig: false, isPersonalBest: true, remaining }; },
        board: async () => ({ rows: [], classSpecies: 0 }),
      };
    };
  }
  const adapter = factory();
  const before = await adapter.state();
  for (const outcome of ['tooEarly', 'missed', 'cancelled', 'landed']) {
    const started = await adapter.start(null); assert.equal(started.ok, true); if (!started.ok) return;
    const game = startFishingGame(started, null, 0);
    const end = outcome === 'cancelled' ? cancelFishingGame(game) : reelFishingGame(game, outcome === 'tooEarly' ? 0 : outcome === 'missed' ? game.deadline + 1 : game.biteAt);
    const result = await adapter.finish(started.castId, end.phase === 'landed');
    assert.equal(result.ok, true);
    assert.equal((await adapter.state()).remaining, before.remaining - (outcome === 'landed' ? 1 : 0));
  }
});
