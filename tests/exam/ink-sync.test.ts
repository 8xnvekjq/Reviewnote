import test from 'node:test';
import assert from 'node:assert/strict';
import { InkSync, type InkCache } from '../../src/features/exam/ui/inkSync.ts';
import type { ExamClient, ExamInkDocument, InkStroke } from '../../src/features/exam/contract.ts';
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
function server() {
  const rows = new Map<string, ExamInkDocument>();
  const state = { offline: false, forbidden: false };
  const client: Pick<ExamClient, 'getInk' | 'saveInk'> = {
    getInk: async () => { if (state.forbidden || state.offline) throw Error('unavailable'); return structuredClone([...rows.values()]); },
    saveInk: async (_attempt, id, strokes, revision, _legacy, _events, batchId) => {
      if (state.offline) throw Error('offline');
      if (batchId && rows.get(id)?.lastBatchId === batchId) return rows.get(id)!.revision;
      if ((rows.get(id)?.revision ?? 0) !== revision) throw Error('EXAM_INK_CONFLICT');
      rows.set(id, { questionId: id, strokes: structuredClone(strokes), revision: revision + 1, lastBatchId: batchId });
      return revision + 1;
    },
  };
  return { rows, state, client };
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
    batches.push(args[6]!);
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
    sent.push(args[5]!.length);
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
