import type { ExamClient } from '../contract.ts';
import { AUDIO_CONSTRAINTS, AUDIO_MAX_BYTES, AUDIO_TIMESLICE_MS, chooseAudioFormat, shouldSplitAudio } from './audioMath.ts';
import { audioStore, type AudioDraft, type AudioStore } from './audioStore.ts';

export interface AudioStatus { id: string; questionId: string; state: 'uploading' | 'done' | 'failed' }
export interface RecordingState {
  recording: boolean;
  startedAt: number;
  busy: boolean;
  notice: string;
  settings: string;
  uploads: AudioStatus[];
}

/** 캡처와 업로드는 분리한다. 다음 문항으로 이동해도 이전 업로드와 기기 보관은 계속된다. */
export class TeacherAudioCapture {
  state: RecordingState = { recording: false, startedAt: 0, busy: false, notice: '', settings: '', uploads: [] };
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private generation = 0;
  private currentDone: Promise<void> = Promise.resolve();
  private uploading = new Map<string, Promise<void>>();
  private failures = new Map<string, AudioDraft>();
  private change: () => void;
  private client: ExamClient;
  private ownerId: string;
  private store: AudioStore;
  private splitBytes?: number;
  constructor(client: ExamClient, ownerId: string, change: () => void, store = audioStore, splitBytes?: number) {
    this.client = client; this.ownerId = ownerId; this.change = change; this.store = store; this.splitBytes = splitBytes;
  }
  private publish(patch: Partial<RecordingState>) { this.state = { ...this.state, ...patch }; this.change(); }
  private status(draft: AudioDraft, state: AudioStatus['state']) {
    this.publish({ uploads: [...this.state.uploads.filter(row => row.id !== draft.id), { id: draft.id, questionId: draft.questionId, state }] });
  }
  async recover() {
    try {
      for (const draft of await this.store.list(this.ownerId)) {
        if (draft.sizeBytes === 0) { await this.store.remove(draft); continue; }
        if (draft.state === 'recording') {
          draft.state = 'pending'; draft.durationMs = Math.max(0, draft.endedAt - draft.startedAt);
          await this.store.put(draft);
          this.publish({ notice: '이 기기에 남은 녹음을 복구했어요.' });
        }
        void this.upload(draft);
      }
    } catch { this.publish({ notice: '기기 저장 공간을 사용할 수 없어 녹음을 시작할 수 없어요.' }); }
  }
  async start(attemptId: string, questionId: string) {
    if (this.state.busy || this.state.recording) return;
    const generation = ++this.generation;
    this.publish({ busy: true, notice: '' });
    try {
      if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      const format = chooseAudioFormat(mime => MediaRecorder.isTypeSupported(mime));
      if (!format) throw new Error('unsupported');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
      if (generation !== this.generation || document.hidden) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const settings = stream.getAudioTracks()[0]?.getSettings() ?? {};
      this.publish({ settings: `${format.mimeType} · ${settings.channelCount ?? '?'}채널 · ${settings.sampleRate ?? '?'}Hz · 소음 억제 ${String(settings.noiseSuppression ?? '?')} · 자동 음량 ${String(settings.autoGainControl ?? '?')} · 에코 제거 ${String(settings.echoCancellation ?? '?')}` });
      await this.part(attemptId, questionId, format, generation);
    } catch (error) {
      this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
      this.publish({ recording: false, notice: error instanceof DOMException && error.name === 'NotAllowedError'
        ? '마이크 권한이 없어요. 브라우저 설정에서 허용한 뒤 다시 눌러 주세요.'
        : '녹음을 시작하지 못했어요. 마이크와 기기 저장 공간을 확인해 주세요.' });
    } finally { this.publish({ busy: false }); }
  }
  private async part(attemptId: string, questionId: string, format: MediaRecorderOptions, generation: number) {
    if (!this.stream || generation !== this.generation) return;
    const recorder = new MediaRecorder(this.stream, format);
    let startedAt = Date.now();
    let draft: AudioDraft = { id: crypto.randomUUID(), ownerId: this.ownerId, attemptId, questionId,
      startedAt, endedAt: startedAt, durationMs: 0, mime: recorder.mimeType || format.mimeType!, sizeBytes: 0, chunks: 0, state: 'recording' };
    await this.store.put(draft);
    if (generation !== this.generation) { await this.store.remove(draft); return; }
    startedAt = Date.now();
    draft = { ...draft, startedAt, endedAt: startedAt };
    let split = false;
    let failed = false;
    let writes = this.store.put(draft).catch(() => {
      failed = true;
      this.publish({ notice: '기기 저장 공간이 부족해 녹음을 멈췄어요.' });
      void this.stop();
    });
    let resolveDone: () => void = () => {};
    this.currentDone = new Promise(resolve => { resolveDone = resolve; });
    this.recorder = recorder;
    recorder.ondataavailable = event => {
      if (!event.data.size) return;
      draft = { ...draft, chunks: draft.chunks + 1, sizeBytes: draft.sizeBytes + event.data.size, endedAt: Date.now() };
      const snapshot = draft;
      writes = writes.then(() => this.store.append(snapshot, event.data)).catch(() => {
        failed = true;
        this.publish({ notice: '기기 저장 공간이 부족해 녹음을 멈췄어요. 저장된 부분은 이 기기에 남아요.' });
        void this.stop();
      });
      if (!split && shouldSplitAudio(draft.sizeBytes, this.splitBytes) && recorder.state === 'recording') {
        split = true; recorder.stop();
      }
    };
    recorder.onerror = () => { this.publish({ notice: '마이크 녹음이 중단되어 저장할게요.' }); void this.stop(); };
    this.publish({ settings: `${this.state.settings} · 실제 ${recorder.mimeType} / ${recorder.audioBitsPerSecond}bps` });
    recorder.onstop = () => {
      const captureStoppedAt = Date.now();
      void (async () => {
        try {
          await writes;
          // 실패한 마지막 청크 대신 트랜잭션이 완료된 자료만 복구한다.
          if (failed) draft = (await this.store.list(this.ownerId)).find(row => row.id === draft.id) ?? draft;
          const stoppedAt = failed ? draft.endedAt : captureStoppedAt;
          draft = { ...draft, state: 'pending', endedAt: stoppedAt, durationMs: Math.max(0, stoppedAt - startedAt) };
          if (draft.sizeBytes) { await this.store.put(draft); void this.upload(draft); }
          else await this.store.remove(draft);
          if (split && generation === this.generation && !document.hidden && !failed) {
            await this.part(attemptId, questionId, format, generation);
          } else {
            this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
            this.recorder = null; this.publish({ recording: false });
          }
        } catch {
          this.stream?.getTracks().forEach(track => track.stop()); this.stream = null; this.recorder = null;
          this.publish({ recording: false, notice: '음성을 저장하지 못했어요. 기기 저장 공간을 확인해 주세요.' });
        }
        finally { resolveDone(); }
      })();
    };
    try { recorder.start(AUDIO_TIMESLICE_MS); }
    catch (error) { resolveDone(); this.recorder = null; throw error; }
    if (!this.state.recording) this.publish({ recording: true, startedAt });
  }
  async stop(notice = '') {
    ++this.generation;
    if (notice) this.publish({ notice });
    const recorder = this.recorder;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    await this.currentDone;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    this.publish({ recording: false });
  }
  retry() { for (const draft of this.failures.values()) void this.upload(draft); }
  private upload(draft: AudioDraft): Promise<void> {
    const existing = this.uploading.get(draft.id);
    if (existing) return existing;
    const pending = (async () => {
      this.status(draft, 'uploading');
      try {
        const blob = await this.store.blob(draft);
        if (!blob.size || blob.size > AUDIO_MAX_BYTES || blob.size !== draft.sizeBytes) throw new Error('audio-size');
        if (!this.client.uploadSolutionAudio) throw new Error('audio-upload');
        for (let attempt = 0; ; attempt++) {
          try { await this.client.uploadSolutionAudio(draft, blob); break; }
          catch (error) { if (attempt >= 2) throw error; await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt)); }
        }
        await this.store.remove(draft); this.failures.delete(draft.id); this.status(draft, 'done');
      } catch { this.failures.set(draft.id, draft); this.status(draft, 'failed'); }
    })().finally(() => { this.uploading.delete(draft.id); });
    this.uploading.set(draft.id, pending);
    return pending;
  }
}
