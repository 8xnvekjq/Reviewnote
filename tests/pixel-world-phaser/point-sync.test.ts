import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustmentAfterServerReward, adjustmentForServerBalance } from '../../src/features/pixel-world-phaser/pointSync.ts';

// ── 구매: 서버가 돌려준 새 잔액 = bonus_points + point_adjustment ──
test('purchase: server balance minus bonus points becomes the new adjustment', () => {
  assert.equal(adjustmentForServerBalance(700, 1000), -300);
  assert.equal(adjustmentForServerBalance(0, 250), -250);
  assert.equal(adjustmentForServerBalance(120, 0), 120);
});

test('purchase: a missing/invalid balance does not sync', () => {
  assert.equal(adjustmentForServerBalance(Number.NaN, 100), null);
  assert.equal(adjustmentForServerBalance(undefined as unknown as number, 100), null);
});

// ── 출품: 서버가 point_adjustment에 보상을 더했으니 같은 양을 더한다 ──
test('crop submission: reward is added to the previous adjustment', () => {
  assert.equal(adjustmentAfterServerReward(-300, 42), -258);
  assert.equal(adjustmentAfterServerReward(0, 10), 10);
});

test('crop submission: a missing/invalid reward does not sync', () => {
  assert.equal(adjustmentAfterServerReward(-300, Number.NaN), null);
  assert.equal(adjustmentAfterServerReward(-300, undefined as unknown as number), null);
});
