import { useEffect, useRef, useState } from 'react';
import type { PlazaPlayerState } from './types';
import {
  createInterpolationState,
  interpolatedPosition,
  isInterpolating,
  retarget,
  type InterpolationState,
} from './positionSmoothing';

/** Pixel World Phase 2A rework (Worker B) — turns usePlazaRealtime's raw remote-player list (x/y
 * that jump to a new grid cell roughly every PLAZA_MOVE_TICK_MS while someone moves, then stop
 * updating at rest) into continuously-interpolated positions safe to render directly. Consumers
 * just do `actorStyle({ x: renderedX, y: renderedY })` with this hook's output — no other change
 * needed on the rendering side.
 *
 * Technique: requestAnimationFrame-driven lerp, not a CSS `transition: left/bottom`. Both were
 * considered:
 *  - CSS transition is less code (render the literal target x/y as a %, let the browser tween) but
 *    (a) ties easing directly to however unevenly ticks actually arrive — a late tick makes the
 *    transition restart from wherever it currently is, which *looks* fine most of the time but
 *    gives no way to clamp how far behind it's allowed to lag, and no clean way to detect "have we
 *    settled" for logic that might need it later; and (b) would require adding transition rules to
 *    pixel-room.css, which is Worker A's territory this round (out of scope here).
 *  - rAF lerp (chosen): the interpolation math is pure and unit-tested (positionSmoothing.ts), the
 *    hook fully owns easing duration independent of network cadence, redirecting mid-flight is
 *    explicit (retarget starts the new leg from the current interpolated point, never the old
 *    target) and lag is clamped to at most one PLAZA_SMOOTH_DURATION_MS leg behind by construction.
 *
 * Pure math lives in positionSmoothing.ts; this file is only the React/rAF glue, matching the split
 * already established by presenceStore.ts (pure reducer) + usePlazaRealtime.ts (glue) and
 * plazaModel.ts (pure) + Plaza.tsx (glue).
 */
export function useSmoothedPlayerPositions(players: PlazaPlayerState[]): PlazaPlayerState[] {
  const statesRef = useRef(new Map<string, InterpolationState>());
  const rafRef = useRef<number | null>(null);
  // Lazy-init to the raw incoming players (not []) so the very first paint doesn't flash an empty
  // list before the first rAF tick runs — at t=0 an interpolation's from/to/target all coincide
  // anyway, so this is identical to what the first computed frame would produce.
  const [rendered, setRendered] = useState<PlazaPlayerState[]>(() => players);

  // The rAF loop reads the latest raw players from a ref (not a closure captured at loop-start
  // time) so it never needs to be torn down/restarted just because `players` changed — the effect
  // below only needs to (re)prime interpolation targets and make sure a loop is running.
  const playersRef = useRef<PlazaPlayerState[]>(players);
  playersRef.current = players;

  useEffect(() => {
    const now = performance.now();
    const states = statesRef.current;
    const seen = new Set<string>();

    for (const player of players) {
      seen.add(player.sessionId);
      const target = { x: player.x, y: player.y };
      const existing = states.get(player.sessionId);
      states.set(
        player.sessionId,
        existing ? retarget(existing, target, now) : createInterpolationState(target, now),
      );
    }
    // Drop interpolation state for sessions no longer in the list (they left the plaza) so this
    // map doesn't grow without bound over a long-lived plaza session.
    for (const sessionId of states.keys()) {
      if (!seen.has(sessionId)) states.delete(sessionId);
    }

    if (rafRef.current === null) {
      const tick = () => {
        const frameNow = performance.now();
        let stillAnimating = false;
        const next = playersRef.current.map(player => {
          const state = states.get(player.sessionId);
          if (!state) return player;
          if (isInterpolating(state, frameNow)) stillAnimating = true;
          const pos = interpolatedPosition(state, frameNow);
          if (pos.x === player.x && pos.y === player.y) return player;
          return { ...player, x: pos.x, y: pos.y };
        });
        setRendered(next);
        rafRef.current = stillAnimating ? requestAnimationFrame(tick) : null;
      };
      rafRef.current = requestAnimationFrame(tick);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players]);

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
