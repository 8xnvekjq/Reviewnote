import type { Puff } from './useStepTrail';
import './stepFx.css';

/** Two-three pixel dust puffs at the feet of the cell just left; purely decorative. */
export function StepDust({ puffs, cols, rows }: { puffs: Puff[]; cols: number; rows: number }) {
  return <>{puffs.map(puff => <span key={puff.id} className="pr-dust" aria-hidden="true"
    style={{ left: `${(puff.x + .5) / cols * 100}%`, bottom: `${(rows - puff.y - 1) / rows * 100}%`, zIndex: puff.y + 1 }}><i /><i /><i /></span>)}</>;
}

/** Tiny four-point pixel sparkles around a piece of furniture that was just set down. */
export function PlaceSparkles() {
  return <span className="pr-sparkles" aria-hidden="true">{[0, 1, 2].map(i => <svg key={i} viewBox="0 0 5 5" shapeRendering="crispEdges"><path d="M2 0h1v2h2v1H3v2H2V3H0V2h2z" fill="#fff6c4" /><path d="M2 2h1v1H2z" fill="#fff" /></svg>)}</span>;
}
