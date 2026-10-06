import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleInkViewport } from '../../src/features/handwriting/inkViewport.ts';

const world = { x: -1600, y: -2000, width: 4800, height: 6000 };
const viewport = { width: 820, height: 1180 };

test('visible ink backing area stays viewport-sized at fit, 2x and max zoom', () => {
  const fit = Math.min(viewport.width / 1600, viewport.height / 2000);
  for (const zoom of [1, 2, 4.5]) {
    const scale = fit * zoom;
    const view = visibleInkViewport(world, { x: -120, y: -60, scale }, viewport);
    assert(Math.abs(view.width * scale - viewport.width) < 1e-9);
    assert(Math.abs(view.height * scale - viewport.height) < 1e-9);
    const width = Math.round(view.width * scale * 2), height = Math.round(view.height * scale * 2);
    assert.equal(width * height, 3_870_400);
    assert(width * height < 16_000_000);
    assert(width / (view.width * scale) >= .95 * 2);
    assert(height / (view.height * scale) >= .95 * 2);
  }
});

test('clipped world edges exclude the blank space beyond the world', () => {
  const small = { x: -100, y: -100, width: 300, height: 300 };
  assert.deepEqual(visibleInkViewport(small, { x: 150, y: 150, scale: 1 }, { width: 200, height: 200 }),
    { x: 0, y: 0, width: 150, height: 150 });
  assert.deepEqual(visibleInkViewport(small, { x: -150, y: -150, scale: 1 }, { width: 200, height: 200 }),
    { x: 250, y: 250, width: 50, height: 50 });
  assert.deepEqual(visibleInkViewport(small, { x: -500, y: -500, scale: 1 }, { width: 200, height: 200 }),
    { x: 300, y: 300, width: 0, height: 0 });
});

test('cropped canvas rendering maps normalized world points to the same screen position', () => {
  for (const scale of [.5125, 1.025, 2.30625]) {
    for (const [x, y] of [[0, 0], [-1200, -1300], [700, 850]]) {
      const camera = { x, y, scale };
      const view = visibleInkViewport(world, camera, viewport);
      const point = { x: .6, y: .7 };
      const screenX = camera.x + (world.x + point.x * world.width) * scale;
      const screenY = camera.y + (world.y + point.y * world.width) * scale;
      const canvasLeft = camera.x + (world.x + view.x) * scale;
      const canvasTop = camera.y + (world.y + view.y) * scale;
      assert(Math.abs(canvasLeft + (point.x * world.width - view.x) * scale - screenX) < 1e-9);
      assert(Math.abs(canvasTop + (point.y * world.width - view.y) * scale - screenY) < 1e-9);
    }
  }
});
