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
  /** Question image, so the admin can switch questions without a DB request. Untrusted: see trustedLiveImage. */
  imageUrl?: string;
}
/** Sent after a successful server save: that save (revision) contains every stroke broadcast of the question up to `upToSeq`. */
export interface LiveSavedMessage {
  version: 1;
  kind: 'saved';
  attemptId: string;
  sessionId: string;
  sequence: number;
  saved: { questionKey: string; revision: number; upToSeq: number };
}
export interface WatchMessage { watcherId: string; state: 'watching' | 'stopped' }
export const watching = (watchers: Map<string, number>, now: number) =>
  [...watchers.values()].some(at => now >= at && now - at < WATCH_TTL_MS);
export const payloadFits = (payload: unknown) => new TextEncoder().encode(JSON.stringify(payload)).byteLength <= LIVE_MAX_BYTES;

/** Hints older than this are dropped even without a save signal (e.g. the `saved` broadcast was lost). */
export const LIVE_HINT_TTL_MS = 30000;
const LIVE_HINT_MAX = 200;
const LIVE_SAVED_MAX = 64;
export interface LiveHintEntry { at: number; message: LiveInkMessage }
interface LiveSavedEntry { at: number; sessionId: string; questionId: string; revision: number; upToSeq: number }
/** Broadcast state of one attempt on the admin side. Server polls stay authoritative; hints are only replayed on top.
 *  `focus`: question of the newest stroke broadcast (a slower save of the previous question must not pull the view back).
 *  `confirmed`: per session+question, the highest sequence a save signal proved to be in the server canon.
 *  `newest`: per session, the highest stroke-broadcast sequence received. Kept after the log is settled, so a late
 *  earlier broadcast (e.g. of the previous question) only fills in the log and never moves the focus back. */
export interface LiveHints {
  log: LiveHintEntry[];
  saved: LiveSavedEntry[];
  confirmed: Map<string, number>;
  newest: Map<string, number>;
  focus?: { questionId: string; number: number; imageUrl?: string; at: number };
}
const emptyHints = (): LiveHints => ({ log: [], saved: [], confirmed: new Map(), newest: new Map() });
const confirmedKey = (sessionId: string, questionId: string) => `${sessionId}\n${questionId}`;

/** Record a stroke broadcast. Within one student session the log stays in sequence order, so a late
 *  earlier message is replayed before the later ones. Messages already proved saved are ignored. */
export function receiveLiveInk(state: LiveHints | undefined, message: LiveInkMessage, now: number): LiveHints {
  const hints = state ?? emptyHints();
  // Decided before the confirmed check: a late earlier message must not take the focus even when it is dropped.
  const newest = message.sequence > (hints.newest.get(message.sessionId) ?? 0);
  if (message.sequence <= (hints.confirmed.get(confirmedKey(message.sessionId, message.questionId)) ?? 0)) return hints;
  const log = [...hints.log];
  let at = log.length;
  while (at > 0 && log[at - 1].message.sessionId === message.sessionId && log[at - 1].message.sequence > message.sequence) at--;
  log.splice(at, 0, { at: now, message });
  if (!newest) return { ...hints, log: log.length > LIVE_HINT_MAX ? log.slice(log.length - LIVE_HINT_MAX) : log };
  const sessions = new Map(hints.newest);
  sessions.delete(message.sessionId); // re-insert: the oldest session is evicted first
  sessions.set(message.sessionId, message.sequence);
  while (sessions.size > LIVE_SAVED_MAX) sessions.delete(sessions.keys().next().value!);
  return { ...hints, log: log.length > LIVE_HINT_MAX ? log.slice(log.length - LIVE_HINT_MAX) : log, newest: sessions,
    focus: { questionId: message.questionId, number: message.number, imageUrl: message.imageUrl, at: now } };
}

/** Record a save signal. It is applied by settleLiveHints once the polled canon reaches its revision. */
export function receiveLiveSaved(state: LiveHints | undefined, message: LiveSavedMessage, now: number): LiveHints {
  const hints = state ?? emptyHints();
  const { questionKey: questionId, revision, upToSeq } = message.saved;
  const saved = [...hints.saved, { at: now, sessionId: message.sessionId, questionId, revision, upToSeq }];
  return { ...hints, saved: saved.length > LIVE_SAVED_MAX ? saved.slice(saved.length - LIVE_SAVED_MAX) : saved };
}

/** Drop broadcasts the server canon is proved to contain: a save signal (session, question, R, S) applies once the
 *  polled canon of that question reached revision R and removes that session's hints of the question up to S.
 *  Nothing is inferred from stroke ids. Unproved hints, signals and the focus expire after LIVE_HINT_TTL_MS.
 *  Returns undefined when nothing is left to keep. */
export function settleLiveHints(hints: LiveHints, canonRevision: (questionId: string) => number | undefined, now: number,
  serverQuestionId?: string): LiveHints | undefined {
  const confirmed = new Map(hints.confirmed);
  const saved = hints.saved.filter(entry => {
    if (now - entry.at >= LIVE_HINT_TTL_MS) return false;
    if ((canonRevision(entry.questionId) ?? -1) < entry.revision) return true;
    const key = confirmedKey(entry.sessionId, entry.questionId);
    confirmed.set(key, Math.max(confirmed.get(key) ?? 0, entry.upToSeq));
    return false;
  });
  const log = hints.log.filter(({ at, message }) => now - at < LIVE_HINT_TTL_MS
    && message.sequence > (confirmed.get(confirmedKey(message.sessionId, message.questionId)) ?? 0));
  // The server reports the focused question itself: it no longer lags behind, the focus is not needed.
  const focus = hints.focus && now - hints.focus.at < LIVE_HINT_TTL_MS && hints.focus.questionId !== serverQuestionId ? hints.focus : undefined;
  // Watermarks stay (bounded) so a delayed duplicate of a saved message is not replayed again.
  while (confirmed.size > LIVE_SAVED_MAX) confirmed.delete(confirmed.keys().next().value!);
  if (!log.length && !saved.length && !focus && !confirmed.size && !hints.newest.size) return undefined;
  return { log, saved, confirmed, newest: hints.newest, focus };
}

interface LiveViewRow { questionId: string; number: number; imageUrl: string; updatedAt: string; ink: LiveInkState | null }
/** View = server canon of the focused question + its unconfirmed broadcasts replayed in order. */
export function composeLiveView<T extends LiveViewRow>(server: T, hints: LiveHints | undefined,
  cached: (questionId: string) => LiveInkState | undefined, imageOf: (questionId: string) => string | undefined): T {
  if (!hints) return server;
  const focus = hints.focus;
  const questionId = focus?.questionId ?? server.questionId;
  const same = questionId === server.questionId;
  const entries = hints.log.filter(entry => entry.message.questionId === questionId);
  if (same && !entries.length) return server;
  const canon = same ? server.ink : cached(questionId) ?? null;
  const strokes = entries.reduce((current, entry) => applyBroadcast(current, entry.message), canon?.strokes ?? []);
  const latest = Math.max(focus?.at ?? 0, entries.at(-1)?.at ?? 0);
  return { ...server, questionId, number: same ? server.number : focus!.number,
    imageUrl: same ? server.imageUrl : imageOf(questionId) ?? focus?.imageUrl ?? '',
    updatedAt: latest && !(Date.parse(server.updatedAt) >= latest) ? new Date(latest).toISOString() : server.updatedAt,
    ink: { revision: canon?.revision ?? 0, strokes } };
}

/** Only the paper's own static question images: a student's broadcast must not make the admin load any other URL. */
export function trustedLiveImage(paperId: string, url: string | undefined): string | undefined {
  if (!url || !url.startsWith(`/exams/${paperId}/`)) return undefined;
  return /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,120}\.(png|jpe?g|webp)$/.test(url.slice(paperId.length + 8)) ? url : undefined;
}

/** Admin-console diagnostics: strokes that were visible and vanished when a poll replaced the view. */
export function vanishedStrokes(before: InkStroke[] | undefined, after: InkStroke[] | undefined) {
  const kept = new Set((after ?? []).map(stroke => stroke.id));
  return (before ?? []).filter(stroke => !kept.has(stroke.id)).length;
}

const SEQUENCE_WINDOW = 256;
export interface LiveSequenceState { max: number; seen: Set<number> }
type Sequenced = { attemptId: string; sessionId: string; sequence: number };
/** Messages skipped between the newest accepted and this one (same student session). Call before acceptLiveSequence. */
export function liveSequenceGap(sequences: Map<string, LiveSequenceState>, message: Sequenced) {
  const last = sequences.get(`${message.attemptId}:${message.sessionId}`)?.max;
  return last === undefined || message.sequence <= last ? 0 : message.sequence - last - 1;
}

/** Each sequence of a session is accepted once, in any order: a late earlier message is not lost. Replays are ignored. */
export function acceptLiveSequence(sequences: Map<string, LiveSequenceState>, message: Sequenced): boolean {
  const key = `${message.attemptId}:${message.sessionId}`;
  let state = sequences.get(key);
  if (state && (state.seen.has(message.sequence) || message.sequence <= state.max - SEQUENCE_WINDOW)) return false;
  if (!state) {
    if (sequences.size >= 128) sequences.delete(sequences.keys().next().value!);
    state = { max: 0, seen: new Set() };
    sequences.set(key, state);
  }
  state.seen.add(message.sequence);
  state.max = Math.max(state.max, message.sequence);
  if (state.seen.size > SEQUENCE_WINDOW) for (const seq of state.seen) if (seq <= state.max - SEQUENCE_WINDOW) state.seen.delete(seq);
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

const shortString = (x: unknown) => typeof x === 'string' && x.length > 0 && x.length <= 200;
/** Treat browser broadcasts as untrusted, ephemeral hints. Server polling remains authoritative. */
export function parseLiveInk(value: unknown): LiveInkMessage | null {
  try {
    if (!value || typeof value !== 'object' || !payloadFits(value)) return null;
    const m = value as LiveInkMessage;
    if (m.version !== 1 || ![m.attemptId, m.questionId, m.sessionId].every(shortString)
      || !Number.isSafeInteger(m.sequence) || m.sequence < 1 || !Number.isSafeInteger(m.number) || m.number < 1
      || !Array.isArray(m.removed) || !m.removed.every(x => typeof x === 'string') || !Array.isArray(m.added)
      || (m.imageUrl !== undefined && !(typeof m.imageUrl === 'string' && m.imageUrl.length <= 300))) return null;
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

export function parseLiveSaved(value: unknown): LiveSavedMessage | null {
  if (!value || typeof value !== 'object') return null;
  const m = value as LiveSavedMessage;
  const positive = (x: unknown) => Number.isSafeInteger(x) && (x as number) >= 1;
  if (m.version !== 1 || m.kind !== 'saved' || ![m.attemptId, m.sessionId].every(shortString) || !positive(m.sequence)
    || !m.saved || typeof m.saved !== 'object' || !shortString(m.saved.questionKey)
    || !positive(m.saved.revision) || !positive(m.saved.upToSeq)) return null;
  return m;
}

export interface BatchClock { schedule(fn: () => void, ms: number): unknown; cancel(timer: unknown): void }
const SENT_RECORDS_MAX = 256;
const MARKS_MAX = 4096;
/** Fixed window from the first edit: continuous drawing cannot postpone a batch indefinitely.
 *  Each broadcast edit gets a local number (mark) by its InkSync event id (none = never part of a server save).
 *  The batcher remembers the newest mark each sent message carried, so `saved` can name the last message a save fully contains. */
export function createInkBatcher(send: (message: LiveInkMessage | LiveSavedMessage) => void, clock: BatchClock, sessionId: string) {
  type Pending = { before: InkStroke[]; after: InkStroke[]; attemptId: string; questionId: string; number: number; imageUrl?: string; last: number };
  const pending = new Map<string, Pending>();
  const savedPending = new Map<string, { attemptId: string; questionId: string; revision: number; mark: number }>();
  // Per attempt+question, in sequence order: the newest edit mark each sent message carried.
  const records = new Map<string, Array<{ sequence: number; last: number }>>();
  const announced = new Map<string, number>();
  const marks = new Map<string, number>();
  let timer: unknown, sequence = 0, lastMark = 0;
  const flush = () => {
    timer = undefined;
    for (const [key, item] of pending) {
      const delta = inkDelta(item.before, item.after, 'draw');
      if (!delta.added.length && !delta.removed.length) continue;
      // Number only messages that are sent, so a receiver-side gap means a message was really lost.
      const message: LiveInkMessage = { version: 1, sessionId, sequence: sequence + 1, attemptId: item.attemptId,
        questionId: item.questionId, number: item.number, added: delta.added, removed: delta.removed,
        ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}) };
      if (!payloadFits(message)) continue;
      sequence = message.sequence;
      const sent = [...(records.get(key) ?? []), { sequence, last: item.last }];
      records.set(key, sent.length > SENT_RECORDS_MAX ? sent.slice(sent.length - SENT_RECORDS_MAX) : sent);
      send(message);
    }
    pending.clear();
    // After the stroke messages, so a save that already contains them confirms them in the same window.
    for (const [key, item] of savedPending) {
      let upToSeq = announced.get(key) ?? 0;
      const sent = records.get(key) ?? [];
      for (const record of sent) { if (record.last > item.mark) break; upToSeq = record.sequence; }
      records.set(key, sent.filter(record => record.sequence > upToSeq));
      if (upToSeq <= (announced.get(key) ?? 0)) continue; // nothing new to confirm: no message
      announced.set(key, upToSeq);
      sequence++;
      send({ version: 1, kind: 'saved', sessionId, sequence, attemptId: item.attemptId,
        saved: { questionKey: item.questionId, revision: item.revision, upToSeq } });
    }
    savedPending.clear();
  };
  const schedule = () => { if (timer === undefined) timer = clock.schedule(flush, LIVE_BATCH_MS); };
  return {
    /** `eventId`: the InkSync edit this change was recorded as (undefined = not saved to the server). */
    change(attemptId: string, questionId: string, number: number, before: InkStroke[], after: InkStroke[], eventId?: string, imageUrl?: string) {
      let mark: number | undefined;
      if (eventId) {
        mark = ++lastMark;
        marks.set(eventId, mark);
        if (marks.size > MARKS_MAX) marks.delete(marks.keys().next().value!);
      }
      const key = `${attemptId}:${questionId}`;
      const old = pending.get(key);
      const last = mark === undefined || old?.last === Infinity ? Infinity : Math.max(old?.last ?? 0, mark);
      // Re-insert so the question edited last is flushed last: it is the one the student is on.
      pending.delete(key);
      pending.set(key, { attemptId, questionId, number, imageUrl, before: old?.before ?? before, after, last });
      schedule();
    },
    /** InkSync.onSaved: a server save of the question at `revision` contained these edits (a prefix of its edits).
     *  At most one message per call, none when no broadcast became confirmed. */
    saved(attemptId: string, questionId: string, revision: number, eventIds: string[]) {
      let mark: number | undefined;
      for (const id of eventIds) {
        const edit = marks.get(id);
        if (edit === undefined) continue;
        marks.delete(id);
        mark = Math.max(mark ?? 0, edit);
      }
      if (mark === undefined) return;
      const key = `${attemptId}:${questionId}`;
      const old = savedPending.get(key);
      savedPending.set(key, { attemptId, questionId, revision: Math.max(revision, old?.revision ?? 0), mark: Math.max(mark, old?.mark ?? 0) });
      schedule();
    },
    clear() { if (timer !== undefined) clock.cancel(timer); timer = undefined; pending.clear(); savedPending.clear(); },
  };
}
