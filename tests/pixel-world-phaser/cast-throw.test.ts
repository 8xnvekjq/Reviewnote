import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castLanding, canChargeCast, waterLanding, activeHotspotAt } from '../../src/features/pixel-world-phaser/logic/castThrow.ts';
import { castPower, castDistance, HOTSPOTS, HOTSPOT_RADIUS } from '../../src/features/pixel-world-phaser/logic/hotspots.ts';
import { cellCenter } from '../../src/features/pixel-world-phaser/logic/world.ts';

test('power rises and falls over 1.6 seconds and distance clamps', () => {
  for (const [ms, power] of [[0,0],[400,.5],[800,1],[1200,.5],[1600,0],[2000,.5],[-100,0]]) assert.equal(castPower(ms), power);
  assert.equal(castDistance(-1),24); assert.equal(castDistance(2),112);
});
test('landing travels straight from the rod tip in all four directions', () => {
  for (const [facing, dx, dy] of [['Right',1,0],['Left',-1,0],['Back',0,-1],['Front',0,1]] as const) {
    assert.deepEqual(castLanding({ x: 180, y: 100 }, facing, .5), { x: 180 + dx * 68, y: 100 + dy * 68 });
  }
});
test('only valid water landings pass, and shore facing controls charging', () => {
  assert.ok(waterLanding(cellCenter({ x: 18, y: 11 })));
  assert.ok(!waterLanding(cellCenter({ x: 17, y: 11 })));
  for (const p of [{ x: -1, y: 10 }, { x: 1000, y: 10 }, { x: 200, y: -1 }, { x: NaN, y: 200 }]) assert.ok(!waterLanding(p));
  assert.ok(canChargeCast(cellCenter({ x: 17, y: 11 }), 'Right'));
  assert.ok(canChargeCast(cellCenter({ x: 14, y: 11 }), 'Back'));
  assert.ok(canChargeCast(cellCenter({ x: 7, y: 14 }), 'Right'));
  assert.ok(!canChargeCast(cellCenter({ x: 7, y: 14 }), 'Left'));
  assert.ok(!canChargeCast(cellCenter({ x: 3, y: 14 }), 'Right'));
});
test('hotspot bonuses require an active server spot and include the radius boundary', () => {
  for (const spot of HOTSPOTS) {
    const p = cellCenter(spot.cell), active = [{ id: spot.id, active: true, left: 3, readyAt: null }];
    assert.equal(activeHotspotAt(p, active), spot.id);
    assert.equal(activeHotspotAt({ x: p.x + HOTSPOT_RADIUS, y: p.y }, active), spot.id);
    assert.equal(activeHotspotAt({ x: p.x + HOTSPOT_RADIUS + 1, y: p.y }, active), null);
    assert.equal(activeHotspotAt(p, [{ ...active[0], active: false }]), null);
    assert.equal(activeHotspotAt(p, undefined), null);
  }
});
