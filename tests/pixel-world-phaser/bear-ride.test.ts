import test from 'node:test';
import assert from 'node:assert/strict';
import { canRide, rideState, rideInScene, rideSpeed, riderOffset, rideRow } from '../../src/features/pixel-world-phaser/logic/bearRide.ts';

test('bear mounting and dismounting are session state transitions', () => {
  assert.equal(rideState(false, 'toggle', 'pet_bear'), true);
  assert.equal(rideState(true, 'toggle', 'pet_bear'), false);
  for (const pet of ['pet_dog', 'pet_duck', 'pet_pigeon', null] as const) {
    assert.equal(canRide(pet), false);
    assert.equal(rideState(true, 'pet', pet), false);
    assert.equal(rideState(false, 'toggle', pet), false);
  }
});
test('riding multiplies walking and running by 1.4', () => {
  assert.equal(rideSpeed(false), 1);
  assert.equal(56 * rideSpeed(true), 56 * 1.4);
  assert.equal(96 * rideSpeed(true), 96 * 1.4);
});
test('room and fishing dismount; outdoor scene changes preserve riding', () => {
  for (const scene of ['yard', 'plaza', 'river'] as const) assert.equal(rideInScene(true, scene, 'pet_bear'), true);
  assert.equal(rideInScene(true, 'room', 'pet_bear'), false);
  assert.equal(rideState(true, 'fishing', 'pet_bear'), false);
});
test('rider offsets and directional animation rows', () => {
  assert.deepEqual(riderOffset('Left'), { x: 4, y: -13 });
  assert.deepEqual(riderOffset('Right'), { x: -4, y: -13 });
  assert.deepEqual(riderOffset('Front'), { x: 0, y: -13 });
  assert.deepEqual(riderOffset('Back'), { x: 0, y: -14 });
  assert.deepEqual((['Left', 'Right', 'Front', 'Back'] as const).map(rideRow), [0, 0, 1, 2]);
});
