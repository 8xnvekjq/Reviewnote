import test from 'node:test';
import assert from 'node:assert/strict';
import { LASER_FADE_MS, LASER_HOLD_MS, laserAlpha } from '../../src/features/exam/ink/inkLaser.ts';
import type { LaserTrail } from '../../src/features/exam/ink/inkLaser.ts';

const trail = (endedAt: number | null): LaserTrail => ({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], endedAt });

test('a laser stroke stays whole while drawing and for 1 second after lifting, then fades out gradually', () => {
  assert.equal(laserAlpha(trail(null), 99999), 1, 'fully visible while drawing, however long');
  assert.equal(LASER_HOLD_MS, 1000);
  assert.equal(laserAlpha(trail(1000), 1000), 1);
  assert.equal(laserAlpha(trail(1000), 1000 + LASER_HOLD_MS - 1), 1, 'still whole just before 1 second');
  const mid = laserAlpha(trail(1000), 1000 + LASER_HOLD_MS + LASER_FADE_MS / 2)!;
  assert.ok(mid > 0.3 && mid < 0.7, String(mid));
  const late = laserAlpha(trail(1000), 1000 + LASER_HOLD_MS + LASER_FADE_MS * 0.9)!;
  assert.ok(late > 0 && late < mid);
  assert.equal(laserAlpha(trail(1000), 1000 + LASER_HOLD_MS + LASER_FADE_MS), null, 'gone');
});
