import { useEffect, useMemo, useRef, useState } from 'react';
import { PLAZA_HEIGHT, PLAZA_MOVE_TICK_MS, PLAZA_WIDTH } from './types';
import type { PlazaDirection } from './types';
import { PLAZA_ENTRANCE, findSpawn, isWalkablePlaza, moveOneStep, planWalk } from './plazaModel';
import type { Cell, PlazaWalkStep } from './plazaModel';
import { usePlazaRealtime } from './usePlazaRealtime';
import { useSmoothedPlayerPositions } from './useSmoothedPlayerPositions';
import { AvatarSprite } from '../sprites';
import type { PublicAvatarAppearance } from '../shop/types';
import { fetchEquippedAppearance } from '../../../utils/pixelShop';
import { plazaDebugLog } from './plazaDebug';
import '../pixel-room.css';
import { PlazaLandscape } from './PlazaLandscape';
import './plaza.css';
import { PlazaActivities } from './PlazaActivities';
import { REACTIONS } from './plazaInteractions';
import { CropExhibit } from './CropExhibit';

const EMPTY_APPEARANCE: PublicAvatarAppearance = { top: null, bottom: null, shoes: null, hair: null, eyes: null, skin: null };
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
const cells: Cell[] = Array.from({ length: PLAZA_WIDTH * PLAZA_HEIGHT }, (_, i) => ({ x: i % PLAZA_WIDTH, y: Math.floor(i / PLAZA_WIDTH) }));

interface Props {
  userId: string;
  sessionId: string;
  onReachEntrance: () => void;
}

/** Pixel World Phase 2A rework — the shared plaza screen. Same tap-to-move + keyboard movement
 * *feel* as PixelRoom.tsx (identical held/walkQueue/frame state machine, same 170ms tick),
 * reimplemented against plazaModel.ts's fixed-scenery grid instead of model.ts's furniture-aware
 * RoomState — see plazaModel.ts for why. No furniture, no save/load, no decorating mode: this
 * screen is the ground, some outdoor scenery, my avatar, and everyone else's.
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

  const { players, paths, updateMyState, ready, reactions, sendReaction } = usePlazaRealtime(sessionId, appearance);
  // This component only ever renders `renderedPlayers`, never the raw realtime list — see
  // useSmoothedPlayerPositions.ts's header comment for why it needs both `players` (roster/
  // appearance) and `paths` (the actual waypoint-by-waypoint history, for smoothing).
  const renderedPlayers = useSmoothedPlayerPositions(players, paths);

  const [actor, setActor] = useState<Cell>(() => findSpawn());
  const [direction, setDirection] = useState<PlazaDirection>(SPAWN_DIRECTION);
  const [frame, setFrame] = useState(0);
  const [held, setHeld] = useState<PlazaDirection | null>(null);
  const [walkQueue, setWalkQueue] = useState<PlazaWalkStep[]>([]);
  const board = useRef<HTMLDivElement>(null);
  const moving = !!held || walkQueue.length > 0;

  // Push every x/y/direction/moving change up to the realtime layer — throttling is the hook's
  // job (per the Worker A contract), not ours. Every commit of actor.x/y is its own separate tick
  // callback (setInterval/setTimeout in the movement effects below), so this effect really does
  // fire once per grid cell crossed — the local side of the pipeline was never the place waypoints
  // went missing (see usePlazaRealtime.ts/useSmoothedPlayerPositions.ts for where they actually did).
  useEffect(() => {
    plazaDebugLog('local:move', sessionId, `(${actor.x},${actor.y})`, { direction, moving, t: performance.now().toFixed(1) });
    updateMyState({ x: actor.x, y: actor.y, direction, moving });
  }, [actor.x, actor.y, direction, moving, updateMyState, sessionId]);

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
  // PixelRoom.tsx's identical effect (fixed outdoor footprints instead of room furniture).
  useEffect(() => {
    if (!held) return;
    function step() {
      setActor(previous => { const next = moveOneStep(previous, held!); return isWalkablePlaza(next) ? next : previous; });
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
      setActor(previous => isWalkablePlaza(next.cell) ? next.cell : previous);
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
    <header className="pr-hub-heading"><div><span>PIXEL WORLD · OUTDOORS</span><h2>모여라, 작은 광장</h2></div><span className="pr-hub-weather" aria-label="맑은 날">☀</span></header>
    <div className="pr-stage">
      <div ref={board} className="pr-board pr-plaza-board" tabIndex={0} role="group" aria-label="광장. 바닥을 눌러 이동하거나 방향키/WASD로 이동. 아래쪽 입구 칸으로 걸어가면 집 앞으로 돌아가요." aria-describedby="pr-plaza-instructions"
        onKeyDown={event => {
          if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
          const next = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
          if (next) { event.preventDefault(); if (!event.repeat) begin(next); }
        }} onKeyUp={event => {
          const next = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
          if (next && event.target === event.currentTarget) { event.preventDefault(); if (held === next) setHeld(null); }
        }} onBlur={() => setHeld(null)}>
        <PlazaLandscape />
        <CropExhibit />
        {[...reactions.values()].some(event => event.kind === 'wish') && <div className="pr-well-ripple" aria-hidden="true">✧</div>}
        <div className="pr-grid pr-plaza-grid">{boardCells.map(cell => <button key={`${cell.x}-${cell.y}`} type="button" tabIndex={-1} aria-hidden="true" disabled={!isWalkablePlaza(cell)} onClick={() => { board.current?.focus({ preventScroll: true }); walkTo(cell); }} />)}</div>
        {/* Other players — appearance only, no nickname/title/email/any identifying text. */}
        {renderedPlayers.map(player => <div key={player.sessionId} className="pr-plaza-other" aria-hidden="true" style={actorStyle({ x: player.x, y: player.y }, 1)}>
          <span className="pr-shadow" /><AvatarSprite direction={player.direction} frame={player.moving ? othersFrame : 0} walking={player.moving} appearance={player.appearance} />
        </div>)}
        <div className="pr-plaza-actor" aria-hidden="true" style={actorStyle(actor, 2)}>
          <span className="pr-shadow" /><AvatarSprite direction={direction} frame={moving ? frame : 0} walking={moving} appearance={appearance} />
        </div>
        {[{ sessionId, ...actor }, ...renderedPlayers].map(player => {
          const reaction = reactions.get(player.sessionId);
          return reaction && <div key={player.sessionId} className="pr-reaction-anchor" aria-hidden="true" style={{ left: `${Math.max(13, Math.min(87, (player.x + .5) * CELL_W))}%`, bottom: `${Math.min(86, (PLAZA_HEIGHT - player.y + .65) * CELL_H)}%`, zIndex: 30 }}><span className="pr-reaction-bubble">{REACTIONS[reaction.kind].emoji} {REACTIONS[reaction.kind].label}</span></div>;
        })}
        <PlazaActivities key={userId} userId={userId} actor={actor} moving={moving} ready={ready} stopMoving={() => { setHeld(null); setWalkQueue([]); }} sendReaction={sendReaction} />
      </div>
    </div>
    <span className="sr-only" role="status">{[...reactions.values()].filter(event => event.sessionId !== sessionId).map(event => `누군가 ${REACTIONS[event.kind].label}`).join(' · ')}</span>
    <button className="pr-hub-home" onClick={() => walkTo(PLAZA_ENTRANCE)}>↓ 집 앞으로 가는 길</button>
    <p id="pr-plaza-instructions" className="pr-instructions pr-plaza-instructions" role="status">내 캐릭터를 눌러 인사 · 우물 곁에서 우물을 눌러 쉬어 가요</p>
  </div>;
}
