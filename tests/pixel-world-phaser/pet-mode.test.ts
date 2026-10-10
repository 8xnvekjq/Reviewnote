import { test } from 'node:test';
import assert from 'node:assert/strict';
import { petMode } from '../../src/features/pixel-world-phaser/logic/petMode.ts';
import type { SceneId } from '../../src/features/pixel-world-phaser/logic/scenes.ts';

for (const scene of ['yard', 'room', 'river', 'plaza'] as SceneId[]) {
  test(`${scene}: per-scene pet mode and deterministic override`, () => {
    assert.equal(petMode(scene), scene === 'yard' || scene === 'room' ? 'roam' : 'follow');
    assert.equal(petMode(scene, true), 'follow');
    assert.equal(petMode(scene, false), petMode(scene));
  });
}
test('scene transitions switch roaming to following and back', () => {
  assert.deepEqual(['yard', 'river', 'yard', 'plaza', 'yard', 'room'].map(scene => petMode(scene as SceneId)),
    ['roam', 'follow', 'roam', 'follow', 'roam', 'roam']);
});
