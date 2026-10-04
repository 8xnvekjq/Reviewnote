import test from 'node:test';
import assert from 'node:assert/strict';
import { MULTI_TAP_GAP_MS, MULTI_TAP_MOVE_PX, MULTI_TAP_MS, MULTI_TAP_SPREAD_MS, MultiFingerTap } from '../../src/features/exam/ink/multiTap.ts';

/** 손가락 n개로 t에 탭(downs: 손가락별 닿는 시각 차, hold: 누른 시간). 마지막 up의 결과를 돌려준다. */
function tap(d: MultiFingerTap, t: number, n: number, { hold = 80, spread = 20, move = 0, firstId = 1 } = {}) {
  let result = null;
  for (let i = 0; i < n; i++) d.down(firstId + i, 100 * i, 100, t + i * (spread / Math.max(1, n - 1)));
  for (let i = 0; i < n; i++) if (move) d.move(firstId + i, 100 * i + move, 100);
  for (let i = 0; i < n; i++) result = d.up(firstId + i, t + hold + i) ?? result;
  return result;
}

test('two-finger double tap undoes, three-finger double tap redoes', () => {
  const d = new MultiFingerTap();
  assert.equal(tap(d, 0, 2), null, 'first tap only arms');
  assert.equal(tap(d, 300, 2, { firstId: 10 }), 'undo');
  assert.equal(tap(d, 2000, 3), null);
  assert.equal(tap(d, 2300, 3, { firstId: 10 }), 'redo');
});

test('a fired double tap does not chain into a third tap', () => {
  const d = new MultiFingerTap();
  tap(d, 0, 2);
  assert.equal(tap(d, 300, 2), 'undo');
  assert.equal(tap(d, 600, 2), null, 'the third tap starts a new pair');
  assert.equal(tap(d, 900, 2), 'undo');
});

test('taps too far apart, too long, too spread or moving are ignored', () => {
  let d = new MultiFingerTap();
  tap(d, 0, 2);
  assert.equal(tap(d, 80 + 1 + MULTI_TAP_GAP_MS + 1, 2), null, 'second tap came too late');

  d = new MultiFingerTap();
  tap(d, 0, 2, { hold: MULTI_TAP_MS + 10 });
  assert.equal(tap(d, MULTI_TAP_MS + 100, 2), null, 'a long press is not a tap');

  d = new MultiFingerTap();
  tap(d, 0, 2, { spread: MULTI_TAP_SPREAD_MS + 20 });
  assert.equal(tap(d, 300, 2), null, 'fingers that land one after another are not one tap');

  d = new MultiFingerTap();
  tap(d, 0, 2, { move: MULTI_TAP_MOVE_PX + 3 });
  assert.equal(tap(d, 300, 2), null, 'a pinch or two-finger scroll is not a tap');

  d = new MultiFingerTap();
  tap(d, 0, 2, { move: MULTI_TAP_MOVE_PX - 4 });
  assert.equal(tap(d, 300, 2), 'undo', 'small finger wobble is still a tap');
});

test('finger count must match, and one-finger touches break the sequence', () => {
  let d = new MultiFingerTap();
  tap(d, 0, 2);
  assert.equal(tap(d, 300, 3), null, 'two then three fingers is not a double tap');
  assert.equal(tap(d, 600, 3), 'redo', 'but the three-finger tap armed its own pair');

  d = new MultiFingerTap();
  tap(d, 0, 2);
  tap(d, 150, 1);
  assert.equal(tap(d, 300, 2), null, 'a single finger in between resets');

  d = new MultiFingerTap();
  tap(d, 0, 4);
  assert.equal(tap(d, 300, 4), null, 'four fingers do nothing');
});

test('cancel and pen input invalidate the tap', () => {
  let d = new MultiFingerTap();
  tap(d, 0, 2);
  d.down(1, 0, 0, 300); d.down(2, 50, 0, 310);
  d.cancel(1);
  assert.equal(d.up(2, 350), null, 'pointercancel spoils the tap');

  d = new MultiFingerTap();
  tap(d, 0, 2);
  d.down(1, 0, 0, 300); d.down(2, 50, 0, 310);
  d.invalidate();
  d.up(1, 340);
  assert.equal(d.up(2, 345), null, 'touches during a pen stroke are not taps');
});

test('multi is reported while two fingers are (or were) down in the current group', () => {
  const d = new MultiFingerTap();
  assert.equal(d.down(1, 0, 0, 0), 1);
  assert.equal(d.multi, false);
  assert.equal(d.down(2, 10, 0, 20), 2);
  assert.equal(d.multi, true);
  d.up(1, 60);
  assert.equal(d.active, 1);
  assert.equal(d.multi, true, 'still the same multi-finger group until every finger lifts');
  d.up(2, 70);
  assert.equal(d.active, 0);
  assert.equal(d.multi, false);
});
