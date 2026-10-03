import test from 'node:test';
import assert from 'node:assert/strict';
import { LASER_FADE_MS, LASER_REDUCED_FADE_MS, laserFade, trimTrail } from '../../src/features/exam/ink/inkLaser.ts';
import type { LaserTrail } from '../../src/features/exam/ink/inkLaser.ts';

const trail = (endedAt: number | null): LaserTrail => ({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], endedAt });

test('a laser trail stays while drawing and vanishes from its old end about a second after lifting the pen', () => {
  assert.deepEqual(laserFade(trail(null), 99999, false), { cut: 0, alpha: 1 }, 'fully visible while drawing');
  const start = laserFade(trail(1000), 1000, false);
  assert.deepEqual(start, { cut: 0, alpha: 1 });
  const mid = laserFade(trail(1000), 1000 + LASER_FADE_MS / 2, false);
  assert.ok(mid && mid.cut > 0.3 && mid.cut < 0.7 && mid.alpha === 1, JSON.stringify(mid));
  const late = laserFade(trail(1000), 1000 + LASER_FADE_MS * 0.9, false);
  assert.ok(late && late.cut > 0.9 && late.alpha < 0.5, JSON.stringify(late));
  assert.equal(laserFade(trail(1000), 1000 + LASER_FADE_MS, false), null, 'gone');
  assert.ok(LASER_FADE_MS >= 800 && LASER_FADE_MS <= 1200);
});

test('reduced motion: a plain fade without eating the tail', () => {
  const mid = laserFade(trail(0), LASER_REDUCED_FADE_MS / 2, true);
  assert.deepEqual(mid, { cut: 0, alpha: 0.5 });
  assert.equal(laserFade(trail(0), LASER_REDUCED_FADE_MS, true), null);
});

test('trimming removes the oldest part of the trail by length', () => {
  const pts = trail(0).points;
  assert.equal(trimTrail(pts, 0), pts);
  assert.deepEqual(trimTrail(pts, 0.25), [{ x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
  assert.deepEqual(trimTrail(pts, 0.75), [{ x: 1.5, y: 0 }, { x: 2, y: 0 }]);
  assert.deepEqual(trimTrail(pts, 1), []);
});
