// 텃밭 도구 막대: 텃밭 가까이에 오면 화면 위쪽(상단 칩 줄 아래)에 뜬다. 무료 도구(괭이·토마토 씨앗·딸기 씨앗·물뿌리개)와
// 상점에서 산 스프링클러 중 하나를 고르면, A(또는 밭 칸 콕 찍기)가 바라보는 칸에 그 도구를 쓴다. 익은 작물은 어떤 도구로든 딴다.
import type { CSSProperties, ReactNode } from 'react';
import town from '../../pixel-room/plaza/assets/tiny-town.png';
import { TOOL_NAMES } from '../../pixel-room/farm/gardenModel';
import type { GardenTool } from '../../pixel-room/farm/gardenModel';
import { POP_GRID, SPRINKLER_GRID, GARDEN_PALETTE } from '../logic/gardenSprites';

/** 글자 격자 → 작은 도트 그림(SVG). */
export function PixelGrid({ grid, size }: { grid: readonly string[]; size: number }) {
  const width = Math.max(...grid.map(row => row.length)), height = grid.length;
  const scale = size / Math.max(width, height);
  return <svg width={width * scale} height={height * scale} viewBox={`0 0 ${width} ${height}`} shapeRendering="crispEdges" aria-hidden="true">
    {grid.flatMap((row, y) => [...row].map((ch, x) => GARDEN_PALETTE[ch] ? <rect key={x + ':' + y} x={x} y={y} width={1} height={1} fill={GARDEN_PALETTE[ch]} /> : null))}
  </svg>;
}
/** 마을 아틀라스(16px 칸)의 한 칸을 두 배로. */
function AtlasIcon({ frame }: { frame: number }) {
  const style: CSSProperties = { width: 32, height: 32, backgroundImage: `url(${town})`, backgroundSize: '384px 352px', imageRendering: 'pixelated',
    backgroundPosition: `${-(frame % 12) * 32}px ${-Math.floor(frame / 12) * 32}px` };
  return <span className="pwp-garden-atlas" style={style} aria-hidden="true" />;
}
const SPRINKLER_ICON = SPRINKLER_GRID.slice(9, 19).map(row => row.slice(3, 14));
const ICONS: Record<GardenTool, ReactNode> = {
  hoe: <AtlasIcon frame={129} />,
  tomato: <PixelGrid grid={POP_GRID.tomato} size={24} />,
  strawberry: <PixelGrid grid={POP_GRID.strawberry} size={24} />,
  water: <AtlasIcon frame={131} />,
  sprinkler: <PixelGrid grid={SPRINKLER_ICON} size={28} />,
};
const SHORT: Record<GardenTool, string> = { hoe: '괭이', tomato: '토마토', strawberry: '딸기', water: '물', sprinkler: '스프링클러' };

export function GardenToolbar({ tool, onTool, sprinkler, message, busy, style }: {
  tool: GardenTool; onTool: (tool: GardenTool) => void; sprinkler: boolean; message: string; busy: boolean; style?: CSSProperties;
}) {
  const tools: GardenTool[] = ['hoe', 'tomato', 'strawberry', 'water', ...(sprinkler ? ['sprinkler' as const] : [])];
  return <div className="pwp-garden-tools" style={style} data-busy={busy}>
    <div role="toolbar" aria-label="텃밭 도구">
      {tools.map(id => <button key={id} type="button" className="pwp-garden-tool" data-tool={id} aria-pressed={tool === id} aria-label={TOOL_NAMES[id]}
        onPointerDown={event => event.stopPropagation()} onClick={() => onTool(id)}>
        {ICONS[id]}<small>{SHORT[id]}</small>
      </button>)}
    </div>
    {message && <p className="pwp-garden-message" role="status" aria-live="polite">{message}</p>}
  </div>;
}
