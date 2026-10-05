import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptLiveSequence, applyBroadcast, composeLiveView, createInkBatcher, LIVE_BATCH_MS, LIVE_HINT_TTL_MS, LIVE_MAX_BYTES,
  liveSequenceGap, parseLiveInk, parseLiveSaved, payloadFits, receiveLiveInk, receiveLiveSaved, settleLiveHints, trustedLiveImage,
  vanishedStrokes, watching, type LiveHints, type LiveInkMessage, type LiveSavedMessage, type LiveSequenceState,
} from '../../src/features/exam/ink/inkBroadcast.ts';
import { nextImageRecovery, nextLiveFrame } from '../../src/features/exam/ui/liveFrame.ts';
import { applyLiveInk } from '../../src/features/exam/ink/inkLive.ts';
import type { InkStroke } from '../../src/features/exam/contract.ts';

const a: InkStroke = { id: 'a', tool: 'pen', color: '#123456', size: 3, points: [] };
const b = { ...a, id: 'b' };
const message = { version: 1 as const, attemptId: 'attempt', questionId: 'question', number: 1, sessionId: 'session', sequence: 1,
  added: [{ index: 0, stroke: a }], removed: [] };

test('navigation without ink broadcasts focus after pending old-question edits, without saving strokes', () => {
  let flush = () => {};
  const sent: Array<LiveInkMessage | LiveSavedMessage> = [];
  const batch = createInkBatcher(m => sent.push(m), { schedule(fn) { flush = fn; return 1; }, cancel() {} }, 'session');
  batch.change('attempt', 'question', 1, [], [a]);
  batch.focus('attempt', 'next', 2, '/next.webp');
  flush();
  assert.equal(sent.length, 2);
  const focus = parseLiveInk(sent[1])!;
  assert.equal(focus.questionId, 'next');
  assert.deepEqual(focus.added, []); assert.deepEqual(focus.removed, []);
  const hints = receiveLiveInk(receiveLiveInk(undefined, sent[0] as LiveInkMessage, 0), focus, 1);
  assert.equal(hints.focus?.questionId, 'next');
  batch.focus('attempt', 'discarded', 3); batch.clear(); flush();
  assert.equal(sent.length, 2);
});

test('fixed 750ms window coalesces additions/removals, bounds latency while drawing, cancels stopped watchers', () => {
  let now = 0;
  const tasks = new Map<number, { at: number; fn: () => void }>();
  let id = 0;
  const advance = (ms: number) => { now += ms; for (const [key, task] of tasks) if (task.at <= now) { tasks.delete(key); task.fn(); } };
  const sent: typeof message[] = [];
  const batch = createInkBatcher(m => sent.push(m), {
    schedule(fn, ms) { tasks.set(++id, { at: now + ms, fn }); return id; }, cancel(timer) { tasks.delete(timer as number); },
  }, 'session');
  batch.change('attempt', 'question', 1, [], [a]);
  advance(500);
  batch.change('attempt', 'question', 1, [a], [a, b]);
  advance(LIVE_BATCH_MS - 501); assert.equal(sent.length, 0);
  advance(1); assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].added.map(x => x.stroke.id), ['a', 'b']);
  batch.change('attempt', 'question', 1, [a, b], [b]);
  batch.change('attempt', 'question', 1, [b], []);
  advance(LIVE_BATCH_MS);
  assert.deepEqual(sent[1].removed, ['a', 'b']); assert.equal(sent[1].sequence, 2);
  batch.change('attempt', 'question', 1, [], [a]); batch.clear(); advance(1000);
  assert.equal(sent.length, 2);
});

test('idempotent additions, erasure, undo replacements, and authoritative server reconciliation', () => {
  const canonical = { revision: 4, strokes: [b] };
  const hinted = applyBroadcast(canonical.strokes, message);
  assert.deepEqual(hinted.map(x => x.id), ['a', 'b']);
  assert.deepEqual(applyBroadcast(hinted, message), hinted);
  assert.deepEqual(applyBroadcast(hinted, { ...message, added: [], removed: ['a'] }), [b]);
  assert.deepEqual(applyBroadcast([a, b], { ...message, removed: ['a'], added: [{ index: 0, stroke: { ...a, color: '#fff' } }] })[0].color, '#fff');
  const result = applyLiveInk(canonical, { mode: 'delta', revision: 4, batches: [] });
  assert.deepEqual(result, canonical, 'RPC uses canonical baseline, never optimistic strokes');
  assert.deepEqual(applyLiveInk(canonical, { mode: 'full', revision: 5, strokes: [] }), { revision: 5, strokes: [] });
});

test('watch leases expire at sixty seconds, stopping one admin preserves other watchers', () => {
  const watchers = new Map([['one', 1000], ['two', 2000]]);
  assert.equal(watching(watchers, 60999), true);
  watchers.delete('two');
  assert.equal(watching(watchers, 60999), true);
  assert.equal(watching(watchers, 61000), false);
  assert.equal(watching(watchers, 999), false);
  assert.equal(watching(new Map(), 1000), false);
});

test('replays are ignored, late earlier messages are accepted once, a reopened session restarts its sequence', () => {
  const sequences = new Map<string, LiveSequenceState>();
  assert.equal(acceptLiveSequence(sequences, { ...message, sequence: 2 }), true);
  assert.equal(acceptLiveSequence(sequences, message), true, 'sequence 1 arriving after 2 is not dropped');
  assert.equal(acceptLiveSequence(sequences, message), false);
  assert.equal(acceptLiveSequence(sequences, { ...message, sequence: 2 }), false);
  assert.equal(acceptLiveSequence(sequences, { ...message, sessionId: 'new' }), true);
  for (let i = 0; i < 200; i++) acceptLiveSequence(sequences, { ...message, sessionId: `session-${i}` });
  assert.equal(sequences.size, 128);
});

test('UTF-8 byte cap, invalid/laser messages ignored, oversized batches skipped', () => {
  assert.equal(payloadFits('x'.repeat(LIVE_MAX_BYTES - 2)), true);
  assert.equal(payloadFits('x'.repeat(LIVE_MAX_BYTES - 1)), false);
  assert.equal(payloadFits('한'.repeat(LIVE_MAX_BYTES / 2)), false);
  assert.deepEqual(parseLiveInk(message), message);
  assert.equal(parseLiveInk({ ...message, sequence: NaN }), null);
  assert.equal(parseLiveInk({ ...message, added: [{ index: 0, stroke: { ...a, tool: 'laser' } }] }), null);
  assert.equal(parseLiveInk({ ...message, added: [{ index: 0, stroke: { ...a, shape: { kind: 'line' } } }] }), null);
  const sent: unknown[] = [];
  let flush = () => {};
  const batch = createInkBatcher(m => sent.push(m), { schedule(fn) { flush = fn; return 1; }, cancel() {} }, 's');
  batch.change('attempt', 'q', 1, [], [{ ...a, color: 'x'.repeat(LIVE_MAX_BYTES) }]); flush();
  assert.equal(sent.length, 0);
});

const c = { ...a, id: 'c' };
const msg = (sequence: number, questionId: string, added: InkStroke[], removed: string[] = [], number = 1, at = 0, sessionId = 'session'): LiveInkMessage =>
  ({ ...message, sessionId, sequence, questionId, number, added: added.map((stroke, index) => ({ index: at + index, stroke })), removed });
const savedMsg = (sequence: number, questionKey: string, revision: number, upToSeq: number, sessionId = 'session'): LiveSavedMessage =>
  ({ version: 1, kind: 'saved', attemptId: 'attempt', sessionId, sequence, saved: { questionKey, revision, upToSeq } });
const row = (questionId: string, revision: number, strokes: InkStroke[], imageUrl = `/${questionId}.png`) =>
  ({ attemptId: 'attempt', questionId, number: 1, imageUrl, updatedAt: '2026-10-04T00:00:00.000Z', ink: { revision, strokes } });
const hintsOf = (...items: Array<[LiveInkMessage | LiveSavedMessage, number]>) => items.reduce<LiveHints | undefined>((state, [m, at]) =>
  'kind' in m ? receiveLiveSaved(state, m, at) : receiveLiveInk(state, m, at), undefined);
const ids = (state: LiveHints | undefined, server: ReturnType<typeof row>) =>
  composeLiveView(server, state, () => undefined, () => undefined).ink?.strokes.map(s => s.id);

test('missing strokes: a poll snapshot older than the broadcast keeps the broadcast strokes until a save proves them', () => {
  // Server saved [a] (revision 1); the student then drew b, which only reached the admin by broadcast.
  let state = hintsOf([msg(1, 'q', [b], [], 1, 1), 1000]);
  state = settleLiveHints(state!, () => 1, 3000, 'q');
  assert.deepEqual(ids(state, row('q', 1, [a])), ['a', 'b'], 'the authoritative replacement does not erase b');
  // Revision 2 is polled but its save signal has not arrived: b stays (nothing is guessed from stroke ids).
  state = settleLiveHints(state!, () => 2, 3500, 'q');
  assert.equal(state?.log.length, 1);
  // Save signal: revision 2 contains broadcasts up to sequence 1.
  state = settleLiveHints(receiveLiveSaved(state, savedMsg(2, 'q', 2, 1), 4000), () => 2, 4000, 'q');
  assert.deepEqual(state?.log ?? [], []);
  // A signal for a revision the poll has not reached yet waits for it.
  const waiting = settleLiveHints(hintsOf([msg(1, 'q', [b]), 0], [savedMsg(2, 'q', 3, 1), 0])!, () => 2, 100, 'q');
  assert.equal(waiting?.log.length, 1); assert.equal(waiting?.saved.length, 1);
  assert.deepEqual(settleLiveHints(waiting!, () => 3, 200, 'q')?.log, []);
  // Expired hints fall back to the server even if never confirmed (lost save signal).
  assert.deepEqual(settleLiveHints(hintsOf([msg(1, 'q', [b]), 2000])!, () => 9, 2000 + LIVE_HINT_TTL_MS, 'q')?.log ?? [], []);
});

test('review repro 1: undo of a saved stroke does not acknowledge an unrelated unsaved stroke', () => {
  // Canon [a] -> broadcast b -> erase a -> undo restores the same id a -> poll still [a] (nothing saved yet).
  let state = hintsOf([msg(1, 'q', [b], [], 1, 1), 1000], [msg(2, 'q', [], ['a']), 1800], [msg(3, 'q', [a]), 2600]);
  state = settleLiveHints(state!, () => 1, 3000, 'q');
  assert.deepEqual(new Set(ids(state, row('q', 1, [a]))), new Set(['a', 'b']));
  // Same id with replaced content is not taken as proof either.
  state = hintsOf([msg(1, 'q', [b]), 0], [msg(2, 'q', [{ ...a, color: '#fff' }], ['a'], 1, 1), 100]);
  state = settleLiveHints(state!, () => 1, 200, 'q');
  assert.equal(state?.log.length, 2);
  const view = composeLiveView(row('q', 1, [a]), state, () => undefined, () => undefined);
  assert.deepEqual(view.ink?.strokes.map(s => [s.id, s.color]), [['b', '#123456'], ['a', '#fff']]);
});

test('review repro 2: an older erase never reverts a newer saved undo', () => {
  // Erase a (seq 1) arrives, the undo broadcast (seq 2) is lost, both are saved as revision 3 [a].
  // The save signal says revision 3 contains everything up to sequence 2: the stale erase goes.
  const erased = hintsOf([msg(1, 'q', [], ['a']), 1000]);
  assert.deepEqual(ids(erased, row('q', 1, [a])), [], 'before the save the admin shows what it was told');
  const saved = settleLiveHints(receiveLiveSaved(erased, savedMsg(3, 'q', 3, 2), 7000), () => 3, 8000, 'q');
  assert.deepEqual(ids(saved, row('q', 3, [a])), ['a']);
  // A delayed duplicate of the stale erase is ignored once confirmed.
  assert.deepEqual(ids(receiveLiveInk(saved, msg(1, 'q', [], ['a']), 8100), row('q', 3, [a])), ['a']);
  // The save signal is lost as well: the erase is replayed only until the TTL, then the canon wins.
  const lost = settleLiveHints(erased!, () => 3, 1000 + LIVE_HINT_TTL_MS, 'q');
  assert.deepEqual(ids(lost, row('q', 3, [a])), ['a']);
  // The next save signal of the question confirms everything up to its sequence, older messages included.
  const next = hintsOf([msg(1, 'q', [], ['a']), 0], [msg(3, 'q', [c]), 50], [savedMsg(4, 'q', 4, 3), 60]);
  assert.deepEqual(ids(settleLiveHints(next!, () => 4, 100, 'q'), row('q', 4, [a, c])), ['a', 'c']);
});

test('review repro 3: reordered independent broadcasts keep both strokes, dependent ones replay in sequence order', () => {
  const sequences = new Map<string, LiveSequenceState>();
  let strokes: InkStroke[] = [];
  for (const m of [msg(2, 'q', [b]), msg(1, 'q', [a])]) if (acceptLiveSequence(sequences, m)) strokes = applyBroadcast(strokes, m);
  assert.deepEqual(new Set(strokes.map(s => s.id)), new Set(['a', 'b']));
  // Draw a (1) then erase it (2), received as 2, 1: the log replays 1 before 2.
  const state = hintsOf([msg(2, 'q', [], ['a']), 0], [msg(1, 'q', [a]), 10]);
  assert.deepEqual(state?.log.map(e => e.message.sequence), [1, 2]);
  assert.deepEqual(ids(state, row('q', 1, [])), []);
});

test('saved signals confirm only their own session and question', () => {
  const state = hintsOf([msg(1, 'q1', [b]), 0], [msg(2, 'q2', [c], [], 2), 10], [msg(1, 'q2', [a], [], 2, 0, 'other'), 20],
    [savedMsg(3, 'q2', 5, 2), 30]);
  const settled = settleLiveHints(state!, q => (q === 'q2' ? 5 : 1), 40, 'q2');
  assert.deepEqual(settled?.log.map(e => `${e.message.sessionId}:${e.message.questionId}`), ['session:q1', 'other:q2']);
});

test('missing strokes: a slower save of the previous question does not pull the view back', () => {
  // Student drew c on q2 (broadcast); the poll still reports q1 because q1's save landed last.
  const state = hintsOf([msg(1, 'q1', [b]), 0], [{ ...msg(2, 'q2', [c], [], 2), imageUrl: '/exams/p/q2.png' }, 100]);
  const cache = new Map([['q2', { revision: 3, strokes: [a] }]]);
  const view = composeLiveView(row('q1', 5, [b]), state, q => cache.get(q), q => (q === 'q2' ? undefined : `/img/${q}.png`));
  assert.equal(view.questionId, 'q2'); assert.equal(view.number, 2);
  assert.equal(view.imageUrl, '/exams/p/q2.png', 'image path from the broadcast, no DB request');
  assert.deepEqual(view.ink?.strokes.map(s => s.id), ['c', 'a'], 'q2 starts from its cached server ink, not an empty page');
  assert.equal(view.ink?.revision, 3);
  // q2's hint is confirmed before the poll reports q2: the focus still holds q2 (no flip back to q1 for its leftover hint).
  const confirmed = settleLiveHints(receiveLiveSaved(state, savedMsg(3, 'q2', 4, 2), 150), q => (q === 'q2' ? 4 : 5), 200, 'q1');
  assert.equal(composeLiveView(row('q1', 5, [b]), confirmed, () => ({ revision: 4, strokes: [a, c] }), () => '/q2.png').questionId, 'q2');
  // Once the poll reports q2 the focus is no longer needed; q1's leftover hint does not pull the view back.
  const agreed = settleLiveHints(confirmed!, () => 4, 300, 'q2');
  assert.equal(agreed?.focus, undefined);
  assert.equal(composeLiveView(row('q2', 4, [a, c]), agreed, () => undefined, () => undefined).questionId, 'q2');
  // Without any further message the focus and the hints expire after the TTL; only the per-session newest sequence stays.
  const expired = settleLiveHints(state!, () => undefined, 100 + LIVE_HINT_TTL_MS, 'q1');
  assert.deepEqual([expired?.log, expired?.saved, expired?.focus, [...expired!.newest]], [[], [], undefined, [['session', 2]]]);
  assert.equal(composeLiveView(row('q1', 5, [b]), expired, () => undefined, () => undefined).questionId, 'q1');
});

test("only the paper's own static question images are taken from a broadcast", () => {
  assert.equal(trustedLiveImage('2025-06-math', '/exams/2025-06-math/c-01.png'), '/exams/2025-06-math/c-01.png');
  for (const url of ['https://evil.example/x.png', '//evil.example/x.png', '/exams/other/c-01.png', '/exams/2025-06-math/../x.png',
    '/exams/2025-06-math/a/b.png', '/exams/2025-06-math/x.svg', '/exams/2025-06-math/x.png?track=1', undefined]) {
    assert.equal(trustedLiveImage('2025-06-math', url), undefined, String(url));
  }
});

test('save signal messages are validated', () => {
  const valid = savedMsg(4, 'q', 3, 2);
  assert.deepEqual(parseLiveSaved(valid), valid);
  assert.equal(parseLiveInk(valid), null, 'never taken as strokes');
  assert.equal(parseLiveSaved(message), null);
  assert.equal(parseLiveSaved({ ...valid, saved: { ...valid.saved, upToSeq: 0 } }), null);
  assert.equal(parseLiveSaved({ ...valid, saved: { ...valid.saved, revision: 1.5 } }), null);
  assert.equal(parseLiveSaved({ ...valid, saved: null }), null);
  assert.equal(parseLiveInk({ ...message, imageUrl: 5 }), null);
});

test('diagnostics: sequence gaps and strokes that vanish on a poll', () => {
  const sequences = new Map<string, LiveSequenceState>();
  assert.equal(liveSequenceGap(sequences, message), 0);
  acceptLiveSequence(sequences, message);
  assert.equal(liveSequenceGap(sequences, { ...message, sequence: 4 }), 2);
  assert.equal(liveSequenceGap(sequences, { ...message, sequence: 1 }), 0, 'replays are not gaps');
  assert.equal(liveSequenceGap(sequences, { ...message, sessionId: 'reopened', sequence: 1 }), 0);
  assert.equal(vanishedStrokes([a, b, c], [a]), 2);
  assert.equal(vanishedStrokes(undefined, [a]), 0);
});

test('student save signal: names the last broadcast a save fully contains, at most one message per save', () => {
  const sent: Array<LiveInkMessage | LiveSavedMessage> = [];
  let flush = () => {};
  const batch = createInkBatcher(m => sent.push(m), { schedule(fn) { flush = fn; return 1; }, cancel() {} }, 's');
  const savedOf = () => sent.filter((m): m is LiveSavedMessage => 'kind' in m).map(m => m.saved);
  batch.change('attempt', 'q', 1, [], [a], 'e1', '/exams/p/q.png'); flush();   // seq 1 carries edit 1
  batch.change('attempt', 'q', 1, [a], [a, b], 'e2'); flush();                 // seq 2 carries edit 2
  batch.change('attempt', 'q', 1, [a, b], [b], 'e3');                         // edit 3 still in the window
  batch.saved('attempt', 'q', 7, ['e1', 'e2']);                                       // the save contains edits 1-2
  flush();                                                                   // seq 3 (edit 3), then the signal
  assert.deepEqual(sent.map(m => m.sequence), [1, 2, 3, 4], 'save signals are numbered too: gaps stay meaningful');
  assert.equal((sent[0] as LiveInkMessage).imageUrl, '/exams/p/q.png');
  assert.deepEqual(savedOf(), [{ questionKey: 'q', revision: 7, upToSeq: 2 }], 'edit 3 is not in revision 7');
  batch.saved('attempt', 'q', 8, ['e3']); flush();
  assert.deepEqual(savedOf().at(-1), { questionKey: 'q', revision: 8, upToSeq: 3 });
  let count = sent.length;
  batch.saved('attempt', 'q', 9, ['e3', 'unknown']); flush();
  assert.equal(sent.length, count, 'nothing new to confirm: no message');
  // A window holding edits 4-5 is confirmed only by a save that contains both.
  batch.change('attempt', 'q', 1, [b], [b, c], 'e4'); batch.change('attempt', 'q', 1, [b, c], [c], 'e5'); flush();
  count = sent.length;
  batch.saved('attempt', 'q', 10, ['e4']); flush();
  assert.equal(sent.length, count);
  batch.saved('attempt', 'q', 11, ['e5']); flush();
  assert.deepEqual(savedOf().at(-1), { questionKey: 'q', revision: 11, upToSeq: count });
  // An edit InkSync did not record (no mark) is never confirmed, nor is anything after it.
  batch.change('attempt', 'q', 1, [c], [], undefined); flush();
  batch.change('attempt', 'q', 1, [], [a], 'e6'); flush();
  count = sent.length;
  batch.saved('attempt', 'q', 12, ['e6']); flush();
  assert.equal(sent.length, count);
});

test('batcher numbers only sent messages and flushes the question edited last', () => {
  const sent: Array<{ questionId: string; sequence: number }> = [];
  let flush = () => {};
  const batch = createInkBatcher(m => sent.push(m), { schedule(fn) { flush = fn; return 1; }, cancel() {} }, 's');
  batch.change('attempt', 'q', 1, [], [a]); batch.change('attempt', 'q', 1, [a], []); flush();
  assert.equal(sent.length, 0, 'net-empty window sends nothing');
  batch.change('attempt', 'q1', 1, [], [a]);
  batch.change('attempt', 'q2', 2, [], [b]);
  batch.change('attempt', 'q1', 1, [a], [a, c]);
  flush();
  assert.deepEqual(sent, sent.map((m, i) => ({ ...m, sequence: i + 1 })), 'no false gaps');
  assert.deepEqual(sent.map(m => m.questionId), ['q2', 'q1'], 'the current question arrives last');
});

test('Live cell switches image and ink together only once the new image is ready', () => {
  const f1 = { questionId: 'q1', number: 1, imageUrl: '/1.png', strokes: [a] };
  const f2 = { questionId: 'q2', number: 2, imageUrl: '/2.png', strokes: [b] };
  const ready = new Set(['/1.png']);
  const isReady = (url: string) => ready.has(url);
  assert.equal(nextLiveFrame(null, f2, isReady), null, 'placeholder, never ink without its image');
  assert.equal(nextLiveFrame(f1, f2, isReady), f1, 'previous frame stays while q2 decodes');
  assert.equal(nextLiveFrame(f1, { ...f2, imageUrl: '' }, isReady), f1, 'unknown image keeps the previous frame');
  ready.add('/2.png');
  assert.equal(nextLiveFrame(f1, f2, isReady), f2);
  const more = { ...f1, strokes: [a, b] };
  assert.equal(nextLiveFrame(f1, more, () => false), more, 'same image updates ink immediately');
});

test('late earlier broadcast of the previous question does not take the focus back after newer hints were saved', () => {
  const make = (sequence: number, questionId: string, number: number): LiveInkMessage => ({ ...message, sequence, questionId, number,
    imageUrl: `/exams/p/${questionId}.png` });
  const sequences = new Map<string, LiveSequenceState>();
  const newest = make(2, 'q2', 2);
  assert.equal(acceptLiveSequence(sequences, newest), true);
  let hints = receiveLiveInk(undefined, newest, 1000);
  const signal: LiveSavedMessage = { version: 1, kind: 'saved', attemptId: 'attempt', sessionId: 'session', sequence: 3,
    saved: { questionKey: 'q2', revision: 2, upToSeq: 2 } };
  acceptLiveSequence(sequences, signal);
  hints = settleLiveHints(receiveLiveSaved(hints, signal, 1500), () => 2, 2000, 'q2')!;
  assert.equal(hints.log.length, 0);
  assert.equal(hints.focus, undefined);
  const older = make(1, 'q1', 1);
  assert.equal(acceptLiveSequence(sequences, older), true);
  hints = receiveLiveInk(hints, older, 2500);
  assert.equal(hints.log.length, 1, 'the late message is still recorded');
  const server = { questionId: 'q2', number: 2, imageUrl: '/exams/p/q2.png', updatedAt: new Date(2000).toISOString(),
    ink: { revision: 2, strokes: [a] } };
  const view = composeLiveView(server, hints, () => undefined, () => undefined);
  assert.equal(view.questionId, 'q2');
  assert.deepEqual(view.ink?.strokes, [a]);
  // Even after the focus TTL the newest-sequence record stays: a much later duplicate-era message cannot move the view.
  hints = settleLiveHints(hints, () => 2, 2500 + LIVE_HINT_TTL_MS, 'q2')!;
  hints = receiveLiveInk(hints, make(1, 'q1', 1), 2600 + LIVE_HINT_TTL_MS);
  assert.equal(composeLiveView(server, hints, () => undefined, () => undefined).questionId, 'q2');
  // A newer broadcast of another question still moves the focus.
  hints = receiveLiveInk(hints, make(4, 'q3', 3), 2700 + LIVE_HINT_TTL_MS);
  assert.equal(composeLiveView(server, hints, () => undefined, () => '/exams/p/q3.png').questionId, 'q3');
});

test('Live cell image recovery: a retry that loads after a failure bumps the generation (the cell reloads its <img>)', () => {
  let state = nextImageRecovery({ url: '', failed: false, generation: 0 }, '/1.png', false);
  assert.equal(state.generation, 0, 'first image: no remount');
  assert.equal(nextImageRecovery(state, '/1.png', false), state, 'unchanged: same object, no re-render');
  state = nextImageRecovery(state, '/1.png', true);
  assert.equal(state.generation, 0, 'failure alone keeps the element (notice shown)');
  assert.equal(nextImageRecovery(state, '/1.png', true), state);
  state = nextImageRecovery(state, '/1.png', false);
  assert.equal(state.generation, 1, 'retry succeeded: replace the broken <img>');
  assert.equal(nextImageRecovery(state, '/1.png', false), state, 'only once per recovery');
  // Question switches keep the element (same element, new src), including away from a failed image.
  state = nextImageRecovery(nextImageRecovery(state, '/2.png', true), '/3.png', false);
  assert.equal(state.generation, 1);
  state = nextImageRecovery(nextImageRecovery(state, '/3.png', true), '/3.png', false);
  assert.equal(state.generation, 2);
});
