// Pixel World Phase 2A — pure interpolation math for smoothing remote players' on-screen movement.
// No React, no Supabase, no Date.now()/timers of its own — "now" is always passed in as data, same
// convention as presenceStore.ts's pure reducer, so this stays trivially unit-testable
// (node --test) without mocking clocks or animation frames.
//
// Why this exists: usePlazaRealtime.ts's `players` only updates roughly every PLAZA_MOVE_TICK_MS
// (170ms) while someone is moving (broadcast) and on start/stop transitions (presence) — see that
// file's routing-policy comment. Rendered directly, that's a discrete grid-cell snap every tick.
// This module turns "a sequence of waypoints arrived" into a smooth, continuously-advancing
// position that visits every waypoint in order, so the *rendering* layer
// (useSmoothedPlayerPositions.ts) can animate at 60fps and actually trace the real path instead of
// teleporting to (or diagonally cutting toward) whichever waypoint happened to be the last one a
// render got to see.
//
// Real-time movement bug investigation (2026-09): an earlier version of this module only ever held
// ONE pending leg (`retarget()` always overwrote it with the newest target). That is exactly what
// broke — usePlazaRealtime.ts's raw event handlers (broadcast/presence.join) can fire more than
// once per task (confirmed via node_modules/@supabase/phoenix's presence.js: a single track()
// update is delivered to the client as a *simultaneous* leave+join diff for the same key, and
// bursty broadcast delivery is a well-known WebSocket+React-batching interaction) — when that
// happens, React commits only ONE render for the whole burst, so any code that only reacts to "the
// latest known position" (props/state) silently skips every waypoint in between. This module (and
// presenceStore.ts's new `paths` accumulator) fixes that by never representing "where a player is"
// as a single point — always as a queue of waypoints to visit in order, at a fixed per-leg pace,
// however many arrived in whatever number of renders.

import { PLAZA_MOVE_TICK_MS } from './types';

export interface SmoothedPoint {
  x: number;
  y: number;
}

export interface InterpolationState {
  from: SmoothedPoint;
  to: SmoothedPoint;
  startTime: number; // same clock as the `now` passed to interpolatedPosition/enqueueWaypoint/advance (e.g. performance.now())
  // Waypoints still waiting to be visited after `to`, in arrival order. Optional (not just `[]`) so
  // existing state literals built by hand (tests, callers) don't have to spell it out every time.
  queue?: SmoothedPoint[];
}

// How long a single hop between two grid-cell targets takes to visually settle. Deliberately tied
// to PLAZA_MOVE_TICK_MS (the cadence new targets actually arrive at) rather than a bigger/rounder
// number: a duration much longer than the tick would mean the animation is still catching up to
// target N when target N+1 already arrived (perpetually lagging further behind, "chasey"), and a
// duration much shorter would finish early and sit still waiting for the next tick (a stutter).
// Matching the tick keeps steady-state lag clamped to ~1 tick, worst case.
export const PLAZA_SMOOTH_DURATION_MS = PLAZA_MOVE_TICK_MS;

// Max pending legs a single session's queue is allowed to hold. Bounds how far behind real-time a
// replay is allowed to fall after a long burst/stall (a tab hidden for several seconds, a network
// hiccup) — beyond this we drop the oldest queued waypoints and resync closer to "now" rather than
// literally replaying a multi-second-old backlog in slow motion. ~1.7s of buffered legs at the
// default 170ms duration — generous for ordinary jitter, short enough that a real stall doesn't
// leave the remote avatar looking noticeably stuck in the past.
export const PLAZA_PATH_QUEUE_CAP = 10;

/** A session's very first known position: no motion to animate, from === to, empty queue. */
export function createInterpolationState(point: SmoothedPoint, now: number): InterpolationState {
  return { from: point, to: point, startTime: now, queue: [] };
}

/** Position at time `now`, linearly interpolated from `from` to `to` over `durationMs`, clamped so
 * it never overshoots the target and never runs backward before `from` (reaching the target stops
 * advancing — later calls with a larger `now` keep returning `to` unchanged). Operates only on the
 * *current* leg — call `advance()` first if queued legs might need to start. */
export function interpolatedPosition(
  state: InterpolationState,
  now: number,
  durationMs: number = PLAZA_SMOOTH_DURATION_MS,
): SmoothedPoint {
  if (durationMs <= 0) return state.to;
  const elapsed = now - state.startTime;
  const t = elapsed <= 0 ? 0 : elapsed >= durationMs ? 1 : elapsed / durationMs;
  return {
    x: state.from.x + (state.to.x - state.from.x) * t,
    y: state.from.y + (state.to.y - state.from.y) * t,
  };
}

/** A new waypoint arrived (broadcast or presence-driven position update). If the session is
 * currently at rest (its last leg finished and nothing is queued), starts a new leg immediately —
 * same feel as the old design. Otherwise the session is mid-animation (or already has a backlog),
 * so the waypoint is appended to the queue instead of overwriting the active leg's target.
 *
 * This — not "always retarget to the newest point" — is the actual fix for the teleport/skipped-
 * path bug: when more than one waypoint for the same session arrives before a render can observe
 * them individually (see this file's header comment), each one still gets its own queued slot and
 * its own PLAZA_SMOOTH_DURATION_MS leg when advance() plays it back, instead of the earlier ones
 * being silently discarded in favor of only the last. */
export function enqueueWaypoint(
  state: InterpolationState,
  waypoint: SmoothedPoint,
  now: number,
  durationMs: number = PLAZA_SMOOTH_DURATION_MS,
): InterpolationState {
  const queue = state.queue ?? [];
  // "At rest" = no active leg to interrupt. Either the current leg already finished (elapsed-based,
  // the normal case for a session that moved before), OR from===to (positionally already settled —
  // true right after createInterpolationState(), where `now` can equal `startTime` itself, elapsed
  // 0; without this clause a session's very first waypoint would wait one whole extra leg before
  // starting to move, since "elapsed >= durationMs" alone would be false at that exact instant).
  const legSettled = state.from.x === state.to.x && state.from.y === state.to.y;
  const atRest = queue.length === 0 && (legSettled || now - state.startTime >= durationMs);

  if (atRest) {
    if (state.to.x === waypoint.x && state.to.y === waypoint.y) return state; // no-op: nothing moved
    return { from: state.to, to: waypoint, startTime: now, queue: [] };
  }

  const last = queue.length > 0 ? queue[queue.length - 1] : state.to;
  if (last.x === waypoint.x && last.y === waypoint.y) return state; // redundant announcement, no-op

  const appended = [...queue, waypoint];
  const capped = appended.length > PLAZA_PATH_QUEUE_CAP
    ? appended.slice(appended.length - PLAZA_PATH_QUEUE_CAP)
    : appended;
  return { from: state.from, to: state.to, startTime: state.startTime, queue: capped };
}

/** Call once per animation frame before reading interpolatedPosition(). If the current leg has
 * finished and waypoints are queued, starts the next leg(s) — chaining each new leg's startTime off
 * the *previous* leg's expected end (`startTime + durationMs`), not off `now`, so a rAF callback
 * that runs a little late doesn't compound into drift versus the sender's real cadence. Advances
 * through as many completed legs as `now` actually covers (e.g. if a frame was delayed past more
 * than one leg's duration), so a queue never "gets stuck" behind a single skipped frame. */
export function advance(
  state: InterpolationState,
  now: number,
  durationMs: number = PLAZA_SMOOTH_DURATION_MS,
): InterpolationState {
  let from = state.from;
  let to = state.to;
  let startTime = state.startTime;
  let queue = state.queue ?? [];
  let changed = false;

  while (queue.length > 0 && now - startTime >= durationMs) {
    from = to;
    to = queue[0];
    startTime += durationMs;
    queue = queue.slice(1);
    changed = true;
  }

  return changed ? { from, to, startTime, queue } : state;
}

/** True while `state` still has visible distance left to cover at time `now` (either the current
 * leg hasn't finished, or there are queued legs still waiting to play) — the rAF-driving hook uses
 * this to know when it can stop scheduling frames instead of animating forever. */
export function isInterpolating(
  state: InterpolationState,
  now: number,
  durationMs: number = PLAZA_SMOOTH_DURATION_MS,
): boolean {
  if (now - state.startTime < durationMs) return true;
  return (state.queue?.length ?? 0) > 0;
}
