import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RecordingClock, TimelineLog, buildLectureReplay, createManifest, decodeChunkFile, encodeChunkFile, mergeChunks, parseManifest,
  splitIntoChunks, type InkChunk, type LectureRecordingManifest, type TimelineEntry,
} from '../../src/features/lectures/lectureRecordingModel.ts';
import {
  LectureRecordingSession, micErrorMessage, type RecorderEnv, type RecorderLike, type RecorderMedia,
} from '../../src/features/lectures/lectureRecorder.ts';
import type { RecordingBackend } from '../../src/features/lectures/lectureRecordings.ts';
import type { InkStroke } from '../../src/features/exam/contract.ts';

const slides = ['a', 'b', 'c'].map((id, i) => ({ id, path: `deck/${id}.webp`, section: '01', label: `슬라이드 ${i + 1}`, bookPage: 100 + i }));
const stroke = (id: string, x = 0.1, ms = 400): InkStroke => ({
  id, tool: 'pen', color: '#1f2937', size: 4,
  points: [{ x, y: 0.1, pressure: 0.6, t: 0 }, { x: +(x + 0.05).toFixed(6), y: 0.12, pressure: 0.6, t: ms / 2 }, { x: +(x + 0.1).toFixed(6), y: 0.15, pressure: 0.6, t: ms }],
});

test('녹음 시계는 일시정지한 시간을 빼고 잰다', () => {
  let wall = 1000;
  const clock = new RecordingClock(() => wall);
  assert.equal(clock.now(), 0);
  clock.resume(); wall += 5000;
  assert.equal(clock.now(), 5000);
  clock.pause(); wall += 60000;
  assert.equal(clock.now(), 5000, '일시정지 중에는 멈춘다');
  clock.resume(); wall += 2500;
  assert.equal(clock.now(), 7500);
});

test('필기 기록은 exam 재생 이벤트 모양이고 바뀐 게 없으면 남기지 않는다', () => {
  const log = new TimelineLog();
  log.slide(0, 'a'); log.slide(10, 'a');
  assert.equal(log.size, 1, '같은 슬라이드는 한 번만');
  const s1 = stroke('s1');
  const event = log.ink(1200, 'a', [], [s1], 'draw');
  assert.ok(event);
  assert.deepEqual(event.added.map(a => a.stroke.id), ['s1']);
  assert.equal(log.ink(1300, 'a', [s1], [s1], 'draw'), null);
  log.ink(1500, 'a', [s1], [], 'undo');
  const taken = log.take();
  assert.deepEqual(taken.map(e => e.type === 'ink' ? `${e.at}:${e.event.kind}` : `${e.at}:slide`), ['0:slide', '1200:draw', '1500:undo']);
  assert.equal(log.size, 0);
});

test('기록 파일 나누기·합치기: 순번 순서, 같은 시각은 기록 순서', () => {
  const entries: TimelineEntry[] = Array.from({ length: 5 }, (_, i) => ({ type: 'slide', at: i < 3 ? 100 : 200 + i, slideId: `s${i}` }));
  const chunks = splitIntoChunks(entries, 4, 2);
  assert.deepEqual(chunks.map(c => [c.seq, c.entries.length, c.fromMs, c.toMs]), [[4, 2, 100, 100], [5, 2, 100, 203], [6, 1, 204, 204]]);
  // 재시도로 늦게 올라간 파일이 먼저 와도 순번대로 합친다.
  assert.deepEqual(mergeChunks([chunks[2], chunks[0], chunks[1]]).map(e => e.slideId), ['s0', 's1', 's2', 's3', 's4']);
});

test('기록 파일은 gzip으로 저장되고 획 점은 압축 문자열로 되살아난다', async () => {
  const chunk: InkChunk = { seq: 1, fromMs: 0, toMs: 900, entries: [
    { type: 'slide', at: 0, slideId: 'a' },
    { type: 'ink', at: 900, slideId: 'a', event: { id: 'e1', kind: 'draw', at: 900, removed: [], added: [{ index: 0, stroke: stroke('s1') }] } },
  ] };
  const { blob, encoding } = await encodeChunkFile(chunk);
  assert.equal(encoding, 'gzip');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([bytes[0], bytes[1]], [0x1f, 0x8b]);
  const back = await decodeChunkFile(blob, encoding);
  assert.equal(back.seq, 1);
  const ink = back.entries[1];
  assert.ok(ink.type === 'ink');
  const round = (points: InkStroke['points']) => points.map(p => ({ ...p, x: +p.x.toFixed(6), y: +p.y.toFixed(6) }));
  assert.deepEqual(round(ink.event.added[0].stroke.points), round(stroke('s1').points));
});

test('manifest는 JSON으로 저장했다가 그대로 다시 읽는다', () => {
  const manifest = createManifest({ recordingId: 'r1', deckId: 'd1', title: '수업', slides, initialSlideId: 'b', createdAt: '2026-10-15T00:00:00.000Z' });
  manifest.clips.push({ id: 'c1', offsetMs: 0, durationMs: 1000, mime: 'audio/webm;codecs=opus', files: ['audio-0001.webm'], bytes: 10 });
  const back = parseManifest(JSON.stringify(manifest));
  assert.deepEqual(back, manifest);
  assert.deepEqual(back.coordinateSpace, { width: 1920, height: 1080, unit: 'slide-width' });
  assert.throws(() => parseManifest({ ...manifest, format: 'x' }));
  assert.throws(() => parseManifest({ ...manifest, version: 99 }), /새로운 앱/);
});

test('재생: 시각별 슬라이드와 그 슬라이드 필기(그리는 중인 획은 일부만)', () => {
  const s1 = stroke('s1', 0.1, 1000), s2 = stroke('s2', 0.5, 400), old = stroke('old', 0.8);
  const entries: TimelineEntry[] = [
    { type: 'ink', at: 0, slideId: 'a', event: { id: 'r', kind: 'restore', at: 0, removed: [], added: [{ index: 0, stroke: old }] } },
    { type: 'ink', at: 3000, slideId: 'a', event: { id: 'e1', kind: 'draw', at: 3000, removed: [], added: [{ index: 1, stroke: s1 }] } },
    { type: 'slide', at: 5000, slideId: 'b' },
    { type: 'ink', at: 7000, slideId: 'b', event: { id: 'e2', kind: 'draw', at: 7000, removed: [], added: [{ index: 0, stroke: s2 }] } },
    { type: 'slide', at: 9000, slideId: 'a' },
    { type: 'ink', at: 9500, slideId: 'a', event: { id: 'e3', kind: 'erase', at: 9500, removed: ['old'], added: [] } },
  ];
  const replay = buildLectureReplay({ slides, initialSlideId: 'a', durationMs: 12000, clips: [] }, entries);
  const ids = (t: number) => { const f = replay.frame(t); return `${f.slideId}:${f.strokes.map(s => `${s.id}${s.points.length < 3 ? '~' : ''}`).join(',')}`; };
  assert.equal(replay.total, 12000);
  assert.equal(ids(0), 'a:old');
  assert.equal(ids(1999), 'a:old');
  assert.equal(ids(2600), 'a:old,s1~', '획은 그린 속도대로 나타난다');
  assert.equal(ids(3000), 'a:old,s1');
  assert.equal(ids(5000), 'b:');
  assert.equal(ids(6800), 'b:s2~');
  assert.equal(ids(8000), 'b:s2');
  assert.equal(ids(9200), 'a:old,s1', '돌아오면 그 슬라이드 필기 그대로');
  assert.equal(ids(9500), 'a:s1');
  assert.equal(replay.frame(9500).slideIndex, 0);
  assert.deepEqual(Object.keys(replay.finalInk()).sort(), ['a', 'b']);
});

// ── 세션(가짜 마이크·저장소) ───────────────────────────────────────────────
class FakeRecorder implements RecorderLike {
  state: RecorderLike['state'] = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: RecorderLike['ondataavailable'] = null;
  onstop: RecorderLike['onstop'] = null;
  onerror: RecorderLike['onerror'] = null;
  private n = 0;
  private readonly tag: string;
  constructor(tag: string) { this.tag = tag; }
  private emit() { this.ondataavailable?.({ data: new Blob([`${this.tag}${this.n++}|`]) }); }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; queueMicrotask(() => { this.emit(); this.onstop?.(); }); }
  requestData() { queueMicrotask(() => this.emit()); }
}

function harness(options: { failUploads?: number; micError?: string } = {}) {
  let wall = 0;
  const files = new Map<string, Blob>();
  const rows: Record<string, unknown>[] = [];
  let failures = options.failUploads ?? 0;
  const backend: RecordingBackend = {
    async upload(path, blob) { if (failures > 0) { failures--; throw new Error('network'); } files.set(path, blob); },
    async insertRow(row) { rows.push({ ...row }); },
    async updateRow(id, patch) { Object.assign(rows.find(r => r.id === id)!, patch); },
  };
  let recorders = 0;
  const tracks: { stopped: boolean }[] = [];
  const media: RecorderMedia = {
    format: () => ({ mimeType: 'audio/webm;codecs=opus' }),
    async getUserMedia() {
      if (options.micError) throw Object.assign(new Error('mic'), { name: options.micError });
      const track = { stopped: false, stop() { this.stopped = true; }, addEventListener() {} };
      tracks.push(track);
      return { getTracks: () => [track] };
    },
    createRecorder: () => new FakeRecorder(`span${++recorders}-`),
  };
  const docListeners = new Map<string, () => void>();
  const doc = { visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (type: string, fn: () => void) => { docListeners.set(type, fn); },
    removeEventListener: (type: string) => { docListeners.delete(type); } };
  let intervalFn: (() => void) | null = null;
  let wakeRequests = 0;
  const env: RecorderEnv = {
    doc: doc as unknown as RecorderEnv['doc'],
    win: { addEventListener() {}, removeEventListener() {} } as unknown as RecorderEnv['win'],
    wall: () => wall,
    wakeLock: { async request() { wakeRequests++; return { async release() {}, addEventListener() {} }; } },
    setInterval: fn => { intervalFn = fn; return 1; },
    clearInterval: () => { intervalFn = null; },
    retryDelays: [0, 0],
  };
  const session = new LectureRecordingSession(backend, media, env);
  return {
    session, files, rows, tracks, doc, docListeners,
    advance: (ms: number) => { wall += ms; },
    tick: () => intervalFn?.(),
    get wakeRequests() { return wakeRequests; },
    manifest: async () => JSON.parse(await [...files].find(([p]) => p.endsWith('manifest.json'))![1].text()) as LectureRecordingManifest,
  };
}

test('세션: 녹음 → 일시정지 → 이어하기 → 슬라이드 넘김 → 끝내기. 클립은 일시정지를 뺀 시각에 놓인다', async () => {
  const h = harness();
  const s = h.session;
  const before = stroke('pre');
  await s.start({ deckId: 'd1', title: '수업', className: '수토반', slides, initialSlideId: 'a', ink: { a: [before] } });
  assert.equal(s.state.phase, 'recording');
  assert.equal(h.rows[0].status, 'recording');
  assert.equal(h.wakeRequests, 1);
  h.advance(4000);
  const s1 = stroke('s1');
  s.logInk('a', [before], [before, s1], 'draw');
  h.advance(2000);
  await s.pause();
  assert.equal(s.state.phase, 'paused');
  assert.ok(h.tracks[0].stopped, '일시정지하면 마이크를 놓는다');
  h.advance(30000); // 일시정지한 30초는 녹음 시간에서 빠진다
  s.logSlide('b'); // 일시정지 중에 넘김 → 6초에 기록
  await s.resume();
  h.advance(3000);
  const s2 = stroke('s2');
  s.logInk('b', [], [s2], 'draw');
  h.advance(1000);
  await s.end();
  assert.equal(s.state.phase, 'done');
  assert.equal(s.state.failed, 0);

  const m = await h.manifest();
  assert.equal(m.status, 'done');
  assert.equal(m.durationMs, 10000);
  assert.equal(m.initialSlideId, 'a');
  assert.deepEqual(m.clips.map(c => [c.offsetMs, c.durationMs, c.files.length]), [[0, 6000, 1], [6000, 4000, 1]]);
  assert.deepEqual(m.clips.flatMap(c => c.files), ['audio-0001.webm', 'audio-0002.webm']);
  assert.equal(await h.files.get(`${m.recordingId}/audio-0001.webm`)!.text(), 'span1-0|');
  assert.equal(h.files.get(`${m.recordingId}/audio-0001.webm`)!.type, 'audio/webm');
  assert.deepEqual(h.rows[0], { id: m.recordingId, deck_id: 'd1', title: '수업', class_name: '수토반', duration_ms: 10000, status: 'done' });
  assert.equal(m.className, '수토반', '반은 manifest에도 남는다');

  // 저장된 파일만으로 다시 읽는다.
  const chunks = await Promise.all(m.chunks.map(async c => decodeChunkFile(h.files.get(`${m.recordingId}/${c.file}`)!, c.encoding)));
  const entries = mergeChunks(chunks);
  assert.deepEqual(entries.map(e => `${e.type}@${e.at}:${e.slideId}`), ['ink@0:a', 'ink@4000:a', 'slide@6000:b', 'ink@9000:b']);
  const replay = buildLectureReplay(m, entries);
  assert.deepEqual(replay.frame(5000).strokes.map(x => x.id), ['pre', 's1']);
  assert.equal(replay.frame(7000).slideId, 'b');
  assert.deepEqual(replay.frame(10000).strokes.map(x => x.id), ['s2']);
  assert.deepEqual(replay.finalInk().a.map(x => x.id), ['pre', 's1']);
});

async function savedEntries(h: ReturnType<typeof harness>) {
  const manifest = await h.manifest();
  return mergeChunks(await Promise.all(manifest.chunks.map(c => decodeChunkFile(h.files.get(`${manifest.recordingId}/${c.file}`)!, c.encoding))));
}

test('일시정지 중 여러 슬라이드의 편집은 이어하기 때 최종 결과만 즉시 나타난다', async () => {
  const h = harness(), s = h.session;
  const old = stroke('old'), one = stroke('one'), two = stroke('two'), three = stroke('three'), other = stroke('other');
  await s.start({ deckId: 'd1', title: '수업', slides, initialSlideId: 'a', ink: { a: [old] } });
  h.advance(2000);
  await s.pause();
  s.logInk('a', [old], [old, one], 'draw');
  s.logInk('a', [old, one], [old, one, two], 'draw');
  s.logInk('a', [old, one, two], [old, one, two, three], 'draw');
  s.logInk('a', [old, one, two, three], [one, two, three], 'erase');
  s.logSlide('b');
  s.logInk('b', [], [other], 'draw');
  s.logSlide('c');
  s.logSlide('b');
  h.advance(60000);
  await s.flush();
  await s.whenIdle();
  assert.deepEqual((await savedEntries(h)).map(e => e.at), [0], '일시정지 중에는 자동 저장해도 편집 과정이 없다');
  await s.resume();
  h.advance(1000);
  const later = stroke('later');
  s.logInk('b', [other], [other, later], 'draw');
  await s.end();
  const entries = await savedEntries(h);
  const resumed = entries.filter(e => e.at === 2000);
  assert.deepEqual(resumed.map(e => [e.type, e.slideId]), [['ink', 'a'], ['ink', 'b'], ['slide', 'b']]);
  for (const entry of resumed.slice(0, 2)) {
    assert.ok(entry.type === 'ink');
    assert.equal(entry.event.kind, 'restore');
    assert.equal(entry.event.at, 2000);
  }
  assert.equal(entries.filter(e => e.type === 'ink' && e.event.kind === 'draw').length, 1);
  const replay = buildLectureReplay(await h.manifest(), entries);
  for (const t of [0, 1600, 1800, 1999]) {
    assert.deepEqual(replay.strokesAt('a', t), [old]);
    assert.deepEqual(replay.strokesAt('b', t), [], '이어하기 전에는 획의 일부도 보이지 않는다');
  }
  assert.deepEqual(replay.strokesAt('a', 2000), [one, two, three]);
  assert.deepEqual(replay.frame(2000).strokes, [other]);
  assert.equal(replay.frame(2000).slideId, 'b');
  assert.equal(replay.frame(2800).strokes.at(-1)!.points.length, 2, '이어하기 이후 획은 평소대로 그려진다');
  assert.deepEqual((await h.manifest()).clips.map(c => c.offsetMs), [0, 2000]);
});

test('이어하기가 실패해도 일시정지 결과를 보존하고 다음 이어하기 때 한 번만 기록한다', async () => {
  const options = { micError: '' }, h = harness(options), s = h.session;
  const first = stroke('first'), final = stroke('final');
  await s.start({ deckId: 'd1', title: '수업', slides, initialSlideId: 'a', ink: {} });
  h.advance(1000);
  await s.pause();
  s.logInk('a', [], [first], 'draw');
  options.micError = 'NotAllowedError';
  await s.resume();
  assert.equal(s.state.phase, 'paused');
  s.logInk('a', [first], [final], 'restore');
  options.micError = '';
  await s.resume();
  await s.end();
  const entries = await savedEntries(h);
  assert.equal(entries.length, 1);
  assert.deepEqual(buildLectureReplay(await h.manifest(), entries).frame(1000).strokes, [final]);
});

test('예전 v1 일시정지 시각의 개별 획도 파일에서 읽어 그대로 재생한다', async () => {
  const log = new TimelineLog(), one = stroke('one'), two = stroke('two');
  log.ink(1000, 'a', [], [one], 'draw');
  log.ink(1000, 'a', [one], [one, two], 'draw');
  const encoded = await encodeChunkFile(splitIntoChunks(log.take(), 1)[0]);
  const chunk = await decodeChunkFile(encoded.blob, encoded.encoding);
  const manifest = createManifest({ recordingId: 'old', deckId: 'd1', title: '수업', slides, initialSlideId: 'a' });
  assert.equal(manifest.version, 1);
  assert.deepEqual(buildLectureReplay(parseManifest(manifest), chunk.entries).frame(1000).strokes, [one, two]);
});

test('일시정지 후 바로 끝내면 지우기와 실행 취소 결과도 마지막 시각에 저장한다', async () => {
  const h = harness(), s = h.session;
  const old = stroke('old'), extra = stroke('extra');
  await s.start({ deckId: 'd1', title: '수업', slides, initialSlideId: 'a', ink: { a: [old] } });
  h.advance(1000);
  await s.pause();
  s.logInk('a', [old], [], 'clear');
  s.logSlide('b');
  s.logInk('b', [], [extra], 'draw');
  s.logInk('b', [extra], [], 'undo');
  h.advance(60000);
  await s.end();
  const entries = await savedEntries(h);
  assert.deepEqual(entries.map(e => [e.type, e.at, e.slideId]), [['ink', 0, 'a'], ['ink', 1000, 'a'], ['slide', 1000, 'b']]);
  const replay = buildLectureReplay(await h.manifest(), entries);
  assert.deepEqual(replay.finalInk().a, []);
  assert.equal(replay.frame(1000).slideId, 'b');
});

test('일시정지 중 변경을 되돌리거나 변경 없이 이어하면 추가 기록이 없다', async () => {
  const h = harness(), s = h.session, extra = stroke('extra');
  await s.start({ deckId: 'd1', title: '수업', slides, initialSlideId: 'a', ink: {} });
  h.advance(1000);
  await s.pause();
  s.logInk('a', [], [extra], 'draw');
  s.logInk('a', [extra], [], 'undo');
  s.logSlide('b'); s.logSlide('a');
  await s.resume();
  h.advance(1000);
  await s.pause();
  await s.resume();
  await s.end();
  assert.deepEqual(await savedEntries(h), []);
});

test('세션: 화면을 벗어나면 저절로 일시정지하고, 돌아오면 화면 켜짐 유지를 다시 잡는다', async () => {
  const h = harness();
  await h.session.start({ deckId: 'd1', title: '수업', slides, initialSlideId: 'a', ink: {} });
  h.advance(1500);
  h.doc.visibilityState = 'hidden';
  h.docListeners.get('visibilitychange')!();
  await h.session.whenIdle();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(h.session.state.phase, 'paused');
  assert.equal(h.session.state.autoPaused, true);
  assert.match(h.session.state.notice, /녹음이 일시정지됐어요/);
  h.advance(60000);
  assert.equal(h.session.elapsed(), 1500, '숨어 있는 동안은 녹음 시간이 늘지 않는다');
  h.doc.visibilityState = 'visible';
  h.docListeners.get('visibilitychange')!();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(h.session.state.phase, 'paused', '돌아와도 몰래 이어 녹음하지 않는다');
  assert.equal(h.wakeRequests, 2);
  await h.session.resume();
  assert.equal(h.session.state.phase, 'recording');
  assert.equal(h.session.state.notice, '');
});

test('세션: 2분마다 끝난 음성 조각과 필기 기록을 올린다(앱이 죽어도 그때까지는 남는다)', async () => {
  const h = harness();
  await h.session.start({ deckId: 'd1', title: '수업', slides, initialSlideId: 'a', ink: {} });
  h.advance(120000);
  h.session.logInk('a', [], [stroke('s1')], 'draw');
  h.tick();
  await new Promise(resolve => setTimeout(resolve, 0));
  await h.session.whenIdle();
  const m = await h.manifest();
  assert.equal(m.status, 'recording');
  assert.deepEqual(m.clips.map(c => [c.offsetMs, c.durationMs, c.files]), [[0, 120000, ['audio-0001.webm']]]);
  assert.equal(m.chunks.length, 1);
  assert.equal(h.rows[0].duration_ms, 120000);
  // 같은 구간의 다음 조각은 같은 클립에 이어진다.
  h.advance(60000);
  await h.session.end();
  const done = await h.manifest();
  assert.deepEqual(done.clips.map(c => [c.offsetMs, c.durationMs, c.files]), [[0, 180000, ['audio-0001.webm', 'audio-0002.webm']]]);
});

test('세션: 업로드가 실패하면 몇 번 더 시도하고, 그래도 안 되면 저장 안 됨으로 남겨 다시 시도한다', async () => {
  const h = harness({ failUploads: 3 }); // 첫 파일이 세 번 연속 실패(재시도 2번 포함)
  await h.session.start({ deckId: 'd1', title: '수업', slides, initialSlideId: 'a', ink: {} });
  await h.session.whenIdle();
  assert.equal(h.session.state.failed, 1);
  assert.ok(h.session.unsaved);
  h.session.retry();
  await h.session.whenIdle();
  assert.equal(h.session.state.failed, 0);
  assert.ok(h.files.size >= 1);
});

test('세션: 마이크 권한 거부·사용 중 오류는 한국어 안내와 함께 시작하지 않는다', async () => {
  const denied = harness({ micError: 'NotAllowedError' });
  await denied.session.start({ deckId: 'd1', title: '수업', slides, initialSlideId: 'a', ink: {} });
  assert.equal(denied.session.state.phase, 'idle');
  assert.match(denied.session.state.notice, /마이크 권한이 없어요/);
  assert.equal(denied.rows.length, 0);
  const busy = harness({ micError: 'NotReadableError' });
  await busy.session.start({ deckId: 'd1', title: '수업', slides, initialSlideId: 'a', ink: {} });
  assert.match(busy.session.state.notice, /다른 앱이 마이크를 쓰고 있어요/);
  assert.match(micErrorMessage(new Error('x')), /녹음을 시작하지 못했어요/);
});
