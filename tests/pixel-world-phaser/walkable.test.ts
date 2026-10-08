import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yardScene, toWorldCell, RIVER_SIGN, RIVER_EXIT, groundTile, borderTrees } from '../../src/features/pixel-world-phaser/logic/yardWorld.ts';
import { plazaScene, plazaCell, plazaBorderGap } from '../../src/features/pixel-world-phaser/logic/plazaWorld.ts';
import { yardWalkable } from '../../src/features/pixel-room/yard/yardModel.ts';
import { SCENERY, inRect } from '../../src/features/pixel-room/plaza/plazaLayout.ts';
import { cellCenter, feetBlocked, facedInteractable, planPath } from '../../src/features/pixel-world-phaser/logic/world.ts';
import { riverScene } from '../../src/features/pixel-world-phaser/logic/riverWorld.ts';
import { dialogueFor } from '../../src/features/pixel-world-phaser/logic/dialogues.ts';
import { cameraCenterAxis, cameraZoom } from '../../src/features/pixel-world-phaser/logic/layout.ts';

const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
const directions = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
for (const scene of [yardScene(), plazaScene()]) {
  test(`${scene.id}: all drawn open cells, exits and interaction approaches reachable from every entry`, () => {
    // 보이지 않는 벽을 찾도록 그리기용 배치에서 기대값을 따로 만든다.
    const obstacle = (x: number, y: number) => scene.id === 'yard'
      ? (x === RIVER_SIGN.x && y === RIVER_SIGN.y) || (x >= 5 && x < 21 && y >= 5 && y < 17 && !yardWalkable({ x: x - 5, y: y - 5 }))
      : SCENERY.some(s => inRect({ x: x - 5, y: y - 5 }, s.footprint));
    const terminals = new Set(scene.exits.flatMap(e => e.cells.map(key)));
    for (const entry of Object.values(scene.entries)) {
      const queue = [entry.cell], seen = new Set([key(entry.cell)]);
      assert.equal(scene.solid(entry.cell), false);
      for (const p of queue) {
        if (terminals.has(key(p))) continue;
        for (const d of directions) {
          const n = { x: p.x + d.x, y: p.y + d.y };
          if (!scene.solid(n) && !seen.has(key(n))) { seen.add(key(n)); queue.push(n); }
        }
      }
      for (let y = 0; y < scene.rows; y++) for (let x = 0; x < scene.cols; x++) {
        const border = x === 0 || y === 0 || x === scene.cols - 1 || y === scene.rows - 1;
        const solid = border || obstacle(x, y);
        assert.equal(scene.solid({ x, y }), solid, `art/collision ${x},${y}`);
        if (!solid) {
          assert.ok(seen.has(key({ x, y })), `unreachable open cell ${x},${y}`);
          assert.equal(feetBlocked(cellCenter({ x, y }), scene.solid), false);
        }
      }
      for (const exit of scene.exits) for (const p of exit.cells) assert.ok(seen.has(key(p)), `exit ${exit.id}`);
      for (const item of scene.interactables) assert.ok((item.cells ?? [item.cell]).some(p => directions.some(d => seen.has(key({ x: p.x + d.x, y: p.y + d.y })))), `approach ${item.id}`);
    }
    assert.equal(scene.solid({ x: -1, y: 8 }), true);
    assert.equal(scene.solid({ x: 2.5, y: 8 }), true);
  });
  test(`${scene.id}: camera bounds include every reachable cell at tablet and phone sizes`, () => {
    for (const [w, h] of [[1180, 820], [390, 844], [800, 1280]]) {
      const zoom = cameraZoom(w, h, 1), vw = w / zoom, vh = h / zoom;
      for (let y = 1; y < scene.rows - 1; y++) for (let x = 1; x < scene.cols - 1; x++) {
        if (scene.solid({ x, y })) continue;
        const p = cellCenter({ x, y });
        const cx = cameraCenterAxis(p.x, vw, scene.cols * 16), cy = cameraCenterAxis(p.y - 12, vh, scene.rows * 16);
        assert.ok(p.x - 8 >= cx - vw / 2 && p.x + 8 <= cx + vw / 2);
        assert.ok(p.y - 8 >= cy - vh / 2 && p.y + 8 <= cy + vh / 2);
      }
    }
  });
}
test('river sign is solid, readable with A from the path, and uses the requested Korean dialogue', () => {
  const scene = yardScene();
  const sign = facedInteractable(cellCenter({ x: RIVER_SIGN.x, y: RIVER_SIGN.y + 1 }), 'Back', scene.interactables);
  assert.equal(sign?.id, 'river-sign');
  assert.deepEqual(sign?.action, { kind: 'talk' });
  assert.equal(scene.solid(RIVER_SIGN), true);
  assert.deepEqual(dialogueFor('river-sign', { scarecrowLine: () => '' }), { speaker: '강가 안내판', lines: ['오른쪽으로 쭉 가면 강가가 나와요. 물고기 그림자를 눌러 낚시해 보세요!'] });
  const path = [...Array.from({ length: 8 }, (_, i) => toWorldCell({ x: 7 + i, y: 9 })), toWorldCell({ x: 14, y: 8 }), toWorldCell({ x: 14, y: 7 }), RIVER_EXIT];
  for (const p of path) { assert.equal(groundTile(p.x, p.y), 25); assert.equal(scene.solid(p), false); }
  for (let x = 19; x <= 25; x++) for (let y = 12; y <= 15; y++) assert.equal(groundTile(x, y), 25);
  for (const tree of borderTrees()) assert.equal(scene.solid({ x: tree.x, y: tree.y - 1 }), true);
  assert.equal(plazaScene().solid(plazaCell({ x: -1, y: 6 })), false);
});

test('outdoor exits sit at walkable edges, entries face inward and each exit cell accepts taps', () => {
  for (const scene of [yardScene(), plazaScene(), riverScene()]) {
    for (const exit of scene.exits.filter(e => e.id !== 'door')) {
      if (scene.id !== 'river') assert.equal(exit.cells.length, 3);
      for (const cell of exit.cells) {
        assert.ok(cell.x === 1 || cell.x === scene.cols - 2 || cell.y === scene.rows - 2 || (scene.id === 'river' && cell.x === 2));
        for (const entry of Object.values(scene.entries)) {
          const path = planPath(entry.cell, cell, scene, scene.exits.flatMap(e => e.cells));
          assert.deepEqual(path.at(-1), cell);
        }
      }
    }
    for (const entry of Object.values(scene.entries)) {
      assert.ok(!scene.exits.some(e => e.cells.some(c => key(c) === key(entry.cell))));
      assert.equal(feetBlocked(cellCenter(entry.cell), scene.solid), false);
    }
  }
  assert.equal(yardScene().entries.plaza.facing, 'Back');
  assert.equal(yardScene().entries.fromRiver.facing, 'Left');
  assert.equal(plazaScene().entries.yard.facing, 'Back');
  for (const cell of yardScene().exits.find(e => e.id === 'gate')!.cells) assert.ok(!borderTrees().some(t => t.x === cell.x && t.y === 22));
  for (const cell of plazaScene().exits[0].cells) assert.ok(plazaBorderGap(cell.x, 21));
});
