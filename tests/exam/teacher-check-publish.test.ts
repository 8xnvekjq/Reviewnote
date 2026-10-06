import test from 'node:test';
import assert from 'node:assert/strict';
import { TeacherAudioCapture } from '../../src/features/exam/audio/audioRecorder.ts';
import { prepareTeacherCheck, runAudioUploadGate, type AudioGateState } from '../../src/features/exam/audio/audioFlush.ts';
import type { AudioDraft, AudioStore } from '../../src/features/exam/audio/audioStore.ts';
import type { ExamClient } from '../../src/features/exam/contract.ts';

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
const pending = <T>() => new Promise<T>(() => {});

test('flushQuestionUploads waits only for that question, retries its failures, and reports only its failures', async () => {
  const { store, drafts, chunks } = memoryStore();
  for (const row of [draft('a1', 'q1'), draft('a2', 'q1'), draft('b1', 'q2')]) { drafts.set(row.id, row); chunks.set(row.id, [new Blob(['test'])]); }
  let releaseB!: () => void;
  const blockedB = new Promise<void>(resolve => { releaseB = resolve; });
  let failQ1 = true;
  const uploaded: string[] = [];
  const capture = new TeacherAudioCapture({ async uploadSolutionAudio(clip: AudioDraft) {
    if (clip.questionId === 'q2') await blockedB;
    else if (failQ1) throw new Error('offline');
    uploaded.push(clip.id);
  } } as unknown as ExamClient, 'teacher', () => {}, store);
  void capture.recover();
  await until(() => capture.state.uploads.length === 3
    && capture.state.uploads.filter(row => row.questionId === 'q1').every(row => row.state === 'failed'));
  assert.equal(await capture.hasPendingQuestionUploads('attempt', 'q1'), true);
  assert.equal(await capture.hasPendingQuestionUploads('attempt', 'q3'), false);
  // q1은 계속 실패: 실패 수는 q1 것만(2개), q2 업로드가 멈춰 있어도 기다리지 않는다.
  assert.deepEqual(await capture.flushQuestionUploads('attempt', 'q1'), { ok: false, failed: 2 });
  failQ1 = false;
  assert.deepEqual(await capture.flushQuestionUploads('attempt', 'q1'), { ok: true, failed: 0 }, 'failed clips of that question are retried');
  assert.deepEqual(uploaded.sort(), ['a1', 'a2']);
  assert.equal(await capture.hasPendingQuestionUploads('attempt', 'q1'), false);
  assert.equal(await capture.hasPendingQuestionUploads('attempt', 'q2'), true, 'q2 keeps uploading in the background');
  releaseB();
  assert.deepEqual(await capture.flushUploads(), { ok: true, failed: 0 });
});

test('flushQuestionUploads stops a recording on that question and waits for its upload', async () => {
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
    const capture = new TeacherAudioCapture({ async uploadSolutionAudio(clip: AudioDraft) {
      await new Promise(resolve => setTimeout(resolve, 20)); uploaded.push(clip.questionId);
    } } as unknown as ExamClient, 'teacher', () => {}, store);
    await capture.start('attempt', 'q1');
    await until(() => [...drafts.values()].some(row => row.sizeBytes > 0));
    // 다른 문항을 기다릴 때는 녹음을 멈추지 않는다.
    assert.deepEqual(await capture.flushQuestionUploads('attempt', 'q2'), { ok: true, failed: 0 });
    assert.equal(capture.state.recording, true);
    assert.deepEqual(await capture.flushQuestionUploads('attempt', 'q1'), { ok: true, failed: 0 });
    assert.equal(capture.state.recording, false);
    assert.deepEqual(uploaded, ['q1'], 'the stopped recording is uploaded before the flush resolves');
    assert.equal(drafts.size, 0);
  } finally {
    for (const [name, descriptor] of [['MediaRecorder', oldRecorder], ['navigator', oldNavigator], ['document', oldDocument]] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
    }
  }
});

function gateUi(choices: boolean[] = [], continueNow = false) {
  const states: (AudioGateState | null)[] = [];
  return { states, ui: {
    show: (state: AudioGateState | null) => { states.push(state); },
    continueRequested: () => continueNow ? Promise.resolve('continue' as const) : pending<'continue'>(),
    retryRequested: async () => choices.shift() ?? false,
    pause: async () => {},
  } };
}

test('upload gate: success, retry then success, give up, continue, timeout', async () => {
  let gate = gateUi();
  assert.equal(await runAudioUploadGate(async () => ({ ok: true, failed: 0 }), gate.ui), 'uploaded');
  assert.deepEqual(gate.states, ['uploading', 'done', null]);
  const results = [{ ok: false, failed: 1 }, { ok: true, failed: 0 }];
  gate = gateUi([true]);
  assert.equal(await runAudioUploadGate(async () => results.shift()!, gate.ui), 'uploaded');
  assert.deepEqual(gate.states, ['uploading', 'failed', 'uploading', 'done', null], '다시 시도');
  gate = gateUi([false]);
  assert.equal(await runAudioUploadGate(async () => ({ ok: false, failed: 2 }), gate.ui), 'skipped');
  assert.deepEqual(gate.states, ['uploading', 'failed', null], '그래도 계속');
  gate = gateUi([], true);
  assert.equal(await runAudioUploadGate(() => pending(), gate.ui), 'skipped');
  assert.deepEqual(gate.states, ['uploading', null]);
  gate = gateUi([false]);
  assert.equal(await runAudioUploadGate(() => pending(), gate.ui, 5), 'skipped');
  assert.deepEqual(gate.states, ['uploading', 'failed', null], 'the time cap enters the failure path');
});

test('teacher check preparation: stop recording → flush ink → upload audio, and never blocks on ink failure', async () => {
  const order: string[] = [];
  const done = await prepareTeacherCheck({
    stopRecording: async () => { order.push('stop'); },
    flushInk: async () => { order.push('ink'); return true; },
    uploadAudio: async () => { order.push('audio'); return 'uploaded'; },
  });
  assert.deepEqual(order, ['stop', 'ink', 'audio']);
  assert.deepEqual(done, { inkSaved: true, audio: 'uploaded' });
  assert.deepEqual(await prepareTeacherCheck({
    stopRecording: async () => { throw new Error('mic'); },
    flushInk: async () => { throw new Error('offline'); },
    uploadAudio: async () => 'skipped',
  }), { inkSaved: false, audio: 'skipped' });
});
