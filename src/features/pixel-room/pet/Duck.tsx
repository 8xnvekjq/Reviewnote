import { useEffect, useRef, useState } from 'react';
import sheet from './assets/duck.png';
import { dogFits } from './dogModel';
import type { DogWorld } from './dogModel';
import { advanceDuck, duckPosition, spawnDuck } from './duckModel';
import type { DuckAction, DuckState } from './duckModel';
import './duck.css';

// Alpha bounds measured on the generated 1254px sheet. Register every pose at
// its feet rather than trusting generated grid padding, avoiding row-change jumps.
const bounds = [
  [56,95,273,293],[369,91,588,293],[684,95,900,293],[985,101,1205,297],
  [49,379,271,583],[363,381,585,583],[674,378,897,583],[985,383,1205,583],
  [49,688,271,887],[368,716,582,887],[676,723,896,888],[990,689,1208,887],
  [49,1021,266,1207],[354,979,589,1185],[666,967,900,1169],[991,1005,1205,1202],
];
export function DuckSprite({ action = 'idle', elapsed = 0, right = false }: { action?: DuckAction; elapsed?: number; right?: boolean }) {
  const row = action === 'walk' ? 1 : action === 'peck' ? 2 : action === 'hop' ? 3 : 0;
  const frame = action === 'idle' ? (elapsed % 3600 > 3300 ? 3 : 0) : Math.min(3, Math.floor(elapsed / (action === 'walk' ? 110 : action === 'peck' ? 220 : 200)) % 4);
  const [left, top, endX, endY] = bounds[row * 4 + frame];
  const width = (endX - left + 4) / 10, height = (endY - top + 4) / 10;
  const lift = action === 'hop' ? [0,2.2,3.8,.5][frame] : action === 'walk' ? [0,.5,0,.5][frame] : 0;
  return <svg viewBox="0 0 32 32" className="pr-duck-sprite" aria-hidden="true" style={{ transform: right ? 'scaleX(-1)' : undefined }}>
    <path d="M8 28h16v2H8z" fill="#453d29" opacity=".15" />
    <svg x={(32 - width) / 2} y={30 - height - lift} width={width} height={height} style={{ width, height }} viewBox={`${left - 2} ${top - 2} ${endX - left + 4} ${endY - top + 4}`} overflow="hidden"><image href={sheet} width="1254" height="1254" /></svg>
  </svg>;
}
export function Duck({ world, paused = false }: { world: DogWorld; paused?: boolean }) {
  const worldRef = useRef(world); worldRef.current = world;
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const [snapshot, setSnapshot] = useState<{ state: DuckState | null; now: number }>(() => { const now = performance.now(); return { state: spawnDuck(world, now), now }; });
  useEffect(() => {
    let frame = 0, last = 0;
    const animate = (now: number) => {
      if (now - last >= 50) { last = now; setSnapshot(previous => ({ state: advanceDuck(previous.state, worldRef.current, now, pausedRef.current || document.hidden), now })); }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);
  const { state, now } = snapshot;
  if (!state || !dogFits(world, state.cell) || !dogFits(world, state.from)) return null;
  const position = paused ? state.cell : duckPosition(state, world, now);
  const walking = state.action === 'walk' && (state.cell.x !== state.from.x || state.cell.y !== state.from.y);
  const action = paused ? 'idle' : walking ? 'walk' : state.action === 'walk' ? 'idle' : state.action;
  return <div className="pr-duck" aria-hidden="true" data-action={action} data-x={state.cell.x} data-y={state.cell.y} data-from-x={state.from.x} data-from-y={state.from.y}
    style={{ left: `${position.x / world.width * 100}%`, bottom: `${(world.height - position.y - 1) / world.height * 100}%`, width: `${200 / world.width}%`, height: `${200 / world.height}%`, zIndex: Math.floor(position.y) + 1 }}>
    <DuckSprite action={action} elapsed={paused ? 0 : now - state.entered} right={state.right} />
  </div>;
}
