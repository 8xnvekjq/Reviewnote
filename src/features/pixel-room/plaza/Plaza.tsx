import { useEffect, useMemo, useRef, useState } from 'react';
import { PLAZA_HEIGHT, PLAZA_MOVE_TICK_MS, PLAZA_WIDTH } from './types';
import type { PlazaDirection } from './types';
import { findSpawn, isInsidePlaza, moveOneStep, planWalk } from './plazaModel';
import type { Cell, PlazaWalkStep } from './plazaModel';
import { usePlazaRealtime } from './usePlazaRealtime';
import { AvatarSprite } from '../sprites';
import type { PublicAvatarAppearance } from '../shop/types';
import { fetchEquippedAppearance } from '../../../utils/pixelShop';
import '../pixel-room.css';

const EMPTY_APPEARANCE: PublicAvatarAppearance = { top: null, bottom: null, shoes: null, hair: null, eyes: null };
const KEYS: Record<string, PlazaDirection> = { ArrowDown: 'Front', s: 'Front', ArrowUp: 'Back', w: 'Back', ArrowLeft: 'Left', a: 'Left', ArrowRight: 'Right', d: 'Right' };
// Cell size as a % of the board box — 16 cols / 12 rows, mirrors ROOM's 10%/12.5% cell math one
// level down (100/16, 100/8) for the wider plaza grid.
const CELL_W = 100 / PLAZA_WIDTH;
const CELL_H = 100 / PLAZA_HEIGHT;
// Same width:height-vs-cell ratio PixelRoom.tsx's .pr-actor uses (22%/10% cols, 27%/12.5% rows)
// carried over to the plaza's smaller cells, so avatars read the same on-screen size in both views.
const ACTOR_W = CELL_W * 2.2;
const ACTOR_H = CELL_H * 2.16;

function actorStyle(cell: Cell, zBoost: number) {
  return {
    left: `${cell.x * CELL_W - (ACTOR_W - CELL_W) / 2}%`,
    bottom: `${(PLAZA_HEIGHT - cell.y - 1) * CELL_H}%`,
    width: `${ACTOR_W}%`,
    height: `${ACTOR_H}%`,
    zIndex: cell.y + zBoost,
  };
}

const cells: Cell[] = Array.from({ length: PLAZA_WIDTH * PLAZA_HEIGHT }, (_, i) => ({ x: i % PLAZA_WIDTH, y: Math.floor(i / PLAZA_WIDTH) }));

interface Props {
  userId: string;
}

/** Pixel World Phase 2A — the shared plaza screen. Same tap-to-move + keyboard movement *feel* as
 * PixelRoom.tsx (identical held/walkQueue/frame state machine, same 170ms tick), reimplemented
 * against plazaModel.ts's boundary-only grid instead of model.ts's furniture-aware RoomState —
 * see plazaModel.ts for why. No furniture, no save/load, no decorating mode: this screen is just
 * the floor, my avatar, and everyone else's. */
export default function Plaza({ userId }: Props) {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [appearance, setAppearance] = useState<PublicAvatarAppearance>(EMPTY_APPEARANCE);
  useEffect(() => {
    let cancelled = false;
    fetchEquippedAppearance(userId).then(next => { if (!cancelled) setAppearance(next); }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  const { players, updateMyState } = usePlazaRealtime(sessionId, appearance);

  const [actor, setActor] = useState<Cell>(() => findSpawn());
  const [direction, setDirection] = useState<PlazaDirection>('Front');
  const [frame, setFrame] = useState(0);
  const [held, setHeld] = useState<PlazaDirection | null>(null);
  const [walkQueue, setWalkQueue] = useState<PlazaWalkStep[]>([]);
  const board = useRef<HTMLDivElement>(null);
  const moving = !!held || walkQueue.length > 0;

  // Push every x/y/direction/moving change up to the realtime layer — throttling is the hook's
  // job (per the Worker A contract), not ours.
  useEffect(() => { updateMyState({ x: actor.x, y: actor.y, direction, moving }); }, [actor.x, actor.y, direction, moving, updateMyState]);

  // Held-key/D-pad movement: one timer runs only while a direction is held, same shape as
  // PixelRoom.tsx's identical effect (furniture-collision check swapped for a boundary check).
  useEffect(() => {
    if (!held) return;
    function step() {
      setActor(previous => { const next = moveOneStep(previous, held!); return isInsidePlaza(next) ? next : previous; });
      setFrame(previous => (previous + 1) % 4);
    }
    step();
    const timer = window.setInterval(step, PLAZA_MOVE_TICK_MS);
    const stop = () => setHeld(null);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', stop);
    return () => { clearInterval(timer); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', stop); };
  }, [held]);

  // Tap-to-walk: consumes one precomputed step per tick, self-terminating as walkQueue shrinks —
  // same shape as PixelRoom.tsx's walk-queue effect.
  useEffect(() => {
    if (walkQueue.length === 0 || held) return;
    const [next, ...rest] = walkQueue;
    const timer = window.setTimeout(() => {
      setActor(previous => isInsidePlaza(next.cell) ? next.cell : previous);
      setDirection(next.direction);
      setFrame(previous => (previous + 1) % 4);
      setWalkQueue(rest);
    }, PLAZA_MOVE_TICK_MS);
    const stop = () => setWalkQueue([]);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', stop);
    return () => { clearTimeout(timer); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', stop); };
  }, [walkQueue, held]);

  // A separate lightweight ticker animates OTHER players' walk cycles while any of them are
  // moving, independent of whether I myself am moving (my own `frame` above already covers me).
  const anyoneElseMoving = players.some(player => player.moving);
  const [othersFrame, setOthersFrame] = useState(0);
  useEffect(() => {
    if (!anyoneElseMoving) return;
    const timer = window.setInterval(() => setOthersFrame(previous => (previous + 1) % 4), PLAZA_MOVE_TICK_MS);
    return () => clearInterval(timer);
  }, [anyoneElseMoving]);

  function begin(next: PlazaDirection) { setWalkQueue([]); setDirection(next); setHeld(next); }
  function walkTo(target: Cell) {
    if (target.x === actor.x && target.y === actor.y) return;
    const steps = planWalk(actor, target);
    if (steps.length === 0) return;
    setHeld(null);
    setWalkQueue(steps);
  }

  const boardCells = useMemo(() => cells, []);

  return <div className="pr-room-frame pr-plaza-frame">
    <div className="pr-wall" aria-hidden="true"><div className="pr-window"><i /><i /><i /><i /></div><span>PIXEL PLAZA</span></div>
    <div className="pr-stage">
      <div ref={board} className="pr-board pr-plaza-board" tabIndex={0} role="group" aria-label="광장. 바닥을 눌러 이동하거나 방향키/WASD로 이동" aria-describedby="pr-plaza-instructions"
        onKeyDown={event => {
          if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
          const next = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
          if (next) { event.preventDefault(); if (!event.repeat) begin(next); }
        }} onKeyUp={event => {
          const next = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
          if (next && event.target === event.currentTarget) { event.preventDefault(); if (held === next) setHeld(null); }
        }} onBlur={() => setHeld(null)}>
        <div className="pr-grid pr-plaza-grid">{boardCells.map(cell => <button key={`${cell.x}-${cell.y}`} type="button" tabIndex={-1} aria-hidden="true" onClick={() => { board.current?.focus({ preventScroll: true }); walkTo(cell); }} />)}</div>
        {/* Other players — appearance only, no nickname/title/email/any identifying text. */}
        {players.map(player => <div key={player.sessionId} className="pr-plaza-other" aria-hidden="true" style={actorStyle({ x: player.x, y: player.y }, 1)}>
          <span className="pr-shadow" /><AvatarSprite direction={player.direction} frame={player.moving ? othersFrame : 0} walking={player.moving} appearance={player.appearance} />
        </div>)}
        <div className="pr-plaza-actor" aria-hidden="true" style={actorStyle(actor, 2)}>
          <span className="pr-shadow" /><AvatarSprite direction={direction} frame={moving ? frame : 0} walking={moving} appearance={appearance} />
        </div>
      </div>
    </div>
    <div className="pr-threshold" aria-hidden="true" />
    <p id="pr-plaza-instructions" className="pr-instructions pr-plaza-instructions" role="status">광장의 바닥을 누르면 그 자리로 걸어가요. 다른 학생들도 함께 보여요.</p>
  </div>;
}
