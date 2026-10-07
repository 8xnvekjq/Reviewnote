import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScene, entrySpawn, exitAt, exitCells } from '../../src/features/pixel-world-phaser/logic/scenes.ts';
import { furnitureCells, roomToWorld, sanitizeFurniture, furnitureSprite, ROOM_DOOR } from '../../src/features/pixel-world-phaser/logic/roomWorld.ts';
import { cellCenter, cellOf, feetBlocked, moveFeet, planPath, facedInteractable } from '../../src/features/pixel-world-phaser/logic/world.ts';
import { canvasSize, cameraZoom } from '../../src/features/pixel-world-phaser/logic/layout.ts';
import { dialogueFor } from '../../src/features/pixel-world-phaser/logic/dialogues.ts';
import { FURNITURE } from '../../src/features/pixel-room/model.ts';
import type { FurnitureType } from '../../src/features/pixel-room/model.ts';
import { savedFurniture } from '../../src/features/pixel-world-phaser/logic/savedFurniture.ts';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';

const data = { furniture: [{ type: 'desk' as const, x: 3, y: 4 }, { type: 'bed' as const, x: 0, y: 0 }] };
test('every exit maps to an open destination entry away from the return exit', () => {
  for (const id of ['yard', 'room'] as const) {
    const scene = buildScene(id, data);
    assert.deepEqual(entrySpawn(scene, 'unknown'), entrySpawn(scene, undefined));
    for (const exit of scene.exits) {
      assert.equal(exitAt(scene, cellCenter(exit.cells[0]))?.id, exit.id);
      const destination = buildScene(exit.to.scene, data);
      assert.ok(destination.entries[exit.to.entry]);
      const spawn = entrySpawn(destination, exit.to.entry);
      assert.ok(!feetBlocked(spawn.feet, destination.solid));
      assert.equal(exitAt(destination, spawn.feet), null);
      const route = planPath(cellOf(spawn.feet), destination.exits[0].cells[0], destination, exitCells(destination));
      assert.ok(route.length);
      assert.deepEqual(route.at(-1), destination.exits[0].cells[0]);
    }
  }
});
test('all furniture footprints collide and every type has Korean interaction lines', () => {
  for (const type of Object.keys(FURNITURE) as FurnitureType[]) {
    const item = { type, x: 2, y: 1 };
    const scene = buildScene('room', { furniture: [item] });
    assert.equal(furnitureCells(item).length, FURNITURE[type].width * FURNITURE[type].height);
    for (const cell of furnitureCells(item)) assert.ok(scene.solid(cell));
    const below = cellCenter(roomToWorld({ x: 2, y: 1 + FURNITURE[type].height }));
    assert.equal(facedInteractable(below, 'Back', scene.interactables)?.id, `furniture:${type}`);
    const text = dialogueFor(`furniture:${type}`, { scarecrowLine: () => '' });
    assert.ok(text?.lines.length && /[가-힣]/.test(text.speaker));
    assert.equal(furnitureSprite(item).bottom, below.y - 8);
  }
});
test('room movement stops at furniture, paths go around it and avoid the mat', () => {
  const scene = buildScene('room', data);
  let feet = cellCenter(roomToWorld({ x: 4, y: 5 }));
  for (let i = 0; i < 100; i++) feet = moveFeet(feet, 0, -2, scene.solid);
  assert.ok(feet.y >= (4 + 2 + 1) * 16 + 4);
  assert.ok(!feetBlocked(feet, scene.solid));
  const route = planPath(roomToWorld({ x: 4, y: 6 }), roomToWorld({ x: 4, y: 2 }), scene, exitCells(scene));
  assert.ok(route.length);
  assert.ok(route.every(cell => !scene.solid(cell) && !exitAt(scene, cellCenter(cell))));
  assert.deepEqual(route.at(-1), roomToWorld({ x: 4, y: 2 }));
});
test('invalid, duplicate and overlapping placements are filtered; door and landing remain open', () => {
  assert.deepEqual(sanitizeFurniture([...data.furniture, { type: 'plant', x: 3, y: 4 },
    { type: 'desk', x: 0, y: 7 }, { type: 'chair', x: 10, y: 0 }]), data.furniture);
  const scene = buildScene('room', { furniture: [{ type: 'bed', x: 4, y: 5 }] });
  assert.ok(!scene.solid(roomToWorld(ROOM_DOOR)));
  assert.ok(!feetBlocked(entrySpawn(scene, 'door').feet, scene.solid));
  assert.ok(scene.solid({ x: 0, y: 4 }));
});
test('saved placement maps owned furniture only and rejects corrupt snapshots', () => {
  const item = PIXEL_CATALOG.find(item => item.category === 'furniture')!;
  const rows = [{ itemId: item.itemId, x: 0, y: 0 }, { itemId: 'unknown', x: 3, y: 3 }];
  assert.deepEqual(savedFurniture(rows, PIXEL_CATALOG, new Set()), []);
  assert.deepEqual(savedFurniture(rows, PIXEL_CATALOG, new Set([item.itemId])), [{ type: item.assetKey, x: 0, y: 0 }]);
  assert.deepEqual(savedFurniture([{ ...rows[0], x: 99 }], PIXEL_CATALOG, new Set([item.itemId])), []);
});
test('fractional DPR keeps camera zoom in integer rendering pixels; invalid DPR and cap are handled', () => {
  for (const dpr of [1, 1.25, 2, 2.625, 3, 4, 0, NaN]) {
    const size = canvasSize(393, 851, dpr);
    assert.ok(size.width > 0 && size.height > 0 && size.ratio <= 3);
    const zoom = cameraZoom(393, 851, size.ratio);
    assert.ok(Number.isInteger(zoom));
    assert.equal(size.width, Math.round(393 * (dpr > 0 && Number.isFinite(dpr) ? Math.min(3, dpr) : 1)));
  }
  assert.equal(dialogueFor('gate', { scarecrowLine: () => '' })?.lines.some(line => line.includes('다음 베타에서 열려요')), true);
});
