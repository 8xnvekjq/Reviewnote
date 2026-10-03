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

/** Hints older than this are dropped: a working student saves every ~5s and the admin polls every ~5s. */
export const LIVE_HINT_TTL_MS = 30000;
const LIVE_HINT_MAX = 200;
export interface LiveHintEntry { at: number; message: LiveInkMessage }

/** Received broadcasts per attempt, kept until the server snapshot contains them (or they expire). */
export function addLiveHint(log: LiveHintEntry[] | undefined, message: LiveInkMessage, now: number): LiveHintEntry[] {
  const next = [...(log ?? []), { at: now, message }];
  return next.length > LIVE_HINT_MAX ? next.slice(next.length - LIVE_HINT_MAX) : next;
}

/** A broadcast is contained in a snapshot when every stroke it added is there and nothing it removed came back.
 *  Removal-only messages never confirm: they are harmless to replay and cannot prove the snapshot is newer. */
function containedIn(ids: Set<string>, message: LiveInkMessage) {
  const added = new Set(message.added.map(item => item.stroke.id));
  return added.size > 0 && [...added].every(id => ids.has(id)) && message.removed.every(id => added.has(id) || !ids.has(id));
}

/** Drop expired hints and everything up to the newest hint a server snapshot already contains.
 *  Older hints of other questions go too: otherwise a leftover from the previous question would
 *  become the newest entry and pull the view back once the current question is confirmed. */
export function pruneLiveHints(log: LiveHintEntry[], canonical: (questionId: string) => InkStroke[] | undefined, now: number) {
  const fresh = log.filter(entry => now - entry.at < LIVE_HINT_TTL_MS);
  const ids = new Map<string, Set<string> | null>();
  let cut = -1;
  fresh.forEach((entry, index) => {
    const questionId = entry.message.questionId;
    if (!ids.has(questionId)) { const strokes = canonical(questionId); ids.set(questionId, strokes ? new Set(strokes.map(s => s.id)) : null); }
    const known = ids.get(questionId);
    if (known && containedIn(known, entry.message)) cut = index;
  });
  return fresh.slice(cut + 1);
}

interface LiveViewRow { questionId: string; number: number; imageUrl: string; updatedAt: string; ink: LiveInkState | null }
/** View = server canon for the hinted question + unconfirmed broadcasts replayed on top.
 *  The newest broadcast decides the question: a slower save of the previous question must not pull the view back. */
export function composeLiveView<T extends LiveViewRow>(server: T, log: LiveHintEntry[] | undefined,
  cached: (questionId: string) => LiveInkState | undefined, imageOf: (questionId: string) => string | undefined): T {
  const last = log?.at(-1);
  if (!log || !last) return server;
  const { questionId, number } = last.message;
  const same = questionId === server.questionId;
  const canon = same ? server.ink : cached(questionId) ?? null;
  const strokes = log.filter(entry => entry.message.questionId === questionId)
    .reduce((current, entry) => applyBroadcast(current, entry.message), canon?.strokes ?? []);
  return { ...server, questionId, number, imageUrl: same ? server.imageUrl : imageOf(questionId) ?? '',
    updatedAt: !(Date.parse(server.updatedAt) >= last.at) ? new Date(last.at).toISOString() : server.updatedAt, ink: { revision: canon?.revision ?? 0, strokes } };
}

/** Admin-console diagnostics: strokes that were visible and vanished when a poll replaced the view. */
export function vanishedStrokes(before: InkStroke[] | undefined, after: InkStroke[] | undefined) {
  const kept = new Set((after ?? []).map(stroke => stroke.id));
  return (before ?? []).filter(stroke => !kept.has(stroke.id)).length;
}

/** Messages skipped between the last accepted and this one (same student session). Call before acceptLiveSequence. */
export function liveSequenceGap(sequences: Map<string, number>, message: LiveInkMessage) {
  const last = sequences.get(`${message.attemptId}:${message.sessionId}`);
  return last === undefined || message.sequence <= last ? 0 : message.sequence - last - 1;
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
      if (!delta.added.length && !delta.removed.length) continue;
      // Number only messages that are sent, so a receiver-side gap means a message was really lost.
      const message: LiveInkMessage = { version: 1, sessionId, sequence: sequence + 1, attemptId: item.attemptId,
        questionId: item.questionId, number: item.number, added: delta.added, removed: delta.removed };
      if (!payloadFits(message)) continue;
      sequence = message.sequence;
      send(message);
    }
    pending.clear();
  };
  return {
    change(attemptId: string, questionId: string, number: number, before: InkStroke[], after: InkStroke[]) {
      const key = `${attemptId}:${questionId}`;
      const old = pending.get(key);
      // Re-insert so the question edited last is flushed last: it is the one the student is on.
      pending.delete(key);
      pending.set(key, { attemptId, questionId, number, before: old?.before ?? before, after });
      if (timer === undefined) timer = clock.schedule(flush, LIVE_BATCH_MS);
    },
    clear() { if (timer !== undefined) clock.cancel(timer); timer = undefined; pending.clear(); },
  };
}
