import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yardScene, RIVER_EXIT_CELLS } from '../../src/features/pixel-world-phaser/logic/yardWorld.ts';
import { riverScene, riverWater, DOCK, RIVER_DECORATIONS, decorationCells, BANK_SPOTS, canCastFrom, nearestBankSpot, bankEdge, RIVER_COLS, RIVER_ROWS } from '../../src/features/pixel-world-phaser/logic/riverWorld.ts';
import { buildScene, entrySpawn, exitAt, exitCells } from '../../src/features/pixel-world-phaser/logic/scenes.ts';
import { cellCenter, cellOf, feetBlocked, planPath, facedInteractable, facingToward } from '../../src/features/pixel-world-phaser/logic/world.ts';
import { worldTint, fallbackWorldTime } from '../../src/features/pixel-world-phaser/logic/worldTint.ts';

test('yard east exit and river west exit connect to open entries both ways', () => {
  const yard = yardScene(); const river = riverScene();
  const east = yard.exits.find(exit => exit.to.scene === 'river')!;
  assert.deepEqual(east.cells, RIVER_EXIT_CELLS);
  assert.deepEqual(river.exits[0].cells, [{ x: 2, y: 11 }]);
  assert.equal(east.to.entry, 'fromYard'); assert.equal(river.exits[0].to.entry, 'fromRiver');
  for (const [scene, exit] of [[yard, east], [river, river.exits[0]]] as const) {
    const destination = buildScene(exit.to.scene, { furniture: [] });
    const spawn = entrySpawn(destination, exit.to.entry);
    assert.ok(!feetBlocked(spawn.feet, destination.solid)); assert.equal(exitAt(destination, spawn.feet), null);
    assert.ok(planPath(cellOf(entrySpawn(scene, undefined).feet), exit.cells[0], scene, exitCells(scene)).length);
  }
});
test('river water blocks feet and routes while the dock remains walkable', () => {
  const spec = riverScene();
  for (let y = 3; y < 19; y++) for (let x = 8; x < 24; x++) {
    const cell = { x, y }; if (riverWater(cell)) { assert.ok(spec.solid(cell)); assert.ok(feetBlocked(cellCenter(cell), spec.solid)); }
  }
  const spawn = cellOf(entrySpawn(spec, 'fromYard').feet);
  const route = planPath(spawn, { x: DOCK.right, y: 11 }, spec, exitCells(spec));
  assert.ok(route.length); assert.ok(route.every(cell => !riverWater(cell)));
});
test('turtle and fishboard have reachable facing interaction cells', () => {
  const spec = riverScene(), start = cellOf(entrySpawn(spec, 'fromYard').feet);
  for (const item of spec.interactables) {
    const neighbor = { x: item.cell.x, y: item.cell.y + 1 };
    assert.ok(planPath(start, neighbor, spec, exitCells(spec)).length);
    const feet = cellCenter(neighbor);
    assert.equal(facedInteractable(feet, facingToward(feet, cellCenter(item.cell)), spec.interactables)?.id, item.id);
    assert.deepEqual(item.action, { kind: 'panel', panel: item.id });
  }
});
test('tints are warm at evening, blue with player light at night, and rain is bounded', () => {
  assert.deepEqual(worldTint('day', 'clear'), { color: 0xffffff, alpha: 0, lightRadius: 0, rainDrops: 0, shadowColor: 0x193d49 });
  assert.equal(worldTint('evening', 'clear').color, 0xe88b52);
  assert.equal(worldTint('night', 'clear').color, 0x101e50); assert.equal(worldTint('night', 'clear').lightRadius, 48);
  for (const phase of ['morning', 'day', 'evening', 'night'] as const) {
    assert.equal(worldTint(phase, 'rain').rainDrops, 36);
    assert.equal(worldTint(phase, 'cloudy').rainDrops, 0);
    assert.ok(worldTint(phase, 'rain').alpha > worldTint(phase, 'clear').alpha);
    assert.ok(worldTint(phase, 'rain').alpha <= 0.68);
  }
});
test('local fallback follows all KST phase boundaries and deterministic daily weather', () => {
  for (const [hour, phase] of [[5,'night'],[6,'morning'],[10,'morning'],[11,'day'],[16,'day'],[17,'evening'],[19,'evening'],[20,'night']] as const) {
    const date = new Date(Date.UTC(2026, 9, 8, hour - 9)); assert.equal(fallbackWorldTime(date).phase, phase);
  }
  assert.equal(fallbackWorldTime(new Date('2026-10-08T00:00:00Z')).weather, fallbackWorldTime(new Date('2026-10-08T14:00:00Z')).weather);
  // 서버(SQL fish_weather_for)와 같은 FNV 규칙: 2026-10-08은 비, 2026-01-01은 맑음.
  assert.equal(fallbackWorldTime(new Date('2026-10-08T03:00:00Z')).weather, 'rain');
  assert.equal(fallbackWorldTime(new Date('2026-01-01T03:00:00Z')).weather, 'clear');
  // 관리자 덮어쓰기는 화면 시계에도 그대로 반영된다.
  assert.deepEqual(fallbackWorldTime(new Date('2026-10-08T03:00:00Z'), { clock: '21:30', weather: 'clear' }), { phase: 'night', weather: 'clear' });
});


test('decoration footprints block feet while flowers remain walkable', () => {
  const spec = riverScene();
  for (const d of RIVER_DECORATIONS) for (const cell of decorationCells(d)) {
    assert.equal(spec.solid(cell), d.blocking, `${d.kind} at ${cell.x},${cell.y}`);
    assert.equal(feetBlocked(cellCenter(cell), spec.solid), d.blocking);
  }
});
test('every fishing spot is reachable and adjacent to water', () => {
  const spec = riverScene(), from = cellOf(entrySpawn(spec, 'fromYard').feet);
  for (const spot of BANK_SPOTS) {
    assert.ok(!spec.solid(spot));
    assert.deepEqual(planPath(from, spot, spec, exitCells(spec)).at(-1), spot);
    assert.ok(riverWater({ x: spot.x + 1, y: spot.y }));
    const shadow = { x: (spot.x + 2) * 16, y: cellCenter(spot).y };
    assert.ok(canCastFrom(cellCenter(spot), shadow));
    assert.ok(nearestBankSpot(shadow, cellCenter(from)));
    assert.ok(!canCastFrom(cellCenter({ x: 2, y: 11 }), shadow));
  }
  let wet = 0;
  for (let y = 0; y < RIVER_ROWS; y++) for (let x = 0; x < RIVER_COLS; x++) if (riverWater({ x, y })) wet++;
  assert.ok(wet > RIVER_COLS * RIVER_ROWS / 2);
});
test('entry viewport includes open water at phone and tablet sizes', async () => {
  const { cameraZoom, cameraCenterAxis } = await import('../../src/features/pixel-world-phaser/logic/layout.ts');
  const feet = entrySpawn(riverScene(), 'fromYard').feet;
  for (const [width, height] of [[390,844], [1180,820]]) {
    const view = width / cameraZoom(width, height);
    const right = cameraCenterAxis(feet.x, view, RIVER_COLS * 16) + view / 2;
    assert.ok(right - bankEdge(9) * 16 >= 16);
  }
});

test('cast range measures the shore rather than the selected landing spot', () => {
  const shadow = { x: 152, y: 230 };
  assert.ok(canCastFrom(cellCenter({ x: 4, y: 14 }), shadow));
  assert.ok(!canCastFrom(cellCenter({ x: 3, y: 14 }), shadow));
  assert.ok(canCastFrom(entrySpawn(riverScene(), 'fromYard').feet, { x: 208, y: 183 }));
  assert.ok(!canCastFrom(cellCenter({ x: 8, y: 14 }), shadow));
});
