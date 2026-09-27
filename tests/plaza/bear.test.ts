import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEAR_SPAN, advanceBear, bearFits, bearPosition, bearStepMs, spawnBear } from '../../src/features/pixel-room/pet/bearModel.ts';
import { dogFits, dogStepMs } from '../../src/features/pixel-room/pet/dogModel.ts';
import { duckStepMs } from '../../src/features/pixel-room/pet/duckModel.ts';
import { roomDogWorld, yardDogWorld } from '../../src/features/pixel-room/pet/dogWorld.ts';
import { defaultState, placeFurniture } from '../../src/features/pixel-room/model.ts';
import { isPetId } from '../../src/features/pixel-room/pet/petKinds.ts';
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
test('bear long simulation keeps its whole 3-cell footprint on free cells and uses every motion', () => {
  for (const world of [roomDogWorld(defaultState(), { x: 4, y: 6 }), yardDogWorld({ x: 10, y: 5 })]) {
    let state = spawnBear(world, 0); const random = seeded(4242);
    const actions = new Set(); const visited = new Set();
    for (let now = 0; now < 900000; now += 50) {
      state = advanceBear(state, world, now, false, random);
      assert.ok(state && bearFits(world, state.cell) && bearFits(world, state.from));
      for (let dx = 0; dx < BEAR_SPAN; dx++) assert.ok(world.free({ x: state.cell.x + dx, y: state.cell.y }));
      assert.ok(state.route.length <= (world.outdoors ? 4 : 2));
      assert.ok(state.route.every(p => bearFits(world, p)));
      actions.add(state.action); visited.add(`${state.cell.x},${state.cell.y}`);
      const p = bearPosition(state, world, now);
      assert.ok(p.x >= Math.min(state.from.x, state.cell.x) && p.x <= Math.max(state.from.x, state.cell.x));
      assert.ok(p.y >= Math.min(state.from.y, state.cell.y) && p.y <= Math.max(state.from.y, state.cell.y));
    }
    assert.deepEqual([...actions].sort(), ['idle', 'sit', 'walk', 'wave']);
    assert.ok(visited.size > 4, `bear should roam (${visited.size} cells)`);
  }
});
test('bear yields to furniture, the player and editing; dog/duck footprints are unchanged', () => {
  const room = defaultState(); const world = roomDogWorld(room, { x: 4, y: 6 });
  let state = spawnBear(world, 0); assert.ok(state);
  state = advanceBear(state, world, 2000, true); assert.ok(state);
  assert.equal(state.action, 'sit'); assert.deepEqual(state.route, []); assert.deepEqual(state.cell, state.from);
  const entered = state.entered; state = advanceBear(state, world, 2500, true); assert.equal(state?.entered, entered, 'sitting keeps animating while paused');
  const changed = placeFurniture(room, 'chair', { x: state!.cell.x + 2, y: state!.cell.y });
  if (changed) { const next = roomDogWorld(changed, { x: 4, y: 6 }); state = advanceBear(state, next, 3000, false); assert.ok(state && bearFits(next, state.cell)); }
  const playerWorld = roomDogWorld(room, { x: state!.cell.x + 1, y: state!.cell.y });
  state = advanceBear(state, playerWorld, 4000, false); assert.ok(state && bearFits(playerWorld, state.cell));
  assert.equal(advanceBear(state, { ...world, free: () => false }, 5000, false), null);
  for (let i = 0; i < 20; i++) { const yard = yardDogWorld({ x: 6 + (i % 5), y: 7 }); const spawned = spawnBear(yard, 0); assert.ok(spawned && bearFits(yard, spawned.cell)); }
  // span defaults to 2: the dog/duck geometry is exactly what it was before the bear.
  const edge = { x: world.width - 2, y: 3 };
  assert.equal(dogFits({ ...world, free: () => true }, edge), true);
  assert.equal(bearFits({ ...world, free: () => true }, edge), false);
});
test('bear walks heavier than dog and duck; server pet values stay allowlisted', () => {
  const room = roomDogWorld(defaultState(), { x: 4, y: 6 }), yard = yardDogWorld({ x: 6, y: 7 });
  for (const world of [room, yard]) assert.ok(bearStepMs(world) > dogStepMs(world) && bearStepMs(world) > duckStepMs(world));
  assert.ok(isPetId('pet_bear') && isPetId('pet_duck') && isPetId('pet_dog'));
  for (const invalid of ['bear', 'pet_cat', 'furniture_chair', null, {}, true]) assert.equal(isPetId(invalid), false);
});
