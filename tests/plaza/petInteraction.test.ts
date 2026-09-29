import { test } from 'node:test';
import assert from 'node:assert/strict';
import './register-typescript.mjs';
const { advanceDog, facePet, holdDog, holdPet, petApproachCells, petNear, releasePet, spawnDog, stepHold } = await import('../../src/features/pixel-room/pet/dogModel.ts');
const { advanceBear, holdBear, BEAR_SPAN } = await import('../../src/features/pixel-room/pet/bearModel.ts');
const { advanceDuck, holdDuck } = await import('../../src/features/pixel-room/pet/duckModel.ts');
const { advancePigeon, holdPigeon } = await import('../../src/features/pixel-room/pet/pigeonModel.ts');
const { roomDogWorld } = await import('../../src/features/pixel-room/pet/dogWorld.ts');
const { defaultState } = await import('../../src/features/pixel-room/model.ts');
const { PET_INTERACTIONS, interactionBeat } = await import('../../src/features/pixel-room/pet/petInteraction.ts');

const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

test('petNear is Chebyshev distance ≤ 1 to any cell of the 1-row footprint', () => {
  const pet = { x: 4, y: 3 };
  // span 2 covers x=4..5: every ring cell is near, including diagonals.
  for (const near of [{ x: 3, y: 3 }, { x: 6, y: 3 }, { x: 3, y: 2 }, { x: 6, y: 4 }, { x: 4, y: 2 }, { x: 5, y: 4 }]) assert.ok(petNear(near, pet), JSON.stringify(near));
  for (const far of [{ x: 2, y: 3 }, { x: 7, y: 3 }, { x: 4, y: 1 }, { x: 5, y: 5 }, { x: 7, y: 4 }, { x: 2, y: 2 }]) assert.ok(!petNear(far, pet), JSON.stringify(far));
  // The bear's 3-wide footprint reaches one cell further right.
  assert.ok(!petNear({ x: 7, y: 3 }, pet, 2));
  assert.ok(petNear({ x: 7, y: 3 }, pet, BEAR_SPAN));
  assert.ok(!petNear({ x: 8, y: 3 }, pet, BEAR_SPAN));
});

test('facePet turns the player toward the footprint: sides first, then up/down', () => {
  const pet = { x: 4, y: 3 };
  // span 2 covers x=4..5.
  assert.equal(facePet({ x: 3, y: 3 }, pet), 'Right');
  assert.equal(facePet({ x: 6, y: 3 }, pet), 'Left');
  assert.equal(facePet({ x: 4, y: 2 }, pet), 'Front');
  assert.equal(facePet({ x: 5, y: 4 }, pet), 'Back');
  // Diagonals prefer left/right.
  assert.equal(facePet({ x: 3, y: 2 }, pet), 'Right');
  assert.equal(facePet({ x: 6, y: 4 }, pet), 'Left');
  // The bear's 3-wide footprint puts x=6 above/below it, not beside it.
  assert.equal(facePet({ x: 6, y: 4 }, pet, BEAR_SPAN), 'Back');
  assert.equal(facePet({ x: 7, y: 2 }, pet, BEAR_SPAN), 'Left');
  // Every approach cell gets a facing; standing on the footprint does not.
  for (const span of [2, 3]) for (const cell of petApproachCells(pet, span)) assert.ok(facePet(cell, pet, span));
  assert.equal(facePet({ x: 5, y: 3 }, pet), null);
});

test('approach cells are exactly the ring around the footprint, sides first', () => {
  for (const span of [2, 3]) {
    const pet = { x: 4, y: 3 };
    const ring = petApproachCells(pet, span);
    assert.equal(ring.length, 2 + 2 * (span + 2));
    assert.equal(new Set(ring.map(c => `${c.x},${c.y}`)).size, ring.length);
    for (const cell of ring) {
      assert.ok(petNear(cell, pet, span));
      assert.ok(!(cell.y === pet.y && cell.x >= pet.x && cell.x < pet.x + span), 'never inside the footprint');
    }
    assert.deepEqual(ring.slice(0, 2), [{ x: 3, y: 3 }, { x: 4 + span, y: 3 }]);
  }
});

test('a held dog stays put facing the player, then resumes its own behavior', () => {
  const room = defaultState();
  const world = roomDogWorld(room, { x: 0, y: 0 });
  const random = seeded(7);
  let state = spawnDog(world, 0)!;
  // Drive it until it is mid-walk so the hold has something to interrupt.
  let now = 0;
  while (!(state.action === 'walk' && state.route.length)) { now += 50; state = advanceDog(state, world, now, false, random)!; }
  const player = { x: state.cell.x - 1, y: state.cell.y };
  const held = holdDog(state, player, now, now + 2800);
  assert.equal(held.right, false, 'player on the left: face left');
  assert.deepEqual(held.from, held.cell);
  assert.equal(held.route.length, 0);
  assert.deepEqual(held.held, { start: now, until: now + 2800, action: 'idle' });
  // Frozen for the whole hold regardless of random rolls.
  let current = held;
  for (let t = now + 50; t < now + 2800; t += 50) {
    current = advanceDog(current, world, t, false, random)!;
    assert.equal(current, held);
  }
  const released = advanceDog(current, world, now + 2800, false, random)!;
  assert.equal(released.held, undefined);
  assert.deepEqual(released.cell, held.cell);
  // Released straight into its resume pose, then free to wander again.
  let wandered = released;
  for (let t = now + 2850; t < now + 30000 && wandered.cell.x === held.cell.x && wandered.cell.y === held.cell.y; t += 50) wandered = advanceDog(wandered, world, t, false, random)!;
  assert.ok(wandered.cell.x !== held.cell.x || wandered.cell.y !== held.cell.y, 'the dog walks again after release');
});

test('facing: right of centre faces right, directly above/below keeps the current facing', () => {
  const base = { cell: { x: 4, y: 3 }, from: { x: 4, y: 3 }, route: [], action: 'sit' as const, right: false, entered: 0, due: 10 };
  assert.equal(holdDog(base, { x: 6, y: 3 }, 0, 100).right, true);
  assert.equal(holdDog(base, { x: 3, y: 4 }, 0, 100).right, false);
  // Bear centre is x+1: a player straight below the middle keeps its facing.
  const bear = { ...base, action: 'idle' as const, right: true };
  assert.equal(holdBear(bear, { x: 5, y: 4 }, 0, 100).right, true);
  assert.equal(holdBear(bear, { x: 4, y: 4 }, 0, 100).right, false);
  // A sitting pet resumes sitting; others resume idle.
  assert.equal(holdDog(base, { x: 6, y: 3 }, 0, 100).held!.action, 'sit');
});

test('re-holding keeps the original resume pose; release and pause both end the hold', () => {
  const base = { cell: { x: 4, y: 3 }, from: { x: 4, y: 3 }, route: [], action: 'sit' as const, right: false, entered: 0, due: 10 };
  const first = holdPet(base, { x: 6, y: 3 }, 0, 1000, 'sit' as const);
  const again = holdPet({ ...first, action: 'bark' as const }, { x: 6, y: 3 }, 500, 1500, 'idle' as const);
  assert.equal(again.held!.action, 'sit');
  assert.equal(releasePet(again, 1500).action, 'sit');
  assert.equal(releasePet(base, 5), base, 'releasing an unheld pet is a no-op');
  assert.equal(stepHold(first, 200, false).frozen, true);
  const paused = stepHold(first, 200, true);
  assert.equal(paused.frozen, false);
  assert.equal(paused.state.held, undefined);
});

test('every pet model honours the hold; the pigeon lands first', () => {
  const room = defaultState();
  const world = roomDogWorld(room, { x: 0, y: 0 });
  const random = seeded(3);
  const cases = [
    { advance: advanceBear, hold: holdBear, start: { cell: { x: 1, y: 3 }, from: { x: 1, y: 3 }, route: [], action: 'wave' as const, right: false, entered: 0, due: 50 } },
    { advance: advanceDuck, hold: holdDuck, start: { cell: { x: 1, y: 3 }, from: { x: 1, y: 3 }, route: [], action: 'hop' as const, right: false, entered: 0, due: 50 } },
    { advance: advancePigeon, hold: holdPigeon, start: { cell: { x: 1, y: 3 }, from: { x: 6, y: 1 }, route: [], action: 'fly' as const, right: false, entered: 0, due: 900 } },
  ];
  for (const { advance, hold, start } of cases) {
    const held = (hold as Function)(start, { x: 0, y: 3 }, 100, 2900);
    assert.deepEqual(held.from, held.cell);
    assert.equal(held.held.action, 'idle', 'one-shot poses (wave/hop/flight) resume as idle');
    assert.equal(held.right, false, 'player on the left');
    for (let t = 150; t < 2900; t += 100) assert.equal((advance as Function)(held, world, t, false, random), held);
    const released = (advance as Function)(held, world, 2900, false, random);
    assert.equal(released.held, undefined);
    assert.deepEqual(released.cell, { x: 1, y: 3 });
  }
  assert.equal(holdPigeon({ ...cases[2].start, from: { x: 1, y: 3 }, action: 'takeoff', to: { x: 5, y: 5 } }, { x: 0, y: 3 }, 0, 100).to, undefined);
});

test('interaction scripts play in order and continuous rows do not restart', () => {
  for (const [pet, script] of Object.entries(PET_INTERACTIONS)) {
    assert.ok(script.ms >= 2000 && script.ms <= 3200, `${pet} lasts about 2–3 s`);
    assert.equal(script.beats[0].at, 0);
    assert.equal(interactionBeat(pet as never, 0).stage, 'treat');
  }
  assert.deepEqual([0, 700, 1700, 2500].map(t => interactionBeat('pet_bear', t).stage), ['treat', 'eat', 'love', 'wave']);
  // Sit started at 600 ms and carries on through the heart beat.
  assert.deepEqual(interactionBeat('pet_bear', 1800), { stage: 'love', action: 'sit', elapsed: 1200, heart: true });
  assert.deepEqual(interactionBeat('pet_bear', 2500), { stage: 'wave', action: 'wave', elapsed: 500, heart: true });
  assert.deepEqual([100, 900, 1700, 2500].map(t => interactionBeat('pet_dog', t).action), ['idle', 'sit', 'bark', 'sit']);
  assert.deepEqual([100, 1000, 2200].map(t => interactionBeat('pet_duck', t).action), ['idle', 'peck', 'hop']);
  assert.deepEqual([100, 1000, 2200].map(t => interactionBeat('pet_pigeon', t).action), ['idle', 'peck', 'bob']);
});

test('pickApproach takes the cheapest reachable ring cell, preferring the sides', async () => {
  const { pickApproach } = await import('../../src/features/pixel-room/pet/dogModel.ts');
  const ring = petApproachCells({ x: 4, y: 3 }, 2);
  const steps = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: 0 }));
  // A front cell one step shorter still loses to a side cell (2-step preference) …
  assert.deepEqual(pickApproach(ring, t => t.x === 3 && t.y === 3 ? steps(4) : t.y === 4 ? steps(3) : steps(9)), steps(4));
  // … but not when the side is much further; unreachable (empty) routes are skipped.
  assert.deepEqual(pickApproach(ring, t => t.x === 3 && t.y === 3 ? steps(8) : t.x === 5 && t.y === 4 ? steps(2) : []), steps(2));
  assert.deepEqual(pickApproach(ring, () => []), []);
});
