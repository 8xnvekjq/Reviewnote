import test from 'node:test';
import assert from 'node:assert/strict';
import { canRide, rideSpeedFor } from '../../src/features/pixel-world-phaser/logic/petRide.ts';
import { rideState, rideInScene } from '../../src/features/pixel-world-phaser/logic/bearRide.ts';
import { rideSolid, rideLanding, rideOnWater, rideRadius, rideOffset } from '../../src/features/pixel-world-phaser/logic/rideArt.ts';
import { riverScene } from '../../src/features/pixel-world-phaser/logic/riverWorld.ts';
import { plazaScene } from '../../src/features/pixel-world-phaser/logic/plazaWorld.ts';
import { yardScene, MARGIN } from '../../src/features/pixel-world-phaser/logic/yardWorld.ts';
import { cellCenter, feetBlocked } from '../../src/features/pixel-world-phaser/logic/world.ts';

test('every pet mounts outdoors; room and fishing transitions follow the contract', () => {
  for (const pet of ['pet_bear', 'pet_pigeon', 'pet_duck', 'pet_dog'] as const) {
    assert.equal(canRide(pet), true);
    assert.equal(rideState(false, 'toggle', pet), true);
    assert.equal(rideState(true, 'toggle', pet), false);
    assert.equal(rideState(true, 'fishing', pet), pet === 'pet_duck');
    assert.equal(rideInScene(true, 'room', pet), false);
    for (const scene of ['yard', 'plaza', 'river'] as const) assert.equal(rideInScene(true, scene, pet), true);
  }
  assert.equal(rideState(true, 'toggle', null), false);
  assert.deepEqual((['pet_bear', 'pet_pigeon', 'pet_dog', 'pet_duck'] as const).map(p => rideSpeedFor(p, true)), [1.15, 1.7, 1.45, .6]);
  assert.equal(rideSpeedFor('pet_duck', true, true), 1.1);
});

test('water access preserves river bounds, trees, and other solid objects', () => {
  const spec = riverScene(), water = { x: 13, y: 8 }, bush = { x: 3, y: 6 }, tree = { x: 2, y: 5 };
  assert.equal(rideOnWater(spec, water), true);
  for (const pet of ['pet_bear', 'pet_pigeon', 'pet_duck', 'pet_dog'] as const) {
    const solid = rideSolid(spec, pet, true);
    assert.equal(solid(water), pet !== 'pet_pigeon' && pet !== 'pet_duck');
    assert.equal(solid(bush), pet !== 'pet_pigeon');
    assert.equal(solid(tree), true);
    assert.equal(solid({ x: 5, y: 8 }), true); // turtle
    for (const edge of [{ x: 0, y: 7 }, { x: spec.cols - 2, y: 7 }, { x: 12, y: 0 }, { x: 12, y: 20 }]) assert.equal(solid(edge), true);
    assert.equal(rideSolid(spec, pet, false)(water), true);
  }
  assert.equal(rideSolid(spec, 'pet_duck', true)({ x: 28, y: 8 }), false); // widened river
  assert.equal(rideSolid(spec, 'pet_duck', true)({ x: 28, y: 8 }), false); // widened river
  assert.equal(rideSolid(spec, 'pet_duck', true)({ x: 12, y: 6 }), true); // lily
  assert.equal(rideSolid(spec, 'pet_pigeon', true)({ x: 12, y: 6 }), false);
});

test('pigeon clears low fences while buildings and trees remain blocked', () => {
  const yard = yardScene(), fly = rideSolid(yard, 'pet_pigeon', true);
  assert.equal(fly({ x: MARGIN + 10, y: MARGIN + 2 }), false);
  assert.equal(fly({ x: MARGIN + 4, y: MARGIN + 2 }), true);
  assert.equal(fly({ x: MARGIN, y: MARGIN + 4 }), true);
  const plaza = plazaScene();
  assert.equal(rideSolid(plaza, 'pet_pigeon', true)({ x: -1, y: 4 }), true);
});

test('dismount finds the closest safe land without choosing an exit; no land returns null', () => {
  const spec = riverScene(), feet = cellCenter({ x: 13, y: 8 }), landing = rideLanding(spec, feet)!;
  assert.ok(landing);
  assert.equal(feetBlocked(landing, spec.solid), false);
  for (let y = 1; y < spec.rows - 1; y++) for (let x = 1; x < spec.cols - 1; x++) {
    const c = cellCenter({ x, y });
    if (!feetBlocked(c, spec.solid)) assert.ok(Math.hypot(c.x - feet.x, c.y - feet.y) >= Math.hypot(landing.x - feet.x, landing.y - feet.y));
  }
  assert.deepEqual(rideLanding(spec, landing), landing);
  assert.equal(rideLanding({ ...spec, solid: () => true }, feet), null);
});

test('rider anchors and collision sizes differ by pet', () => {
  assert.equal(rideRadius('pet_bear', true), 12);
  assert.equal(rideRadius('pet_pigeon', true), 7);
  assert.equal(rideRadius('pet_duck', true), 10);
  assert.equal(rideRadius('pet_dog', true), 8);
  assert.equal(rideRadius('pet_bear', false), 7);
  assert.equal(rideOffset('pet_pigeon', 'Front').y, -17);
  assert.equal(rideOffset('pet_dog', 'Front').y, 0);
});
