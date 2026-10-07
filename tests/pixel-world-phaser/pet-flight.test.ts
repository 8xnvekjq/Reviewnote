import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPetFlightState, startPetFlight, stepPetFlight, petFlightFrame } from '../../src/features/pixel-world-phaser/logic/petFlight.ts';
import type { FlightWorld, FlightPhase } from '../../src/features/pixel-world-phaser/logic/petFlight.ts';
import type { Point } from '../../src/features/pixel-world-phaser/logic/joystick.ts';
import { feetBlocked } from '../../src/features/pixel-world-phaser/logic/world.ts';

const open: FlightWorld = { blocked: () => false, landing: point => point };
const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

for (const fps of [30, 60]) {
  test(`pigeon ${fps}fps: takeoff, flap, land, cooldown`, () => {
    const target = { x: 160, y: 40 };
    let state = startPetFlight(createPetFlightState({ x: 0, y: 0 }), target, open);
    const phases: FlightPhase[] = [state.phase], frames = new Set<number>();
    let lastPhase = state.phase;
    for (let i = 0; i < fps * 4; i++) {
      const previous = state;
      frames.add(petFlightFrame(state));
      state = stepPetFlight(state, 1000 / fps, open);
      assert.ok(gap(previous.position, state.position) <= 220 / fps + 1e-6, 'bounded movement');
      assert.ok(Math.abs(previous.altitude - state.altitude) <= 4, 'continuous altitude');
      assert.ok(state.altitude >= 0 && state.altitude <= 13.5);
      if (state.phase !== lastPhase) { phases.push(state.phase); lastPhase = state.phase; }
      if (state.phase === 'ground') assert.equal(open.blocked(state.position), false);
    }
    assert.deepEqual(phases, ['takeoff', 'fly', 'land', 'ground']);
    for (const frame of [16, 17, 18, 19, 20, 21, 22, 23]) assert.ok(frames.has(frame), `frame ${frame}`);
    assert.ok(gap(state.position, target) < 0.5);
    assert.equal(state.altitude, 0);
    assert.equal(startPetFlight(state, { x: 200, y: 0 }, open).phase, 'ground', 'cannot fly repeatedly');
    for (let i = 0; i < fps * 10; i++) state = stepPetFlight(state, 1000 / fps, open);
    assert.equal(startPetFlight(state, target, open).phase, 'takeoff');
  });

  test(`pigeon ${fps}fps: flies across a solid wall and lands walkably`, () => {
    const solid = (cell: Point) => cell.x < 0 || cell.y < 0 || cell.x >= 16 || cell.y >= 12 || cell.x === 5;
    const target = { x: 152, y: 88 };
    const world: FlightWorld = {
      blocked: point => feetBlocked(point, solid),
      landing: point => feetBlocked(point, solid) ? target : point,
    };
    let state = startPetFlight(createPetFlightState({ x: 40, y: 88 }), { x: 88, y: 88 }, world);
    let crossed = false, landed = false;
    for (let i = 0; i < fps * 4; i++) {
      state = stepPetFlight(state, 1000 / fps, world);
      if (world.blocked(state.position)) { crossed = true; assert.equal(state.phase, 'fly'); }
      if (state.phase === 'land' || state.phase === 'ground') { assert.equal(world.blocked(state.position), false); landed = true; }
    }
    assert.ok(crossed);
    assert.ok(landed);
    assert.ok(gap(state.position, target) < 0.5);
  });

  test(`pigeon ${fps}fps: a newly blocked landing redirects without teleporting`, () => {
    const first = { x: 100, y: 0 }, safe = { x: 132, y: 16 };
    let occupied = false;
    const world: FlightWorld = {
      blocked: point => occupied && gap(point, first) < 8,
      landing: point => occupied && gap(point, first) < 8 ? safe : point,
    };
    let state = startPetFlight(createPetFlightState({ x: 0, y: 0 }), first, world);
    while (state.phase !== 'land') state = stepPetFlight(state, 1000 / fps, world);
    occupied = true;
    for (let i = 0; i < fps * 4; i++) {
      const before = state.position;
      state = stepPetFlight(state, 1000 / fps, world);
      assert.ok(gap(before, state.position) <= 220 / fps + 1e-6);
      if (state.phase === 'ground') assert.equal(world.blocked(state.position), false);
    }
    assert.equal(state.phase, 'ground');
    assert.ok(gap(state.position, safe) < 0.5);
  });

  test(`pigeon ${fps}fps: follows a running player then settles without jitter`, () => {
    const target = { x: 180, y: 0 };
    let state = startPetFlight(createPetFlightState({ x: 0, y: 0 }), target, open);
    let previousDirection = 0, reversals = 0, flips = 0;
    for (let i = 0; i < fps * 5; i++) {
      if (i < fps * 2) target.x += 96 / fps;
      const previous = state;
      state = stepPetFlight(state, 1000 / fps, open, target);
      const direction = Math.sign(state.position.x - previous.position.x);
      if (direction && previousDirection && direction !== previousDirection) reversals++;
      if (direction) previousDirection = direction;
      if (state.flipX !== previous.flipX) flips++;
      assert.ok(state.position.x <= target.x);
    }
    assert.equal(state.phase, 'ground');
    assert.ok(gap(state.position, target) < 0.5);
    assert.equal(reversals, 0);
    assert.ok(flips <= 1);
  });
}

test('30 and 60fps flight agree at matching times', () => {
  const simulate = (fps: number) => {
    let state = startPetFlight(createPetFlightState({ x: 20, y: 40 }), { x: 400, y: 80 }, open);
    const samples = [];
    for (let i = 0; i < fps * 3; i++) {
      state = stepPetFlight(state, 1000 / fps, open);
      if ((i + 1) % (fps / 10) === 0) samples.push(state);
    }
    return samples;
  };
  const low = simulate(30), high = simulate(60);
  low.forEach((state, i) => {
    assert.equal(state.phase, high[i].phase);
    assert.ok(gap(state.position, high[i].position) < 1e-6);
    assert.ok(Math.abs(state.altitude - high[i].altitude) < 1e-6);
  });
});

test('no valid landing means no takeoff; no safe spot midflight means hover', () => {
  const nowhere: FlightWorld = { blocked: () => true, landing: () => null };
  const ground = createPetFlightState({ x: 0, y: 0 });
  assert.equal(startPetFlight(ground, { x: 100, y: 0 }, nowhere), ground);
  let state = startPetFlight(ground, { x: 100, y: 0 }, open);
  for (let i = 0; i < 200; i++) state = stepPetFlight(state, 50, nowhere);
  assert.equal(state.phase, 'fly');
  assert.ok(state.altitude > 0);
});
