// 교재 수업 녹음 세션: 마이크 음성(끊김 없는 구간 = 클립) + 슬라이드·필기 기록.
// 화면은 녹화하지 않는다(Smart View와 충돌). 약 2분마다, 그리고 일시정지·끝내기 때 Storage에 나눠 올린다.
import type { InkChangeKind, InkStroke } from '../exam/contract.ts';
import { AUDIO_CONSTRAINTS, chooseAudioFormat } from '../exam/audio/audioMath.ts';
import type { LectureSlide } from './lectureDecks.ts';
import {
  RECORDING_FLUSH_MS, RecordingClock, TimelineLog, audioFileName, chunkFileName, createManifest, encodeChunkFile, splitIntoChunks,
  type LectureRecordingManifest, type ManifestClip,
} from './lectureRecordingModel.ts';
import type { RecordingBackend } from './lectureRecordings.ts';

export type RecordingPhase = 'idle' | 'starting' | 'recording' | 'paused' | 'ending' | 'done';
export interface RecordingSessionState {
  phase: RecordingPhase;
  recordingId: string | null;
  /** 화면에 띄울 안내(일시정지 이유, 마이크 오류 등). */
  notice: string;
  /** 화면을 벗어나 저절로 일시정지됐는지. */
  autoPaused: boolean;
  /** 올리는 중·대기 중인 파일 수 / 실패해서 다시 시도해야 하는 수. */
  uploading: number;
  failed: number;
  /** 마지막으로 모두 올라간 시각(Date.now()). */
  savedAt: number | null;
}

/** MediaRecorder 중 쓰는 부분만(테스트에서 가짜로 바꾼다). */
export interface RecorderLike {
  readonly state: 'inactive' | 'recording' | 'paused';
  readonly mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
  start(timeslice?: number): void;
  stop(): void;
  requestData(): void;
}
export interface StreamLike { getTracks(): Array<{ stop(): void; addEventListener(type: 'ended', listener: () => void): void }> }
export interface RecorderMedia {
  format(): { mimeType: string; audioBitsPerSecond?: number } | null;
  getUserMedia(): Promise<StreamLike>;
  createRecorder(stream: StreamLike, format: { mimeType: string; audioBitsPerSecond?: number }): RecorderLike;
}
export interface RecorderEnv {
  doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  win: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void>; addEventListener(type: 'release', listener: () => void): void }> };
  wall?: () => number;
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
  /** 업로드 재시도 대기(ms). */
  retryDelays?: number[];
}

export const browserRecorderMedia: RecorderMedia = {
  format: () => typeof MediaRecorder === 'undefined' ? null : chooseAudioFormat(mime => MediaRecorder.isTypeSupported(mime)),
  getUserMedia: () => {
    if (!navigator.mediaDevices?.getUserMedia) return Promise.reject(new DOMException('unsupported', 'NotSupportedError'));
    return navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
  },
  createRecorder: (stream, format) => new MediaRecorder(stream as MediaStream, format) as unknown as RecorderLike,
};

export function browserRecorderEnv(): RecorderEnv {
  const wakeLock = (navigator as Navigator & { wakeLock?: RecorderEnv['wakeLock'] }).wakeLock;
  return {
    doc: document, win: window, wakeLock,
    setInterval: (handler, ms) => window.setInterval(handler, ms),
    clearInterval: id => window.clearInterval(id as number),
  };
}

/** 마이크 오류를 선생님이 바로 알아볼 말로. */
export function micErrorMessage(error: unknown): string {
  const name = error instanceof Error || (error && typeof error === 'object' && 'name' in error) ? String((error as { name: string }).name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return '마이크 권한이 없어요. 브라우저 주소창 왼쪽 자물쇠 → 권한에서 마이크를 허용한 뒤 다시 눌러 주세요.';
  if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError') return '다른 앱이 마이크를 쓰고 있어요. 녹음·통화 앱을 닫고 다시 눌러 주세요.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '마이크를 찾지 못했어요. 마이크 연결을 확인해 주세요.';
  if (name === 'NotSupportedError') return '이 브라우저에서는 녹음을 할 수 없어요. 크롬에서 열어 주세요.';
  return '녹음을 시작하지 못했어요. 마이크를 확인하고 다시 눌러 주세요.';
}

interface ClipFile { name: string; endMs: number; bytes: number; uploaded: boolean }
interface ClipState { id: string; offsetMs: number; mime: string; files: ClipFile[]; pending: Blob[] }
interface UploadItem { key: string; run: () => Promise<void> }

const DEFAULT_RETRY = [1000, 3000, 8000];

export class LectureRecordingSession {
  state: RecordingSessionState = { phase: 'idle', recordingId: null, notice: '', autoPaused: false, uploading: 0, failed: 0, savedAt: null };
  private readonly clock: RecordingClock;
  private readonly log = new TimelineLog();
  private currentSlideId: string | null = null;
  private readonly pausedInk = new Map<string, { before: InkStroke[]; after: InkStroke[] }>();
  private manifest: LectureRecordingManifest | null = null;
  private stream: StreamLike | null = null;
  private recorder: RecorderLike | null = null;
  private format: { mimeType: string; audioBitsPerSecond?: number } | null = null;
  private clip: ClipState | null = null;
  private clips: ClipState[] = [];
  private chunkSeq = 1;
  private audioSeq = 1;
  private chunks: LectureRecordingManifest['chunks'] = [];
  private queue: UploadItem[] = [];
  private failedItems: UploadItem[] = [];
  private draining: Promise<void> | null = null;
  private dataWaiters: Array<() => void> = [];
  private stopWaiters: Array<() => void> = [];
  private timer: unknown = null;
  private wakeSentinel: { release(): Promise<void> } | null = null;
  private listening = false;
  private readonly listeners = new Set<() => void>();
  private readonly backend: RecordingBackend;
  private readonly media: RecorderMedia;
  private readonly env: RecorderEnv;
  private readonly flushMs: number;
  private readonly timesliceMs: number;

  constructor(backend: RecordingBackend, media: RecorderMedia = browserRecorderMedia, env: RecorderEnv = browserRecorderEnv(),
    options: { flushMs?: number; timesliceMs?: number } = {}) {
    this.backend = backend; this.media = media; this.env = env;
    this.flushMs = options.flushMs ?? RECORDING_FLUSH_MS;
    this.timesliceMs = options.timesliceMs ?? 10000;
    this.clock = new RecordingClock(env.wall ?? (() => performance.now()));
  }

  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private publish(patch: Partial<RecordingSessionState> = {}) {
    this.state = { ...this.state, ...patch, uploading: this.queue.length + (this.draining ? 1 : 0), failed: this.failedItems.length };
    this.listeners.forEach(listener => listener());
  }
  /** 녹음된 시간(ms, 일시정지 제외). */
  elapsed() { return this.clock.now(); }
  get active() { return this.state.phase === 'recording' || this.state.phase === 'paused' || this.state.phase === 'starting'; }
  /** 아직 Storage에 다 올라가지 않은 기록이 있는지(닫기 전 확인용). */
  get unsaved() { return this.pausedInk.size > 0 || this.log.size > 0 || this.state.uploading > 0 || this.state.failed > 0 || this.clips.some(c => c.pending.length); }

  // ── 시작·일시정지·이어하기·끝내기 ──
  async start(input: { deckId: string; title: string; slides: LectureSlide[]; initialSlideId: string; ink: Record<string, InkStroke[]> }) {
    if (this.state.phase !== 'idle') return;
    this.publish({ phase: 'starting', notice: '' });
    this.format = this.media.format();
    if (!this.format) { this.publish({ phase: 'idle', notice: micErrorMessage({ name: 'NotSupportedError' }) }); return; }
    try { this.stream = await this.media.getUserMedia(); }
    catch (error) { this.publish({ phase: 'idle', notice: micErrorMessage(error) }); return; }
    const recordingId = crypto.randomUUID();
    try { await this.backend.insertRow({ id: recordingId, deck_id: input.deckId, title: input.title, duration_ms: 0, status: 'recording' }); }
    catch {
      this.releaseStream();
      this.publish({ phase: 'idle', notice: '녹음 목록을 만들지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.' });
      return;
    }
    this.manifest = createManifest({ recordingId, deckId: input.deckId, title: input.title, slides: input.slides, initialSlideId: input.initialSlideId });
    this.currentSlideId = input.initialSlideId;
    this.log.slide(0, input.initialSlideId);
    this.log.take(); // 첫 슬라이드는 manifest.initialSlideId로 남는다.
    this.log.baseline(input.ink);
    this.listen();
    this.state = { ...this.state, recordingId };
    try { this.beginSpan(); }
    catch (error) {
      this.releaseStream();
      this.publish({ phase: 'paused', notice: micErrorMessage(error) });
      return;
    }
    this.publish({ phase: 'recording', autoPaused: false });
    void this.acquireWakeLock();
    this.enqueueManifest();
  }

  async pause(reason: 'user' | 'hidden' | 'mic' = 'user') {
    if (this.state.phase !== 'recording') return;
    const endMs = this.clock.pause();
    const notice = reason === 'hidden' ? '녹음이 일시정지됐어요. 이어하기를 누르면 계속 녹음해요.'
      : reason === 'mic' ? '마이크 연결이 끊겨 녹음을 일시정지했어요. 이어하기를 눌러 주세요.' : '';
    this.publish({ phase: 'paused', autoPaused: reason !== 'user', notice });
    await this.stopRecorder();
    this.releaseStream();
    this.cutAudio(endMs);
    this.recorder = null; this.clip = null;
    this.flushInk();
    this.enqueueManifest();
  }

  async resume() {
    if (this.state.phase !== 'paused') return;
    this.publish({ phase: 'starting', notice: '' });
    try {
      this.stream = await this.media.getUserMedia();
      if (this.env.doc.visibilityState === 'hidden') throw new Error('hidden');
      this.beginSpan();
    } catch (error) {
      this.releaseStream();
      this.publish({ phase: 'paused', notice: error instanceof Error && error.message === 'hidden' ? '' : micErrorMessage(error) });
      return;
    }
    this.commitPausedChanges(this.clip!.offsetMs);
    this.publish({ phase: 'recording', autoPaused: false, notice: '' });
    void this.acquireWakeLock();
  }

  async end() {
    if (this.state.phase === 'starting') return;
    if (this.state.phase === 'recording') await this.pause('user');
    if (this.state.phase !== 'paused' || !this.manifest) return;
    this.commitPausedChanges(this.clock.now());
    this.publish({ phase: 'ending', notice: '' });
    this.manifest.status = 'done';
    this.flushInk();
    this.enqueueManifest();
    await this.whenIdle();
    this.unlisten();
    void this.releaseWakeLock();
    this.publish({ phase: 'done' });
  }

  /** 지금까지의 기록을 바로 올린다(주기 저장). */
  async flush() {
    if (!this.manifest) return;
    if (this.state.phase === 'recording' && this.recorder && this.clip) {
      const endMs = this.clock.now();
      const clip = this.clip;
      await this.requestData(this.recorder);
      this.cutAudio(endMs, clip);
    }
    this.flushInk();
    this.retry();
    this.enqueueManifest();
  }

  /** 실패한 업로드를 다시 시도한다. */
  retry() {
    if (!this.failedItems.length) return;
    const items = this.failedItems; this.failedItems = [];
    for (const item of items) this.enqueue(item);
  }

  /** 모든 업로드가 끝날 때까지(실패분은 failed로 남는다). */
  async whenIdle() { while (this.draining) await this.draining; }

  // ── 기록 ──
  logSlide(slideId: string) {
    if (!this.manifest || !this.active) return;
    this.currentSlideId = slideId;
    if (this.state.phase === 'recording') this.log.slide(this.clock.now(), slideId);
  }
  logInk(slideId: string, before: InkStroke[], after: InkStroke[], kind: InkChangeKind) {
    if (this.state.phase === 'recording') this.log.ink(this.clock.now(), slideId, before, after, kind);
    else if (this.manifest && (this.state.phase === 'paused' || this.state.phase === 'starting')) {
      // 마이크를 다시 여는 동안의 편집도 일시정지 결과에 포함한다.
      const initial = this.pausedInk.get(slideId)?.before ?? structuredClone(before);
      const final = structuredClone(after);
      if (JSON.stringify(initial) === JSON.stringify(final)) this.pausedInk.delete(slideId);
      else this.pausedInk.set(slideId, { before: initial, after: final });
    }
  }

  private commitPausedChanges(at: number) {
    for (const [slideId, ink] of this.pausedInk) this.log.snapshot(at, slideId, ink.before, ink.after);
    this.pausedInk.clear();
    // 결과 필기를 먼저 반영한 뒤 이어갈 슬라이드로 이동한다.
    if (this.currentSlideId) this.log.slide(at, this.currentSlideId);
  }

  /** 화면을 닫을 때. 진행 중인 업로드는 계속 둔다. */
  dispose() {
    this.unlisten();
    try { if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop(); } catch { /* 이미 멈춤 */ }
    this.releaseStream();
    void this.releaseWakeLock();
    this.listeners.clear();
  }

  // ── 음성 ──
  private beginSpan() {
    if (!this.stream || !this.format) throw new Error('no-stream');
    const recorder = this.media.createRecorder(this.stream, this.format);
    const clip: ClipState = { id: crypto.randomUUID(), offsetMs: 0, mime: recorder.mimeType || this.format.mimeType, files: [], pending: [] };
    recorder.ondataavailable = event => {
      if (event.data?.size) clip.pending.push(event.data);
      const waiters = this.dataWaiters; this.dataWaiters = [];
      waiters.forEach(resolve => resolve());
    };
    recorder.onstop = () => {
      const waiters = this.stopWaiters; this.stopWaiters = [];
      waiters.forEach(resolve => resolve());
    };
    recorder.onerror = () => { void this.pause('mic'); };
    for (const track of this.stream.getTracks()) track.addEventListener('ended', () => { if (this.recorder === recorder) void this.pause('mic'); });
    recorder.start(this.timesliceMs);
    clip.offsetMs = this.clock.resume();
    this.recorder = recorder; this.clip = clip;
    this.clips.push(clip);
  }
  private requestData(recorder: RecorderLike) {
    return new Promise<void>(resolve => {
      const timer = setTimeout(resolve, 3000);
      this.dataWaiters.push(() => { clearTimeout(timer); resolve(); });
      try { recorder.requestData(); } catch { clearTimeout(timer); resolve(); }
    });
  }
  private stopRecorder() {
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') return Promise.resolve();
    return new Promise<void>(resolve => {
      const timer = setTimeout(resolve, 3000);
      this.stopWaiters.push(() => { clearTimeout(timer); resolve(); });
      try { recorder.stop(); } catch { clearTimeout(timer); resolve(); }
    });
  }
  private releaseStream() { this.stream?.getTracks().forEach(track => track.stop()); this.stream = null; }

  /** 지금까지 받은 음성을 다음 audio-000N 파일로 떼어 올린다. 클립 파일은 이어 붙이면 하나의 녹음이 된다. */
  private cutAudio(endMs: number, clip = this.clip) {
    if (!clip || !clip.pending.length || !this.manifest) return;
    const blob = new Blob(clip.pending, { type: clip.mime.split(';')[0] });
    clip.pending = [];
    const file: ClipFile = { name: audioFileName(this.audioSeq++, clip.mime), endMs, bytes: blob.size, uploaded: false };
    clip.files.push(file);
    const path = `${this.manifest.recordingId}/${file.name}`;
    this.enqueue({ key: path, run: async () => { await this.backend.upload(path, blob); file.uploaded = true; } });
  }

  // ── 필기·슬라이드 기록 ──
  private flushInk() {
    if (!this.manifest || !this.log.size) return;
    const chunks = splitIntoChunks(this.log.take(), this.chunkSeq);
    this.chunkSeq += chunks.length;
    for (const chunk of chunks) {
      const file = chunkFileName(chunk.seq);
      const path = `${this.manifest.recordingId}/${file}`;
      let encoded: Awaited<ReturnType<typeof encodeChunkFile>> | null = null;
      this.enqueue({ key: path, run: async () => {
        encoded ??= await encodeChunkFile(chunk);
        await this.backend.upload(path, encoded.blob);
        if (!this.chunks.some(c => c.file === file)) {
          this.chunks.push({ file, seq: chunk.seq, fromMs: chunk.fromMs, toMs: chunk.toMs, entries: chunk.entries.length, encoding: encoded.encoding, bytes: encoded.blob.size });
        }
      } });
    }
  }

  /** manifest에는 실제로 올라간 파일만 적는다. 클립은 앞에서부터 이어진 파일까지만(중간이 빠지면 이어 붙일 수 없다). */
  manifestSnapshot(): LectureRecordingManifest | null {
    if (!this.manifest) return null;
    const clips: ManifestClip[] = [];
    for (const clip of this.clips) {
      const files: ClipFile[] = [];
      for (const file of clip.files) { if (!file.uploaded) break; files.push(file); }
      if (!files.length) continue;
      clips.push({ id: clip.id, offsetMs: clip.offsetMs, durationMs: Math.max(0, files.at(-1)!.endMs - clip.offsetMs), mime: clip.mime,
        files: files.map(f => f.name), bytes: files.reduce((sum, f) => sum + f.bytes, 0) });
    }
    return { ...this.manifest, updatedAt: new Date().toISOString(), durationMs: this.clock.now(),
      clips, chunks: [...this.chunks].sort((a, b) => a.seq - b.seq) };
  }

  private enqueueManifest() {
    const manifest = this.manifest;
    if (!manifest) return;
    const key = `${manifest.recordingId}/manifest.json`;
    // 늘 줄의 맨 뒤에서 올린다(앞서 넣은 조각 파일이 먼저 올라가야 manifest에 적힌다).
    this.queue = this.queue.filter(item => item.key !== key && item.key !== 'row');
    this.failedItems = this.failedItems.filter(item => item.key !== key && item.key !== 'row');
    this.enqueue({ key, run: async () => {
      const snapshot = this.manifestSnapshot()!;
      await this.backend.upload(key, new Blob([JSON.stringify(snapshot)], { type: 'application/json' }), { cacheControl: '0' });
    } });
    this.enqueue({ key: 'row', run: async () => {
      await this.backend.updateRow(manifest.recordingId, { duration_ms: this.clock.now(), status: manifest.status });
    } });
  }

  // ── 업로드 줄(순서대로, 실패하면 몇 번 더) ──
  private enqueue(item: UploadItem) {
    if (this.queue.some(queued => queued.key === item.key)) return;
    this.queue.push(item);
    if (!this.draining) this.draining = this.drain().finally(() => { this.draining = null; this.publish(); });
    this.publish();
  }
  private async drain() {
    const delays = this.env.retryDelays ?? DEFAULT_RETRY;
    while (this.queue.length) {
      const item = this.queue.shift()!;
      this.publish();
      let ok = false;
      for (let attempt = 0; ; attempt++) {
        try { await item.run(); ok = true; break; }
        catch (error) {
          if (attempt >= delays.length) { console.warn('[lecture-recording] 업로드 실패:', item.key, error); break; }
          await new Promise(resolve => setTimeout(resolve, delays[attempt]));
        }
      }
      if (!ok) this.failedItems.push(item);
      else if (!this.queue.length && !this.failedItems.length) this.state = { ...this.state, savedAt: Date.now() };
    }
  }

  // ── 화면 꺼짐·앱 전환 대비 ──
  private onVisibility = () => {
    if (this.env.doc.visibilityState === 'hidden') {
      // 화면을 벗어나면 몰래 녹음을 이어 가지 않는다. 화면 켜짐 유지는 브라우저가 이때 풀어 버린다.
      this.wakeSentinel = null;
      if (this.state.phase === 'recording') void this.pause('hidden');
      else void this.flush();
    } else if (this.state.phase === 'recording' || this.state.phase === 'paused') {
      void this.acquireWakeLock();
      this.retry();
      this.publish();
    }
  };
  private onPageHide = () => { if (this.state.phase === 'recording') void this.pause('hidden'); };
  private listen() {
    if (this.listening) return;
    this.listening = true;
    this.env.doc.addEventListener('visibilitychange', this.onVisibility);
    this.env.win.addEventListener('pagehide', this.onPageHide);
    this.timer = this.env.setInterval(() => { void this.flush(); }, this.flushMs);
  }
  private unlisten() {
    if (!this.listening) return;
    this.listening = false;
    this.env.doc.removeEventListener('visibilitychange', this.onVisibility);
    this.env.win.removeEventListener('pagehide', this.onPageHide);
    if (this.timer !== null) { this.env.clearInterval(this.timer); this.timer = null; }
  }
  private async acquireWakeLock() {
    if (!this.env.wakeLock || this.wakeSentinel || this.env.doc.visibilityState !== 'visible') return;
    try {
      const sentinel = await this.env.wakeLock.request('screen');
      this.wakeSentinel = sentinel;
      sentinel.addEventListener('release', () => { if (this.wakeSentinel === sentinel) this.wakeSentinel = null; });
    } catch { /* 배터리 절약 모드 등에서는 거절될 수 있다 */ }
  }
  private async releaseWakeLock() {
    const sentinel = this.wakeSentinel; this.wakeSentinel = null;
    await sentinel?.release().catch(() => {});
  }
}
