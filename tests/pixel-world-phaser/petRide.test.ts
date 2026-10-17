import test from 'node:test';
import assert from 'node:assert/strict';
import { canCrossWater, canFishWhileRiding, rideChipLabel, rideSpeedFor } from '../../src/features/pixel-world-phaser/logic/petRide.ts';

test('펫 타기 속도: 비둘기 > 강아지 > 곰 > 걷기, 오리는 땅에서 느리고 물에서 빠르다', () => {
  assert.ok(rideSpeedFor('pet_pigeon', true) > rideSpeedFor('pet_dog', true));
  assert.ok(rideSpeedFor('pet_dog', true) > rideSpeedFor('pet_bear', true));
  assert.ok(rideSpeedFor('pet_bear', true) > 1);
  assert.ok(rideSpeedFor('pet_duck', true, false) < 1 && rideSpeedFor('pet_duck', true, true) > 1);
  assert.equal(rideSpeedFor('pet_pigeon', false), 1);
});
test('물 건너기·탄 채 낚시·칩 문구', () => {
  assert.equal(canCrossWater('pet_pigeon', true), true);
  assert.equal(canCrossWater('pet_duck', true), true);
  assert.equal(canCrossWater('pet_bear', true), false);
  assert.equal(canCrossWater('pet_duck', false), false);
  assert.equal(canFishWhileRiding('pet_duck'), true);
  assert.equal(canFishWhileRiding('pet_bear'), false);
  assert.equal(rideChipLabel('pet_dog', false), '🐶 태우기');
  assert.equal(rideChipLabel('pet_bear', false), '🐾 타기');
  assert.equal(rideChipLabel('pet_duck', true), '내리기');
});
