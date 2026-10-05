import test from 'node:test';
import assert from 'node:assert/strict';
import { InkSync, autoSaveSpacingMs, type InkCache } from '../../src/features/exam/ui/inkSync.ts';
import { applyInkEvent, inkDelta, inkIdsHash } from '../../src/features/exam/ink/inkReplay.ts';
import { decodeInkPayload } from '../../src/features/exam/ink/inkCodec.ts';
import type { ExamClient, ExamInkDocument, InkReplayEvent, InkSaveRequest, InkStroke } from '../../src/features/exam/contract.ts';
import type { InkDraft } from '../../src/features/exam/ui/inkStore.ts';

const stroke = (id: string): InkStroke => ({ id, tool: 'pen', color: '#1f2937', size: 4, points: [{ x: .1, y: .2, pressure: .5, t: 0 }] });

test('the next edit rewrites a large legacy baseline once and keeps every actual replay edit', async () => {
  const s = server();
  const legacy = { ...stroke('legacy'), points: Array.from({length:16000},(_,i)=>({x:.123456,y:.654321,pressure:.5,t:i})) };
  const raw = { questionId:'q1', strokes:[legacy], revision:1 };
  s.rows.set('q1', decodeInkPayload(raw));
  const sync = new InkSync({ ...s.client, getInk: async () => [decodeInkPayload(raw)] }, 'attempt', undefined, cache().storage);
  await sync.load();
  const edit = sync.change('q1',[legacy,stroke('new')]);
  assert.equal(await sync.flush(),true);
  const events = s.requests[0].request.events;
  assert.equal(events.length,2);
  assert.deepEqual(events[0].removed,['legacy']);
  assert.equal(events[0].added[0].stroke.id,'legacy');
  assert.equal(events[1].id,edit);
  sync.change('q1',[legacy,stroke('new'),stroke('next')]);
  assert.equal(await sync.flush(),true);
  assert.equal(s.requests[1].request.events.length,1,'the compacted baseline is not rewritten on each edit');
  assert.deepEqual(s.rows.get('q1')?.strokes.map(s=>s.id),['legacy','new','next']);
});
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
  const second = a.flush(); // 진행 중인 저장이 끝난 뒤 이어서(동시에 두 writer는 없다)
  release();
  assert.equal(await saving, true);
  assert.equal(await second, true);
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

/** save_exam_ink_delta의 한도 흉내: edit마다 중간 결과의 획 수를 검사한다(서버도 edit마다 2000획·크기를 본다). */
function limitedServer(limit: number) {
  const s = server();
  let hold: Promise<void> | undefined;
  const client = { ...s.client, saveInk: async (...args: Parameters<typeof s.client.saveInk>) => {
    const [, id, request] = args;
    if (hold) await hold;
    if (s.state.offline || s.batches.has(request.batchId)) return s.client.saveInk(...args); // 오프라인·이미 받은 batch(멱등 경로)는 한도 검사 전
    let strokes = s.rows.get(id)?.strokes ?? [];
    for (const event of request.events) {
      strokes = applyInkEvent(strokes, event);
      if (strokes.length > limit) { s.requests.push({ questionId: id, request: structuredClone(request), bytes: 0 }); throw Error('EXAM_INK_TOO_LARGE'); }
    }
    return s.client.saveInk(...args);
  } };
  return { ...s, client, setLimit(next: number) { limit = next; }, holdNext() { let release!: () => void; hold = new Promise(resolve => { release = () => { hold = undefined; resolve(); }; }); return () => release(); } };
}

test('a rejected queue longer than one batch (64 edits) recovers once the student clears the question', async () => {
  const s = limitedServer(3);
  const a = new InkSync(s.client, 'attempt', undefined, cache().storage);
  await a.load();
  const drawn: InkStroke[] = [];
  for (let i = 0; i < 65; i++) { drawn.push(stroke(`s${i}`)); a.change('q1', [...drawn]); }
  assert.equal(await a.flush(), false);
  assert.equal(a.status, 'rejected');
  a.change('q1', [], 'clear');
  assert.equal(await a.flush(), true, 'the cleared state reaches the server');
  assert.equal(a.status, 'saved');
  assert.equal(s.rows.get('q1'), undefined, 'nothing was ever accepted, and nothing needs to be');
  a.change('q1', [stroke('x')]);
  assert.equal(await a.flush(), true);
  assert.deepEqual(s.rows.get('q1')?.strokes.map(x => x.id), ['x']);
});

test('a rejected queue split by bytes recovers after erasing; Live gets the original edit ids as saved', async () => {
  const s = limitedServer(1);
  const a = new InkSync(s.client, 'attempt', undefined, cache().storage);
  const acknowledged: string[] = [];
  a.onSaved = (_id, _revision, ids) => acknowledged.push(...ids);
  await a.load();
  // 컴팩트 전송에서도 분할되는 최악의 차분: 각 획 ≈1.87MB, 세 번째 획 앞에서 4MiB를 넘는다.
  const heavy = (id: string) => ({ ...stroke(id), points: Array.from({ length: 100000 }, (_, i) => ({
    x: i % 2 ? -100 : 100, y: i % 2 ? 100 : -100, pressure: i % 2, t: i % 2 ? 86400000 : 0,
  })) });
  const [h1, h2, h3] = [heavy('h1'), heavy('h2'), heavy('h3')];
  const ids = [a.change('q1', [h1]), a.change('q1', [h1, h2]), a.change('q1', [h1, h2, h3])];
  assert.equal(await a.flush(), false);
  assert.equal(s.requests[0].request.events.length, 2, 'the first batch stopped at the byte boundary');
  ids.push(a.change('q1', [h3], 'erase'));
  assert.equal(await a.flush(), true);
  assert.deepEqual(s.rows.get('q1')?.strokes.map(x => x.id), ['h3']);
  for (const id of ids) assert.ok(acknowledged.includes(id!), 'every original edit is acknowledged for Live');
});

test('only the intermediate state is too large (2000-stroke check per edit): retried once compacted, not stopped', async () => {
  const s = limitedServer(3);
  const a = new InkSync(s.client, 'attempt', undefined, cache().storage);
  await a.load();
  const four = ['a', 'b', 'c', 'd'].map(stroke);
  a.change('q1', four);
  a.change('q1', four.slice(0, 2), 'erase');
  assert.equal(await a.flush(), true);
  assert.deepEqual(s.rows.get('q1')?.strokes.map(x => x.id), ['a', 'b']);
  assert.equal(s.requests.length, 2);
  assert.equal(s.requests[1].request.events.length, 1);
  assert.equal(s.requests[1].request.events[0].kind, 'draw');
  assert.equal(a.rejected.size, 0);
});

test('erasing while the refused request is in flight is not swallowed by that rejection', async () => {
  const s = limitedServer(3);
  const a = new InkSync(s.client, 'attempt', undefined, cache().storage);
  await a.load();
  a.change('q1', ['a', 'b', 'c', 'd'].map(stroke));
  const release = s.holdNext();
  const first = a.flush();
  await new Promise(resolve => setTimeout(resolve, 0));
  a.change('q1', [], 'clear');
  release();
  assert.equal(await first, true, 'the same flush goes on with the cleared drawing');
  assert.equal(a.status, 'saved');
  assert.equal(a.rejected.size, 0);
  assert.equal(a.pending, false);
});

test('an explicit save joining a held-back background save also sends what that save left behind', async () => {
  const s = limitedServer(Infinity);
  const a = new InkSync(s.client, 'attempt', undefined, cache().storage);
  await a.load();
  const heavy = { ...stroke('big'), points: Array.from({ length: 20000 }, (_, i) => ({ x: .1, y: .2, pressure: .5, t: i })) };
  a.change('q1', [heavy]);
  const release = s.holdNext();
  const background = a.flush({ background: true });
  await new Promise(resolve => setTimeout(resolve, 0));
  a.change('q1', [heavy, stroke('small')]);
  const explicit = a.flush(); // 제출·나가기
  release();
  assert.equal(await background, false, 'the automatic save respects the large-question spacing');
  assert.equal(await explicit, true);
  assert.equal(s.requests.length, 2);
  assert.deepEqual(s.rows.get('q1')?.strokes.map(x => x.id), ['big', 'small']);
  assert.equal(a.status, 'saved');
});

/** round-2 Codex 재현: 압축 batch가 네트워크 실패로 보관된 뒤 지웠다면, 그 batch의 거절은 지운 지금 필기를 막지 않는다. */
async function storedCompactBatchThenErase(reopen: boolean) {
  const s = limitedServer(3); const c = cache();
  let a = new InkSync(s.client, 'attempt', undefined, c.storage);
  await a.load();
  a.change('q1', ['a', 'b', 'c', 'd'].map(stroke));
  assert.equal(await a.flush(), false);
  assert.equal(a.status, 'rejected');
  s.state.offline = true;
  assert.equal(await a.retryRejected(), false);
  const stored = a.documents.get('q1')?.upload;
  assert.ok(stored?.covers, 'a compacted batch is kept for an uncertain failure');
  a.change('q1', ['a', 'b'].map(stroke), 'erase');
  if (reopen) { await a.flush(); a = new InkSync(s.client, 'attempt', undefined, c.storage); }
  s.state.offline = false;
  if (reopen) await a.load();
  const before = s.requests.length;
  assert.equal(await a.flush(), true, 'one explicit save recovers');
  assert.equal(s.requests[before].request.batchId, stored.id, 'the stored batch is resent unchanged first');
  assert.equal(s.requests.length, before + 2);
  assert.deepEqual(s.rows.get('q1')?.strokes.map(x => x.id), ['a', 'b']);
  assert.equal(a.status, 'saved');
  assert.equal(a.rejected.size, 0);
}
test('a stored compacted batch refused after a later erase does not stop the erased drawing (same tab)', () => storedCompactBatchThenErase(false));
test('a stored compacted batch refused after a later erase does not stop the erased drawing (reopened from IndexedDB)', () => storedCompactBatchThenErase(true));

test('a stored compacted batch refused after an erase: automatic saves keep the large-question spacing, but do not stop', async () => {
  const s = limitedServer(3);
  const a = new InkSync(s.client, 'attempt', undefined, cache().storage);
  await a.load();
  const heavy = (id: string) => ({ ...stroke(id), points: Array.from({ length: 9000 }, (_, i) => ({ x: .1, y: .2, pressure: .5, t: i })) });
  const four = ['h1', 'h2', 'h3', 'h4'].map(heavy);
  a.change('q1', four);
  assert.equal(await a.flush(), false);
  s.state.offline = true;
  assert.equal(await a.retryRejected(), false);
  a.change('q1', four.slice(0, 3), 'erase'); // 아직 ≈1.6MB
  s.state.offline = false;
  const before = s.requests.length;
  const realNow = Date.now;
  Date.now = () => realNow() + 10 * 60_000; // 오프라인 실패의 백오프가 지난 뒤의 자동 저장
  try {
    assert.equal(await a.flush({ background: true }), false);
  } finally { Date.now = realNow; }
  assert.equal(s.requests.length, before + 1, 'only the stored batch was resent; the new compacted one waits for the spacing');
  assert.equal(a.status, 'pending');
  assert.equal(a.rejected.size, 0);
  assert.equal(await a.flush(), true);
  assert.deepEqual(s.rows.get('q1')?.strokes.map(x => x.id), ['h1', 'h2', 'h3']);
});

test('the whole current drawing refused again (compacted, nothing after it) still stops', async () => {
  const s = limitedServer(3);
  const a = new InkSync(s.client, 'attempt', undefined, cache().storage);
  await a.load();
  a.change('q1', ['a', 'b', 'c', 'd'].map(stroke));
  a.change('q1', ['a', 'b', 'c', 'd', 'e'].map(stroke));
  assert.equal(await a.flush(), false);
  assert.equal(s.requests.length, 2, 'the two-edit queue is compacted and tried once more');
  assert.equal(a.status, 'rejected');
  assert.equal(await a.flush(), false);
  assert.equal(s.requests.length, 2, 'then nothing is resent until the drawing changes');
  s.state.offline = true;
  assert.equal(await a.retryRejected(), false);
  s.state.offline = false;
  const before = s.requests.length;
  assert.equal(await a.flush(), false, 'the stored compacted batch covers the whole queue: refused again, stopped');
  assert.equal(s.requests.length, before + 1);
  assert.equal(a.status, 'rejected');
});

test('a compacted batch saved but its acknowledgement lost: the later erase is saved as the next revision', async () => {
  for (const reopen of [false, true]) {
    const s = limitedServer(3); const c = cache();
    let ackLost = false;
    const client = { ...s.client, saveInk: async (...args: Parameters<typeof s.client.saveInk>) => {
      const revision = await s.client.saveInk(...args);
      if (ackLost) { ackLost = false; throw Error('acknowledgement lost'); }
      return revision;
    } };
    let a = new InkSync(client, 'attempt', undefined, c.storage);
    await a.load();
    a.change('q1', ['a', 'b', 'c', 'd'].map(stroke));
    assert.equal(await a.flush(), false);
    s.setLimit(Infinity); // 한도 상향 마이그레이션 적용
    ackLost = true;
    assert.equal(await a.retryRejected(), false);
    assert.equal(s.rows.get('q1')?.revision, 1, 'the server did store the compacted batch');
    a.change('q1', ['a', 'b'].map(stroke), 'erase');
    if (reopen) { await a.flush(); a = new InkSync(client, 'attempt', undefined, c.storage); await a.load(); }
    assert.equal(await a.flush(), true);
    assert.equal(s.rows.get('q1')?.revision, 2);
    assert.deepEqual(s.rows.get('q1')?.strokes.map(x => x.id), ['a', 'b']);
    assert.equal(a.documents.get('q1')?.compact, undefined);
    assert.equal(a.documents.get('q1')?.covers, undefined);
  }
});
