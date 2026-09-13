import { useEffect, useRef, useState } from 'react';
import type { PlazaPlayerState } from './types';
import type { PathWaypoint } from './presenceStore';
import { getPathSince } from './presenceStore';
import {
  advance,
  createInterpolationState,
  enqueueWaypoint,
  interpolatedPosition,
  isInterpolating,
  type InterpolationState,
} from './positionSmoothing';
import { plazaDebugLog } from './plazaDebug';

/** Pixel World Phase 2A rework — turns usePlazaRealtime's raw remote-player list (x/y that jump to
 * a new grid cell roughly every PLAZA_MOVE_TICK_MS while someone moves, then stop updating at
 * rest) into continuously-interpolated positions safe to render directly. Consumers just do
 * `actorStyle({ x: renderedX, y: renderedY })` with this hook's output — no other change needed on
 * the rendering side.
 *
 * Technique: requestAnimationFrame-driven lerp along a per-session WAYPOINT QUEUE, not a single
 * "retarget to the latest known position." Real two-account testing (2026-09) found that a
 * single-target design teleports/skips cells: usePlazaRealtime.ts's raw broadcast/presence
 * handlers can fire more than once within the same JS task (confirmed via
 * node_modules/@supabase/phoenix's presence.js — one track() update is delivered as a simultaneous
 * leave+join diff for the same key; bursty WebSocket delivery does the same thing to broadcast) —
 * React then commits only ONE render for the whole burst, so anything that only reacts to "the
 * latest players snapshot" silently skips every waypoint in between, producing exactly the
 * reported symptoms (teleport, not following the same path, catching up late after the sender
 * stops). presenceStore.ts's `paths` accumulator captures every waypoint regardless of how many
 * renders happen (the reducer still processes every dispatched action even inside a React batch);
 * this hook reads whatever is new since its own per-session seq cursor and queues it, so a burst of
 * N waypoints replays as N separate PLAZA_SMOOTH_DURATION_MS legs instead of collapsing into one.
 *
 * Pure math lives in positionSmoothing.ts; this file is only the React/rAF glue, matching the split
 * already established by presenceStore.ts (pure reducer) + usePlazaRealtime.ts (glue) and
 * plazaModel.ts (pure) + Plaza.tsx (glue).
 */
export function useSmoothedPlayerPositions(
  players: PlazaPlayerState[],
  paths: Map<string, PathWaypoint[]>,
): PlazaPlayerState[] {
  const statesRef = useRef(new Map<string, InterpolationState>());
  // sessionId -> last-consumed seq from that session's path — the cursor that lets getPathSince
  // hand back exactly "what's new since I last looked," independent of how many renders happened
  // in between (see this file's header comment).
  const cursorRef = useRef(new Map<string, number>());
  const rafRef = useRef<number | null>(null);
  // Lazy-init to the raw incoming players (not []) so the very first paint doesn't flash an empty
  // list before the first rAF tick runs — at t=0 an interpolation's from/to/target all coincide
  // anyway, so this is identical to what the first computed frame would produce.
  const [rendered, setRendered] = useState<PlazaPlayerState[]>(() => players);

  // The rAF loop reads the latest raw players from a ref (not a closure captured at loop-start
  // time) so it never needs to be torn down/restarted just because `players` changed — the effect
  // below only needs to (re)prime interpolation queues and make sure a loop is running.
  const playersRef = useRef<PlazaPlayerState[]>(players);
  playersRef.current = players;

  useEffect(() => {
    const now = performance.now();
    const states = statesRef.current;
    const cursors = cursorRef.current;
    const seen = new Set<string>();

    for (const player of players) {
      seen.add(player.sessionId);
      const existing = states.get(player.sessionId);

      if (!existing) {
        // First sighting of this session — appear exactly where they already are. No path to
        // replay from before we started observing them (presence-sync/join already seeds `paths`
        // with this same point as the first waypoint, so setting the cursor to their current seq
        // means that seed point is correctly treated as "already consumed," not queued again).
        states.set(player.sessionId, createInterpolationState({ x: player.x, y: player.y }, now));
        cursors.set(player.sessionId, player.seq);
        plazaDebugLog('smooth:spawn', player.sessionId, { x: player.x, y: player.y, seq: player.seq, t: now.toFixed(1) });
        continue;
      }

      const sinceSeq = cursors.get(player.sessionId) ?? -1;
      const newWaypoints = getPathSince(paths, player.sessionId, sinceSeq);
      if (newWaypoints.length === 0) continue;

      let state = existing;
      for (const waypoint of newWaypoints) {
        state = enqueueWaypoint(state, { x: waypoint.x, y: waypoint.y }, now);
      }
      states.set(player.sessionId, state);
      cursors.set(player.sessionId, newWaypoints[newWaypoints.length - 1].seq);
      plazaDebugLog('smooth:enqueue', player.sessionId, {
        waypoints: newWaypoints.map(w => `(${w.x},${w.y})#${w.seq}`),
        queueLength: state.queue?.length ?? 0,
        t: now.toFixed(1),
      });
    }

    // Drop interpolation/cursor state for sessions no longer in the list (they left the plaza) so
    // these maps don't grow without bound over a long-lived plaza session.
    for (const sessionId of states.keys()) {
      if (!seen.has(sessionId)) {
        states.delete(sessionId);
        cursors.delete(sessionId);
      }
    }

    if (rafRef.current === null) {
      const tick = () => {
        const frameNow = performance.now();
        let stillAnimating = false;
        const next = playersRef.current.map(player => {
          const state = states.get(player.sessionId);
          if (!state) return player;
          const advanced = advance(state, frameNow);
          if (advanced !== state) {
            states.set(player.sessionId, advanced);
            plazaDebugLog('smooth:leg-start', player.sessionId, `${advanced.from.x},${advanced.from.y} -> ${advanced.to.x},${advanced.to.y}`, { queueLeft: advanced.queue?.length ?? 0, t: frameNow.toFixed(1) });
          }
          if (isInterpolating(advanced, frameNow)) stillAnimating = true;
          const pos = interpolatedPosition(advanced, frameNow);
          if (pos.x === player.x && pos.y === player.y) return player;
          return { ...player, x: pos.x, y: pos.y };
        });
        setRendered(next);
        rafRef.current = stillAnimating ? requestAnimationFrame(tick) : null;
      };
      rafRef.current = requestAnimationFrame(tick);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, paths]);

  // Belt-and-suspenders unmount cleanup — the effect above already stops scheduling once nothing
  // is animating, but this guarantees no frame ever fires after this hook's owner has unmounted.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  return rendered;
}
