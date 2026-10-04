import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IDENTITY, MAX_SCALE, MIN_SCALE, TAP_MAX_MS, clampPan, clampScale, dragView, isTap, pinchView, startGesture, trackMove,
  trackPointers, wheelScale, zoomAt,
} from '../../src/features/exam/ui/imageViewerGesture.ts';

const base = { w: 400, h: 300 };
const viewport = { w: 400, h: 600 };

test('image viewer: scale is clamped to 1~5', () => {
  assert.equal(clampScale(0.3), MIN_SCALE);
  assert.equal(clampScale(9), MAX_SCALE);
  assert.equal(clampScale(2.5), 2.5);
  assert.equal(clampScale(Number.NaN), MIN_SCALE);
  assert.equal(wheelScale(5, -10_000, false), 5);
  assert.equal(wheelScale(1, 10_000, true), 1);
  assert.ok(wheelScale(1, -100, false) > 1, '휠 위로 = 확대');
  assert.ok(wheelScale(2, 100, true) < 2, 'ctrl+휠 아래로 = 축소');
});

test('image viewer: a short still single touch is a tap', () => {
  let g = startGesture(0);
  g = trackMove(g, { x: 0, y: 0 }, { x: 4, y: 3 });
  assert.equal(isTap(g, 120), true);
  assert.equal(isTap(g, TAP_MAX_MS + 1), false, '길게 누른 건 탭이 아니다');
});

test('image viewer: drag and pinch are not taps', () => {
  const dragged = trackMove(startGesture(0), { x: 0, y: 0 }, { x: 30, y: 0 });
  assert.equal(isTap(dragged, 100), false);
  // 손가락이 거의 안 움직였어도 두 손가락이 닿았으면 핀치(닫지 않음)
  const pinched = trackPointers(startGesture(0), 2);
  assert.equal(isTap(trackPointers(pinched, 1), 100), false, '최대 포인터 수는 줄지 않는다');
  // 멀리 갔다가 제자리로 돌아와도 탭이 아니다
  const back = trackMove(trackMove(startGesture(0), { x: 0, y: 0 }, { x: 50, y: 0 }), { x: 0, y: 0 }, { x: 1, y: 0 });
  assert.equal(isTap(back, 100), false);
});

test('image viewer: pinch scales by finger distance within limits', () => {
  const start = { view: IDENTITY, mid: { x: 0, y: 0 }, distance: 100 };
  assert.equal(pinchView(start, { x: 0, y: 0 }, 200, base, viewport).scale, 2);
  assert.equal(pinchView(start, { x: 0, y: 0 }, 2000, base, viewport).scale, MAX_SCALE);
  const shrunk = pinchView(start, { x: 0, y: 0 }, 20, base, viewport);
  assert.deepEqual(shrunk, { scale: 1, x: 0, y: 0 }, '1배 아래로는 안 줄어들고 가운데로');
  assert.deepEqual(pinchView({ ...start, distance: 0 }, { x: 0, y: 0 }, 50, base, viewport), IDENTITY);
});

test('image viewer: zoom keeps the focal point and pan stays inside the image', () => {
  const zoomed = zoomAt(IDENTITY, 2, { x: 100, y: 0 }, base, viewport);
  assert.equal(zoomed.scale, 2);
  assert.equal(zoomed.x, -100, '오른쪽을 확대하면 이미지가 왼쪽으로 밀린다');
  assert.equal(zoomed.y, 0, '세로는 2배여도 화면(600)보다 작아 가운데 고정');
  // 이동 한계: (400*2-400)/2 = 200
  assert.deepEqual(clampPan({ scale: 2, x: 999, y: -999 }, base, viewport), { scale: 2, x: 200, y: 0 });
  assert.deepEqual(clampPan({ scale: 4, x: -999, y: 999 }, base, viewport), { scale: 4, x: -600, y: 300 });
});

test('image viewer: one-finger drag moves only when zoomed', () => {
  assert.deepEqual(dragView(IDENTITY, { x: 50, y: 50 }, base, viewport), IDENTITY);
  assert.deepEqual(dragView({ scale: 3, x: 0, y: 0 }, { x: 50, y: -40 }, base, viewport), { scale: 3, x: 50, y: -40 });
});
