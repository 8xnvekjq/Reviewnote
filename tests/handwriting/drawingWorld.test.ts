import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeExportRect, getDrawingWorld, WORLD_PAD_RATIO } from '../../src/features/handwriting/drawingWorld.ts';

const doc = { width: 1600, height: 1200 };
const world = getDrawingWorld(doc);
// react-sketch-canvas 내부 좌표(월드 박스 왼쪽 위 기준) → 문서 좌표 역변환용
const pt = (docX: number, docY: number) => ({ x: docX - world.x, y: docY - world.y });

test('world surrounds the document by one document size on every side', () => {
  assert.equal(WORLD_PAD_RATIO, 1);
  assert.deepEqual(world, { x: -1600, y: -1200, width: 4800, height: 3600 });
  // 문서 사각형은 월드 한가운데 — 문서 좌표 (0,0)~(W,H)는 그대로 유지된다
  assert.equal(world.x + world.width, doc.width + 1600);
  assert.equal(world.y + world.height, doc.height + 1200);
});

test('blank notebook world is based on its locked initial viewport size', () => {
  assert.deepEqual(getDrawingWorld({ width: 358, height: 371 }), { x: -358, y: -371, width: 1074, height: 1113 });
});

test('no strokes or strokes inside the document keep the export identical to the document', () => {
  const docRect = { x: 0, y: 0, width: 1600, height: 1200 };
  assert.deepEqual(computeExportRect(doc, world, []), docRect);
  const inside = { paths: [pt(100, 100), pt(1500, 1100)], strokeWidth: 10, drawMode: true };
  assert.deepEqual(computeExportRect(doc, world, [inside]), docRect);
});

test('strokes drawn in the white space outside the document extend the export area', () => {
  const right = { paths: [pt(1900, 500), pt(2100, 600)], strokeWidth: 8, drawMode: true };
  const above = { paths: [pt(300, -400)], strokeWidth: 8, drawMode: true };
  const rect = computeExportRect(doc, world, [right, above]);
  // 반지름 4 + 여백 24
  assert.deepEqual(rect, { x: 0, y: -428, width: 2128, height: 1628 });
});

test('eraser strokes do not extend the export area', () => {
  const eraser = { paths: [pt(-900, -900)], strokeWidth: 60, drawMode: false };
  assert.deepEqual(computeExportRect(doc, world, [eraser]), { x: 0, y: 0, width: 1600, height: 1200 });
});

test('export area never leaves the drawing world and ignores invalid points', () => {
  const edge = { paths: [pt(-1600, -1200), pt(3200, 2400), { x: Number.NaN, y: 0 }], strokeWidth: 20, drawMode: true };
  assert.deepEqual(computeExportRect(doc, world, [edge]), world);
});
