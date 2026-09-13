// Pixel World Phase 2A rework (Worker B) — pure interpolation math for smoothing remote players'
// on-screen movement. No React, no Supabase, no Date.now()/timers of its own — "now" is always
// passed in as data, same convention as presenceStore.ts's pure reducer, so this stays trivially
// unit-testable (node --test) without mocking clocks or animation frames.
//
// Why this exists: usePlazaRealtime.ts's `players` only updates roughly every PLAZA_MOVE_TICK_MS
// (170ms) while someone is moving (broadcast) and on start/stop transitions (presence) — see that
// file's routing-policy comment. Rendered directly, that's a discrete grid-cell snap every tick.
// This module turns "a new target arrived" into a smooth, continuously-advancing position between
// the last resting point and the new target, so the *rendering* layer (useSmoothedPlayerPositions.ts)
// can animate at 60fps between ticks instead of teleporting.

import { PLAZA_MOVE_TICK_MS } from './types';

export interface SmoothedPoint {
  x: number;
  y: number;
}

export interface InterpolationState {
  from: SmoothedPoint;
  to: SmoothedPoint;
  startTime: number; // same clock as the `now` passed to interpolatedPosition/retarget (e.g. performance.now())
}

// How long a single hop between two grid-cell targets takes to visually settle. Deliberately tied
// to PLAZA_MOVE_TICK_MS (the cadence new targets actually arrive at) rather than a bigger/rounder
// number: a duration much longer than the tick would mean the animation is still catching up to
// target N when target N+1 already arrived (perpetually lagging further behind, "chasey"), and a
// duration much shorter would finish early and sit still waiting for the next tick (a stutter).
// Matching the tick keeps steady-state lag clamped to ~1 tick, worst case.
export const PLAZA_SMOOTH_DURATION_MS = PLAZA_MOVE_TICK_MS;

/** A session's very first known position: no motion to animate, from === to. */
export function createInterpolationState(point: SmoothedPoint, now: number): InterpolationState {
  return { from: point, to: point, startTime: now };
}

/** Position at time `now`, linearly interpolated from `from` to `to` over `durationMs`, clamped so
 * it never overshoots the target and never runs backward before `from` (reaching the target stops
 * advancing — later calls with a larger `now` keep returning `to` unchanged). */
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

/** A fresh target arrived (new broadcast/presence tick). Redirects smoothly: the new leg starts
 * from wherever the animation actually is right now (not from the old target), so a target change
 * mid-flight bends the path instead of jumping. A no-op (same object returned) when the target is
 * unchanged, so redundant updates (e.g. a presence track whose x/y didn't move) don't reset the
 * animation clock and restart a completed interpolation from itself. */
export function retarget(
  state: InterpolationState,
  target: SmoothedPoint,
  now: number,
  durationMs: number = PLAZA_SMOOTH_DURATION_MS,
): InterpolationState {
  if (state.to.x === target.x && state.to.y === target.y) return state;
  const current = interpolatedPosition(state, now, durationMs);
  return { from: current, to: target, startTime: now };
}

/** True while `state` still has visible distance left to cover at time `now` — the rAF-driving
 * hook uses this to know when it can stop scheduling frames instead of animating forever. */
export function isInterpolating(
  state: InterpolationState,
  now: number,
  durationMs: number = PLAZA_SMOOTH_DURATION_MS,
): boolean {
  return now - state.startTime < durationMs;
}
