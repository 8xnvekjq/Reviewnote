// 기존 광장의 칸/충돌을 그대로 쓰고 카메라용 숲 여백만 더한다.
import { SCENERY, COURTYARD, PATHS, inRect } from '../../pixel-room/plaza/plazaLayout';
import { isWalkablePlaza, PLAZA_ENTRANCE, findSpawn } from '../../pixel-room/plaza/plazaModel';
import type { SceneSpec } from './scenes';
import type { Point } from './joystick';
import { TILE, cellCenter } from './world';
export const PLAZA_MARGIN = 5;
export const plazaCell = (p: Point): Point => ({ x: p.x + PLAZA_MARGIN, y: p.y + PLAZA_MARGIN });
export const plazaSolid = (p: Point) => !isWalkablePlaza({ x: p.x - PLAZA_MARGIN, y: p.y - PLAZA_MARGIN });
export function plazaScene(): SceneSpec {
  const targets = SCENERY.filter(s => ['shop', 'well', 'podium', 'notice', 'bench'].includes(s.kind));
  return {
    id: 'plaza', title: '광장', cols: 26, rows: 22, solid: plazaSolid,
    entries: { yard: { cell: plazaCell(findSpawn()), facing: 'Back' } }, defaultEntry: 'yard',
    exits: [{ id: 'yard', cells: [plazaCell(PLAZA_ENTRANCE)], to: { scene: 'yard', entry: 'plaza' } }],
    interactables: targets.map((s, i) => {
      const cells = Array.from({ length: s.footprint.w * s.footprint.h }, (_, n) => plazaCell({ x: s.footprint.x + n % s.footprint.w, y: s.footprint.y + Math.floor(n / s.footprint.w) }));
      const panel = s.kind === 'shop' ? 'shop' : s.kind === 'well' ? 'well' : s.kind === 'bench' ? 'bench' : 'contest';
      return { id: s.kind === 'bench' ? 'bench:' + i : s.kind, cell: cells[0], cells,
        label: { shop: '광장 상점', well: '우물', podium: '토마토 대회', notice: '게시판', bench: '벤치', tree: '', bush: '', fence: '' }[s.kind],
        verb: s.kind === 'shop' ? '상점 열기' : '살펴보기', action: { kind: 'panel' as const, panel },
        bang: { x: (s.x + PLAZA_MARGIN + s.w / 2) * TILE, y: (s.y + PLAZA_MARGIN) * TILE } };
    }),
  };
}
export function plazaGroundTile(x: number, y: number): number {
  if (PATHS.some(r => inRect({ x, y }, r))) return 25;
  if (inRect({ x, y }, COURTYARD)) {
    const col = x === COURTYARD.x ? 0 : x === COURTYARD.x + COURTYARD.w - 1 ? 2 : 1;
    const row = y === COURTYARD.y ? 0 : y === COURTYARD.y + COURTYARD.h - 1 ? 2 : 1;
    return 12 + col + row * 12;
  }
  return (x * 13 + y * 7) % 19 === 0 ? 2 : (x + y * 3) % 4 === 0 ? 1 : 0;
}
export const plazaFeet = (p: Point) => cellCenter(plazaCell(p));
