import { useEffect, useMemo, useRef, useState } from 'react';
import { PLAZA_HEIGHT, PLAZA_MOVE_TICK_MS, PLAZA_WIDTH } from './types';
import type { PlazaDirection } from './types';
import { PLAZA_ENTRANCE, findSpawn, isInsidePlaza, moveOneStep, planWalk } from './plazaModel';
import type { Cell, PlazaWalkStep } from './plazaModel';
import { usePlazaRealtime } from './usePlazaRealtime';
import { useSmoothedPlayerPositions } from './useSmoothedPlayerPositions';
import { AvatarSprite, FurnitureSprite } from '../sprites';
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
// Facing on arrival: same convention as the room's own door spawn (PixelRoom.tsx's
// ROOM_SPAWN_FROM_PLAZA) — face away from the door you just walked through, deeper into the new
// space, continuing the walk rather than turning back to face it.
const SPAWN_DIRECTION: PlazaDirection = 'Back';

function actorStyle(cell: Cell, zBoost: number) {
  return {
    left: `${cell.x * CELL_W - (ACTOR_W - CELL_W) / 2}%`,
    bottom: `${(PLAZA_HEIGHT - cell.y - 1) * CELL_H}%`,
    width: `${ACTOR_W}%`,
    height: `${ACTOR_H}%`,
    zIndex: cell.y + zBoost,
  };
}
// Ground-level dressing (hedge/path/stub): no z-index here — these stay under everything via the
// low z-index their CSS classes carry, so they never need to compete with avatars/scenery.
function rectStyle(item: Rect) {
  return { left: `${item.x * CELL_W}%`, top: `${item.y * CELL_H}%`, width: `${item.w * CELL_W}%`, height: `${item.h * CELL_H}%` };
}
// Standing scenery (tree/bush/bench/board): z-index by footprint row, same convention as the
// room's furniture (item.y + height) — so an avatar can walk in front of or behind it correctly.
function sceneryStyle(item: SceneryItem) {
  return { ...rectStyle(item), zIndex: item.y + item.h };
}

const cells: Cell[] = Array.from({ length: PLAZA_WIDTH * PLAZA_HEIGHT }, (_, i) => ({ x: i % PLAZA_WIDTH, y: Math.floor(i / PLAZA_WIDTH) }));

// Outdoor set dressing — a data table, not bespoke per-item JSX, so a future scenery pass (or a
// third location reusing the same rendering shape) is mostly a matter of adding rows here.
// tree/bush reuse the room's existing furniture-sprite-crop technique (same FurnitureSprite the
// room uses for real furniture) rather than new art; board/bench are drawn with plain CSS. None
// of this participates in collision — see plazaModel.ts's header comment for why the plaza has no
// obstacle system.
type Rect = { x: number; y: number; w: number; h: number };
type SceneryKind = 'tree' | 'bush' | 'bench' | 'board';
interface SceneryItem extends Rect { kind: SceneryKind }
const PLAZA_SCENERY: SceneryItem[] = [
  { kind: 'board', x: 7, y: 2, w: 2, h: 2 },
  { kind: 'bench', x: 5, y: 5, w: 2, h: 1 },
  { kind: 'bench', x: 9, y: 5, w: 2, h: 1 },
  { kind: 'tree', x: 3, y: 1, w: 1, h: 2 },
  { kind: 'tree', x: 12, y: 1, w: 1, h: 2 },
  { kind: 'tree', x: 2, y: 6, w: 1, h: 2 },
  { kind: 'tree', x: 13, y: 6, w: 1, h: 2 },
  { kind: 'bush', x: 4, y: 3, w: 1, h: 1 },
  { kind: 'bush', x: 11, y: 3, w: 1, h: 1 },
  { kind: 'bush', x: 5, y: 9, w: 1, h: 1 },
  { kind: 'bush', x: 10, y: 9, w: 1, h: 1 },
];
// Walkway from the entrance up to the notice board. A separate short "stub" pokes through a gap
// in the top border (see .pr-plaza-hedge-top-* below) — purely decorative, hinting that the world
// continues past this frame, not connected to the real path and not going anywhere yet.
const PLAZA_PATH: Rect = { x: 7, y: 4, w: 2, h: 8 };
const PLAZA_PATH_STUB: Rect = { x: 7, y: 0, w: 2, h: 1 };

interface Props {
  userId: string;
  sessionId: string;
  onReachEntrance: () => void;
}

/** Pixel World Phase 2A rework — the shared plaza screen. Same tap-to-move + keyboard movement
 * *feel* as PixelRoom.tsx (identical held/walkQueue/frame state machine, same 170ms tick),
 * reimplemented against plazaModel.ts's boundary-only grid instead of model.ts's furniture-aware
 * RoomState — see plazaModel.ts for why. No furniture, no save/load, no decorating mode: this
 * screen is the ground, some non-collidable outdoor scenery, my avatar, and everyone else's.
 *
 * The ONLY way out is walking onto PLAZA_ENTRANCE — PixelRoom.tsx owns the actual transition
 * (fade overlay + swapping which location is mounted); this component just tells it when the
 * player reached the door via onReachEntrance. sessionId is now a stable prop generated once by
 * PixelRoom.tsx (not regenerated on every mount) so Presence's per-key dedup collapses cleanly
 * across repeated room<->plaza round trips instead of leaving ghost entries behind. */
export default function Plaza({ userId, sessionId, onReachEntrance }: Props) {
  const [appearance, setAppearance] = useState<PublicAvatarAppearance>(EMPTY_APPEARANCE);
  useEffect(() => {
    let cancelled = false;
    fetchEquippedAppearance(userId).then(next => { if (!cancelled) setAppearance(next); }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  const { players, updateMyState } = usePlazaRealtime(sessionId, appearance);
  // Worker B's real interpolation lands here later (see useSmoothedPlayerPositions.ts) — this
  // component only ever renders `renderedPlayers`, never the raw realtime list, so the swap is a
  // one-line change in that file with nothing to update here.
  const renderedPlayers = useSmoothedPlayerPositions(players);

  const [actor, setActor] = useState<Cell>(() => findSpawn());
  const [direction, setDirection] = useState<PlazaDirection>(SPAWN_DIRECTION);
  const [frame, setFrame] = useState(0);
  const [held, setHeld] = useState<PlazaDirection | null>(null);
  const [walkQueue, setWalkQueue] = useState<PlazaWalkStep[]>([]);
  const board = useRef<HTMLDivElement>(null);
  const moving = !!held || walkQueue.length > 0;

  // Push every x/y/direction/moving change up to the realtime layer — throttling is the hook's
  // job (per the Worker A contract), not ours.
  useEffect(() => { updateMyState({ x: actor.x, y: actor.y, direction, moving }); }, [actor.x, actor.y, direction, moving, updateMyState]);

  // Reaching the door: guarded against firing on the very first render (spawn is one cell away
  // from PLAZA_ENTRANCE by construction, so this only ever fires from real movement, but the
  // guard is kept here too — same defensive shape as PixelRoom.tsx's room-side door check — in
  // case a future spawn point ever lands exactly on the entrance).
  const skipEntranceCheckRef = useRef(true);
  useEffect(() => {
    if (skipEntranceCheckRef.current) { skipEntranceCheckRef.current = false; return; }
    if (actor.x === PLAZA_ENTRANCE.x && actor.y === PLAZA_ENTRANCE.y) {
      setHeld(null);
      setWalkQueue([]);
      onReachEntrance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor]);

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
  const anyoneElseMoving = renderedPlayers.some(player => player.moving);
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
      <div ref={board} className="pr-board pr-plaza-board" tabIndex={0} role="group" aria-label="광장. 바닥을 눌러 이동하거나 방향키/WASD로 이동. 아래쪽 입구 칸으로 걸어가면 내 방으로 돌아가요." aria-describedby="pr-plaza-instructions"
        onKeyDown={event => {
          if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
          const next = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
          if (next) { event.preventDefault(); if (!event.repeat) begin(next); }
        }} onKeyUp={event => {
          const next = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
          if (next && event.target === event.currentTarget) { event.preventDefault(); if (held === next) setHeld(null); }
        }} onBlur={() => setHeld(null)}>
        {/* Ground dressing, back to front: border hedge (with one decorative gap + off-frame path
           stub), the walkway, then trees/bushes/bench/board. All aria-hidden + non-interactive —
           purely a "this reads as outdoors" backdrop, never an obstacle (see plazaModel.ts). */}
        <div className="pr-plaza-hedge" aria-hidden="true" style={rectStyle({ x: 0, y: 0, w: 7, h: 1 })} />
        <div className="pr-plaza-hedge" aria-hidden="true" style={rectStyle({ x: 9, y: 0, w: PLAZA_WIDTH - 9, h: 1 })} />
        <div className="pr-plaza-hedge" aria-hidden="true" style={rectStyle({ x: 0, y: PLAZA_HEIGHT - 1, w: 7, h: 1 })} />
        <div className="pr-plaza-hedge" aria-hidden="true" style={rectStyle({ x: 9, y: PLAZA_HEIGHT - 1, w: PLAZA_WIDTH - 9, h: 1 })} />
        <div className="pr-plaza-hedge" aria-hidden="true" style={rectStyle({ x: 0, y: 0, w: 1, h: PLAZA_HEIGHT })} />
        <div className="pr-plaza-hedge" aria-hidden="true" style={rectStyle({ x: PLAZA_WIDTH - 1, y: 0, w: 1, h: PLAZA_HEIGHT })} />
        <div className="pr-plaza-path-stub" aria-hidden="true" style={rectStyle(PLAZA_PATH_STUB)} />
        <div className="pr-plaza-path" aria-hidden="true" style={rectStyle(PLAZA_PATH)} />
        <div className="pr-grid pr-plaza-grid">{boardCells.map(cell => <button key={`${cell.x}-${cell.y}`} type="button" tabIndex={-1} aria-hidden="true" onClick={() => { board.current?.focus({ preventScroll: true }); walkTo(cell); }} />)}</div>
        {PLAZA_SCENERY.map((item, index) => <div key={index} className={`pr-plaza-scenery pr-plaza-scenery-${item.kind}`} aria-hidden="true" style={sceneryStyle(item)}>
          {item.kind === 'tree' && <FurnitureSprite type="tallplant" />}
          {item.kind === 'bush' && <FurnitureSprite type="plant" />}
          {item.kind === 'board' && <span className="pr-plaza-board-face"><i /><i /><i /></span>}
        </div>)}
        {/* Other players — appearance only, no nickname/title/email/any identifying text. */}
        {renderedPlayers.map(player => <div key={player.sessionId} className="pr-plaza-other" aria-hidden="true" style={actorStyle({ x: player.x, y: player.y }, 1)}>
          <span className="pr-shadow" /><AvatarSprite direction={player.direction} frame={player.moving ? othersFrame : 0} walking={player.moving} appearance={player.appearance} />
        </div>)}
        <div className="pr-plaza-actor" aria-hidden="true" style={actorStyle(actor, 2)}>
          <span className="pr-shadow" /><AvatarSprite direction={direction} frame={moving ? frame : 0} walking={moving} appearance={appearance} />
        </div>
      </div>
    </div>
    <div className="pr-threshold" aria-hidden="true" />
    <p id="pr-plaza-instructions" className="pr-instructions pr-plaza-instructions" role="status">광장의 바닥을 누르면 그 자리로 걸어가요. 아래쪽 입구 칸으로 걸어가면 내 방으로 돌아가요. 다른 학생들도 함께 보여요.</p>
  </div>;
}
