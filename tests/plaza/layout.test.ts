import { test } from 'node:test';
import assert from 'node:assert/strict';
import './register-typescript.mjs';
const { findSpawn, PLAZA_ENTRANCE, isWalkablePlaza, planWalk } = await import('../../src/features/pixel-room/plaza/plazaModel.ts');

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
