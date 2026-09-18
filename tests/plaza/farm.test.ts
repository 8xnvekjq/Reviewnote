import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FARM_BEDS, farmStage, farmDay, growthLabel, isFarmCell, computeCropSize, cropCareRatio, maxCareDaysFor, rollLuck, sizeLabel, FARM_GROWTH_DAYS, reviewRatioFor, bonusChanceFor, computeBonusAmount, computeCropSizeV2, REVIEW_RATIO_CAP, SCARECROW_CELL, farmMoisture, computeSubmitReward } from '../../src/features/pixel-room/farm/farmModel.ts';
import { pickScarecrowLine } from '../../src/features/pixel-room/farm/scarecrowLines.ts';
import { YARD_SPAWNS, yardPath, yardWalkable, yardExit } from '../../src/features/pixel-room/yard/yardModel.ts';
import { yardDogWorld } from '../../src/features/pixel-room/pet/dogWorld.ts';
import { advanceDog, dogFits } from '../../src/features/pixel-room/pet/dogModel.ts';
const planted = Date.parse('2026-09-18T00:00:00Z');
const hour = 3600000;
const crop = { id: 'test', plantedAt: new Date(planted).toISOString(), readyAt: new Date(planted + 24 * hour).toISOString(), careCount: 0, lastWateredOn: null, reviewGained: 0 };
test('growth stage boundaries use server timestamps; no care never kills a crop', () => {
  assert.equal(farmStage(null, planted), 'empty');
  for (const [hours, stage] of [[0,'sprout'],[5.99,'sprout'],[6,'leaf'],[17.99,'leaf'],[18,'fruit'],[23.99,'fruit'],[24,'ripe'],[240,'ripe']] as const) assert.equal(farmStage(crop, planted + hours * hour), stage);
  assert.equal(growthLabel(crop, planted), '수확까지 약 1일'); // >=24h remaining now reads in days
  assert.equal(growthLabel(crop, planted + 24 * hour - 1), '수확까지 약 1분');
});
test('growthLabel scales through days/hours/minutes for the real 4-day (96h) production duration', () => {
  assert.equal(FARM_GROWTH_DAYS, 4);
  const crop4 = { id: 't4', plantedAt: new Date(planted).toISOString(), readyAt: new Date(planted + 96 * hour).toISOString(), careCount: 0, lastWateredOn: null, reviewGained: 0 };
  assert.equal(growthLabel(crop4, planted), '수확까지 약 4일');
  assert.equal(growthLabel(crop4, planted + 50 * hour), '수확까지 약 2일'); // 46h left -> rounds up to 2 days
  assert.equal(growthLabel(crop4, planted + 73 * hour), '수확까지 약 23시간');
  assert.equal(growthLabel(crop4, planted + 96 * hour - 30000), '수확까지 약 1분');
  assert.equal(growthLabel(crop4, planted + 96 * hour), '빨갛게 익었어요!');
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
test('the scarecrow guide is a solid fixed decoration (blocks walking) but never disconnects either farm approach', () => {
  assert.equal(yardWalkable(SCARECROW_CELL), false);
  for (const bed of FARM_BEDS) {
    for (const from of Object.values(YARD_SPAWNS)) {
      const approach = { x: bed.x - 1, y: bed.y + 1 };
      const path = yardPath(from, approach);
      assert.ok(path.length > 0, `still reachable from ${JSON.stringify(from)} with the scarecrow in place`);
      assert.ok(path.every(p => !(p.x === SCARECROW_CELL.x && p.y === SCARECROW_CELL.y)));
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

test('maxCareDaysFor: a legacy 24h crop keeps its own true (smaller) denominator; the real 4-day production duration is capped at exactly 4', () => {
  assert.equal(maxCareDaysFor(crop.plantedAt, crop.readyAt), 2); // legacy 24h in-flight crop, unaffected
  const midnightKst = Date.parse('2026-09-17T15:00:00Z'); // 2026-09-18T00:00 KST
  assert.equal(maxCareDaysFor(new Date(midnightKst).toISOString(), new Date(midnightKst + 24 * hour).toISOString()), 2);
  assert.equal(maxCareDaysFor(crop.plantedAt, new Date(planted + 49 * hour).toISOString()), 3); // formula generalizes below the cap
  // The real 96h (4-day) production duration would span 5 calendar days by raw calendar-boundary
  // math (partial planting day + 3 full days + partial ready day) — capped at 4, matching "4일 중
  // 며칠 물을 줬는지" exactly, and never exceeding FARM_GROWTH_DAYS regardless of plant time-of-day.
  assert.equal(maxCareDaysFor(crop.plantedAt, new Date(planted + 96 * hour).toISOString()), FARM_GROWTH_DAYS);
  const lateNightPlant = Date.parse('2026-09-17T14:59:00Z'); // 2026-09-17T23:59 KST — worst-case sliver
  assert.equal(maxCareDaysFor(new Date(lateNightPlant).toISOString(), new Date(lateNightPlant + 96 * hour).toISOString()), FARM_GROWTH_DAYS);
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

test('reviewRatioFor/bonusChanceFor: bounded, monotonic, and matches the documented 12%..40% range', () => {
  assert.equal(reviewRatioFor(0), 0);
  assert.equal(reviewRatioFor(REVIEW_RATIO_CAP), 1);
  assert.equal(reviewRatioFor(REVIEW_RATIO_CAP * 10), 1); // never exceeds 1 no matter how much was earned
  assert.equal(reviewRatioFor(-5), 0); // never negative (a reverted review shouldn't look like negative diligence)
  assert.ok(Math.abs(bonusChanceFor(0) - 0.12) < 1e-9);
  assert.ok(Math.abs(bonusChanceFor(1) - 0.40) < 1e-9);
  assert.ok(Math.abs(bonusChanceFor(0.5) - 0.26) < 1e-9);
  for (let g = 0; g <= REVIEW_RATIO_CAP * 2; g += 3) assert.ok(bonusChanceFor(reviewRatioFor(g)) >= 0.12 && bonusChanceFor(reviewRatioFor(g)) <= 0.40);
});

test('computeBonusAmount: always a real, positive nudge (never zero/negative) within the documented 6..18 range', () => {
  for (let i = 0; i <= 100; i++) {
    const amount = computeBonusAmount(i / 100);
    assert.ok(Number.isInteger(amount) && amount >= 6 && amount <= 18, `amount ${amount} out of range`);
  }
});

test('computeCropSizeV2: bonus is a SEPARATE chance-gated add-on, never applied when the roll misses, and review never overrides watering as the dominant signal', () => {
  const random = lcg(99);
  for (let i = 0; i < 500; i++) {
    const luckRoll = rollLuck(random);
    const reviewGained = Math.floor(random() * 120);
    const bonusRoll = random();
    const bonusAmountRoll = rollLuck(random);
    const chance = bonusChanceFor(reviewRatioFor(reviewGained));
    const { size, bonusApplied } = computeCropSizeV2({ careCount: 2, maxCareDays: 4, luckRoll, reviewGained, bonusRoll, bonusAmountRoll });
    assert.equal(bonusApplied, bonusRoll < chance);
    assert.ok(size >= 10 && size <= 100);
    if (!bonusApplied) assert.equal(size, computeCropSize({ careCount: 2, maxCareDays: 4, luckRoll })); // no bonus -> exactly the base size
  }
});

test('distribution: watering (0/2/4 of 4 days) x review activity (low/mid/high) — watering stays the dominant, easy-to-read driver; review is a small, non-deterministic average nudge', () => {
  const random = lcg(5150);
  const N = 4000;
  const REVIEW = { low: 0, mid: REVIEW_RATIO_CAP / 2, high: REVIEW_RATIO_CAP }; // 0, 25, 50 points gained over the 4-day window (reviewRatio 0/0.5/1)
  const sample = (careCount: number, reviewGained: number) => Array.from({ length: N }, () => {
    const luckRoll = rollLuck(random), bonusRoll = random(), bonusAmountRoll = rollLuck(random);
    return computeCropSizeV2({ careCount, maxCareDays: 4, luckRoll, reviewGained, bonusRoll, bonusAmountRoll });
  });
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x.size, 0) / xs.length;
  const results: Record<string, Record<string, ReturnType<typeof sample>>> = {};
  const table: string[] = [];
  for (const care of [0, 2, 4]) {
    results[care] = {};
    for (const [label, gained] of Object.entries(REVIEW)) {
      const xs = sample(care, gained);
      results[care][label] = xs;
      const sizes = xs.map(x => x.size);
      const bonusRate = xs.filter(x => x.bonusApplied).length / xs.length;
      table.push(`water=${care} review=${label.padEnd(4)} mean=${mean(xs).toFixed(1)} min=${Math.min(...sizes)} max=${Math.max(...sizes)} bonusRate=${(bonusRate * 100).toFixed(1)}%`);
      for (const x of sizes) assert.ok(x >= 10 && x <= 100);
    }
  }
  console.log('\n' + table.join('\n'));

  // Watering is the dominant, clearly-ordered driver at every review level.
  for (const label of Object.keys(REVIEW)) {
    const m0 = mean(results[0][label]), m2 = mean(results[2][label]), m4 = mean(results[4][label]);
    assert.ok(m2 > m0 + 10, `water 0->2 should clearly raise the mean at review=${label}: ${m0} -> ${m2}`);
    assert.ok(m4 > m2 + 10, `water 2->4 should clearly raise the mean at review=${label}: ${m2} -> ${m4}`);
  }
  // Review shifts the mean upward at every watering level, but only as a modest secondary nudge —
  // clearly smaller than a single watering-level step (checked above), never dominant, and it
  // never guarantees anything: bonusRate stays well under 100% even at review=high.
  for (const care of [0, 2, 4]) {
    const mLow = mean(results[care].low), mHigh = mean(results[care].high);
    assert.ok(mHigh > mLow + 1, `review low->high should raise the mean at water=${care}: ${mLow} -> ${mHigh}`);
    assert.ok(mHigh - mLow < 10, `review's effect should stay clearly secondary to watering at water=${care}: gap ${mHigh - mLow}`);
    const highBonusRate = results[care].high.filter(x => x.bonusApplied).length / results[care].high.length;
    const lowBonusRate = results[care].low.filter(x => x.bonusApplied).length / results[care].low.length;
    assert.ok(highBonusRate > lowBonusRate, 'higher review activity should raise the bonus rate');
    assert.ok(highBonusRate < 0.5, 'even excellent review activity should not make the bonus a near-certainty');
    // A perfectly-watered but low-review crop can still beat an unlucky high-review one, and a
    // low-review crop can still get lucky — review is never a substitute for or override of luck.
    assert.ok(Math.min(...results[care].high.map(x => x.size)) <= Math.max(...results[care].low.map(x => x.size)),
      `review should never fully separate outcomes at water=${care} — overlap must remain possible`);
  }
});

test('farmMoisture: day-granularity moist/normal/dry, derived purely from lastWateredOn/plantedAt (no new stored state)', () => {
  assert.equal(farmMoisture(null, planted), 'normal'); // empty plot: not applicable, but never throws
  const day = 24 * hour;
  const freshlyPlanted = { ...crop, plantedAt: new Date(planted).toISOString(), lastWateredOn: null };
  assert.equal(farmMoisture(freshlyPlanted, planted), 'moist'); // planting day itself reads as moist
  assert.equal(farmMoisture(freshlyPlanted, planted + day), 'normal'); // one day unwatered: still fine
  assert.equal(farmMoisture(freshlyPlanted, planted + 2 * day), 'dry'); // two+ days: visibly dry
  assert.equal(farmMoisture(freshlyPlanted, planted + 10 * day), 'dry'); // stays dry, never a new/different state (no death state)
  const wateredToday = { ...crop, lastWateredOn: farmDay(planted) };
  assert.equal(farmMoisture(wateredToday, planted), 'moist');
  assert.equal(farmMoisture(wateredToday, planted + day), 'normal');
  assert.equal(farmMoisture(wateredToday, planted + 2 * day), 'dry');
});

function mkCrop(overrides: Partial<typeof crop> = {}) { return { ...crop, ...overrides }; }
function mkSnapshot(crops: (typeof crop | null)[]) {
  return { serverNow: new Date(planted).toISOString(), today: farmDay(planted), harvestCount: 0, bestSize: null, lastHarvestSize: null,
    plots: crops.map((c, index) => ({ index, revision: 0, crop: c })) };
}
test('pickScarecrowLine: never throws, always returns a real line, and a null/empty farm only ever draws from a sensible pool', () => {
  const random = lcg(7);
  assert.equal(typeof pickScarecrowLine(null, planted, random), 'string');
  assert.ok(pickScarecrowLine(null, planted, random).length > 0);
  const emptySnap = mkSnapshot([null, null]);
  for (let i = 0; i < 200; i++) assert.ok(pickScarecrowLine(emptySnap, planted, random).length > 0);
});
test('pickScarecrowLine: draws contextual lines noticeably more when they apply, but still keeps the generic rotation alive (never 0% or 100%)', () => {
  const random = lcg(2026);
  // A ripe crop should surface the "수확 가능" line family a clear, non-trivial fraction of the time.
  const ripeSnap = mkSnapshot([mkCrop({ readyAt: new Date(planted - hour).toISOString(), plantedAt: new Date(planted - 5 * hour).toISOString() }), null]);
  const N = 2000;
  const draws = Array.from({ length: N }, () => pickScarecrowLine(ripeSnap, planted, random));
  const ripeHits = draws.filter(line => line.includes('수확') || line.includes('익었')).length;
  assert.ok(ripeHits > N * 0.2, `expected a meaningful share of ripe-context lines, got ${ripeHits}/${N}`);
  assert.ok(ripeHits < N * 0.9, `generic rotation should still surface sometimes, got ${ripeHits}/${N}`);
});
test('pickScarecrowLine: a crop with strong review activity can surface the review-linked hint', () => {
  const random = lcg(4242);
  const reviewySnap = mkSnapshot([mkCrop({ reviewGained: REVIEW_RATIO_CAP, lastWateredOn: farmDay(planted) }), null]);
  const draws = Array.from({ length: 3000 }, () => pickScarecrowLine(reviewySnap, planted, random));
  assert.ok(draws.some(line => line.includes('복습')), 'expected the review-linked hint to appear at least once over many draws');
});

test('computeSubmitReward: a flat base plus a size-proportional top-up, staying well under the shop\'s cheapest item across the whole [10,100] size range', () => {
  assert.equal(computeSubmitReward(10), 14); // 10 + round(10*0.4)
  assert.equal(computeSubmitReward(50), 30); // 10 + round(50*0.4)
  assert.equal(computeSubmitReward(100), 50); // 10 + round(100*0.4)
  let previous = -Infinity;
  for (let size = 10; size <= 100; size++) {
    const reward = computeSubmitReward(size);
    assert.ok(Number.isInteger(reward) && reward >= 14 && reward <= 50, `reward ${reward} out of the documented 14..50 range for size ${size}`);
    assert.ok(reward >= previous, 'reward is monotonic in size — a bigger tomato never pays less');
    previous = reward;
  }
});
