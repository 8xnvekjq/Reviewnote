import test from 'node:test';
import assert from 'node:assert/strict';
import { InkSync, autoSaveSpacingMs, type InkCache } from '../../src/features/exam/ui/inkSync.ts';
import { applyInkEvent, inkDelta, inkIdsHash } from '../../src/features/exam/ink/inkReplay.ts';
import type { ExamClient, ExamInkDocument, InkReplayEvent, InkSaveRequest, InkStroke } from '../../src/features/exam/contract.ts';
import type { InkDraft } from '../../src/features/exam/ui/inkStore.ts';

const stroke = (id: string): InkStroke => ({ id, tool: 'pen', color: '#1f2937', size: 4, points: [{ x: .1, y: .2, pressure: .5, t: 0 }] });
function cache(legacy = new Map<string, InkStroke[]>()) {
  const drafts = new Map<string, InkDraft>();
  const storage: InkCache = {
    legacy: async () => structuredClone(legacy), read: async () => structuredClone(drafts),
    write: async (_attempt, id, draft) => { drafts.set(id, structuredClone(draft)); return true; },
  };
  return { drafts, storage };
}
/** save_exam_ink_delta 흉내: 이벤트를 서버 필기에 적용하고 결과 획 id 해시를 대조한다. 요청 본문 크기도 기록한다. */
function server() {
  const rows = new Map<string, ExamInkDocument>();
  const batches = new Map<string, { revision: number; baseRevision: number; events: InkReplayEvent[] }>();
  const state = { offline: false, forbidden: false };
  const requests: Array<{ questionId: string; request: InkSaveRequest; bytes: number }> = [];
  const client: Pick<ExamClient, 'getInk' | 'saveInk'> = {
    getInk: async () => { if (state.forbidden || state.offline) throw Error('unavailable'); return structuredClone([...rows.values()]); },
    saveInk: async (_attempt, id, request) => {
      requests.push({ questionId: id, request: structuredClone(request), bytes: Buffer.byteLength(JSON.stringify(request)) });
      if (state.offline) throw Error('offline');
      const { revision, events, batchId, idsHash } = request;
      const done = batches.get(batchId);
      if (done) {
        if (done.baseRevision !== revision || JSON.stringify(done.events) !== JSON.stringify(events)) throw Error('EXAM_REPLAY_BATCH_MISMATCH');
        return done.revision;
      }
      if ((rows.get(id)?.revision ?? 0) !== revision) throw Error('EXAM_INK_CONFLICT');
      const strokes = events.reduce(applyInkEvent, rows.get(id)?.strokes ?? []);
      if (await inkIdsHash(strokes) !== idsHash) throw Error('EXAM_REPLAY_FINAL_MISMATCH');
      batches.set(batchId, { revision: revision + 1, baseRevision: revision, events: structuredClone(events) });
      rows.set(id, { questionId: id, strokes: structuredClone(strokes), revision: revision + 1, lastBatchId: batchId });
      return revision + 1;
    },
  };
  return { rows, batches, state, requests, client };
}

test('a second device sees ink; stale edits cannot overwrite it; clearing keeps a tombstone', async () => {
  const s = server();
  const a = new InkSync(s.client, 'attempt', undefined, cache().storage);
  const b = new InkSync(s.client, 'attempt', undefined, cache().storage);
  await Promise.all([a.load(), b.load()]);
  a.change('q1', [stroke('a')]);
  assert.equal(await a.flush(), true);
  b.change('q1', [stroke('b')]);
  assert.equal(await b.flush(), false);
  assert.equal(b.status, 'conflict');
  assert.equal(s.rows.get('q1')?.strokes[0].id, 'a');
  await b.load(true);
  assert.equal(b.strokes.get('q1')?.[0].id, 'a');
  b.change('q1', []);
  assert.equal(await b.flush(), true);
  await a.load();
  assert.deepEqual(a.strokes.get('q1'), []);
  assert.equal(s.rows.get('q1')?.revision, 2);
});

test('offline drafts survive reopening and retry against the original revision', async () => {
  const s = server(); const c = cache();
  const a = new InkSync(s.client, 'attempt', undefined, c.storage);
  await a.load();
  s.state.offline = true;
  a.change('q1', [stroke('offline')]);
  assert.equal(await a.flush(), false);
  s.state.offline = false;
  const reopened = new InkSync(s.client, 'attempt', undefined, c.storage);
  await reopened.load();
  assert.equal(reopened.pending, true);
  assert.equal(await reopened.flush(), true);
  assert.equal(s.rows.get('q1')?.strokes[0].id, 'offline');
});

test('legacy import only for missing documents; erased server ink is never resurrected', async () => {
  const s = server();
  s.rows.set('q2', { questionId: 'q2', strokes: [], revision: 2 });
  const c = cache(new Map([['q1', [stroke('old')]], ['q2', [stroke('erased')]], ['foreign', [stroke('wrong')]]]));
  const a = new InkSync(s.client, 'attempt', undefined, c.storage, new Set(['q1', 'q2']));
  await a.load(); await a.flush();
  assert.equal(s.rows.get('q1')?.strokes[0].id, 'old');
  assert.deepEqual(s.rows.get('q2')?.strokes, []);
  assert.equal(s.rows.has('foreign'), false);
});

test('edits during a slow save are serialized with the acknowledged revision', async () => {
  const s = server();
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  let first = true;
  const client = { ...s.client, saveInk: async (...args: Parameters<typeof s.client.saveInk>) => {
    if (first) { first = false; await hold; }
    return s.client.saveInk(...args);
  } };
  const a = new InkSync(client, 'attempt', undefined, cache().storage);
  await a.load(); a.change('q1', [stroke('a')]);
  const saving = a.flush();
  a.change('q1', [stroke('a'), stroke('b')]);
  assert.equal(a.flush(), saving);
  release();
  assert.equal(await saving, true);
  assert.equal(s.rows.get('q1')?.revision, 2);
  assert.equal(s.rows.get('q1')?.strokes.length, 2);
});

test('failed authorization never exposes or imports cached ink', async () => {
  const s = server(); s.state.forbidden = true;
  const a = new InkSync(s.client, 'attempt', undefined, cache(new Map([['q1', [stroke('private')]]])).storage);
  await a.load();
  assert.equal(a.ready, false);
  assert.equal(a.strokes.size, 0);
  assert.equal(await a.flush(), false);
});

test('lost save acknowledgement is recovered without overwriting a newer document', async () => {
  const s = server(); const c = cache();
  const client = { ...s.client, saveInk: async (...args: Parameters<typeof s.client.saveInk>) => {
    await s.client.saveInk(...args);
    throw new Error('acknowledgement lost');
  } };
  const a = new InkSync(client, 'attempt', undefined, c.storage);
  await a.load();
  a.change('q1', [stroke('saved')]);
  assert.equal(await a.flush(), false);
  await a.load();
  assert.equal(a.status, 'saved');
  assert.equal(a.documents.get('q1')?.revision, 1);
});

test('erase then undo before debounce preserves both events even though the final drawing is unchanged', async () => {
  const s = server(); const a = new InkSync(s.client, 'attempt', undefined, cache().storage);
  await a.load();
  a.change('q1', [stroke('a')]); await a.flush();
  a.change('q1', [], 'erase');
  a.change('q1', [stroke('a')], 'undo');
  await a.load();
  assert.equal(a.pending, true);
  assert.deepEqual(a.documents.get('q1')?.events?.map(event => event.kind), ['erase', 'undo']);
  assert.equal(await a.flush(), true);
});

test('retry after lost acknowledgement keeps the old batch immutable and sends later edits once', async () => {
  const s = server(); let failOnce = true;
  const batches: string[] = [];
  const client = { ...s.client, saveInk: async (...args: Parameters<typeof s.client.saveInk>) => {
    batches.push(args[2].batchId);
    const revision = await s.client.saveInk(...args);
    if (failOnce) { failOnce = false; throw new Error('lost acknowledgement'); }
    return revision;
  } };
  const a = new InkSync(client, 'attempt', undefined, cache().storage);
  await a.load(); a.change('q1', [stroke('a')]);
  assert.equal(await a.flush(), false);
  a.change('q1', [stroke('a'), stroke('b')]);
  assert.equal(await a.flush(), true);
  assert.equal(batches[0], batches[1]);
  assert.notEqual(batches[1], batches[2]);
  assert.equal(s.rows.get('q1')?.revision, 2);
  assert.equal(s.rows.get('q1')?.strokes.length, 2);
});

test('long offline event queues upload in bounded batches without losing ordering', async () => {
  const s = server(); const sent: number[] = [];
  const client = { ...s.client, saveInk: async (...args: Parameters<typeof s.client.saveInk>) => {
    sent.push(args[2].events.length);
    return s.client.saveInk(...args);
  } };
  const a = new InkSync(client, 'attempt', undefined, cache().storage);
  await a.load();
  const strokes: InkStroke[] = [];
  for (let i = 0; i < 130; i++) { strokes.push(stroke(String(i))); a.change('q1', [...strokes]); }
  assert.equal(await a.flush(), true);
  assert.deepEqual(sent, [64, 64, 2]);
  assert.deepEqual(s.rows.get('q1')?.strokes, strokes);
  assert.equal(s.rows.get('q1')?.revision, 3);
});

test('in-memory edits survive retry when IndexedDB is unavailable', async () => {
  const s = server();
  const storage: InkCache = { legacy: async () => new Map(), read: async () => new Map(), write: async () => false };
  const a = new InkSync(s.client, 'attempt', undefined, storage);
  await a.load(); a.change('q1', [stroke('a')]);
  await a.load();
  assert.equal(a.pending, true);
  assert.equal(await a.flush(), true);
  assert.equal(s.rows.get('q1')?.strokes.length, 1);
});

test('background saves back off after a failure; explicit saves still go through immediately', async () => {
  const s = server(); let calls = 0;
  const client = { ...s.client, saveInk: async (...args: Parameters<typeof s.client.saveInk>) => { calls++; return s.client.saveInk(...args); } };
  const a = new InkSync(client, 'attempt', undefined, cache().storage);
  await a.load();
  s.state.offline = true;
  a.change('q1', [stroke('a')]);
  assert.equal(await a.flush({ background: true }), false);
  assert.equal(calls, 1);
  // Within the backoff window an automatic retry does not reach the server.
  assert.equal(await a.flush({ background: true }), false);
  assert.equal(calls, 1);
  s.state.offline = false;
  // Submit / exit / "다시 시도" are explicit and ignore the backoff.
  assert.equal(await a.flush(), true);
  assert.equal(calls, 2);
  // Success resets the backoff.
  a.change('q1', [stroke('a'), stroke('b')]);
  assert.equal(await a.flush({ background: true }), true);
  assert.equal(calls, 3);
});

test('server sync kill switch keeps ink on the device and sends nothing', async () => {
  const s = server(); const c = cache(); let calls = 0;
  const client = { ...s.client, saveInk: async (...args: Parameters<typeof s.client.saveInk>) => { calls++; return s.client.saveInk(...args); } };
  const a = new InkSync(client, 'attempt', undefined, c.storage, undefined, true);
  await a.load();
  a.change('q1', [stroke('local')]);
  assert.equal(await a.flush(), true);
  assert.equal(calls, 0);
  assert.equal(a.pending, true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(c.drafts.get('q1')?.strokes[0].id, 'local');
  // Turning sync back on uploads what accumulated.
  const later = new InkSync(client, 'attempt', undefined, c.storage);
  await later.load();
  assert.equal(await later.flush(), true);
  assert.equal(s.rows.get('q1')?.strokes[0].id, 'local');
});

test('draw, erase (removed only), undo restore and clear reach the server as deltas without the drawing', async () => {
  const s = server(); const a = new InkSync(s.client, 'attempt', undefined, cache().storage);
  await a.load();
  const [x, y, z] = [stroke('x'), stroke('y'), stroke('z')];
  a.change('q1', [x, y, z]); assert.equal(await a.flush(), true);
  a.change('q1', [x, z], 'erase'); assert.equal(await a.flush(), true);
  const erase = s.requests.at(-1)!.request.events[0];
  assert.deepEqual([erase.added, erase.removed], [[], ['y']]);
  a.change('q1', [x, y, z], 'undo'); assert.equal(await a.flush(), true);
  assert.deepEqual(s.rows.get('q1')?.strokes, [x, y, z], 'undo puts the stroke back in its original place');
  a.change('q1', [], 'clear'); assert.equal(await a.flush(), true);
  assert.deepEqual(s.rows.get('q1')?.strokes, []);
  assert.equal(s.rows.get('q1')?.revision, 4);
  assert.deepEqual(s.requests.map(entry => Object.keys(entry.request).sort()), Array(4).fill(['batchId', 'events', 'idsHash', 'legacyImport', 'revision']));
  assert.equal(s.requests.at(-1)!.request.idsHash, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'empty drawing hashes the empty string');
});

test('a hash mismatch is rejected without touching the server copy and is retried, not treated as a conflict', async () => {
  const s = server();
  const client = { ...s.client, saveInk: async (attempt: string, id: string, request: InkSaveRequest) =>
    s.client.saveInk(attempt, id, { ...request, idsHash: '0'.repeat(64) }) };
  const a = new InkSync(client, 'attempt', undefined, cache().storage);
  await a.load(); a.change('q1', [stroke('a')]);
  assert.equal(await a.flush(), false);
  assert.equal(a.status, 'failed');
  assert.equal(s.rows.has('q1'), false);
  assert.equal(a.documents.get('q1')?.pending, true);
});

test('an upload left in IndexedDB by the previous app version (with strokes) is resent as the same batch', async () => {
  const s = server(); const c = cache();
  const events = [inkDelta([], [stroke('a')], 'draw', 1000), inkDelta([stroke('a')], [stroke('a'), stroke('b')], 'draw', 2000)];
  const later = inkDelta([stroke('a'), stroke('b')], [stroke('b')], 'erase', 3000);
  c.drafts.set('q1', { strokes: [stroke('b')], revision: 0, pending: true, baseStrokes: [], events: [...events, later],
    upload: { id: 'old-batch', strokes: [stroke('a'), stroke('b')], events, revision: 0 } });
  const a = new InkSync(s.client, 'attempt', undefined, c.storage);
  await a.load();
  assert.equal(await a.flush(), true);
  assert.equal(s.requests[0].request.batchId, 'old-batch');
  assert.deepEqual(s.requests[0].request.events, events);
  assert.equal(s.requests[0].request.idsHash, await inkIdsHash([stroke('a'), stroke('b')]));
  assert.equal(s.requests[0].request.legacyImport, false);
  assert.deepEqual(s.rows.get('q1')?.strokes, [stroke('b')]);
  assert.equal(s.rows.get('q1')?.revision, 2);
  // 같은 batch를 한 번 더 보내도(응답 유실 재시도) 같은 revision.
  assert.equal(await s.client.saveInk('attempt', 'q1', s.requests[0].request), 1);
});

test('adding one stroke to a 300-stroke question sends a small request', async () => {
  const s = server(); const a = new InkSync(s.client, 'attempt', undefined, cache().storage);
  await a.load();
  // 실제 필기와 비슷하게: 획마다 점 40개, 문항 전체 수백 KB.
  const big = (id: string): InkStroke => ({ id: `${crypto.randomUUID()}-${id}`, tool: 'pen', color: '#1f2937', size: 3,
    points: Array.from({ length: 40 }, (_, i) => ({ x: 0.123456 + i / 1000, y: 0.654321, pressure: 0.5, t: i * 16 })) });
  const strokes = Array.from({ length: 300 }, (_, i) => big(String(i)));
  a.change('q1', strokes); assert.equal(await a.flush(), true);
  const docBytes = Buffer.byteLength(JSON.stringify(strokes));
  assert.ok(docBytes > 300_000, `fixture is a realistic size (${docBytes} bytes)`);
  a.change('q1', [...strokes, big('new')]); assert.equal(await a.flush(), true);
  const last = s.requests.at(-1)!;
  assert.ok(last.bytes < 20 * 1024, `one-stroke save is ${last.bytes} bytes`);
  assert.equal(s.rows.get('q1')?.strokes.length, 301);
});

test('Live save signal: after each successful save only, with the saved edits; the save request is unchanged', async () => {
  const s = server();
  const sync = new InkSync(s.client, 'attempt', undefined, cache().storage);
  const saved: Array<[string, number, string[]]> = [];
  sync.onSaved = (questionId, revision, ids) => saved.push([questionId, revision, ids]);
  await sync.load();
  const e1 = sync.change('q1', [stroke('a')]);
  const e2 = sync.change('q1', [stroke('a'), stroke('b')]);
  assert.ok(e1 && e2 && e1 !== e2);
  assert.equal(sync.change('q1', [stroke('a'), stroke('b')]), undefined, 'a no-op edit records nothing');
  s.state.offline = true;
  assert.equal(await sync.flush(), false);
  assert.deepEqual(saved, [], 'a failed save sends no signal');
  s.state.offline = false;
  assert.equal(await sync.flush(), true);
  assert.deepEqual(saved, [['q1', 1, [e1, e2]]]);
  assert.deepEqual(Object.keys(s.requests.at(-1)!.request).sort(), ['batchId', 'events', 'idsHash', 'legacyImport', 'revision']);
});

test('Live end to end: student edits, broadcasts and saves; the admin drops hints only on the save proof', async () => {
  const { createInkBatcher, receiveLiveInk, receiveLiveSaved, settleLiveHints, composeLiveView, parseLiveInk, parseLiveSaved } =
    await import('../../src/features/exam/ink/inkBroadcast.ts');
  const s = server();
  const sync = new InkSync(s.client, 'attempt', undefined, cache().storage);
  await sync.load();
  let flush = () => {};
  let hints: ReturnType<typeof receiveLiveInk> | undefined;
  let lose = false;
  const batch = createInkBatcher(message => {
    if (lose) return;
    const ink = parseLiveInk(message), signal = parseLiveSaved(message);
    if (ink) hints = receiveLiveInk(hints, ink, 0);
    if (signal) hints = receiveLiveSaved(hints, signal, 0);
  }, { schedule(fn) { flush = fn; return 1; }, cancel() {} }, 'student');
  sync.onSaved = (questionId, revision, ids) => batch.saved('attempt', questionId, revision, ids);
  const edit = (next: InkStroke[]) => {
    const before = sync.strokes.get('q1') ?? [];
    batch.change('attempt', 'q1', 1, before, next, sync.change('q1', next));
  };
  const a = stroke('a'), b = stroke('b');
  edit([a]); flush();
  await sync.flush(); flush();                                // revision 1 = [a], signal: up to seq 1
  edit([a, b]); flush();                                      // b: broadcast only
  edit([b]); flush();                                         // erase a
  lose = true; edit([a, b]); flush(); lose = false;           // undo, broadcast lost
  const poll = () => ({ attemptId: 'attempt', questionId: 'q1', number: 1, imageUrl: '/q.png', updatedAt: '2026-10-04T00:00:00Z',
    ink: { revision: s.rows.get('q1')!.revision, strokes: s.rows.get('q1')!.strokes } });
  const view = () => composeLiveView(poll(), hints, () => undefined, () => undefined).ink!.strokes.map(x => x.id).sort();
  hints = settleLiveHints(hints!, () => s.rows.get('q1')!.revision, 1, 'q1');
  assert.deepEqual(view(), ['b'], 'before the save: what the admin was told (undo lost), canon [a] does not erase b');
  await sync.flush(); flush();                                // revision 2 = [a, b], signal covers every sent message
  hints = settleLiveHints(hints!, () => s.rows.get('q1')!.revision, 2, 'q1');
  assert.deepEqual(hints?.log ?? [], []);
  assert.deepEqual(view(), ['a', 'b'], 'the stale erase no longer reverts the saved undo');
});

// 2026-10-05 장애: 문항 필기가 서버 한도를 넘자 같은 batch를 끝없이 다시 보냈다("다시 시도" 무한 반복).
test('a permanent rejection (too large) stops resending that question, keeps the ink, saves the rest, and recovers after erasing', async () => {
  const s = server(); const c = cache();
  const limit = 3; // 서버 한도 흉내: 문항당 획 3개까지
  const client = { ...s.client, saveInk: async (...args: Parameters<typeof s.client.saveInk>) => {
    const [, id, request] = args;
    const strokes = request.events.reduce(applyInkEvent, s.rows.get(id)?.strokes ?? []);
    if (strokes.length > limit) { s.requests.push({ questionId: id, request, bytes: 0 }); throw Error('EXAM_INK_TOO_LARGE'); }
    return s.client.saveInk(...args);
  } };
  const a = new InkSync(client, 'attempt', undefined, c.storage);
  await a.load();
  const big = ['a', 'b', 'c', 'd'].map(stroke);
  a.change('q1', big);
  a.change('q2', [stroke('other')]);
  assert.equal(await a.flush(), false);
  assert.equal(a.status, 'rejected');
  assert.equal(a.rejected.get('q1'), 'EXAM_INK_TOO_LARGE');
  assert.equal(s.rows.get('q2')?.strokes[0].id, 'other', 'other questions still save');
  assert.deepEqual(a.strokes.get('q1')?.map(x => x.id), ['a', 'b', 'c', 'd'], 'ink stays on the device');
  assert.equal(a.documents.get('q1')?.upload, undefined, 'the refused batch is dropped (the server kept nothing)');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(c.drafts.get('q1')?.pending, true);
  const sent = s.requests.length;
  // 자동 저장·화면 숨김(명시 저장)·10초 재시도 어느 것도 같은 문항을 다시 보내지 않는다.
  assert.equal(await a.flush({ background: true }), false);
  assert.equal(await a.flush(), false);
  assert.equal(s.requests.length, sent);
  assert.equal(a.onlyRejectedPending, true);
  // 일부를 지우면 그 변경과 함께 새 batch로 다시 보내 저장된다(기록은 잃지 않는다).
  a.change('q1', big.slice(0, 2), 'erase');
  assert.equal(await a.flush(), true);
  assert.equal(a.status, 'saved');
  assert.deepEqual(s.rows.get('q1')?.strokes.map(x => x.id), ['a', 'b']);
  assert.equal(a.rejected.size, 0);
});

test('a refused batch left in IndexedDB is resent once, then dropped; "다시 시도" retries it explicitly', async () => {
  const s = server(); const c = cache(); let tooLarge = true; let calls = 0;
  const client = { ...s.client, saveInk: async (...args: Parameters<typeof s.client.saveInk>) => {
    calls++;
    if (tooLarge) throw Error('EXAM_INK_TOO_LARGE');
    return s.client.saveInk(...args);
  } };
  const a = new InkSync(client, 'attempt', undefined, c.storage);
  await a.load();
  a.change('q1', [stroke('a')]);
  assert.equal(await a.flush(), false);
  assert.equal(calls, 1);
  tooLarge = false; // 서버 한도를 올리는 마이그레이션이 적용됐다
  assert.equal(await a.flush(), false, 'not resent automatically');
  assert.equal(calls, 1);
  assert.equal(await a.retryRejected(), true);
  assert.equal(calls, 2);
  assert.equal(s.rows.get('q1')?.strokes[0].id, 'a');
});

test('a transient failure on a stored batch still retries the same batch (not treated as a rejection)', async () => {
  const s = server(); const c = cache();
  const a = new InkSync(s.client, 'attempt', undefined, c.storage);
  await a.load();
  s.state.offline = true;
  a.change('q1', [stroke('a')]);
  assert.equal(await a.flush(), false);
  const batch = a.documents.get('q1')?.upload?.id;
  assert.ok(batch);
  assert.equal(a.status, 'failed');
  s.state.offline = false;
  assert.equal(await a.flush(), true);
  assert.equal(s.requests.at(-1)?.request.batchId, batch);
});

test('failed loads back off: automatic retries do not reload the whole attempt every 10 seconds', async () => {
  const s = server(); let loads = 0;
  const client = { ...s.client, getInk: async (...args: Parameters<typeof s.client.getInk>) => { loads++; return s.client.getInk(...args); } };
  const a = new InkSync(client, 'attempt', undefined, cache().storage);
  s.state.offline = true;
  await a.load();
  assert.equal(a.status, 'failed');
  assert.equal(loads, 1);
  await a.load(false, { background: true });
  assert.equal(loads, 1, 'within the backoff window');
  s.state.offline = false;
  await a.load(); // 학생이 누른 '다시 시도'는 바로
  assert.equal(loads, 2);
  assert.equal(a.status, 'saved');
  await a.load(false, { background: true });
  assert.equal(loads, 3, 'success resets the backoff');
});

test('large questions are auto-saved less often; explicit saves (submit, exit, hidden tab) are immediate', async () => {
  const s = server();
  const a = new InkSync(s.client, 'attempt', undefined, cache().storage);
  await a.load();
  const heavy = (id: string) => ({ ...stroke(id), points: Array.from({ length: 9000 }, (_, i) => ({ x: .1, y: .2, pressure: .5, t: i })) });
  const strokes = [heavy('h1'), heavy('h2'), heavy('h3'), heavy('h4')]; // ≈ 2.1MB
  assert.ok(autoSaveSpacingMs(strokes) >= 20000 && autoSaveSpacingMs(strokes) <= 30000);
  assert.equal(autoSaveSpacingMs([stroke('small')]), 0);
  a.change('q1', strokes);
  assert.equal(await a.flush({ background: true }), true, 'first save goes right away');
  a.change('q1', [...strokes, stroke('more')]);
  assert.equal(await a.flush({ background: true }), false, 'next automatic save waits for the spacing');
  assert.equal(a.status, 'pending');
  assert.equal(s.rows.get('q1')?.strokes.length, 4);
  a.change('q2', [stroke('small')]);
  assert.equal(await a.flush({ background: true }), false);
  assert.equal(s.rows.get('q2')?.strokes.length, 1, 'small questions are not held back by a large one');
  assert.equal(await a.flush(), true);
  assert.equal(s.rows.get('q1')?.strokes.length, 5);
});
