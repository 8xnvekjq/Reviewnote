import test from 'node:test';
import assert from 'node:assert/strict';
import { MULTI_TAP_MOVE_PX, MultiFingerTap } from '../../src/features/exam/ink/multiTap.ts';
import { MultiFingerPan } from '../../src/features/exam/ink/multiPan.ts';

/** 캔버스와 같은 순서로 두 판정기에 넣고, 스크롤 양을 모은다. */
function harness() {
  const taps = new MultiFingerTap();
  const pan = new MultiFingerPan();
  const scrolls: { dx: number; dy: number }[] = [];
  const actions: string[] = [];
  return {
    taps, pan, scrolls, actions,
    down(id: number, x: number, y: number, t: number) { taps.down(id, x, y, t); pan.down(id, x, y); },
    move(id: number, x: number, y: number) {
      taps.move(id, x, y);
      const d = pan.move(id, x, y);
      if (taps.multi && d) scrolls.push(d);
    },
    up(id: number, t: number) { pan.up(id); const a = taps.up(id, t); if (a) actions.push(a); },
    total() { return scrolls.reduce((s, d) => ({ dx: s.dx + d.dx, dy: s.dy + d.dy }), { dx: 0, dy: 0 }); },
  };
}

/** 두 손가락을 함께 (dx, dy)만큼 steps번에 나눠 민다. */
function drag2(h: ReturnType<typeof harness>, t: number, dx: number, dy: number, steps = 10) {
  h.down(1, 100, 300, t);
  h.down(2, 200, 300, t + 10);
  for (let i = 1; i <= steps; i++) {
    h.move(1, 100 + (dx * i) / steps, 300 + (dy * i) / steps);
    h.move(2, 200 + (dx * i) / steps, 300 + (dy * i) / steps);
  }
  h.up(1, t + 200);
  h.up(2, t + 210);
}

test('two fingers dragging together scroll by their average movement (all of it), and are not a tap', () => {
  const h = harness();
  drag2(h, 0, 0, -120);
  const { dx, dy } = h.total();
  assert.ok(Math.abs(dx) < 1e-9);
  assert.ok(Math.abs(dy + 120) < 1e-9, `content follows the fingers the whole way (got ${dy})`);
  drag2(h, 300, 0, -120);
  assert.deepEqual(h.actions, [], 'two drags in a row are never a double tap');
});

test('horizontal two-finger drag scrolls sideways', () => {
  const h = harness();
  drag2(h, 0, -80, 0);
  assert.ok(Math.abs(h.total().dx + 80) < 1e-9);
});

test('movement within the tap slop does not scroll, and a double still tap still undoes', () => {
  const h = harness();
  const still = (t: number) => {
    h.down(1, 100, 300, t); h.down(2, 200, 300, t + 10);
    h.move(1, 100 + MULTI_TAP_MOVE_PX - 2, 300); h.move(2, 200, 300 + 3);
    h.up(1, t + 80); h.up(2, t + 90);
  };
  still(0);
  still(300);
  assert.deepEqual(h.scrolls, []);
  assert.deepEqual(h.actions, ['undo']);
});

test('a pinch (fingers spreading symmetrically) does not scroll', () => {
  const h = harness();
  h.down(1, 100, 300, 0); h.down(2, 200, 300, 5);
  for (let i = 1; i <= 10; i++) { h.move(1, 100 - 4 * i, 300); h.move(2, 200 + 4 * i, 300); }
  const { dx, dy } = h.total();
  assert.ok(Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9);
});

test('one finger never multi-scrolls (single-finger draw/pan is handled elsewhere)', () => {
  const h = harness();
  h.down(1, 100, 300, 0);
  for (let i = 1; i <= 10; i++) h.move(1, 100, 300 - 10 * i);
  h.up(1, 300);
  assert.deepEqual(h.scrolls, []);
  assert.equal(h.pan.engaged, false);
});

test('a finger that moved before the second one landed does not make the scroll jump', () => {
  const h = harness();
  h.down(1, 100, 300, 0);
  h.move(1, 100, 200); // 한 손가락으로 쓰거나 스크롤하던 중
  h.down(2, 200, 200, 400);
  h.move(1, 100, 190); h.move(2, 200, 190);
  assert.equal(h.pan.engaged, false, '10px is still within the slop');
  h.move(1, 100, 180); h.move(2, 200, 180);
  assert.ok(Math.abs(h.total().dy + 20) < 1e-9);
});

test('lifting one finger keeps scrolling with the other, without a jump', () => {
  const h = harness();
  h.down(1, 100, 300, 0); h.down(2, 200, 300, 5);
  h.move(1, 100, 260); h.move(2, 200, 260);
  h.up(1, 100);
  h.move(2, 200, 240);
  assert.ok(Math.abs(h.total().dy + 60) < 1e-9);
  h.up(2, 120);
  assert.equal(h.pan.engaged, false, 'the group ends when all fingers are up');
});

test('a palm while the pen writes (blocked group) never scrolls', () => {
  const h = harness();
  h.pan.block(); // 펜이 없을 때는 아무 일도 없다
  h.down(1, 100, 300, 0);
  h.pan.block(); // 펜 획 중에 닿은 손
  h.down(2, 200, 300, 5);
  h.move(1, 100, 200); h.move(2, 200, 200);
  assert.deepEqual(h.scrolls, []);
  h.up(1, 50); h.up(2, 60);
  drag2(h, 1000, 0, -50);
  assert.ok(Math.abs(h.total().dy + 50) < 1e-9, 'the next group scrolls again');
});
