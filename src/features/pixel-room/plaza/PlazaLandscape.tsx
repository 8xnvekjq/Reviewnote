import { memo } from 'react';
import town from './assets/tiny-town.png';
import { COURTYARD, PATHS, SCENERY, inRect } from './plazaLayout';
import type { PlazaRect } from './plazaLayout';
import { PLAZA_WIDTH, PLAZA_HEIGHT } from './types';

function rectStyle(rect: PlazaRect) {
  return { left: `${rect.x / PLAZA_WIDTH * 100}%`, top: `${rect.y / PLAZA_HEIGHT * 100}%`, width: `${rect.w / PLAZA_WIDTH * 100}%`, height: `${rect.h / PLAZA_HEIGHT * 100}%` };
}
function Tile({ id }: { id: number }) {
  return <svg viewBox={`${id % 12 * 16} ${Math.floor(id / 12) * 16} 16 16`} overflow="hidden"><image href={town} width="192" height="176" /></svg>;
}
function pathTile(x: number, y: number): number {
  if (PATHS.some(rect => inRect({ x, y }, rect))) return 25;
  if (inRect({ x, y }, COURTYARD)) {
    const col = x === COURTYARD.x ? 0 : x === COURTYARD.x + COURTYARD.w - 1 ? 2 : 1;
    const row = y === COURTYARD.y ? 0 : y === COURTYARD.y + COURTYARD.h - 1 ? 2 : 1;
    return 12 + col + row * 12;
  }
  if (PATHS.some(rect => inRect({ x, y }, rect))) return 25;
  if ((x * 13 + y * 7) % 19 === 0) return 2;
  return (x + y * 3) % 4 === 0 ? 1 : 0;
}
const terrain = Array.from({ length: PLAZA_WIDTH * PLAZA_HEIGHT }, (_, i) => ({ x: i % PLAZA_WIDTH, y: Math.floor(i / PLAZA_WIDTH) }));

/** Static artwork only. No realtime subscriptions or persistence. */
export const PlazaLandscape = memo(function PlazaLandscape() {
  return <>
    <div className="pr-hub-ground" aria-hidden="true">{terrain.map(({ x, y }) => <Tile key={`${x}-${y}`} id={pathTile(x, y)} />)}</div>
    {SCENERY.map((item, index) => <div key={index} className={`pr-hub-scenery pr-hub-${item.kind}`} aria-hidden="true" style={{ ...rectStyle(item), zIndex: item.footprint.y + item.footprint.h }}>
      {item.kind === 'tree' && <svg viewBox="64 0 16 32" overflow="hidden"><image href={town} width="192" height="176" /></svg>}
      {item.kind === 'well' && <svg viewBox="128 112 16 32" overflow="hidden"><image href={town} width="192" height="176" /></svg>}
      {item.kind === 'bush' && <Tile id={28} />}
      {item.kind === 'fence' && Array.from({ length: item.w }, (_, i) => <Tile key={i} id={i === 0 ? 80 : i === item.w - 1 ? 82 : 81} />)}
      {item.kind === 'bench' && <><i /><i /><span /></>}
      {item.kind === 'notice' && <><div className="pr-hub-notice-roof" /><div className="pr-hub-notice-paper"><i /><i /><i /></div><span /></>}
    </div>)}
    <div className="pr-hub-doorstep" aria-hidden="true" style={rectStyle({ x: 8, y: 11, w: 1, h: 1 })}>↓</div>
  </>;
});
