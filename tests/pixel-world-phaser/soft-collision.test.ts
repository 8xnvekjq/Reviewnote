import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCollisionState, stepSoftCollision, safeSeparation, stepPetSpacing, PERSON_RADIUS, RIDING_RADIUS, SEPARATION_SPEED, PASS_THROUGH_MS } from '../../src/features/pixel-world-phaser/logic/softCollision.ts';
import { moveFeet, feetBlocked } from '../../src/features/pixel-world-phaser/logic/world.ts';

const open = { blocked: () => false };
const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const peer = { id: 'peer', x: 14, y: 0 };

test('foot radii are small, with extra room for a ridden bear', () => {
  assert.equal(PERSON_RADIUS, 7);
  assert.equal(RIDING_RADIUS, 10);
  const result = stepSoftCollision({ x: 0, y: 0 }, { x: 56, y: 0 }, [{ ...peer, x: 19, radius: RIDING_RADIUS }], createCollisionState(), 50, RIDING_RADIUS);
  assert.equal(result.state.contacts, 1);
});

test('slide removes inward velocity and retains the tangent', () => {
  const result = stepSoftCollision({ x: 0, y: 0 }, { x: 56, y: 30 }, [peer], createCollisionState(), 50);
  assert.equal(result.delta.x, 0);
  assert.equal(result.delta.y, 1.5);
  assert.equal(result.state.contacts, 1);
});

for (const fps of [30, 60]) test(`head-on push passes through after 0.6 seconds at ${fps} fps`, () => {
  let state = createCollisionState(), position = { x: 0, y: 0 };
  let firstPass = 0;
  const dt = 1000 / fps;
  for (let frame = 1; frame <= fps * 2; frame++) {
    const result = stepSoftCollision(position, { x: 56, y: 0 }, [peer], state, dt);
    state = result.state;
    if (state.passThrough && !firstPass) firstPass = frame * dt;
    position = safeSeparation({ x: position.x + result.delta.x, y: position.y + result.delta.y }, result.separation, open);
  }
  assert.ok(firstPass >= PASS_THROUGH_MS - 0.01 && firstPass <= PASS_THROUGH_MS + dt + 0.01);
  assert.ok(position.x > peer.x + 14);
  assert.equal(state.passThrough, 0);
});

test('separation is gentle even when overlapping multiple peers', () => {
  const from = { x: 24, y: 24 };
  const result = stepSoftCollision(from, { x: 56, y: 0 }, [
    { id: 'a', x: 24, y: 24 }, { id: 'b', x: 25, y: 24 },
  ], createCollisionState(), 50);
  assert.ok(Math.hypot(result.separation.x, result.separation.y) <= SEPARATION_SPEED * .05);
  assert.ok(gap(from, safeSeparation(from, result.separation, open)) <= 1);
});

test('spawn separation cannot enter a solid tile or exceed its cap', () => {
  const solid = (cell: { x: number; y: number }) => cell.x < 1 || cell.y < 1 || cell.x >= 4 || cell.y >= 4;
  const world = { blocked: (point: { x: number; y: number }) => feetBlocked(point, solid) };
  let position = { x: 21, y: 24 }, state = createCollisionState();
  for (let i = 0; i < 10; i++) {
    const result = stepSoftCollision(position, { x: 1, y: 0 }, [{ id: 'spawn', x: 23, y: 24 }], state, 50);
    const next = safeSeparation(position, result.separation, world);
    assert.ok(gap(position, next) <= 1 + 1e-9);
    assert.equal(world.blocked(next), false);
    position = next; state = result.state;
  }
});

test('pass-through never bypasses wall collision', () => {
  const solid = (cell: { x: number; y: number }) => cell.x >= 2;
  const from = { x: 27, y: 24 };
  const result = stepSoftCollision(from, { x: 56, y: 0 }, [{ id: 'wall', x: 32, y: 24 }],
    { contacts: 1, passThrough: 1, pushes: { wall: PASS_THROUGH_MS } }, 50);
  const next = moveFeet(from, result.delta.x, result.delta.y, solid);
  assert.equal(feetBlocked(next, solid), false);
  assert.ok(next.x <= 27);
});

test('idle player is never separated and releases contact timers', () => {
  const result = stepSoftCollision({ x: 0, y: 0 }, { x: 0, y: 0 }, [{ ...peer, x: 0 }],
    { contacts: 1, passThrough: 0, pushes: { peer: 500 } }, 50);
  assert.deepEqual(result.delta, { x: 0, y: 0 });
  assert.deepEqual(result.separation, { x: 0, y: 0 });
  assert.deepEqual(result.state, createCollisionState());
});

test('side-by-side walking at touching distance has no wobble', () => {
  const result = stepSoftCollision({ x: 0, y: 0 }, { x: 0, y: 56 }, [peer], createCollisionState(), 50);
  assert.deepEqual(result.delta, { x: 0, y: 56 * .05 });
  assert.deepEqual(result.separation, { x: 0, y: 0 });
  assert.equal(result.state.contacts, 0);
});

test('pet steps away from people, including exact spawn overlap', () => {
  for (const person of [{ x: 23, y: 24 }, { x: 24, y: 24 }]) {
    const from = { x: 24, y: 24 };
    const next = stepPetSpacing(from, [person], [], 50, open);
    assert.ok(gap(next, person) > gap(from, person));
    assert.ok(gap(next, from) <= 1);
  }
});

test('pet step-aside respects solids', () => {
  const solid = (cell: { x: number; y: number }) => cell.x < 1;
  const from = { x: 21, y: 24 };
  const next = stepPetSpacing(from, [{ x: 23, y: 24 }], [], 50, { blocked: point => feetBlocked(point, solid) });
  assert.deepEqual(next, from);
  assert.equal(feetBlocked(next, solid), false);
});

test('pets keep eight pixels apart without moving distant pets', () => {
  let a = { x: 24, y: 24 }, b = { x: 24, y: 24 };
  for (let i = 0; i < 60; i++) {
    a = stepPetSpacing(a, [], [b], 50, open);
    b = stepPetSpacing(b, [], [a], 50, open);
  }
  assert.ok(gap(a, b) > 7.99);
  assert.deepEqual(stepPetSpacing(a, [], [{ x: 100, y: 100 }], 50, open), a);
});

for (const gate of [{ frozen: true }, { fishing: true }, { indoor: true }, { transitioning: true }]) {
  test(`collision and pet spacing disabled with ${JSON.stringify(gate)}`, () => {
    const from = { x: 0, y: 0 };
    const result = stepSoftCollision(from, { x: 56, y: 0 }, [peer], createCollisionState(), 50, PERSON_RADIUS, gate);
    assert.deepEqual(result.delta, { x: 56 * .05, y: 0 });
    assert.deepEqual(result.state, createCollisionState());
    assert.deepEqual(stepPetSpacing(from, [from], [from], 50, open, gate), from);
  });
}

test('같은 점에 완전히 겹쳐 시작해도 어느 방향으로든 바로 걸어 나갈 수 있다', () => {
  for (const velocity of [{ x: 56, y: 0 }, { x: 0, y: -56 }, { x: -40, y: 40 }]) {
    const step = stepSoftCollision({ x: 100, y: 100 }, velocity, [{ id: 'b', x: 100, y: 100 }], createCollisionState(), 16);
    assert.ok(Math.hypot(step.delta.x, step.delta.y) > 0.8, 'not frozen in place');
  }
});
