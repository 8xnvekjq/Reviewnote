import { test } from 'node:test';
import assert from 'node:assert/strict';
import { facesPet, reactionFrame } from '../../src/features/pixel-world-phaser/logic/petReaction.ts';
import { PET_SHEETS } from '../../src/features/pixel-world-phaser/logic/petSheets.ts';
import type { PetId } from '../../src/features/pixel-room/pet/petKinds.ts';

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
