import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FARM_BEDS, farmStage, farmDay, growthLabel, isFarmCell, computeCropSize, cropCareRatio, maxCareDaysFor, rollLuck, sizeLabel } from '../../src/features/pixel-room/farm/farmModel.ts';
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

function lcg(seed: number) { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

test('maxCareDaysFor: the fixed 24h growth window always spans exactly 2 Korea-time calendar days; a longer window spans more', () => {
  assert.equal(maxCareDaysFor(crop.plantedAt, crop.readyAt), 2);
  // A crop planted exactly at KST midnight still spans 2 days (readyAt lands exactly on the next).
  const midnightKst = Date.parse('2026-09-17T15:00:00Z'); // 2026-09-18T00:00 KST
  assert.equal(maxCareDaysFor(new Date(midnightKst).toISOString(), new Date(midnightKst + 24 * hour).toISOString()), 2);
  // A hypothetical longer growth duration spans proportionally more days (formula generalizes,
  // it is not hardcoded to "2").
  assert.equal(maxCareDaysFor(crop.plantedAt, new Date(planted + 49 * hour).toISOString()), 3);
});

test('cropCareRatio: 0/maxCareDays behaves and never exceeds 1 even if careCount somehow overshoots', () => {
  assert.equal(cropCareRatio({ careCount: 0, maxCareDays: 2 }), 0);
  assert.equal(cropCareRatio({ careCount: 1, maxCareDays: 2 }), 0.5);
  assert.equal(cropCareRatio({ careCount: 2, maxCareDays: 2 }), 1);
  assert.equal(cropCareRatio({ careCount: 3, maxCareDays: 2 }), 1);
  assert.equal(cropCareRatio({ careCount: 0, maxCareDays: 0 }), 0); // guarded divide-by-zero
});

test('computeCropSize: always within [10,100] across the full luck range, for both no-care and full-care', () => {
  const random = lcg(7);
  for (let i = 0; i < 2000; i++) {
    const luckRoll = rollLuck(random);
    assert.ok(luckRoll >= 0 && luckRoll <= 1);
    for (const careCount of [0, 1, 2]) {
      const size = computeCropSize({ careCount, maxCareDays: 2, luckRoll });
      assert.ok(Number.isInteger(size) && size >= 10 && size <= 100, `size ${size} out of bounds for careCount=${careCount} luckRoll=${luckRoll}`);
    }
  }
});

test('sizeLabel tiers cover the full [10,100] range with no gaps', () => {
  for (let score = 10; score <= 100; score++) assert.ok(typeof sizeLabel(score) === 'string' && sizeLabel(score).length > 0);
  assert.equal(sizeLabel(10), '아주 작은 토마토');
  assert.equal(sizeLabel(29), '아주 작은 토마토');
  assert.equal(sizeLabel(30), '작은 토마토');
  assert.equal(sizeLabel(49), '작은 토마토');
  assert.equal(sizeLabel(50), '보통 크기 토마토');
  assert.equal(sizeLabel(69), '보통 크기 토마토');
  assert.equal(sizeLabel(70), '큰 토마토');
  assert.equal(sizeLabel(89), '큰 토마토');
  assert.equal(sizeLabel(90), '아주 큰 토마토');
  assert.equal(sizeLabel(100), '아주 큰 토마토');
});

test('distribution: diligent care is better on AVERAGE but harvest size is never fixed or deterministic (many simulated harvests)', () => {
  const random = lcg(20260918);
  const N = 5000;
  const sample = (careCount: number) => Array.from({ length: N }, () => computeCropSize({ careCount, maxCareDays: 2, luckRoll: rollLuck(random) }));
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const full = sample(2); // watered every possible day
  const none = sample(0); // never watered once
  const half = sample(1); // watered on one of the two possible days

  // No harvest ever fails or hits an extreme "dead crop" floor — always a real, positive size.
  for (const xs of [full, none, half]) for (const x of xs) assert.ok(x >= 10 && x <= 100);

  const meanFull = mean(full), meanNone = mean(none), meanHalf = mean(half);
  // Diligence is worth it on average — monotonic, with a real gap (not a rounding-noise gap).
  assert.ok(meanFull > meanHalf + 5, `mean(full)=${meanFull} should clearly exceed mean(half)=${meanHalf}`);
  assert.ok(meanHalf > meanNone + 5, `mean(half)=${meanHalf} should clearly exceed mean(none)=${meanNone}`);
  assert.ok(meanFull - meanNone >= 15, `care should move the average by a meaningful margin, got ${meanFull - meanNone}`);

  // ...but it is not a fixed outcome: full care does not always land in the top tier, and a
  // neglected crop is not always stuck in the bottom tier — real overlap exists between groups.
  assert.ok(full.some(x => x < 90), 'full care should not ALWAYS produce the biggest tomato');
  assert.ok(none.some(x => x > 50), 'no care should not always produce a small tomato');
  assert.ok(Math.min(...full) <= Math.max(...none), 'an unlucky diligent harvest and a lucky neglected one should be able to overlap');
  // Each group shows real internal spread (not a constant value repeated N times).
  assert.ok(Math.max(...full) - Math.min(...full) >= 15, 'full-care results should vary meaningfully harvest to harvest');
  assert.ok(Math.max(...none) - Math.min(...none) >= 15, 'no-care results should vary meaningfully harvest to harvest');
});
