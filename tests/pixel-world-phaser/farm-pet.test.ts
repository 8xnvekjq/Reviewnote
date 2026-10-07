import { test } from 'node:test';
import assert from 'node:assert/strict';
import { farmAction } from '../../src/features/pixel-world-phaser/logic/farmActions.ts';
import { facesPet, reactionFrame } from '../../src/features/pixel-world-phaser/logic/petReaction.ts';
import { PET_SHEETS } from '../../src/features/pixel-world-phaser/logic/petSheets.ts';
import { INTERACTABLES, cellCenter } from '../../src/features/pixel-world-phaser/logic/yardWorld.ts';
import { facedInteractable } from '../../src/features/pixel-world-phaser/logic/world.ts';
import type { FarmPlot } from '../../src/features/pixel-room/farm/farmModel.ts';
import type { PetId } from '../../src/features/pixel-room/pet/petKinds.ts';

test('farm menu uses KST day, readiness and missing plot safety', () => {
  const now = Date.parse('2026-10-08T15:00:00Z');
  const plot: FarmPlot = { index: 0, revision: 1, crop: null };
  assert.equal(farmAction(undefined, now).disabled, true);
  assert.equal(farmAction(plot, now).action, 'plant');
  plot.crop = { id: 'crop', plantedAt: '2026-10-08T00:00:00Z', readyAt: '2026-10-12T00:00:00Z', lastWateredOn: '2026-10-08', careCount: 1, reviewGained: 0 };
  assert.equal(farmAction(plot, now - 1).disabled, true);
  assert.equal(farmAction(plot, now).disabled, false);
  assert.equal(farmAction(plot, Date.parse(plot.crop.readyAt)).action, 'harvest');
});
test('all four bed edges are A targets; wrong facing is ignored', () => {
  for (const bed of INTERACTABLES.filter(item => item.id.startsWith('farm:'))) {
    for (const [dx, dy, facing] of [[-1, 1, 'Right'], [2, 1, 'Left'], [1, -1, 'Front'], [1, 2, 'Back']] as const) {
      assert.equal(facedInteractable(cellCenter({ x: bed.cell.x + dx, y: bed.cell.y + dy }), facing, [bed])?.id, bed.id);
    }
  }
});
test('pet requires near forward position, and every reaction frame fits its sheet', () => {
  assert.equal(facesPet({x:0,y:0}, 'Right', {x:18,y:3}), true);
  assert.equal(facesPet({x:0,y:0}, 'Left', {x:18,y:3}), false);
  assert.equal(facesPet({x:0,y:0}, 'Right', {x:80,y:0}), false);
  for (const id of Object.keys(PET_SHEETS) as PetId[]) for (const kind of ['feed', 'pet'] as const) for (let t = 0; t <= 3000; t += 50) {
    const frame = reactionFrame(id, t, kind), sheet = PET_SHEETS[id];
    assert.ok(frame >= 0 && frame < sheet.columns * sheet.rows);
  }
  assert.equal(Math.floor(reactionFrame('pet_dog', 800, 'feed') / 6), 3);
  assert.equal(Math.floor(reactionFrame('pet_dog', 1700, 'feed') / 6), 0);
});
