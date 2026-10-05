import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_CONSTRAINTS, AUDIO_TIMESLICE_MS, audioTimelineBounds, chooseAudioFormat, clipPosition, shouldSplitAudio, isAudioObjectDuplicate } from '../../src/features/exam/audio/audioMath.ts';
import { TeacherAudioCapture } from '../../src/features/exam/audio/audioRecorder.ts';
import type { AudioDraft, AudioStore } from '../../src/features/exam/audio/audioStore.ts';
import type { ExamClient, InkStroke, SolutionAudioClip } from '../../src/features/exam/contract.ts';
import { buildInkClock, buildInkTimeline, inkDelta } from '../../src/features/exam/ink/inkReplay.ts';

const clip: SolutionAudioClip = { id: 'voice', offsetMs: -5000, durationMs: 15000, mime: 'audio/webm;codecs=opus', sizeBytes: 90000, storagePath: 'test.webm' };

test('format preference, fallback, constraints and split threshold', () => {
  assert.deepEqual(chooseAudioFormat(() => true), { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 48000 });
  assert.deepEqual(chooseAudioFormat(mime => mime === 'audio/mp4'), { mimeType: 'audio/mp4', audioBitsPerSecond: 96000 });
  assert.equal(chooseAudioFormat(() => false), null);
  assert.equal(shouldSplitAudio(45 * 1024 * 1024 - 1), false);
  assert.equal(shouldSplitAudio(45 * 1024 * 1024), true);
  assert.equal(isAudioObjectDuplicate({ status: 409, statusCode: 'ResourceAlreadyExists' }), true);
  assert.equal(isAudioObjectDuplicate({ status: 400, statusCode: 'Duplicate' }), true);
  assert.equal(isAudioObjectDuplicate({ status: 403, statusCode: 'AccessDenied' }), false);
  assert.deepEqual(AUDIO_CONSTRAINTS, { channelCount: 1, sampleRate: 48000, noiseSuppression: true, autoGainControl: true, echoCancellation: false });
});

test('negative clip offsets, consecutive clips and uncompressed ink use the same clock', () => {
  const second = { ...clip, id: 'second', offsetMs: 12000, durationMs: 3000 };
  const bounds = audioTimelineBounds([clip, second], -380);
  assert.deepEqual(bounds, { shift: 5000, end: 20000 });
  assert.deepEqual(clipPosition(clip, 2500, bounds.shift), { active: true, seconds: 2.5 });
  assert.equal(clipPosition(clip, 15000, bounds.shift).active, false);
  assert.deepEqual(clipPosition(second, 18000, bounds.shift), { active: true, seconds: 1 });
  const stroke: InkStroke = { id: 's', tool: 'pen', color: '#123456', size: 4, points: [
    { x: 0, y: 0, pressure: .5, t: 0 }, { x: .2, y: .2, pressure: .5, t: 380 },
  ] };
  const events = [inkDelta([], [stroke], 'draw', 0), inkDelta([stroke], [], 'erase', 12000)];
  const timeline = buildInkTimeline({ batches: [{ id: 'b', revision: 1, baseRevision: 0, baseline: [], events }], strokes: [], revision: 1 });
  const clock = buildInkClock(timeline, { origin: 0, shift: bounds.shift, total: bounds.end });
  assert.deepEqual(clock.starts, [4620, 16999]);
  assert.deepEqual(clock.ends, [5000, 17000]);
  assert.equal(clock.total, 20000);
  assert.equal(clock.frame(4800)[0].points.length, 1);
  assert.equal(clock.frame(13000).length, 1, 'long pause remains present while teacher explains');
  assert.equal(clock.frame(18000).length, 0);
  const own = buildInkTimeline({ batches: [{ id: 'b', revision: 1, baseRevision: 0, baseline: [], events: events.map(e => ({ ...e, at: e.at + 100000 })) }], strokes: [], revision: 1 });
  assert.deepEqual(buildInkClock(own, { origin: 100000, shift: bounds.shift, total: bounds.end }).ends, clock.ends);
});

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
const until = async (predicate: () => boolean) => {
  for (let i = 0; i < 500; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.fail('state did not settle');
};

test('chunks persist immediately; split creates independently decodable parts; retry/recovery retain question and owner', async () => {
  const oldRecorder = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder');
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const recorders: FakeRecorder[] = [];
  let trackStops = 0;
  class FakeRecorder {
    static isTypeSupported() { return true; }
    state = 'inactive'; mimeType = 'audio/webm;codecs=opus'; audioBitsPerSecond = 48000;
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
    onerror?: () => void;
    start(timeslice: number) { assert.equal(timeslice, AUDIO_TIMESLICE_MS); this.state = 'recording'; }
    emit(text = '1234') { this.ondataavailable?.({ data: new Blob([text], { type: this.mimeType }) }); }
    stop() { this.state = 'inactive'; queueMicrotask(() => { this.emit('end'); this.onstop?.(); }); }
    constructor(_stream: unknown, options: MediaRecorderOptions) { assert.equal(options.audioBitsPerSecond, 48000); recorders.push(this); }
  }
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: FakeRecorder });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { async getUserMedia(constraints: unknown) {
    assert.deepEqual(constraints, { audio: AUDIO_CONSTRAINTS });
    const track = { stop() { trackStops++; }, getSettings: () => ({ channelCount: 1, sampleRate: 48000 }) };
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  } } } });
  try {
    const { store, drafts, chunks } = memoryStore();
    const uploaded: AudioDraft[] = [];
    let fail = false;
    const api = { async uploadSolutionAudio(draft: AudioDraft, blob: Blob) {
      if (fail) throw new Error('offline'); assert.equal(blob.size, draft.sizeBytes); uploaded.push({ ...draft });
    } } as unknown as ExamClient;
    const capture = new TeacherAudioCapture(api, 'owner', () => {}, store, 8);
    await capture.start('attempt', 'q1');
    recorders[0].emit();
    await until(() => [...drafts.values()][0]?.sizeBytes === 4);
    assert.equal(chunks.size, 1, 'before stop the arrived chunk is durable');
    recorders[0].emit();
    await until(() => recorders.length === 2 && recorders[1].state === 'recording');
    assert.equal(uploaded.length, 1);
    assert.equal(uploaded[0].sizeBytes, 11);
    assert.equal(capture.state.recording, true, 'split continues same press');
    await capture.stop();
    await until(() => capture.state.uploads.every(row => row.state === 'done'));
    assert.equal(uploaded.length, 2); assert.ok(uploaded[1].startedAt >= uploaded[0].startedAt);
    assert.equal(uploaded[0].questionId, 'q1'); assert.equal(uploaded[1].questionId, 'q1');
    await capture.start('attempt', 'q2'); fail = true;
    await capture.stop();
    await until(() => capture.state.uploads.some(row => row.state === 'failed'));
    assert.equal(drafts.size, 1, 'failed uploads remain in device storage');
    fail = false; capture.retry();
    await until(() => capture.state.uploads.every(row => row.state === 'done'));
    assert.equal(uploaded[2].questionId, 'q2'); assert.equal(drafts.size, 0);
    const crashed: AudioDraft = { ...uploaded[0], id: 'crashed', state: 'recording', chunks: 1, sizeBytes: 4, endedAt: uploaded[0].startedAt + 9000 };
    await store.append(crashed, new Blob(['part']));
    const otherOwner: AudioDraft = { ...crashed, id: 'other', ownerId: 'someone-else' };
    await store.append(otherOwner, new Blob(['part']));
    const recovered = new TeacherAudioCapture(api, 'owner', () => {}, store);
    await recovered.recover();
    await until(() => recovered.state.uploads[0]?.state === 'done');
    assert.equal(uploaded.at(-1)!.durationMs, 9000);
    assert.equal(drafts.size, 1); assert.equal(drafts.get('other')!.ownerId, 'someone-else');
    assert.ok(trackStops >= 2);
  } finally {
    for (const [name, descriptor] of [['MediaRecorder', oldRecorder], ['navigator', oldNavigator], ['document', oldDocument]] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
    }
  }
});
