import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { yardScene, RIVER_EXIT_CELLS } from '../../src/features/pixel-world-phaser/logic/yardWorld.ts';
import { riverScene, riverWater, inDock, DOCK, RIVER_DECORATIONS, decorationCells, bankEdge, RIVER_COLS, RIVER_ROWS } from '../../src/features/pixel-world-phaser/logic/riverWorld.ts';
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
  const route = planPath(spawn, { x: DOCK.right, y: DOCK.top }, spec, exitCells(spec));
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
    assert.equal(worldTint(phase, 'rain').rainDrops, 56);
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
test('entry viewport includes open water at phone and tablet sizes', async () => {
  const { cameraZoom, cameraCenterAxis } = await import('../../src/features/pixel-world-phaser/logic/layout.ts');
  const feet = entrySpawn(riverScene(), 'fromYard').feet;
  for (const [width, height] of [[390,844], [1180,820]]) {
    const view = width / cameraZoom(width, height);
    const right = cameraCenterAxis(feet.x, view, RIVER_COLS * 16) + view / 2;
    assert.ok(right - bankEdge(9) * 16 >= 16);
  }
});

test('expanded fish art preserves the original RGBA bytes and has five nonempty transparent icons', () => {
  const result = spawnSync('python', ['-I', 'scripts/pixel-world/draw-fish-expansion.py', '--check'],
    { cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const art = JSON.parse(result.stdout);
  assert.equal(art.originalHash, '2fde85e7e4b0ad943fd01843a139155993332d5fda27a27cdee89fc654d36134');
  assert.deepEqual(art.fishSize, [224, 16]);
  assert.deepEqual(art.junkSize, [48, 16]);
  assert.equal(art.opaquePixels.length, 5);
  assert.ok(art.opaquePixels.every((count: number) => count > 0 && count < 256));
});

test('dock has eleven columns and three fully walkable rows without decorations or hotspots', async () => {
  const { HOTSPOTS, HOTSPOT_RADIUS } = await import('../../src/features/pixel-world-phaser/logic/hotspots.ts');
  assert.deepEqual(DOCK, { left: 7, right: 17, top: 10, bottom: 12 });
  const spec = riverScene(), start = cellOf(entrySpawn(spec, 'fromYard').feet);
  for (let x = 7; x <= 17; x++) for (let y = 10; y <= 12; y++) {
    const cell = { x, y };
    assert.ok(inDock(cell)); assert.ok(!spec.solid(cell)); assert.ok(!riverWater(cell));
    assert.deepEqual(planPath(start, cell, spec, exitCells(spec)).at(-1), cell);
    assert.ok(!RIVER_DECORATIONS.flatMap(decorationCells).some(c => c.x === x && c.y === y));
    for (const spot of HOTSPOTS) assert.ok(Math.hypot(cellCenter(spot.cell).x - cellCenter(cell).x, cellCenter(spot.cell).y - cellCenter(cell).y) > HOTSPOT_RADIUS + 8);
  }
});
