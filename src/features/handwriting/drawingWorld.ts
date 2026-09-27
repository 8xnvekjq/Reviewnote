import type { DocumentSize } from './useHandwritingInput';

// 필기 "월드" — 문서(문제 이미지 / 새 필기장 초기 크기) 바깥의 흰 여백까지 포함한 실제 필기 가능 영역.
//
// PR1(#43)부터 react-sketch-canvas의 SVG 박스가 documentSize와 정확히 같은 크기로 고정되고,
// 그 바깥 pointerdown은 무시되며, 팬도 문서 가장자리 + 80px까지만 허용됐다. 그래서 확대 후 문서
// 밖 흰 공간으로 이동하면 보이기는 해도 필기는 안 되는 "고정 사각형"이 생겼다(회귀).
//
// 좌표계 자체는 바꾸지 않는다: 카메라(scale/x/y)와 배경 이미지는 계속 문서 좌표 (0,0)~(W,H)
// 기준이고, SVG 박스만 문서 좌표 (world.x, world.y)부터 world.width×height 크기로 넓힌다.
// react-sketch-canvas 내부 좌표 = 문서 좌표 - (world.x, world.y). 문서 각 변 바깥으로 문서
// 크기만큼(가로 W, 세로 H) 여백을 둔다 — 최대 확대(맞춤의 4.5배)에서도 충분히 넓은 작업 공간이면서
// SVG 크기(최대 약 4800px)가 과하지 않은 선.
export const WORLD_PAD_RATIO = 1;

export interface DocRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getDrawingWorld(doc: DocumentSize): DocRect {
  const padX = Math.round(doc.width * WORLD_PAD_RATIO);
  const padY = Math.round(doc.height * WORLD_PAD_RATIO);
  return { x: -padX, y: -padY, width: doc.width + padX * 2, height: doc.height + padY * 2 };
}

/** react-sketch-canvas의 CanvasPath 중 저장 범위 계산에 필요한 필드만. */
export interface StrokeLike {
  paths: ReadonlyArray<{ x: number; y: number }>;
  strokeWidth: number;
  drawMode: boolean;
}

// 저장 이미지에 문서 밖 필기가 잘리지 않도록 붙이는 여백(문서 좌표 단위).
const EXPORT_MARGIN = 24;

/**
 * 저장할 영역(문서 좌표). 기본은 문서 전체이고, 문서 밖에 그린 펜 획이 있으면 그 획까지 포함하도록
 * 넓힌다(월드 경계 안으로 제한). 문서 밖 필기가 없으면 결과가 문서 사각형과 정확히 같아서 기존
 * 저장 결과와 동일하다. 지우개 획(drawMode=false)은 그리는 게 아니라 가리는 것이라 범위에서 뺀다.
 */
export function computeExportRect(doc: DocumentSize, world: DocRect, strokes: ReadonlyArray<StrokeLike>): DocRect {
  let minX = 0;
  let minY = 0;
  let maxX = doc.width;
  let maxY = doc.height;
  for (const stroke of strokes) {
    if (!stroke.drawMode) continue;
    const r = stroke.strokeWidth / 2 + EXPORT_MARGIN;
    for (const p of stroke.paths) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const x = p.x + world.x;
      const y = p.y + world.y;
      if (x - r < minX) minX = x - r;
      if (y - r < minY) minY = y - r;
      if (x + r > maxX) maxX = x + r;
      if (y + r > maxY) maxY = y + r;
    }
  }
  minX = Math.floor(Math.max(world.x, minX));
  minY = Math.floor(Math.max(world.y, minY));
  maxX = Math.ceil(Math.min(world.x + world.width, maxX));
  maxY = Math.ceil(Math.min(world.y + world.height, maxY));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
