import { test } from 'node:test';
import assert from 'node:assert/strict';
import { continuousPayload, continuousPosition } from '../../src/features/pixel-room/plaza/presenceProtocol.ts';
import { createPlazaStoreState, plazaStoreReducer } from '../../src/features/pixel-room/plaza/presenceStore.ts';
import { plazaScene, plazaCell, plazaGroundTile } from '../../src/features/pixel-world-phaser/logic/plazaWorld.ts';
import { isWalkablePlaza } from '../../src/features/pixel-room/plaza/plazaModel.ts';
import { SCENERY } from '../../src/features/pixel-room/plaza/plazaLayout.ts';
import { cellCenter, feetBlocked, planPath, facedInteractable } from '../../src/features/pixel-world-phaser/logic/world.ts';
import { buildScene, entrySpawn, exitAt, exitCells } from '../../src/features/pixel-world-phaser/logic/scenes.ts';
const appearance = { top: null, bottom: null, hair: null, shoes: null, eyes: null, skin: null };
const old = { sessionId: 'old', x: 8, y: 10, direction: 'Back' as const, moving: false, seq: 1, updatedAt: 1, appearance };
test('v2 retains nearest-tile x/y while beta renders full fractional coordinates; v1 remains tile based', () => {
  const beta = { ...old, ...continuousPayload({ x: (5 + 8.25 + .5) * 16, y: (5 + 9.75 + .5) * 16 }), pet: 'pet_duck' as const };
  assert.equal(beta.x, 8); assert.equal(beta.y, 10);
  assert.deepEqual(continuousPosition(beta), { x: 8.25, y: 9.75 });
  assert.deepEqual(continuousPosition(old), { x: 8, y: 10 });
  let state = plazaStoreReducer(createPlazaStoreState(), { type: 'presence-join', players: [{ player: beta, presenceRef: 'beta-ref' }] });
  assert.deepEqual(continuousPosition(state.players.get('old')!), { x: 8.25, y: 9.75 });
  assert.deepEqual(continuousPosition(state.paths.get('old')![0]), { x: 8.25, y: 9.75 });
  state = plazaStoreReducer(state, { type: 'broadcast', player: { ...beta, seq: 2, position: { x: 8.4, y: 9.6 } } });
  assert.deepEqual(continuousPosition(state.paths.get('old')!.at(-1)!), { x: 8.4, y: 9.6 });
  assert.equal(state.players.get('old')!.pet, 'pet_duck');
  assert.equal(state.players.get('old')!.x, 8, 'old renderer reads x without interpreting v2');
  const raw = { ...beta, name: 'private', grade: 3 };
  state = plazaStoreReducer(state, { type: 'broadcast', player: { ...raw, seq: 3 } });
  assert.ok(!('name' in state.players.get('old')!)); assert.ok(!('grade' in state.players.get('old')!));
});
test('invalid extension falls back to legacy coordinates and invalid pets are stripped', () => {
  for (const position of [{ x: NaN, y: 2 }, { x: 2, y: Infinity }, { x: 99, y: 2 }]) {
    assert.deepEqual(continuousPosition({ ...old, version: 2, position }), { x: 8, y: 10 });
  }
  const state = plazaStoreReducer(createPlazaStoreState(), { type: 'broadcast', player: { ...old, version: 2, pet: 'unknown' as never } });
  assert.equal(state.players.get('old')!.pet, null);
});
test('v2 preserves new plaza margin positions while legacy nearest cells remain clamped', () => {
  for (const position of [{ x: -4.18, y: 7 }, { x: 19.18, y: 15.1 }, { x: 8, y: -4.1 }]) {
    const payload = continuousPayload({ x: (position.x + 5.5) * 16, y: (position.y + 5.5) * 16 });
    const state = plazaStoreReducer(createPlazaStoreState(), { type: 'broadcast', player: { ...old, ...payload } });
    const actual = continuousPosition(state.players.get('old')!);
    assert.ok(Math.abs(actual.x - position.x) < 1e-10 && Math.abs(actual.y - position.y) < 1e-10);
    assert.ok(payload.x >= 0 && payload.x <= 15 && payload.y >= 0 && payload.y <= 11);
  }
  for (const position of [{ x: -4.51, y: 2 }, { x: 20, y: 2 }, { x: 2, y: 16 }]) {
    assert.deepEqual(continuousPosition({ ...old, version: 2, position }), { x: old.x, y: old.y });
  }
});
test('plaza preserves scenery footprints with open return entry and connected exits', () => {
  const scene = plazaScene();
  for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) assert.equal(scene.solid(plazaCell({ x, y })), !isWalkablePlaza({ x, y }));
  for (const item of SCENERY) assert.ok(scene.solid(plazaCell(item.footprint)));
  assert.equal(plazaGroundTile(8, 10), 25); assert.equal(plazaGroundTile(4, 3), 12);
  for (const id of ['yard', 'room', 'plaza', 'river'] as const) {
    const current = buildScene(id, { furniture: [] });
    for (const exit of current.exits) {
      const destination = buildScene(exit.to.scene, { furniture: [] });
      const spawn = entrySpawn(destination, exit.to.entry);
      assert.equal(feetBlocked(spawn.feet, destination.solid), false);
      assert.equal(exitAt(destination, spawn.feet), null);
      assert.ok(planPath({ x: Math.floor(spawn.feet.x / 16), y: Math.floor(spawn.feet.y / 16) }, destination.exits[0].cells[0], destination, exitCells(destination)).length);
    }
  }
  assert.equal(facedInteractable(cellCenter(plazaCell({ x: 13, y: 7 })), 'Back', scene.interactables)?.action.kind, 'panel');
});

test('plaza return path extends to its bottom perimeter', () => {
  const scene = plazaScene();
  for (let y = 12; y <= 16; y++) for (let x = 7; x <= 9; x++) assert.equal(plazaGroundTile(x, y), 25);
  assert.equal(exitAt(scene, cellCenter(plazaCell({ x: 8, y: 11 }))), null);
  assert.equal(scene.entries.yard.cell.y, 19);
  for (const cell of scene.exits[0].cells) assert.equal(cell.y, 20);
});
