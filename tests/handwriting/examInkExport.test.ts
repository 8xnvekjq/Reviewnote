import { test } from 'node:test';
import assert from 'node:assert/strict';
import { examInkExportRect, examInkPaths } from '../../src/features/handwriting/examInkExport.ts';
import type { InkStroke } from '../../src/features/exam/contract.ts';
const doc = { width: 100, height: 80 };
const world = { x: -100, y: -80, width: 300, height: 240 };
const stroke = (points: Array<{ x: number; y: number }>): InkStroke => ({ id: 'a', tool: 'pen', color: '#dc2626', size: 3, points: points.map(p => ({ ...p, pressure: .5, t: 0 })) });

test('empty and inside-document ink preserve the original saved document bounds', () => {
  assert.deepEqual(examInkExportRect(doc, world, []), { x: 0, y: 0, ...doc });
  assert.deepEqual(examInkExportRect(doc, world, [stroke([{ x: .5, y: .4 }])]), { x: 0, y: 0, ...doc });
});
test('outside ink expands PNG bounds in document coordinates, capped to the drawing world', () => {
  assert.deepEqual(examInkExportRect(doc, world, [stroke([{ x: 0, y: 0 }, { x: 1, y: .8 }])]), world);
});
test('snapped shapes use their final geometry instead of the pre-snap pen points', () => {
  const s = stroke([{ x: .5, y: .4 }]);
  s.shape = { kind: 'line', from: [0, 0], to: [1, .8] };
  const paths = examInkPaths([s], world);
  assert.equal(paths[0].paths[0].x, 0);
  assert.equal(paths[0].paths.at(-1)!.x, 300);
  assert.deepEqual(examInkExportRect(doc, world, [s]), world);
});
test('highlighter bounds include its wider stroke; removed strokes do not affect export', () => {
  const s = stroke([{ x: .4, y: .4 }]);
  const penWidth = examInkPaths([s], world)[0].strokeWidth;
  s.tool = 'highlighter';
  assert.equal(examInkPaths([s], world)[0].strokeWidth, penWidth * 3.5);
  assert.deepEqual(examInkExportRect(doc, world, []), { x: 0, y: 0, ...doc });
});
