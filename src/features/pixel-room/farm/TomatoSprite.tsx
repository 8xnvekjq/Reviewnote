import type { FarmMoisture, FarmStage } from './farmModel';

// Original tiny pixel illustration: one coherent silhouette through all growth stages. Soil reads
// as three simple tiers (moist/normal/dry) — a pure display cue, not a new scoring rule.
const SOIL_FILL: Record<FarmMoisture, string> = { moist: '#714830', normal: '#99653c', dry: '#c2986a' };
const SOIL_LINE: Record<FarmMoisture, string> = { moist: '#543b2e', normal: '#7a4f32', dry: '#8a6a45' };
export function TomatoSprite({ stage, moisture }: { stage: FarmStage; moisture: FarmMoisture }) {
  return <svg viewBox="0 0 32 32" aria-hidden="true" shapeRendering="crispEdges">
    <path fill="#684531" d="M2 18h28v12H2z" /><path fill={SOIL_FILL[moisture]} d="M2 17h28v11H2z" />
    <path stroke={SOIL_LINE[moisture]} strokeWidth="1" d="M5 21h22M5 25h22" />
    {moisture === 'dry' && <path stroke="#8a6a45" strokeWidth="1" d="M7 20l3 3M23 23l3-3M14 27l2 2" />}
    <path fill="#be915a" d="M1 17h2v12H1zM29 17h2v12h-2zM1 29h30v2H1z" />
    {stage === 'empty' ? <><path fill="#c89860" d="M9 19h2v2H9zM20 23h2v2h-2z" /><path fill="#e6d3a3" d="M22 12h7v5h-7z" /><path fill="#97774d" d="M24 17h2v4h-2z" /></> : <>
      {stage !== 'sprout' && <path fill="#b78c56" d="M19 3h2v22h-2z" />}
      <path fill="#387140" d={stage === 'sprout' ? 'M15 18h2v6h-2zM11 16h4v3h-4zM17 14h4v3h-4z' : 'M15 7h2v17h-2zM8 11h7v4H8zM17 8h7v4h-7zM9 18h6v3H9zM17 16h8v4h-8z'} />
      <path fill="#70a747" d={stage === 'sprout' ? 'M11 15h4v2h-4zM17 14h4v2h-4z' : 'M8 10h6v2H8zM18 7h6v2h-6zM10 17h4v2h-4zM19 15h6v2h-6z'} />
      {(stage === 'fruit' || stage === 'ripe') && <>
        <path fill={stage === 'ripe' ? '#b73931' : '#638344'} d="M7 14h7v6H7zM18 19h8v7h-8zM18 10h6v5h-6z" />
        <path fill={stage === 'ripe' ? '#ee6646' : '#a0b95b'} d="M7 13h6v5H7zM18 18h7v6h-7zM18 9h5v4h-5z" />
        <path fill="#e8b77d" d="M8 14h2v1H8zM19 19h2v1h-2z" /><path fill="#3d713e" d="M9 12h3v2H9zM20 17h3v2h-3zM19 8h3v2h-3z" />
      </>}
    </>}
    {moisture === 'moist' && <path fill="#83c7ce" d="M4 24h2v2H4zM26 20h2v2h-2z" />}
  </svg>;
}
