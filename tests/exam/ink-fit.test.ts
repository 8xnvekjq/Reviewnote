import test from 'node:test';
import assert from 'node:assert/strict';
import { INK_FIT_PAD, compositeBounds, compositeScale, fitExtraBelow, fitImageWidth, inkExtent, replayStrokeLists } from '../../src/features/exam/ink/inkFit.ts';
import { inkExtraBelow, strokeWidth } from '../../src/features/exam/ink/inkModel.ts';
import type { InkReplayData, InkStroke } from '../../src/features/exam/contract.ts';

const pt = (x: number, y: number) => ({ x, y, pressure: 0.5, t: 0 });
const pen = (id: string, points: Array<[number, number]>, size = 4): InkStroke => ({ id, tool: 'pen', color: '#000', size, points: points.map(([x, y]) => pt(x, y)) });
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

test('ink extent reaches the right/bottom edge of every stroke including half its width', () => {
  const a = pen('a', [[0.1, 0.2], [0.5, 0.4]]);
  const b = pen('b', [[1.8, 0.3], [1.9, 2.6]], 7);
  const extent = inkExtent([a], [b]);
  near(extent.maxX, 1.9 + strokeWidth(b) / 2);
  near(extent.maxY, 2.6 + strokeWidth(b) / 2);
  assert.deepEqual(inkExtent([], null, undefined), { maxX: 0, maxY: 0 }, 'no ink → nothing to fit');
});

test('shape strokes use their geometry for the extent', () => {
  const circle: InkStroke = { id: 'c', tool: 'pen', color: '#000', size: 4, points: [pt(1, 1)], shape: { kind: 'ellipse', cx: 1.5, cy: 1, rx: 0.3, ry: 0.2, rotation: 0 } };
  const extent = inkExtent([circle]);
  assert.ok(extent.maxX > 1.79 && extent.maxX < 1.82, `ellipse right edge ${extent.maxX}`);
});

test('reading canvas keeps the image size when ink stays on the image', () => {
  assert.equal(fitImageWidth(952, 480, { maxX: 0.9, maxY: 1 }), 480);
  assert.equal(fitImageWidth(952, 480, null), 480);
  assert.equal(fitImageWidth(300, 480, { maxX: 0.9, maxY: 1 }), 300, 'narrow phone still fills the width');
  assert.equal(fitImageWidth(952, undefined, undefined), 952);
});

test('reading canvas shrinks the image just enough to show ink in the right margin', () => {
  // 풀이 화면(980px, 이미지 480px)의 오른쪽 끝까지 쓴 필기 ≈ 2.04 단위
  const imgW = fitImageWidth(952, 480, { maxX: 980 / 480, maxY: 1 });
  near(imgW, 952 / (980 / 480 + INK_FIT_PAD));
  assert.ok(imgW * (980 / 480) <= 952, 'the rightmost ink is inside the container');
  // 관리자 '풀이 중' 검토(본문 860px)
  const admin = fitImageWidth(860, 480, { maxX: 2, maxY: 1 });
  assert.ok(admin * 2 <= 860 && admin > 400);
  // 한능검 원본 페이지: 필기는 이미지 안(≤ 1)이라 그대로
  assert.equal(fitImageWidth(952, 980, { maxX: 0.98, maxY: 1.2 }), 952);
});

test('room below the image grows only when ink goes further down', () => {
  assert.equal(fitExtraBelow(0.5, { maxX: 1, maxY: 1.2 }), inkExtraBelow(0.5));
  near(fitExtraBelow(0.5, { maxX: 1, maxY: 2.5 }), 2.5 + INK_FIT_PAD - 0.5);
  assert.equal(fitExtraBelow(0, { maxX: 1, maxY: 5 }), 0, 'nothing before the image has loaded');
});

test('replay extent includes strokes that were later erased', () => {
  const kept = pen('k', [[0.2, 0.2]]);
  const erased = pen('e', [[1.7, 0.4]]);
  const data: InkReplayData = { revision: 2, strokes: [kept], batches: [{ id: 'b', revision: 2, baseRevision: 0, baseline: null, events: [
    { id: 'e1', kind: 'draw', at: 1, added: [{ index: 0, stroke: kept }, { index: 1, stroke: erased }], removed: [] },
    { id: 'e2', kind: 'erase', at: 2, added: [], removed: ['e'] },
  ] }] };
  assert.ok(inkExtent(...replayStrokeLists(data)).maxX > 1.7);
  assert.deepEqual(replayStrokeLists(null), []);
});

test('composite covers the whole image and widens/lengthens for ink outside it', () => {
  assert.deepEqual(compositeBounds(1.2, { maxX: 0.5, maxY: 0.5 }), { width: 1, height: 1.2 }, 'ink on the image → just the image');
  const wide = compositeBounds(0.6, { maxX: 1.9, maxY: 2.1 });
  near(wide.width, 1.9 + INK_FIT_PAD);
  near(wide.height, 2.1 + INK_FIT_PAD);
});

test('composite pixel scale never upscales and caps huge pictures', () => {
  assert.equal(compositeScale(600, { width: 1, height: 1 }), 600, 'small images keep their own size');
  assert.equal(compositeScale(1600, { width: 1, height: 1 }), 900, 'big images are capped per unit');
  const tall = compositeScale(1600, { width: 2, height: 4 });
  assert.ok(tall * 4 <= 2400 + 1e-9, 'longest side capped');
  assert.ok(2 * 4 * tall * tall <= 4_000_000 + 1e-6, 'pixel count capped');
});
