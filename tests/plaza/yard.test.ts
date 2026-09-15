import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YARD_DOOR, YARD_GATE, YARD_SPAWNS, yardExit, yardPath, yardWalkable } from '../../src/features/pixel-room/yard/yardModel.ts';
test('both yard arrivals are walkable and never trigger an exit', () => {
  for (const spawn of Object.values(YARD_SPAWNS)) {
    assert.ok(yardWalkable(spawn)); assert.equal(yardExit(spawn), null);
    for (const destination of [YARD_DOOR, YARD_GATE]) {
      const path = yardPath(spawn, destination);
      assert.deepEqual(path.at(-1), destination);
      assert.ok(path.slice(0, -1).every(cell => !yardExit(cell)));
    }
  }
});
test('garden and both entrances are connected without crossing the house', () => {
  for (const spawn of Object.values(YARD_SPAWNS)) for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) {
    const target = { x, y };
    if (!yardWalkable(target) || (spawn.x === x && spawn.y === y)) continue;
    const path = yardPath(spawn, target);
    assert.ok(path.length, `unreachable ${x},${y}`);
    assert.ok(path.every(yardWalkable));
    assert.ok(path.slice(0, -1).every(cell => !yardExit(cell)));
  }
  assert.deepEqual(yardPath(YARD_SPAWNS.room, { x: 5, y: 3 }), []);
});
