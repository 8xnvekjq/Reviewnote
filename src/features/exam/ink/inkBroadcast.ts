import type { InkStroke } from '../contract.ts';
import { inkDelta } from './inkReplay.ts';
import type { LiveInkState } from './inkLive.ts';

export const LIVE_BATCH_MS = 750;
export const WATCH_TTL_MS = 60000;
export const WATCH_INTERVAL_MS = 25000;
export const LIVE_MAX_BYTES = 200 * 1024;
export interface LiveInkMessage {
  version: 1;
  attemptId: string;
  questionId: string;
  number: number;
  sessionId: string;
  sequence: number;
  added: Array<{ index: number; stroke: InkStroke }>;
  removed: string[];
}
export interface WatchMessage { watcherId: string; state: 'watching' | 'stopped' }
export const watching = (watchers: Map<string, number>, now: number) =>
  [...watchers.values()].some(at => now >= at && now - at < WATCH_TTL_MS);
export const payloadFits = (payload: unknown) => new TextEncoder().encode(JSON.stringify(payload)).byteLength <= LIVE_MAX_BYTES;

/** A metadata-only poll must not erase unsaved hints; a received ink RPC always wins. */
export function reconcileLiveView<T extends { questionId: string; number: number; imageUrl: string; updatedAt: string; ink: LiveInkState | null }>(
  server: T, view: T | undefined, authoritativeInk: boolean,
): T {
  if (!view || authoritativeInk) return server;
  return { ...server, questionId: view.questionId, number: view.number, imageUrl: view.imageUrl, updatedAt: view.updatedAt, ink: view.ink };
}

export function acceptLiveSequence(sequences: Map<string, number>, message: LiveInkMessage): boolean {
  const key = `${message.attemptId}:${message.sessionId}`;
  if (message.sequence <= (sequences.get(key) ?? 0)) return false;
  if (!sequences.has(key) && sequences.size >= 128) sequences.delete(sequences.keys().next().value!);
  sequences.set(key, message.sequence);
  return true;
}

export function applyBroadcast(strokes: InkStroke[], message: LiveInkMessage): InkStroke[] {
  const removed = new Set(message.removed);
  const next = strokes.filter(stroke => !removed.has(stroke.id));
  for (const { index, stroke } of message.added) {
    const duplicate = next.findIndex(item => item.id === stroke.id);
    if (duplicate >= 0) next.splice(duplicate, 1);
    next.splice(Math.min(index, next.length), 0, stroke);
  }
  return next;
}

/** Treat browser broadcasts as untrusted, ephemeral hints. Server polling remains authoritative. */
export function parseLiveInk(value: unknown): LiveInkMessage | null {
  try {
    if (!value || typeof value !== 'object' || !payloadFits(value)) return null;
    const m = value as LiveInkMessage;
    if (m.version !== 1 || ![m.attemptId, m.questionId, m.sessionId].every(x => typeof x === 'string' && x.length > 0 && x.length <= 200)
      || !Number.isSafeInteger(m.sequence) || m.sequence < 1 || !Number.isSafeInteger(m.number) || m.number < 1
      || !Array.isArray(m.removed) || !m.removed.every(x => typeof x === 'string') || !Array.isArray(m.added)) return null;
    for (const a of m.added) {
      const s = a.stroke;
      if (!Number.isSafeInteger(a.index) || a.index < 0 || !s || typeof s.id !== 'string'
        || !['pen', 'highlighter'].includes(s.tool) || typeof s.color !== 'string' || !Number.isFinite(s.size)
        || !Array.isArray(s.points) || !s.points.every(p => p && [p.x, p.y, p.pressure, p.t].every(Number.isFinite))) return null;
      // Shapes are drawn by the canvas without further validation; reject malformed shapes.
      if (s.shape) {
        const shape = s.shape;
        const pair = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
        if (shape.kind === 'line') { if (!pair(shape.from) || !pair(shape.to)) return null; }
        else if (shape.kind === 'ellipse') { if (![shape.cx, shape.cy, shape.rx, shape.ry, shape.rotation].every(Number.isFinite)) return null; }
        else if (shape.kind === 'polygon' || shape.kind === 'curve') { if (!Array.isArray(shape.points) || !shape.points.every(pair)) return null; }
        else return null;
      }
    }
    return m;
  } catch { return null; }
}

export interface BatchClock { schedule(fn: () => void, ms: number): unknown; cancel(timer: unknown): void }
/** Fixed window from the first edit: continuous drawing cannot postpone a batch indefinitely. */
export function createInkBatcher(send: (message: LiveInkMessage) => void, clock: BatchClock, sessionId: string) {
  const pending = new Map<string, { before: InkStroke[]; after: InkStroke[]; attemptId: string; questionId: string; number: number }>();
  let timer: unknown, sequence = 0;
  const flush = () => {
    timer = undefined;
    for (const item of pending.values()) {
      const delta = inkDelta(item.before, item.after, 'draw');
      const message: LiveInkMessage = { version: 1, sessionId, sequence: ++sequence, attemptId: item.attemptId,
        questionId: item.questionId, number: item.number, added: delta.added, removed: delta.removed };
      if ((message.added.length || message.removed.length) && payloadFits(message)) send(message);
    }
    pending.clear();
  };
  return {
    change(attemptId: string, questionId: string, number: number, before: InkStroke[], after: InkStroke[]) {
      const key = `${attemptId}:${questionId}`;
      const old = pending.get(key);
      pending.set(key, { attemptId, questionId, number, before: old?.before ?? before, after });
      if (timer === undefined) timer = clock.schedule(flush, LIVE_BATCH_MS);
    },
    clear() { if (timer !== undefined) clock.cancel(timer); timer = undefined; pending.clear(); },
  };
}
