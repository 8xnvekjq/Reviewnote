import { memo, useEffect, useRef, useState } from 'react';
import { AvatarSprite, DoormatSprite } from '../sprites';
import type { PublicAvatarAppearance } from '../shop/types';
import type { PlazaDirection } from '../plaza/types';
import { PLAZA_MOVE_TICK_MS } from '../plaza/types';
import town from '../plaza/assets/tiny-town.png';
import { YARD_DOOR, YARD_GATE, YARD_SPAWNS, yardExit, yardPath, yardWalkable } from './yardModel';
import type { YardCell, YardDestination } from './yardModel';
import '../plaza/plaza.css';
import './yard.css';
import { Dog } from '../pet/Dog';
import { yardDogWorld } from '../pet/dogWorld';

const cells = Array.from({ length: 192 }, (_, i) => ({ x: i % 16, y: Math.floor(i / 16) }));
const deltas: Record<PlazaDirection, YardCell> = { Front: { x: 0, y: 1 }, Back: { x: 0, y: -1 }, Left: { x: -1, y: 0 }, Right: { x: 1, y: 0 } };
const keys: Record<string, PlazaDirection> = { ArrowDown: 'Front', s: 'Front', ArrowUp: 'Back', w: 'Back', ArrowLeft: 'Left', a: 'Left', ArrowRight: 'Right', d: 'Right' };
function Tile({ id }: { id: number }) { return <svg viewBox={`${id % 12 * 16} ${Math.floor(id / 12) * 16} 16 16`}><image href={town} width="192" height="176" /></svg>; }
const Landscape = memo(function Landscape() {
  return <>
    <div className="pr-yard-ground" aria-hidden="true">{cells.map(({ x, y }) => <Tile key={`${x}-${y}`} id={x >= 5 && x <= 7 && y >= 5 ? (x === 5 ? 24 : x === 7 ? 26 : 25) : (x + y * 3) % 17 === 0 ? 2 : (x * 7 + y) % 5 === 0 ? 1 : 0} />)}</div>
    <div className="pr-yard-house" aria-hidden="true">{[52, 53, 54, 64, 65, 66, 84, 86, 84].map((id, i) => <Tile key={i} id={id} />)}</div>
    <div className="pr-yard-mat" aria-hidden="true"><DoormatSprite /></div>
    {[[0, 1], [0, 7], [14, 0]].map(([x, y]) => <svg key={`${x}-${y}`} className="pr-yard-tree" aria-hidden="true" style={{ left: `${x / 16 * 100}%`, top: `${y / 12 * 100}%`, zIndex: y + 4 }} viewBox="64 0 16 32"><image href={town} width="192" height="176" /></svg>)}
    {[2, 10].map(y => <div key={y} className="pr-yard-fence" aria-hidden="true" style={{ top: `${y / 12 * 100}%` }}>{[80, 81, 81, 82].map((id, i) => <Tile key={i} id={id} />)}</div>)}
    <div className="pr-yard-garden" aria-hidden="true"><span>✿</span><span>✿</span></div>
    <span className="pr-yard-sign" aria-hidden="true">광장 ↓</span>
  </>;
});

interface Props { dogActive?: boolean; from: YardDestination; appearance: PublicAvatarAppearance; onExit: (destination: YardDestination) => void }
export default function FrontYard({ from, appearance, onExit, dogActive = false }: Props) {
  const [actor, setActor] = useState<YardCell>(() => YARD_SPAWNS[from]);
  const [direction, setDirection] = useState<PlazaDirection>(from === 'room' ? 'Front' : 'Back');
  const [held, setHeld] = useState<PlazaDirection | null>(null);
  const [queue, setQueue] = useState<YardCell[]>([]);
  const [frame, setFrame] = useState(0);
  const leaving = useRef(false);
  const board = useRef<HTMLDivElement>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  useEffect(() => {
    const destination = yardExit(actor);
    if (!destination || leaving.current) return;
    leaving.current = true;
    setHeld(null); setQueue([]);
    onExitRef.current(destination);
  }, [actor]);
  useEffect(() => {
    if ((!held && !queue.length) || leaving.current) return;
    const timer = window.setTimeout(() => {
      const next = held ? { x: actor.x + deltas[held].x, y: actor.y + deltas[held].y } : queue[0];
      if (yardWalkable(next)) {
        setDirection(held ?? (next.x > actor.x ? 'Right' : next.x < actor.x ? 'Left' : next.y > actor.y ? 'Front' : 'Back'));
        setActor(next); setFrame(value => (value + 1) % 4);
      } else setHeld(null);
      if (!held) setQueue(value => value.slice(1));
    }, PLAZA_MOVE_TICK_MS);
    return () => clearTimeout(timer);
  }, [actor, held, queue]);
  useEffect(() => {
    const stop = () => { setHeld(null); setQueue([]); };
    window.addEventListener('blur', stop); document.addEventListener('visibilitychange', stop);
    return () => { window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', stop); };
  }, []);
  function walkTo(cell: YardCell) { if (!leaving.current) { setHeld(null); setQueue(yardPath(actor, cell)); board.current?.focus({ preventScroll: true }); } }
  const moving = !!held || queue.length > 0;
  return <div className="pr-room-frame pr-plaza-frame pr-yard-frame">
    <header className="pr-hub-heading"><div><span>PIXEL WORLD · HOME</span><h2>우리 집 앞, 작은 뜰</h2></div><span className="pr-hub-weather" aria-hidden="true">☀</span></header>
    <div className="pr-stage"><div ref={board} className="pr-board pr-plaza-board pr-yard-board" tabIndex={0} role="group" aria-label="집 앞. 위쪽 집 문은 내 방, 아래쪽 길은 광장으로 이어져요." onKeyDown={event => {
      if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
      const next = keys[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (next) { event.preventDefault(); if (!event.repeat) { setQueue([]); setHeld(next); } }
    }} onKeyUp={event => { if (keys[event.key.length === 1 ? event.key.toLowerCase() : event.key] === held) setHeld(null); }} onBlur={() => setHeld(null)}>
      <Landscape />
      <div className="pr-grid pr-plaza-grid">{cells.map(cell => <button type="button" key={`${cell.x}-${cell.y}`} tabIndex={-1} aria-hidden="true" disabled={!yardWalkable(cell)} onClick={() => walkTo(cell)} />)}</div>
      <button type="button" className="pr-yard-door" aria-label="집 문으로 걸어가기" onClick={() => walkTo(YARD_DOOR)} />
      <button type="button" className="pr-yard-gate" aria-label="길을 따라 광장으로 걸어가기" onClick={() => walkTo(YARD_GATE)}>↓</button>
      {dogActive && <Dog world={yardDogWorld(actor)} />}
      <div className="pr-plaza-actor" aria-hidden="true" data-x={actor.x} data-y={actor.y} data-direction={direction} style={{ left: `${(actor.x - .6) / 16 * 100}%`, bottom: `${(11 - actor.y) / 12 * 100}%`, width: '13.75%', height: '18%', zIndex: actor.y + 2 }}><span className="pr-shadow" /><AvatarSprite direction={direction} frame={moving ? frame : 0} walking={moving} appearance={appearance} /></div>
    </div></div>
    <p className="pr-instructions pr-plaza-instructions">집 문으로 들어가거나, 아래 길을 따라 광장으로 걸어가요.</p>
  </div>;
}
