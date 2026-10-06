import type { DocRect } from './drawingWorld.ts';
import type { Camera, DocumentSize } from './useHandwritingInput.ts';

/** 화면과 월드의 교집합을 월드 원점 기준 CSS 좌표로 돌려준다. */
export function visibleInkViewport(world: DocRect, camera: Camera, viewport: DocumentSize): DocRect {
  const x = Math.max(0, Math.min(world.width, -camera.x / camera.scale - world.x));
  const y = Math.max(0, Math.min(world.height, -camera.y / camera.scale - world.y));
  const right = Math.min(world.width, (viewport.width - camera.x) / camera.scale - world.x);
  const bottom = Math.min(world.height, (viewport.height - camera.y) / camera.scale - world.y);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}
