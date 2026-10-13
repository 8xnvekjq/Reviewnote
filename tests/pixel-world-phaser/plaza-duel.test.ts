import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickDuelTarget, RPS_DUEL_NEAR_PX, RPS_DUEL_HIDE_PX } from '../../src/features/pixel-world-phaser/logic/plazaDuel.ts';
import { NET_REACH } from '../../src/features/pixel-world-phaser/logic/netHit.ts';

const me = { x: 100, y: 100 };
test('near distance is twice the bug-net radius, hide distance adds hysteresis', () => {
  assert.equal(RPS_DUEL_NEAR_PX, NET_REACH.radius * 2);
  assert.equal(RPS_DUEL_NEAR_PX, 28);
  assert.equal(RPS_DUEL_HIDE_PX, RPS_DUEL_NEAR_PX + 6);
});
test('far classmates get no button; one within reach does', () => {
  assert.equal(pickDuelTarget(me, [], null), null);
  assert.equal(pickDuelTarget(me, [{ id: 'a', x: 129, y: 100 }], null), null);
  assert.equal(pickDuelTarget(me, [{ id: 'a', x: 128, y: 100 }], null), 'a');
  assert.equal(pickDuelTarget(me, [{ id: 'a', x: 115.5, y: 112.25 }], null), 'a', 'fractional positions');
});
test('only the nearest of several classmates is picked', () => {
  assert.equal(pickDuelTarget(me, [{ id: 'a', x: 120, y: 100 }, { id: 'b', x: 100, y: 110 }, { id: 'c', x: 160, y: 100 }], null), 'b');
});
test('hysteresis: a shown button stays until past the hide distance', () => {
  assert.equal(pickDuelTarget(me, [{ id: 'a', x: 131, y: 100 }], 'a'), 'a');
  assert.equal(pickDuelTarget(me, [{ id: 'a', x: 100 + RPS_DUEL_HIDE_PX, y: 100 }], 'a'), 'a');
  assert.equal(pickDuelTarget(me, [{ id: 'a', x: 100 + RPS_DUEL_HIDE_PX + .5, y: 100 }], 'a'), null);
  // 같은 자리에서 처음이면 뜨지 않는다.
  assert.equal(pickDuelTarget(me, [{ id: 'a', x: 131, y: 100 }], null), null);
});
test('switching needs a clearly nearer classmate; a vanished current target is dropped', () => {
  assert.equal(pickDuelTarget(me, [{ id: 'a', x: 120, y: 100 }, { id: 'b', x: 119, y: 100 }], 'a'), 'a');
  assert.equal(pickDuelTarget(me, [{ id: 'a', x: 120, y: 100 }, { id: 'b', x: 110, y: 100 }], 'a'), 'b');
  assert.equal(pickDuelTarget(me, [{ id: 'b', x: 125, y: 100 }], 'a'), 'b');
  assert.equal(pickDuelTarget(me, [], 'a'), null);
});
