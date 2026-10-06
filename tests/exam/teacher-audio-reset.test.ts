import test from 'node:test';
import assert from 'node:assert/strict';
import { TeacherAudioCapture } from '../../src/features/exam/audio/audioRecorder.ts';
import type { AudioDraft, AudioStore } from '../../src/features/exam/audio/audioStore.ts';
import { InkSync, type InkCache } from '../../src/features/exam/ui/inkSync.ts';
import type { InkDraft } from '../../src/features/exam/ui/inkStore.ts';
import type { ExamClient, ExamInkDocument, InkStroke } from '../../src/features/exam/contract.ts';

function memoryStore() {
  const drafts = new Map<string, AudioDraft>(), chunks = new Map<string, Blob[]>();
  const store: AudioStore = {
    async put(draft) { drafts.set(draft.id, { ...draft }); },
    async append(draft, blob) { drafts.set(draft.id, { ...draft }); const rows = chunks.get(draft.id) ?? []; rows.push(blob); chunks.set(draft.id, rows); },
    async list(owner) { return [...drafts.values()].filter(row => row.ownerId === owner).map(row => ({ ...row })); },
    async blob(draft) { return new Blob(chunks.get(draft.id), { type: draft.mime }); },
    async remove(draft) { drafts.delete(draft.id); chunks.delete(draft.id); },
  };
  return { store, drafts, chunks };
}
const draft = (id: string, questionId: string, attemptId = 'attempt'): AudioDraft => ({ id, ownerId: 'teacher', attemptId, questionId,
  startedAt: 1, endedAt: 10, durationMs: 9, mime: 'audio/webm', sizeBytes: 4, chunks: 1, state: 'pending' });
const until = async (predicate: () => boolean) => {
  for (let i = 0; i < 500; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.fail('state did not settle');
};

test('discardClip waits for an in-flight upload and removes the device draft so a retry cannot resurrect it', async () => {
  const { store, drafts, chunks } = memoryStore();
  for (const row of [draft('keep', 'q1'), draft('gone', 'q1')]) { drafts.set(row.id, row); chunks.set(row.id, [new Blob(['test'])]); }
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const uploaded: string[] = [];
  let fail = true;
  const capture = new TeacherAudioCapture({ async uploadSolutionAudio(clip: AudioDraft) {
    await blocked; if (fail) throw new Error('offline'); uploaded.push(clip.id);
  } } as unknown as ExamClient, 'teacher', () => {}, store);
  void capture.recover();
  await until(() => capture.state.uploads.filter(row => row.state === 'uploading').length === 2);
  let discarded = false;
  const discarding = capture.discardClip('gone').then(() => { discarded = true; });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(discarded, false, 'waits for the in-flight request (it may still reach the server and must be deleted after)');
  release();
  await discarding;
  assert.deepEqual([...drafts.keys()], ['keep'], 'only the deleted clip leaves device storage');
  assert.ok(!capture.state.uploads.some(row => row.id === 'gone'));
  fail = false;
  capture.retry();
  await until(() => capture.state.uploads.every(row => row.state === 'done'));
  assert.deepEqual(uploaded, ['keep'], 'retry never re-uploads the deleted clip');
  assert.deepEqual(await capture.flushUploads(), { ok: true, failed: 0 });
});

test('discardQuestion drops failed and recovered drafts of that question only, and recovery skips them afterwards', async () => {
  const { store, drafts, chunks } = memoryStore();
  for (const row of [draft('a1', 'q1'), draft('a2', 'q1'), draft('b1', 'q2'), draft('other-attempt', 'q1', 'attempt-2')]) {
    drafts.set(row.id, row); chunks.set(row.id, [new Blob(['test'])]);
  }
  let fail = true;
  const uploaded: string[] = [];
  const capture = new TeacherAudioCapture({ async uploadSolutionAudio(clip: AudioDraft) {
    if (fail) throw new Error('offline'); uploaded.push(clip.id);
  } } as unknown as ExamClient, 'teacher', () => {}, store);
  void capture.recover();
  await until(() => capture.state.uploads.length === 4 && capture.state.uploads.every(row => row.state === 'failed'));
  await capture.discardQuestion('attempt', 'q1');
  assert.deepEqual([...drafts.keys()].sort(), ['b1', 'other-attempt']);
  fail = false;
  assert.deepEqual(await capture.flushUploads(), { ok: true, failed: 0 });
  assert.deepEqual(uploaded.sort(), ['b1', 'other-attempt']);
  // 같은 기기에서 다시 녹음한 새 녹음은 정상적으로 올라간다(지운 것은 id 단위로만 막는다).
  drafts.set('a3', draft('a3', 'q1')); chunks.set('a3', [new Blob(['test'])]);
  const fresh = new TeacherAudioCapture({ async uploadSolutionAudio(clip: AudioDraft) { uploaded.push(clip.id); } } as unknown as ExamClient, 'teacher', () => {}, store);
  await fresh.recover();
  await until(() => uploaded.includes('a3'));
});

test('discardQuestion stops a recording on that question and throws its audio away instead of uploading it', async () => {
  const oldRecorder = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder');
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  class FakeRecorder {
    static isTypeSupported() { return true; }
    state = 'inactive'; mimeType = 'audio/webm;codecs=opus'; audioBitsPerSecond = 48000;
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
    start() { this.state = 'recording'; queueMicrotask(() => this.ondataavailable?.({ data: new Blob(['1234']) })); }
    stop() { this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(['end']) }); this.onstop?.(); }); }
  }
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: FakeRecorder });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { async getUserMedia() {
    const track = { stop() {}, getSettings: () => ({}) };
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  } } } });
  try {
    const { store, drafts } = memoryStore();
    const uploaded: string[] = [];
    const capture = new TeacherAudioCapture({ async uploadSolutionAudio(clip: AudioDraft) { uploaded.push(clip.questionId); } } as unknown as ExamClient,
      'teacher', () => {}, store);
    await capture.start('attempt', 'q1');
    await until(() => [...drafts.values()].some(row => row.sizeBytes > 0));
    assert.equal(capture.state.recording, true);
    await capture.discardQuestion('attempt', 'q1');
    assert.equal(capture.state.recording, false);
    assert.equal(drafts.size, 0);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.deepEqual(uploaded, [], 'the discarded recording is never uploaded');
    // 다시 녹음하면 이어서 새 녹음으로 올라간다.
    await capture.start('attempt', 'q1');
    await capture.stop();
    await until(() => uploaded.length === 1);
  } finally {
    for (const [name, descriptor] of [['MediaRecorder', oldRecorder], ['navigator', oldNavigator], ['document', oldDocument]] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
    }
  }
});

const stroke = (id: string): InkStroke => ({ id, tool: 'pen', color: '#1f2937', size: 4, points: [{ x: .1, y: .2, pressure: .5, t: 0 }] });
function inkCache() {
  const drafts = new Map<string, InkDraft>();
  const storage: InkCache = {
    legacy: async () => new Map(), read: async () => structuredClone(drafts),
    write: async (_attempt, id, value) => { drafts.set(id, structuredClone(value)); return true; },
  };
  return { drafts, storage };
}

test('InkSync.resetQuestion waits for the in-flight save, clears pending edits and adopts the server revision', async () => {
  const rows = new Map<string, ExamInkDocument>([['q1', { questionId: 'q1', strokes: [stroke('old')], revision: 3 }], ['q2', { questionId: 'q2', strokes: [stroke('x')], revision: 1 }]]);
  let release!: () => void;
  let blocked: Promise<void> | null = new Promise<void>(resolve => { release = resolve; });
  const order: string[] = [];
  const client: Pick<ExamClient, 'getInk' | 'saveInk'> = {
    getInk: async () => structuredClone([...rows.values()]),
    saveInk: async (_attempt, id, request) => {
      order.push(`save:${id}:${request.revision}`);
      if (blocked) await blocked;
      const revision = request.revision + 1;
      rows.set(id, { questionId: id, strokes: [], revision });
      return revision;
    },
  };
  const { drafts, storage } = inkCache();
  const sync = new InkSync(client, 'attempt', undefined, storage);
  await sync.load();
  const generation = sync.generation;
  sync.change('q1', [stroke('old'), stroke('a')]);
  const flushing = sync.flush();
  await new Promise(resolve => setTimeout(resolve, 5));
  sync.change('q1', [stroke('old'), stroke('a'), stroke('b')]); // 저장 중에 더 그린 필기도 함께 버린다
  sync.change('q2', [stroke('x'), stroke('y')]);
  const reset = sync.resetQuestion('q1', async () => { order.push('reset'); return { revision: 10 }; });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(order, ['save:q1:3'], 'the server reset waits for the in-flight batch');
  blocked = null; release();
  assert.deepEqual(await reset, { revision: 10 });
  await flushing;
  const resetAt = order.indexOf('reset');
  assert.ok(order.slice(0, resetAt).every(row => row.startsWith('save:')), 'the writer finishes its queue first (the reset then wipes it)');
  assert.deepEqual(sync.strokes.get('q1'), []);
  assert.equal(sync.documents.get('q1')!.revision, 10);
  assert.equal(sync.documents.get('q1')!.pending, false);
  assert.equal(drafts.get('q1')!.pending, false, 'the device draft is a clean tombstone, so nothing is re-sent after reload');
  assert.ok(sync.generation > generation, 'canvas remounts without undo history');
  assert.equal(await sync.flush(), true);
  assert.ok(!order.slice(resetAt).some(row => row.startsWith('save:q1')), 'no old q1 batch is uploaded after the reset');
  assert.ok(order.includes('save:q2:1'), 'other questions keep their pending edits');
  sync.change('q1', [stroke('fresh')]);
  assert.equal(await sync.flush(), true);
  assert.equal(order.at(-1), 'save:q1:10', 'the next solve continues from the reset revision');
});

test('InkSync.resetQuestion keeps local ink when the server reset fails', async () => {
  const client: Pick<ExamClient, 'getInk' | 'saveInk'> = {
    getInk: async () => [{ questionId: 'q1', strokes: [stroke('old')], revision: 2 }],
    saveInk: async (_attempt, _id, request) => request.revision + 1,
  };
  const sync = new InkSync(client, 'attempt', undefined, inkCache().storage);
  await sync.load();
  await assert.rejects(sync.resetQuestion('q1', async () => { throw new Error('offline'); }), /offline/);
  assert.deepEqual(sync.strokes.get('q1')!.map(s => s.id), ['old']);
  assert.equal(sync.documents.get('q1')!.revision, 2);
  sync.change('q1', [stroke('old'), stroke('new')]);
  assert.equal(await sync.flush(), true, 'the writer lock is released after a failed reset');
});
