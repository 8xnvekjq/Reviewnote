import type { InkStroke } from '../exam/contract.ts';
import { HIGHLIGHTER_OPACITY, INK_REFERENCE_WIDTH, strokePolyline, strokeWidth } from '../exam/ink/inkModel.ts';
import { drawStroke } from '../exam/ink/inkRender.ts';
import { computeExportRect, type DocRect } from './drawingWorld.ts';

/** 정규화된 시험 획을 기존 필기 월드의 저장 범위 계산에 연결한다. */
export function examInkPaths(strokes: InkStroke[], world: DocRect) {
  return strokes.map(stroke => ({
    drawMode: true,
    strokeWidth: strokeWidth(stroke) * world.width,
    paths: strokePolyline(stroke).map(p => ({ x: p.x * world.width, y: p.y * world.width })),
  }));
}

export function examInkExportRect(doc: { width: number; height: number }, world: DocRect, strokes: InkStroke[]) {
  return computeExportRect(doc, world, examInkPaths(strokes, world));
}

/** 화면과 동일하게 형광펜을 별도 레이어에서 합성하고 펜을 위에 그린다. */
export function paintExamInk(ctx: CanvasRenderingContext2D, strokes: InkStroke[], world: DocRect) {
  const layer = document.createElement('canvas');
  layer.width = ctx.canvas.width;
  layer.height = ctx.canvas.height;
  const highlight = layer.getContext('2d');
  if (!highlight) throw new Error('형광펜 레이어를 만들 수 없습니다.');
  highlight.setTransform(ctx.getTransform());
  highlight.translate(world.x, world.y);
  highlight.scale(world.width / INK_REFERENCE_WIDTH, world.width / INK_REFERENCE_WIDTH);
  for (const stroke of strokes) if (stroke.tool === 'highlighter') drawStroke(highlight, stroke);
  ctx.save();
  ctx.resetTransform();
  ctx.globalAlpha = HIGHLIGHTER_OPACITY;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(world.x, world.y);
  ctx.scale(world.width / INK_REFERENCE_WIDTH, world.width / INK_REFERENCE_WIDTH);
  for (const stroke of strokes) if (stroke.tool === 'pen') drawStroke(ctx, stroke);
  ctx.restore();
}
