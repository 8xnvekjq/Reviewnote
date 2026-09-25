import { test } from 'node:test';
import assert from 'node:assert/strict';
import './register-typescript.mjs';
const { findSpawn, PLAZA_ENTRANCE, isWalkablePlaza, planWalk } = await import('../../src/features/pixel-room/plaza/plazaModel.ts');
const { PODIUM, PLAZA_SHOP, nearPlazaShop } = await import('../../src/features/pixel-room/plaza/plazaLayout.ts');

test('shop has a blocked counter and three reachable approach cells, with no access from behind', () => {
  for (let x = 12; x <= 14; x++) {
    for (let y = 5; y <= 6; y++) assert.equal(isWalkablePlaza({ x, y }), false);
    const front = { x, y: 7 };
    assert.ok(nearPlazaShop(front));
    assert.ok(planWalk(findSpawn(), front).length);
    assert.ok(planWalk(front, PLAZA_ENTRANCE).length);
  }
  assert.equal(nearPlazaShop({ x: 13, y: 4 }), false);
  assert.equal(nearPlazaShop(findSpawn()), false);
  assert.equal(nearPlazaShop({ x: 11, y: 7 }), false);
  assert.equal(PLAZA_SHOP.footprint.y + PLAZA_SHOP.footprint.h, 7);
});

test('every open plaza cell connects to spawn and the home entrance', () => {
  const spawn = findSpawn();
  assert.ok(isWalkablePlaza(spawn));
  assert.ok(isWalkablePlaza(PLAZA_ENTRANCE));
  for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) {
    const target = { x, y };
    if (!isWalkablePlaza(target) || (x === spawn.x && y === spawn.y)) continue;
    const path = planWalk(spawn, target);
    assert.ok(path.length, `unreachable ${x},${y}`);
    assert.deepEqual(path.at(-1)?.cell, target);
    assert.ok(path.every(step => isWalkablePlaza(step.cell)));
  }
  assert.deepEqual(planWalk(spawn, PLAZA_ENTRANCE).at(-1)?.cell, PLAZA_ENTRANCE);
});
test('well and benches block their bases, while paths go around them', () => {
  assert.deepEqual(planWalk(findSpawn(), { x: 7, y: 5 }), []);
  assert.deepEqual(planWalk(findSpawn(), { x: 4, y: 6 }), []);
  const path = planWalk({ x: 7, y: 6 }, { x: 7, y: 4 });
  assert.ok(path.length > 2);
  let previous = { x: 7, y: 6 };
  for (const { cell } of path) {
    assert.equal(Math.abs(cell.x - previous.x) + Math.abs(cell.y - previous.y), 1);
    assert.ok(isWalkablePlaza(cell));
    previous = cell;
  }
});
test('the crop exhibit podium blocks its own footprint but never disconnects the courtyard (mirrors the notice board it sits opposite)', () => {
  for (let x = PODIUM.footprint.x; x < PODIUM.footprint.x + PODIUM.footprint.w; x++)
    for (let y = PODIUM.footprint.y; y < PODIUM.footprint.y + PODIUM.footprint.h; y++)
      assert.equal(isWalkablePlaza({ x, y }), false);
  // Same full-grid reachability guarantee as the top test above, scoped to right around the podium
  // — a targeted regression check in case a future edit narrows this specific corner of the map.
  for (const target of [{ x: 3, y: 3 }, { x: 6, y: 3 }, { x: 4, y: 4 }, { x: 5, y: 4 }])
    assert.ok(planWalk(findSpawn(), target).length > 0, `still reachable near the podium: ${JSON.stringify(target)}`);
});
