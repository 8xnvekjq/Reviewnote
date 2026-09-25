// One small, fixed outdoor map. Ground, scenery and collision share the same cell coordinates.
import { PLAZA_HEIGHT, PLAZA_WIDTH } from './types';
export interface PlazaRect { x: number; y: number; w: number; h: number }
// Grid-cell rect -> CSS percentage box, relative to the whole PLAZA_WIDTH x PLAZA_HEIGHT board.
// Lives here (not PlazaLandscape.tsx) so non-component files (CropExhibit.tsx) can import it
// without triggering the fast-refresh-only-exports-components lint rule on a component file.
export function rectStyle(rect: PlazaRect) {
  return { left: `${rect.x / PLAZA_WIDTH * 100}%`, top: `${rect.y / PLAZA_HEIGHT * 100}%`, width: `${rect.w / PLAZA_WIDTH * 100}%`, height: `${rect.h / PLAZA_HEIGHT * 100}%` };
}
export interface PlazaScenery extends PlazaRect {
  kind: 'tree' | 'bush' | 'well' | 'bench' | 'notice' | 'fence' | 'podium' | 'shop';
  footprint: PlazaRect;
}
export const COURTYARD: PlazaRect = { x: 4, y: 3, w: 8, h: 6 };
export const PATHS: PlazaRect[] = [
  { x: 7, y: 8, w: 3, h: 4 },
  { x: 2, y: 5, w: 3, h: 2 },
  { x: 11, y: 7, w: 4, h: 1 },
];
// Mirrors the notice board's own shape/placement (x10,y2, footprint one row into the courtyard) on
// the opposite side, so the two read as a matched pair framing the well. The podium itself (the
// stand) is always-visible static scenery, drawn here; the tomato sitting ON it is dynamic (fetched
// live) and lives in CropExhibit.tsx, positioned against this same PODIUM rect — same split as
// 'well' (static, here) vs. PlazaActivities.tsx (dynamic, the well's popup logic).
export const PODIUM: PlazaScenery = { kind: 'podium', x: 4, y: 2, w: 2, h: 2, footprint: { x: 4, y: 3, w: 2, h: 1 } };
export const PLAZA_SHOP: PlazaScenery = { kind: 'shop', x: 12, y: 4, w: 3, h: 3, footprint: { x: 12, y: 5, w: 3, h: 2 } };
export function nearPlazaShop(cell: { x: number; y: number }): boolean {
  return cell.y === 7 && cell.x >= 12 && cell.x <= 14;
}
export const SCENERY: PlazaScenery[] = [
  PLAZA_SHOP,
  { kind: 'well', x: 7, y: 2, w: 2, h: 4, footprint: { x: 7, y: 5, w: 2, h: 1 } },
  { kind: 'notice', x: 10, y: 2, w: 2, h: 2, footprint: { x: 10, y: 3, w: 2, h: 1 } },
  PODIUM,
  { kind: 'bench', x: 4, y: 6, w: 2, h: 1, footprint: { x: 4, y: 6, w: 2, h: 1 } },
  { kind: 'bench', x: 10, y: 6, w: 2, h: 1, footprint: { x: 10, y: 6, w: 2, h: 1 } },
  { kind: 'tree', x: 1, y: 0, w: 2, h: 4, footprint: { x: 1, y: 3, w: 2, h: 1 } },
  { kind: 'tree', x: 13, y: 0, w: 2, h: 4, footprint: { x: 13, y: 3, w: 2, h: 1 } },
  { kind: 'tree', x: 0, y: 7, w: 2, h: 4, footprint: { x: 0, y: 10, w: 2, h: 1 } },
  { kind: 'tree', x: 14, y: 7, w: 2, h: 4, footprint: { x: 14, y: 10, w: 2, h: 1 } },
  { kind: 'bush', x: 0, y: 4, w: 1, h: 1, footprint: { x: 0, y: 4, w: 1, h: 1 } },
  { kind: 'bush', x: 2, y: 8, w: 1, h: 1, footprint: { x: 2, y: 8, w: 1, h: 1 } },
  { kind: 'bush', x: 12, y: 9, w: 1, h: 1, footprint: { x: 12, y: 9, w: 1, h: 1 } },
  { kind: 'bush', x: 15, y: 5, w: 1, h: 1, footprint: { x: 15, y: 5, w: 1, h: 1 } },
  { kind: 'fence', x: 4, y: 1, w: 3, h: 1, footprint: { x: 4, y: 1, w: 3, h: 1 } },
  { kind: 'fence', x: 10, y: 0, w: 3, h: 1, footprint: { x: 10, y: 0, w: 3, h: 1 } },
  { kind: 'fence', x: 3, y: 11, w: 4, h: 1, footprint: { x: 3, y: 11, w: 4, h: 1 } },
  { kind: 'fence', x: 10, y: 11, w: 3, h: 1, footprint: { x: 10, y: 11, w: 3, h: 1 } },
];
export function inRect(cell: { x: number; y: number }, rect: PlazaRect): boolean {
  return cell.x >= rect.x && cell.x < rect.x + rect.w && cell.y >= rect.y && cell.y < rect.y + rect.h;
}
export function isSceneryCell(cell: { x: number; y: number }): boolean {
  return SCENERY.some(item => inRect(cell, item.footprint));
}
