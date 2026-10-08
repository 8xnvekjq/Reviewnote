import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFarmResult } from '../../src/features/pixel-world-phaser/logic/farmResult.ts';
import { parseCastFinish } from '../../src/features/pixel-world-phaser/ui/fishingAdapter.ts';

test('낚시 종료와 농장 수확은 SQL 응답의 최상위 경험치 영수증을 보존한다', () => {
  const fishGain = { gained: 25, xp: 1270, level: 13, leveledUp: true };
  const fish = parseCastFinish({ ok: true, landed: true, speciesId: 'pirami', lengthCm: 10,
    rarity: 'rare', new: false, remaining: -1, xpGain: fishGain });
  assert.ok(fish.ok && fish.landed);
  assert.deepEqual(fish.xpGain, fishGain);
  const farmGain = { gained: 40, xp: 1310, level: 13, leveledUp: false };
  const raw = { serverNow: '2026-10-09T01:00:00Z', plots: [{ index: 0 }, { index: 1 }],
    result: 'ok', harvest: { sizeScore: 75, bonusApplied: true }, xpGain: farmGain };
  const farm = parseFarmResult(raw);
  assert.deepEqual(farm.xpGain, farmGain);
  assert.deepEqual(farm.harvest, raw.harvest);
  assert.equal(parseFarmResult({ ...raw, xpGain: { ...farmGain, leveledUp: 'false' } }).xpGain, undefined);
  assert.equal(parseFarmResult({ ...raw, xpGain: undefined }).xpGain, undefined);
  assert.throws(() => parseFarmResult({ ...raw, plots: [] }));
});
