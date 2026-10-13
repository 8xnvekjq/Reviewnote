import { test } from 'node:test';
import assert from 'node:assert/strict';
import { continuousPayload, continuousPosition } from '../../src/features/pixel-room/plaza/presenceProtocol.ts';
import { createPlazaStoreState, plazaStoreReducer } from '../../src/features/pixel-room/plaza/presenceStore.ts';
import { plazaScene, plazaCell, plazaGroundTile, RPS_TABLE, RPS_RULE_SIGN } from '../../src/features/pixel-world-phaser/logic/plazaWorld.ts';
import { isWalkablePlaza } from '../../src/features/pixel-room/plaza/plazaModel.ts';
import { SCENERY, PATHS, inRect } from '../../src/features/pixel-room/plaza/plazaLayout.ts';
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

test('카드 테이블과 설명서 팻말은 벽 안 열린 잔디에 있고 앞에서 닿는다', () => {
  const scene = plazaScene();
  const cellsOf = (r: { x: number; y: number; w: number; h: number }) => Array.from({ length: r.w * r.h }, (_, n) => ({ x: r.x + n % r.w, y: r.y + Math.floor(n / r.w) }));
  // 테이블 그림(64px)은 칸보다 양옆 반 칸, 위로 두 칸 더 크다. 팻말 그림은 위로 반 칸.
  const tableArt = { x: RPS_TABLE.x - 1, y: RPS_TABLE.y - 2, w: RPS_TABLE.w + 2, h: RPS_TABLE.h + 2 };
  const signArt = { x: RPS_RULE_SIGN.x, y: RPS_RULE_SIGN.y - 1, w: 1, h: 2 };
  for (const cell of [...cellsOf(RPS_TABLE), ...cellsOf(RPS_RULE_SIGN)]) {
    const s = plazaCell(cell);
    assert.ok(s.x > 0 && s.x < 25 && s.y > 0 && s.y < 21, `벽 안: ${JSON.stringify(s)}`);
    assert.ok(scene.solid(s));
    assert.ok(!PATHS.some(p => inRect(cell, p)));
  }
  for (const art of [tableArt, signArt]) for (const cell of cellsOf(art)) {
    if (art === tableArt && (cell.x === tableArt.x || cell.x === tableArt.x + tableArt.w - 1)) continue; // 반 칸만 걸침
    assert.ok(!SCENERY.some(item => inRect(cell, item) || inRect(cell, item.footprint)), `그림 겹침: ${JSON.stringify(cell)}`);
  }
  assert.ok(!cellsOf(tableArt).some(cell => inRect(cell, RPS_RULE_SIGN)));
  const spawn = entrySpawn(scene, 'yard');
  const from = { x: Math.floor(spawn.feet.x / 16), y: Math.floor(spawn.feet.y / 16) };
  for (let dx = 0; dx < RPS_TABLE.w; dx++) {
    const front = plazaCell({ x: RPS_TABLE.x + dx, y: RPS_TABLE.y + RPS_TABLE.h });
    assert.equal(scene.solid(front), false);
    assert.ok(planPath(from, front, scene, exitCells(scene)).length);
    assert.equal(facedInteractable(cellCenter(front), 'Back', scene.interactables)?.id, 'rps-table');
  }
  const besideSign = plazaCell({ x: RPS_RULE_SIGN.x - 1, y: RPS_RULE_SIGN.y });
  assert.equal(scene.solid(besideSign), false);
  assert.ok(planPath(from, besideSign, scene, exitCells(scene)).length);
  assert.equal(facedInteractable(cellCenter(besideSign), 'Right', scene.interactables)?.id, 'rps-rules');
});
