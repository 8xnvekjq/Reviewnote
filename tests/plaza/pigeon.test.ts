import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advancePigeon, pigeonAirborne, pigeonFlightTarget, pigeonLift, pigeonPosition, pigeonStepMs, spawnPigeon } from '../../src/features/pixel-room/pet/pigeonModel.ts';
import type { PigeonState } from '../../src/features/pixel-room/pet/pigeonModel.ts';
import { dogFits, dogStepMs } from '../../src/features/pixel-room/pet/dogModel.ts';
import { duckStepMs } from '../../src/features/pixel-room/pet/duckModel.ts';
import { roomDogWorld, yardDogWorld } from '../../src/features/pixel-room/pet/dogWorld.ts';
import { defaultState } from '../../src/features/pixel-room/model.ts';
import { isPetId } from '../../src/features/pixel-room/pet/petKinds.ts';
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

function simulate(world: ReturnType<typeof roomDogWorld>, seed: number, ms: number) {
  let state = spawnPigeon(world, 0); const random = seeded(seed);
  const time = new Map<string, number>(); const actions = new Set<string>(); const sequence: string[] = [];
  let flights = 0, maxLift = 0;
  for (let now = 0; now < ms; now += 40) {
    const previous = state;
    state = advancePigeon(state, world, now, false, random);
    assert.ok(state && dogFits(world, state.cell), 'current / landing cell is always a safe pet cell');
    if (!pigeonAirborne(state) || state.action === 'takeoff') assert.ok(dogFits(world, state.from));
    assert.ok(state.route.every(p => dogFits(world, p)));
    if (state.action !== previous?.action) sequence.push(state.action);
    if (state.action === 'takeoff' && previous?.action !== 'takeoff') { flights++; assert.ok(state.to && dogFits(world, state.to)); }
    time.set(state.action, (time.get(state.action) ?? 0) + 40); actions.add(state.action);
    const p = pigeonPosition(state, world, now);
    assert.ok(p.x >= Math.min(state.from.x, state.cell.x) - 1e-9 && p.x <= Math.max(state.from.x, state.cell.x) + 1e-9);
    const lift = pigeonLift(state, world, now); maxLift = Math.max(maxLift, lift);
    assert.ok(lift >= 0 && lift <= 12); if (!pigeonAirborne(state)) assert.equal(lift, 0);
  }
  return { time, actions, sequence, flights, maxLift };
}
test('pigeon lives on the ground and only sometimes flies: takeoff -> fly -> land, every motion used', () => {
  const room = simulate(roomDogWorld(defaultState(), { x: 4, y: 6 }), 11, 900000);
  const yard = simulate(yardDogWorld({ x: 10, y: 5 }), 29, 900000);
  for (const run of [room, yard]) {
    assert.deepEqual([...run.actions].sort(), ['bob', 'fly', 'idle', 'land', 'peck', 'rest', 'takeoff', 'walk']);
    const airborne = (run.time.get('takeoff') ?? 0) + (run.time.get('fly') ?? 0) + (run.time.get('land') ?? 0);
    assert.ok(airborne / 900000 < .15, `mostly grounded (${(airborne / 9000).toFixed(1)}% airborne)`);
    // A flight always runs takeoff -> fly -> land, never skipping or chaining another flight.
    run.sequence.forEach((action, index) => {
      if (action === 'fly') { assert.equal(run.sequence[index - 1], 'takeoff'); assert.equal(run.sequence[index + 1] ?? 'land', 'land'); }
      if (action === 'land') assert.notEqual(run.sequence[index + 1], 'takeoff');
    });
    assert.ok(run.maxLift > 6);
  }
  assert.ok(yard.flights > room.flights, `yard is livelier (${yard.flights} vs ${room.flights} flights)`);
  assert.ok((room.time.get('rest') ?? 0) > (yard.time.get('rest') ?? 0), 'room is calmer');
});
test('flight targets are short hops to safe cells; a taken landing cell is re-targeted, not vanished', () => {
  const world = yardDogWorld({ x: 10, y: 5 });
  const start = spawnPigeon(world, 0)!;
  for (let i = 0; i < 50; i++) {
    const to = pigeonFlightTarget(world, start.cell, seeded(i))!;
    const distance = Math.abs(to.x - start.cell.x) + Math.abs(to.y - start.cell.y);
    assert.ok(dogFits(world, to) && distance >= 2 && distance <= 5);
  }
  const target = pigeonFlightTarget(world, start.cell, seeded(3))!;
  let state: PigeonState | null = { ...start, action: 'takeoff', to: target, entered: 0, due: 300 };
  state = advancePigeon(state, world, 320, false, seeded(1));
  assert.equal(state?.action, 'fly'); assert.deepEqual(state!.cell, target); assert.deepEqual(state!.from, start.cell);
  // Player walks onto the takeoff cell: the airborne bird carries on.
  const playerOnTakeoff = yardDogWorld(start.cell);
  state = advancePigeon(state, playerOnTakeoff, 400, false, seeded(1));
  assert.equal(state?.action, 'fly'); assert.deepEqual(state!.cell, target);
  // Player steps onto the landing cell: glide to the closest free spot.
  const playerOnLanding = yardDogWorld({ x: target.x + 1, y: target.y });
  state = advancePigeon(state, playerOnLanding, 450, false, seeded(1));
  assert.equal(state?.action, 'fly'); assert.ok(dogFits(playerOnLanding, state!.cell)); assert.notDeepEqual(state!.cell, target);
  state = advancePigeon(state, playerOnLanding, 5000, false, seeded(1));
  assert.equal(state?.action, 'land'); assert.equal(pigeonLift(state!, world, state!.entered), 7);
  // Decorating mid-flight settles the bird on its landing cell.
  const paused = advancePigeon({ ...state!, action: 'fly', from: start.cell }, playerOnLanding, 5100, true);
  assert.equal(paused?.action, 'rest'); assert.deepEqual(paused!.from, paused!.cell);
  assert.equal(advancePigeon(state, { ...world, free: () => false }, 6000, false), null);
});
test('pigeon struts quicker than dog and duck; server pet values stay allowlisted', () => {
  for (const world of [roomDogWorld(defaultState(), { x: 4, y: 6 }), yardDogWorld({ x: 6, y: 7 })]) assert.ok(pigeonStepMs(world) < duckStepMs(world) && pigeonStepMs(world) < dogStepMs(world));
  assert.ok(['pet_dog', 'pet_duck', 'pet_bear', 'pet_pigeon'].every(isPetId));
  for (const invalid of ['pigeon', 'pet_cat', 'furniture_chair', null, {}, true]) assert.equal(isPetId(invalid), false);
});
