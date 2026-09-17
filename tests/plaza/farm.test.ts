import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FARM_BEDS, farmStage, farmDay, growthLabel, isFarmCell } from '../../src/features/pixel-room/farm/farmModel.ts';
import { YARD_SPAWNS, yardPath, yardWalkable, yardExit } from '../../src/features/pixel-room/yard/yardModel.ts';
import { yardDogWorld } from '../../src/features/pixel-room/pet/dogWorld.ts';
import { advanceDog, dogFits } from '../../src/features/pixel-room/pet/dogModel.ts';
const planted = Date.parse('2026-09-18T00:00:00Z');
const hour = 3600000;
const crop = { id: 'test', plantedAt: new Date(planted).toISOString(), readyAt: new Date(planted + 24 * hour).toISOString(), careCount: 0, lastWateredOn: null };
test('growth stage boundaries use server timestamps; no care never kills a crop', () => {
  assert.equal(farmStage(null, planted), 'empty');
  for (const [hours, stage] of [[0,'sprout'],[5.99,'sprout'],[6,'leaf'],[17.99,'leaf'],[18,'fruit'],[23.99,'fruit'],[24,'ripe'],[240,'ripe']] as const) assert.equal(farmStage(crop, planted + hours * hour), stage);
  assert.equal(growthLabel(crop, planted), '수확까지 약 24시간');
  assert.equal(growthLabel(crop, planted + 24 * hour - 1), '수확까지 약 1분');
});
test('watering date resets at midnight Korea, independent of device timezone', () => {
  assert.equal(farmDay(Date.parse('2026-09-18T14:59:59Z')), '2026-09-18');
  assert.equal(farmDay(Date.parse('2026-09-18T15:00:00Z')), '2026-09-19');
});
test('farm footprints block walking; both approach cells are reachable from either arrival', () => {
  for (const bed of FARM_BEDS) {
    for (let x = bed.x; x < bed.x + 2; x++) for (let y = bed.y; y < bed.y + 2; y++) assert.equal(yardWalkable({ x,y }), false);
    for (const from of Object.values(YARD_SPAWNS)) {
      const approach = { x: bed.x - 1, y: bed.y + 1 };
      const path = yardPath(from, approach);
      assert.deepEqual(path.at(-1), approach);
      assert.ok(path.every(p => yardWalkable(p) && !yardExit(p)));
    }
  }
});
test('dog retains two-cell-wide routes around both plots and avoids a tending player', () => {
  for (const player of [{x:6,y:7}, {x:10,y:5}, {x:10,y:8}]) {
    const world = yardDogWorld(player);
    let state = null;
    const visited = new Set<string>();
    let seed = 123;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let now = 0; now < 300000; now += 100) {
      state = advanceDog(state, world, now, false, random);
      assert.ok(state && dogFits(world, state.cell) && dogFits(world, state.from));
      assert.ok(!isFarmCell(state.cell) && !isFarmCell({x:state.cell.x+1,y:state.cell.y}));
      visited.add(`${state.cell.x},${state.cell.y}`);
    }
    assert.ok(visited.size > 10, `enough dog movement remains: ${visited.size}`);
  }
});
