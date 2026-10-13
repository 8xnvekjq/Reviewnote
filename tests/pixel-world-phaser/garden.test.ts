import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CROP_RULES, FARM_DAILY_CAP, GARDEN_GATE, GARDEN_INDEXES, GARDEN_SIZE, cellWet, gardenAction, gardenIndex, gardenIndexAt, gardenLook, gardenLookKey,
  gardenResultMessage, gardenStage, gardenXY, gardenYardCell, isGardenFence, isGardenIndex, lateGrowth, soilOf, sprinklerCovers, sprinklerPlaced,
} from '../../src/features/pixel-room/farm/gardenModel.ts';
import type { GardenTool } from '../../src/features/pixel-room/farm/gardenModel.ts';
import type { FarmCrop, FarmPlot, FarmSnapshot } from '../../src/features/pixel-room/farm/farmModel.ts';
import { GARDEN_AREA, gardenIndexAtWorld, gardenTarget, gardenWorldCell, nearGarden, planPath, worldSolid, yardScene, SPAWN, cellOf, cellCenter } from '../../src/features/pixel-world-phaser/logic/yardWorld.ts';
import { CROP_H, CROP_W, cropGrid, GARDEN_PALETTE, SPRINKLER_GRID } from '../../src/features/pixel-world-phaser/logic/gardenSprites.ts';
import { parseFarmResult } from '../../src/features/pixel-world-phaser/logic/farmResult.ts';
import { parseBag } from '../../src/features/pixel-world-phaser/logic/bag.ts';

const hour = 3600000;
const now = Date.parse('2026-10-20T03:00:00Z'); // 2026-10-20 12:00 KST
const today = '2026-10-20';
const crop = (over: Partial<FarmCrop> = {}): FarmCrop => ({ id: 'c', type: 'tomato', plantedAt: new Date(now - 10 * hour).toISOString(),
  readyAt: new Date(now + 86 * hour).toISOString(), careCount: 0, lastWateredOn: null, reviewGained: 0, harvests: 0, ...over });
const plot = (over: Partial<FarmPlot> = {}): FarmPlot => ({ index: 9, revision: 1, crop: null, soil: 'grass', wateredOn: null, sprinkler: false, ...over });

test('garden grid: 6×4 cells indexed y*8+x, fence ring with a two-cell gate on top', () => {
  assert.deepEqual(GARDEN_SIZE, { cols: 6, rows: 4 });
  assert.equal(GARDEN_INDEXES.length, 24);
  assert.deepEqual(gardenXY(gardenIndex(5, 3)), { x: 5, y: 3 });
  assert.equal(gardenIndex(5, 3), 29);
  assert.ok(isGardenIndex(0) && isGardenIndex(29) && !isGardenIndex(6) && !isGardenIndex(32) && !isGardenIndex(-1) && !isGardenIndex(1.5));
  for (const index of GARDEN_INDEXES) assert.equal(gardenIndexAt(gardenYardCell(index)), index);
  assert.equal(GARDEN_GATE.length, 2);
  for (const gate of GARDEN_GATE) assert.equal(isGardenFence(gate), false);
});

test('yard world: fence blocks, cells and gate are walkable, every cell reachable from the door', () => {
  const scene = yardScene();
  let fence = 0;
  for (let y = GARDEN_AREA.y; y < GARDEN_AREA.y + GARDEN_AREA.rows; y++) for (let x = GARDEN_AREA.x; x < GARDEN_AREA.x + GARDEN_AREA.cols; x++) {
    const index = gardenIndexAtWorld({ x, y });
    if (index !== null) assert.equal(worldSolid({ x, y }), false, `cell ${x},${y}`);
    else if (worldSolid({ x, y })) fence++;
  }
  assert.equal(fence, 2 * GARDEN_AREA.cols + 2 * GARDEN_AREA.rows - 4 - 2, 'fence ring minus the two gate cells');
  for (const index of GARDEN_INDEXES) {
    const cell = gardenWorldCell(index);
    assert.deepEqual(planPath(cellOf(SPAWN), cell, scene.solid).at(-1), cell, `reach cell ${index}`);
  }
  // 텃밭은 광장 길·강가 출구와 겹치지 않는다(울타리 밖).
  const inside = (c: { x: number; y: number }) => c.x >= GARDEN_AREA.x && c.y >= GARDEN_AREA.y && c.x < GARDEN_AREA.x + GARDEN_AREA.cols && c.y < GARDEN_AREA.y + GARDEN_AREA.rows;
  for (const exit of scene.exits) for (const cell of exit.cells) assert.equal(inside(cell), false, exit.id);
  assert.ok(nearGarden(cellOf(cellCenter({ x: GARDEN_AREA.x - 1, y: GARDEN_AREA.y + 2 }))), 'tool bar shows from the main path beside the fence');
  assert.equal(nearGarden(cellOf(SPAWN)), false, 'not at the house door');
});

test('tool target: the faced garden cell first, otherwise the cell under the feet; outside the garden none', () => {
  const c0 = gardenWorldCell(0), c8 = gardenWorldCell(gardenIndex(0, 1));
  assert.equal(gardenTarget(cellCenter(c0), 'Front'), gardenIndex(0, 1));
  assert.equal(gardenTarget(cellCenter(c8), 'Back'), 0);
  assert.equal(gardenTarget(cellCenter(c0), 'Left'), 0, 'facing the fence uses the standing cell');
  const gate = { x: GARDEN_AREA.x + 3, y: GARDEN_AREA.y };
  assert.equal(gardenTarget(cellCenter(gate), 'Front'), gardenIndex(2, 0), 'from the gate, facing down');
  assert.equal(gardenTarget(cellCenter({ x: gate.x, y: gate.y - 1 }), 'Back'), null);
  assert.equal(gardenTarget(SPAWN, 'Front'), null);
});

test('growth stages: 씨앗 → 새싹 → 자람 → 열매; strawberry regrow shows 자람 until ripe again', () => {
  const t = crop({ plantedAt: new Date(now).toISOString(), readyAt: new Date(now + 96 * hour).toISOString() });
  assert.deepEqual([0, 19, 20, 47, 48, 95.9, 96].map(h => gardenStage(t, now + h * hour)), ['seed', 'seed', 'sprout', 'sprout', 'grown', 'grown', 'ripe']);
  assert.equal(lateGrowth(t, now + 71 * hour), false); assert.equal(lateGrowth(t, now + 72 * hour), true);
  assert.equal(CROP_RULES.strawberry.growHours, Math.round(CROP_RULES.tomato.growHours * 2 / 3));
  assert.equal(CROP_RULES.strawberry.regrowHours, CROP_RULES.strawberry.growHours / 2);
  assert.equal(CROP_RULES.strawberry.maxHarvests, 3); assert.equal(CROP_RULES.tomato.maxHarvests, 1);
  const regrow = crop({ type: 'strawberry', harvests: 1, plantedAt: new Date(now).toISOString(), readyAt: new Date(now + 32 * hour).toISOString() });
  assert.equal(gardenStage(regrow, now), 'grown');
  assert.equal(gardenStage(regrow, now + 32 * hour), 'ripe');
});

test('soil: grass / dry tilled / wet tilled — wet only today (watered, rain, or sprinkler via server wateredOn)', () => {
  const snap = { today, rainToday: false };
  assert.equal(soilOf(plot()), 'grass');
  assert.equal(soilOf(plot({ crop: crop() })), 'tilled', 'a crop implies tilled soil (old responses without soil)');
  assert.equal(cellWet(plot({ soil: 'tilled' }), snap, now), false);
  assert.equal(cellWet(plot({ soil: 'tilled', wateredOn: today }), snap, now), true);
  assert.equal(cellWet(plot({ soil: 'tilled', wateredOn: today }), snap, now + 24 * hour), false, 'dries the next KST day');
  assert.equal(cellWet(plot({ soil: 'tilled' }), { today, rainToday: true }, now), true, 'rain wets every tilled cell');
  assert.equal(cellWet(plot({ soil: 'tilled' }), { today, rainToday: true }, now + 24 * hour), false, 'yesterday’s rain flag does not carry over');
  assert.equal(cellWet(plot(), { today, rainToday: true }, now), false, 'grass is never soil');
  assert.ok(sprinklerCovers(9, 0) && sprinklerCovers(9, 18) && sprinklerCovers(9, 10) && !sprinklerCovers(9, 9) && !sprinklerCovers(9, 11 + 8) && !sprinklerCovers(0, 7));
  assert.equal([...GARDEN_INDEXES].filter(i => sprinklerCovers(9, i)).length, 8);
  assert.equal([...GARDEN_INDEXES].filter(i => sprinklerCovers(0, i)).length, 3, 'corner sprinkler waters the 3 cells inside the garden');
});

test('action per tool: hoe tills grass, seeds need tilled soil, water once a day, ripe crops harvest with any tool', () => {
  const ctx = { now, sprinklerOwned: false, sprinklerAt: null };
  const act = (p: FarmPlot | undefined, tool: GardenTool, extra = {}) => gardenAction(p, tool, { ...ctx, ...extra }).action;
  assert.equal(act(plot(), 'hoe'), 'till');
  assert.equal(act(plot({ soil: 'tilled' }), 'hoe'), null);
  assert.equal(act(plot(), 'tomato'), null);
  assert.match(gardenAction(plot(), 'strawberry', ctx).reason!, /괭이/);
  assert.equal(act(plot({ soil: 'tilled' }), 'tomato'), 'plant_tomato');
  assert.equal(act(plot({ soil: 'tilled' }), 'strawberry'), 'plant_strawberry');
  assert.equal(act(plot({ soil: 'tilled', crop: crop() }), 'tomato'), null);
  assert.equal(act(plot(), 'water'), null);
  assert.equal(act(plot({ soil: 'tilled' }), 'water'), 'water', 'empty tilled soil can be watered');
  assert.equal(act(plot({ soil: 'tilled', wateredOn: today }), 'water'), null);
  assert.equal(act(plot({ crop: crop() }), 'water'), 'water');
  assert.equal(act(plot({ crop: crop({ lastWateredOn: today }) }), 'water'), null);
  const ripe = plot({ crop: crop({ readyAt: new Date(now - 1).toISOString() }) });
  for (const tool of ['hoe', 'tomato', 'strawberry', 'water', 'sprinkler'] as GardenTool[]) assert.equal(act(ripe, tool), 'harvest', tool);
  assert.equal(gardenAction(ripe, 'hoe', ctx).verb, '토마토 따기');
  assert.equal(act(undefined, 'hoe'), null);
});

test('sprinkler tool: needs to be owned, one per student, only on a cell without a crop; tools skip its cell', () => {
  const owned = { sprinklerOwned: true, sprinklerAt: null };
  const act = (p: FarmPlot, tool: GardenTool, extra: object) => gardenAction(p, tool, { now, ...extra }).action;
  assert.equal(act(plot(), 'sprinkler', { sprinklerOwned: false }), null);
  assert.equal(act(plot(), 'sprinkler', owned), 'place_sprinkler');
  assert.equal(act(plot({ soil: 'tilled' }), 'sprinkler', owned), 'place_sprinkler');
  assert.equal(act(plot({ crop: crop() }), 'sprinkler', owned), null);
  assert.equal(act(plot(), 'sprinkler', { sprinklerOwned: true, sprinklerAt: 3 }), null);
  assert.equal(act(plot({ sprinkler: true }), 'sprinkler', { sprinklerOwned: true, sprinklerAt: 9 }), 'remove_sprinkler');
  for (const tool of ['hoe', 'tomato', 'water'] as GardenTool[]) assert.equal(act(plot({ soil: 'tilled', sprinkler: true }), tool, owned), null);
  assert.equal(sprinklerPlaced({ plots: [plot({ index: 4 }), plot({ index: 12, sprinkler: true })] }), 12);
});

test('result messages are Korean and describe strawberry harvests left', () => {
  assert.equal(gardenResultMessage('till', 'ok'), '흙을 갈았어요.');
  assert.match(gardenResultMessage('harvest', 'ok', { cropType: 'strawberry', berries: 2, harvests: 1, maxHarvests: 3 }), /딸기 2알.*2번 더/);
  assert.match(gardenResultMessage('harvest', 'ok', { cropType: 'strawberry', berries: 1, harvests: 3, maxHarvests: 3 }), /다 땄어요/);
  assert.match(gardenResultMessage('harvest', 'ok', { cropType: 'tomato', sizeScore: 82, bonusApplied: true }), /82\/100.*복습 보너스/);
  assert.equal(gardenResultMessage('water', 'already_watered'), '오늘은 이미 촉촉해요.');
  assert.equal(gardenResultMessage('plant_tomato', 'untilled'), '괭이로 먼저 흙을 갈아 주세요.');
});

test('look + key: one entry per cell, changes only when something visible changes', () => {
  const snapshot: FarmSnapshot = { serverNow: new Date(now).toISOString(), today, harvestCount: 0, bestSize: null, lastHarvestSize: null, rainToday: false,
    plots: [plot({ index: 0, soil: 'tilled', wateredOn: today, crop: crop({ plantedAt: new Date(now).toISOString(), readyAt: new Date(now + 96 * hour).toISOString() }) }), plot({ index: 9, sprinkler: true })] };
  const look = gardenLook(snapshot, now);
  assert.equal(look.cells.length, 24);
  assert.deepEqual(look.cells[0], { index: 0, soil: 'tilled', wet: true, sprinkler: false, crop: { type: 'tomato', stage: 'seed', late: false } });
  assert.equal(look.cells.find(c => c.index === 9)!.sprinkler, true);
  assert.equal(look.cells.find(c => c.index === 1)!.soil, 'grass', 'missing cells are grass');
  assert.equal(gardenLookKey(look), gardenLookKey(gardenLook(snapshot, now + 1000)));
  assert.notEqual(gardenLookKey(look), gardenLookKey(gardenLook(snapshot, now + 30 * hour)), 'seed → sprout redraws');
  assert.notEqual(gardenLookKey(look), gardenLookKey(gardenLook({ ...snapshot, rainToday: true }, now)));
});

test('daily farm cap equals the old two-bed maximum (2 harvests × 40 XP, 2 submissions × 50P)', () => {
  assert.deepEqual(FARM_DAILY_CAP, { xp: 2 * CROP_RULES.tomato.xp, points: 2 * (10 + Math.round(100 * 0.4)) });
});

test('sprites: every crop stage fits 16×20, uses only palette colours, and stages look different', () => {
  const grids = (['tomato', 'strawberry'] as const).flatMap(type => (['seed', 'sprout', 'grown', 'ripe'] as const).map(stage => cropGrid(type, stage)));
  grids.push(cropGrid('tomato', 'grown', true), cropGrid('strawberry', 'grown', true), SPRINKLER_GRID);
  for (const grid of grids) {
    assert.equal(grid.length, CROP_H);
    for (const row of grid) { assert.equal(row.length, CROP_W); for (const ch of row) assert.ok(ch === '.' || GARDEN_PALETTE[ch], ch); }
  }
  assert.equal(new Set(grids.map(g => g.join('\n'))).size, grids.length - 1, 'sprout is shared, everything else distinct');
  assert.ok(cropGrid('tomato', 'ripe').join('').includes('R') && !cropGrid('tomato', 'grown').join('').includes('R'));
  assert.ok(cropGrid('strawberry', 'ripe').join('').includes('B'));
});

test('responses: garden snapshots with 24 plots parse, malformed plots are rejected, strawberries parse in the bag', () => {
  const raw = { serverNow: new Date(now).toISOString(), today, harvestCount: 0, plots: GARDEN_INDEXES.map(index => ({ index, revision: 0, crop: null, soil: 'grass' })), xpGain: { gained: 10, xp: 50, level: 2, leveledUp: true, track: 'farming' } };
  const farm = parseFarmResult(raw);
  assert.equal(farm.plots.length, 24); assert.equal(farm.xpGain?.gained, 10);
  assert.throws(() => parseFarmResult({ ...raw, plots: [{ index: 'x', revision: 0 }] }));
  assert.throws(() => parseFarmResult({ ...raw, plots: [] }));
  const bag = parseBag({ capacity: 20, weight: 0.3, items: [{ kind: 'crop', ref: 'strawberry', qty: 3, unitWeight: 0.1, unitPoints: 2 }, { kind: 'gem', ref: 'x', qty: 1, unitWeight: 1, unitPoints: 1 }] });
  assert.deepEqual(bag?.items.map(i => [i.kind, i.ref, i.qty]), [['crop', 'strawberry', 3]]);
});
