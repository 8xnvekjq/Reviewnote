// 저장된 수업 녹음(슬라이드 + 필기 기록 + 음성)을 MP4 영상으로 만든다. 화면을 녹화하지 않고 기록을 다시 그려서
// 인코딩하므로 실제 길이보다 빨리 끝난다. 바뀌지 않는 장면은 프레임을 늘려(가변 프레임) 건너뛴다.
// 긴 수업(1시간+)도 탭 메모리에 다 올리지 않는다: 음성은 조금씩 풀고, 영상 파일은 브라우저 저장 공간(OPFS)에 바로 쓴다.
// 화면이 숨겨져도 멈추지 않는다(PC는 창을 내려도 계속, 탭은 안드로이드가 얼렸다가 돌아오면 이어진다).
import type { InkStroke, SolutionAudioClip } from '../exam/contract.ts';
import { HIGHLIGHTER_OPACITY, INK_REFERENCE_WIDTH } from '../exam/ink/inkModel.ts';
import { drawStroke } from '../exam/ink/inkRender.ts';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from './lectureDecks.ts';
import type { LectureReplay } from './lectureRecordingModel.ts';

export const EXPORT_FPS = 30;
/** 바뀌지 않는 장면도 이 간격마다 프레임을 다시 넣는다. */
export const EXPORT_MAX_HOLD_MS = 2000;
/** 키프레임 간격(초). 정지 장면이 대부분이라 길게 잡아 파일을 줄인다(탐색은 유튜브가 다시 인코딩한다). */
export const EXPORT_KEYFRAME_S = 5;
/** 시험 내보내기 길이. */
export const EXPORT_TEST_MS = 60_000;
export const EXPORT_SAMPLE_RATE = 48_000;
/** 영상과 음성을 이 길이씩 번갈아 넣는다(인코더·메모리가 한쪽에 몰리지 않게). */
export const EXPORT_WINDOW_MS = 5000;
/** 저장 공간 확인용 어림(분당 MB, 넉넉하게). */
export const EXPORT_MB_PER_MIN = 6;
const OPFS_PREFIX = 'lecture-export-';

// ── 순수 계산 ──────────────────────────────────────────────────────────────
export interface PlannedFrame { atMs: number; durationMs: number }

/** [fromMs, toMs) 구간에서 실제로 그릴 프레임. 바로 앞 프레임과 화면이 같으면 앞 프레임을 늘린다. */
export function planFrames(keyAt: (ms: number) => string, fromMs: number, toMs: number, fps = EXPORT_FPS, maxHoldMs = EXPORT_MAX_HOLD_MS): PlannedFrame[] {
  const frames: PlannedFrame[] = [];
  const count = Math.max(0, Math.ceil((toMs - fromMs) * fps / 1000));
  let lastKey = '';
  for (let i = 0; i < count; i++) {
    const atMs = fromMs + i * 1000 / fps;
    const key = keyAt(atMs);
    const prev = frames.at(-1);
    if (prev && key === lastKey && atMs - prev.atMs < maxHoldMs) continue;
    frames.push({ atMs, durationMs: 0 });
    lastKey = key;
  }
  frames.forEach((frame, i) => { frame.durationMs = (frames[i + 1]?.atMs ?? toMs) - frame.atMs; });
  return frames;
}

export interface AudioPlacement { clip: number; srcMs: number; dstMs: number; lengthMs: number }

/** 녹음 시각 기준 클립 위치 → 내보내는 구간 [fromMs, toMs) 안에서 어디를 어디에 둘지. dstMs는 구간 시작 기준. */
export function placeAudio(clips: Pick<SolutionAudioClip, 'offsetMs' | 'durationMs'>[], fromMs: number, toMs: number): AudioPlacement[] {
  const out: AudioPlacement[] = [];
  clips.forEach((clip, i) => {
    // 다음 클립이 시작하면 앞 클립은 끝낸다(조각 길이가 기록보다 조금 길어도 겹치지 않게).
    const end = Math.min(clip.offsetMs + clip.durationMs, clips[i + 1]?.offsetMs ?? Infinity);
    const start = Math.max(clip.offsetMs, fromMs);
    const stop = Math.min(end, toMs);
    if (stop > start) out.push({ clip: i, srcMs: start - clip.offsetMs, dstMs: start - fromMs, lengthMs: stop - start });
  });
  return out;
}

export interface WindowRead { clip: number; srcSample: number; outOffset: number; count: number }

/** 음성 창 [winFromMs, winFromMs + length샘플) 을 채우려면 어느 클립의 몇 번째 샘플부터 몇 개를 어디에 읽을지. */
export function windowReads(placements: AudioPlacement[], winFromMs: number, length: number, sampleRate = EXPORT_SAMPLE_RATE): WindowRead[] {
  const ms = (value: number) => Math.round(value * sampleRate / 1000);
  const winStart = ms(winFromMs);
  const reads: WindowRead[] = [];
  for (const p of placements) {
    const dst0 = ms(p.dstMs), dst1 = ms(p.dstMs + p.lengthMs);
    const from = Math.max(dst0, winStart), to = Math.min(dst1, winStart + length);
    if (to > from) reads.push({ clip: p.clip, srcSample: ms(p.srcMs) + (from - dst0), outOffset: from - winStart, count: to - from });
  }
  return reads;
}

export function exportFileName(title: string, fromMs: number, toMs: number, test: boolean) {
  const clean = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || '수업';
  const m = (ms: number) => `${Math.floor(ms / 60000)}m${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}s`;
  return test ? `${clean} (테스트 ${m(fromMs)}-${m(toMs)}).mp4` : `${clean}.mp4`;
}

/** 샘플을 sampleRate → EXPORT_SAMPLE_RATE로(선형 보간; 사파리 AAC 44.1kHz 녹음 대비). */
export function resample(input: Float32Array, fromRate: number, toRate = EXPORT_SAMPLE_RATE): Float32Array {
  if (fromRate === toRate || !input.length) return input;
  const out = new Float32Array(Math.round(input.length * toRate / fromRate));
  const step = fromRate / toRate;
  for (let i = 0; i < out.length; i++) {
    const x = i * step, i0 = Math.floor(x), i1 = Math.min(i0 + 1, input.length - 1);
    out[i] = input[i0] + (input[i1] - input[i0]) * (x - i0);
  }
  return out;
}

// ── 그리기 ────────────────────────────────────────────────────────────────
type Ctx = CanvasRenderingContext2D;

/** 슬라이드 그림 + 필기를 1920×1080 한 장으로(화면 보기와 같은 순서: 형광펜 층 → 펜). */
export function drawLectureFrame(ctx: Ctx, highlightCtx: Ctx, image: CanvasImageSource | null, strokes: InkStroke[]) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  if (image) {
    // 화면과 같이 object-contain.
    const iw = (image as { width: number }).width || W, ih = (image as { height: number }).height || H;
    const scale = Math.min(W / iw, H / ih);
    ctx.drawImage(image, (W - iw * scale) / 2, (H - ih * scale) / 2, iw * scale, ih * scale);
  }
  // 필기 좌표: 슬라이드 너비 = 1 → 기준 공간(× INK_REFERENCE_WIDTH)에서 그린다.
  const toPixels = W / INK_REFERENCE_WIDTH;
  const highlights = strokes.filter(stroke => stroke.tool === 'highlighter');
  if (highlights.length) {
    const hc = highlightCtx.canvas;
    highlightCtx.setTransform(1, 0, 0, 1, 0, 0);
    highlightCtx.clearRect(0, 0, hc.width, hc.height);
    highlightCtx.setTransform(toPixels, 0, 0, toPixels, 0, 0);
    for (const stroke of highlights) drawStroke(highlightCtx, stroke);
    ctx.save();
    ctx.globalAlpha = HIGHLIGHTER_OPACITY;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(hc, 0, 0);
    ctx.restore();
  }
  ctx.setTransform(toPixels, 0, 0, toPixels, 0, 0);
  for (const stroke of strokes) if (stroke.tool !== 'highlighter') drawStroke(ctx, stroke);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ── 내보내기 ──────────────────────────────────────────────────────────────
export interface ExportProgress { doneMs: number; totalMs: number; elapsedMs: number; frames: number }
/** 어디에 시간이 들었는지(ms). hidden = 화면이 숨겨져 있던 시간(그동안도 계속 만든다). */
export interface ExportTimings { draw: number; video: number; audio: number; hidden: number }
export type EncoderMode = 'prefer-hardware' | 'prefer-software';
/** 시작할 때 잰 인코더 속도(프레임당 ms). 더 빠른 쪽으로 만든다. */
export type EncoderBench = Partial<Record<EncoderMode, number>>;
export interface ExportResult {
  blob: Blob; videoCodec: string; audioCodec: string | null; frames: number; elapsedMs: number; durationMs: number;
  timings: ExportTimings; encoder: EncoderMode | null; bench: EncoderBench;
  /** 영상 파일을 둔 곳: 브라우저 저장 공간(긴 영상) 또는 메모리. */
  storage: 'opfs' | 'memory';
}

export interface LectureExportInput {
  replay: LectureReplay;
  /** manifest.slides 순서의 슬라이드 그림 주소. */
  slideIds: string[];
  slideUrls: string[];
  clips: SolutionAudioClip[];
  fromMs: number;
  toMs: number;
  /** true면 브라우저 저장 공간(OPFS)에 쓴다(못 쓰면 오류). false면 메모리(짧은 시험용). */
  toFile?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
}

type Mediabunny = typeof import('mediabunny');

/** 슬라이드 그림을 필요할 때 받아 최근 몇 장만 기억한다(1920×1080 한 장 ≈ 8MB). */
function slideImages(slideIds: string[], urls: string[], keep = 3) {
  const cache = new Map<string, Promise<ImageBitmap | null>>();
  const load = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('슬라이드 그림을 받지 못했어요.');
    return createImageBitmap(await response.blob());
  };
  return {
    get(slideId: string): Promise<ImageBitmap | null> {
      let hit = cache.get(slideId);
      if (hit) { cache.delete(slideId); cache.set(slideId, hit); return hit; }
      const url = urls[slideIds.indexOf(slideId)];
      hit = url ? load(url) : Promise.resolve(null);
      cache.set(slideId, hit);
      while (cache.size > keep) {
        const [oldest, value] = cache.entries().next().value!;
        cache.delete(oldest);
        void value.then(bitmap => bitmap?.close(), () => {});
      }
      return hit;
    },
    close() { for (const value of cache.values()) void value.then(bitmap => bitmap?.close(), () => {}); cache.clear(); },
  };
}

/** 클립 하나의 소리를 앞에서부터 차례로 풀어 읽는다(1시간 클립을 한꺼번에 풀면 700MB). 읽는 위치는 앞으로만 간다. */
class ClipReader {
  private iterator: AsyncIterator<{ buffer: AudioBuffer }> | null = null;
  private input: InstanceType<Mediabunny['Input']> | null = null;
  private queue: Float32Array[] = [];
  /** queue[0][0]이 클립에서 몇 번째 샘플인지. */
  private position = 0;
  private ended = false;
  private readonly mb: Mediabunny;
  private readonly url: string;
  constructor(mb: Mediabunny, url: string) { this.mb = mb; this.url = url; }

  private async open() {
    const blob = await (await fetch(this.url)).blob();
    this.input = new this.mb.Input({ source: new this.mb.BlobSource(blob), formats: this.mb.ALL_FORMATS });
    const track = await this.input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) throw new Error('녹음 음성을 풀 수 없어요(이 브라우저가 지원하지 않는 형식).');
    this.iterator = new this.mb.AudioBufferSink(track).buffers()[Symbol.asyncIterator]();
  }

  private async pull(): Promise<boolean> {
    if (this.ended) return false;
    if (!this.iterator) await this.open();
    const next = await this.iterator!.next();
    if (next.done) { this.ended = true; return false; }
    const { buffer } = next.value;
    let mono: Float32Array;
    if (buffer.numberOfChannels === 1) mono = buffer.getChannelData(0).slice();
    else {
      mono = new Float32Array(buffer.length);
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < mono.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
      }
    }
    // 시각(timestamp)은 쓰지 않고 순서대로 잇는다(MediaRecorder 조각의 시각은 들쭉날쭉할 수 있다).
    this.queue.push(resample(mono, buffer.sampleRate));
    return true;
  }

  /** 클립의 srcSample부터 count개를 out[outOffset…]에 쓴다. 소리가 모자라면 그만큼 무음. */
  async read(srcSample: number, out: Float32Array, outOffset: number, count: number) {
    let written = 0;
    while (written < count) {
      const want = srcSample + written;
      // 지나간 조각은 버린다.
      while (this.queue.length && this.position + this.queue[0].length <= want) {
        this.position += this.queue.shift()!.length;
      }
      if (!this.queue.length) {
        if (!(await this.pull())) return;
        continue;
      }
      const head = this.queue[0];
      const start = want - this.position;
      if (start < 0) { written += Math.min(count - written, -start); continue; } // 이미 지나간 곳(앞으로만 읽는다)
      const n = Math.min(head.length - start, count - written);
      out.set(head.subarray(start, start + n), outOffset + written);
      written += n;
    }
  }

  dispose() { this.queue = []; this.iterator = null; this.input?.dispose?.(); this.input = null; }
}

const abortError = () => new DOMException('내보내기를 취소했어요.', 'AbortError');

/** 다른 일(진행 막대 그리기)에 잠깐 양보한다. setTimeout은 숨겨진 탭에서 1초 이상으로 늦춰지므로(30분 영상이면
 *  양보 360번 = 6분+) 늦춰지지 않는 MessageChannel을 쓴다. */
function yieldTask(): Promise<void> {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
    channel.port2.postMessage(null);
  });
}

/** 화면이 숨겨져 있던 시간을 잰다(결과 창에 보여 주어 느린 까닭을 알 수 있게). */
function hiddenTimer() {
  let total = 0, since = document.visibilityState === 'hidden' ? performance.now() : null as number | null;
  const onChange = () => {
    if (document.visibilityState === 'hidden') since ??= performance.now();
    else if (since !== null) { total += performance.now() - since; since = null; }
  };
  document.addEventListener('visibilitychange', onChange);
  return {
    get: () => total + (since !== null ? performance.now() - since : 0),
    stop: () => document.removeEventListener('visibilitychange', onChange),
  };
}

type OpfsDirectory = FileSystemDirectoryHandle & { entries(): AsyncIterable<[string, FileSystemHandle]> };

/** 지난 내보내기 파일을 지운다(브라우저 저장 공간을 계속 차지하지 않게). */
export async function clearExportFiles() {
  if (!navigator.storage?.getDirectory) return;
  try {
    const dir = await navigator.storage.getDirectory() as OpfsDirectory;
    const names: string[] = [];
    for await (const [name] of dir.entries()) if (name.startsWith(OPFS_PREFIX)) names.push(name);
    for (const name of names) await dir.removeEntry(name).catch(() => {});
  } catch { /* 저장 공간을 못 열면 지울 것도 없다 */ }
}

async function openFileTarget(mb: Mediabunny, durationMs: number) {
  if (!navigator.storage?.getDirectory) throw new Error('이 브라우저는 긴 영상을 저장할 공간(OPFS)을 지원하지 않아요. 크롬에서 다시 해 주세요.');
  await clearExportFiles();
  const estimate = await navigator.storage.estimate?.().catch(() => null);
  const needMb = Math.ceil(durationMs / 60000 * EXPORT_MB_PER_MIN);
  if (estimate?.quota != null && estimate.usage != null && (estimate.quota - estimate.usage) / 1024 / 1024 < needMb) {
    throw new Error(`기기 저장 공간이 부족해요(약 ${needMb}MB 필요). 공간을 비우고 다시 해 주세요.`);
  }
  const dir = await navigator.storage.getDirectory();
  const handle = await dir.getFileHandle(`${OPFS_PREFIX}${Date.now()}.mp4`, { create: true });
  const writable = await handle.createWritable();
  const stream = new WritableStream<{ type: 'write'; data: Uint8Array; position: number }>({
    write: chunk => writable.write({ type: 'write', position: chunk.position, data: chunk.data as Uint8Array<ArrayBuffer> }),
    close: () => writable.close(),
    abort: () => writable.abort(),
  });
  return {
    target: new mb.StreamTarget(stream, { chunked: true, chunkSize: 8 * 1024 * 1024 }),
    file: () => handle.getFile(),
    discard: () => dir.removeEntry(handle.name).catch(() => {}),
  };
}

/** 같은 컴퓨터에서도 하드웨어 인코더가 다른 프로그램과 겹치면 몇 배 느려질 수 있다(2026-10-16 PC 30분 영상:
 *  프레임당 31ms ↔ 시험 환경 4–6ms). 그래서 실제 첫 화면으로 두 인코더를 잠깐 돌려 보고 빠른 쪽을 고른다. */
export async function pickEncoder(mb: Mediabunny, codec: string, canvas: HTMLCanvasElement, ctx: Ctx, frames = 30, warmup = 5):
  Promise<{ mode: EncoderMode | null; bench: EncoderBench }> {
  const bench: EncoderBench = {};
  const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (const mode of ['prefer-hardware', 'prefer-software'] as const) {
    const config = { codec: codec as 'avc', quality: mb.QUALITY_HIGH, keyFrameInterval: EXPORT_KEYFRAME_S, hardwareAcceleration: mode };
    if (!(await mb.canEncodeVideo(config.codec, { width: canvas.width, height: canvas.height, quality: mb.QUALITY_HIGH, hardwareAcceleration: mode }).catch(() => false))) continue;
    const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.NullTarget() });
    try {
      const source = new mb.CanvasSource(canvas, config);
      output.addVideoTrack(source, { frameRate: EXPORT_FPS });
      await output.start();
      let t0 = 0;
      for (let i = 0; i < frames; i++) {
        if (i === warmup) t0 = performance.now();
        // 필기처럼 작은 곳만 바뀌는 프레임
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(200 + i * 12, 600, 10, 10);
        await source.add(i / EXPORT_FPS, 1 / EXPORT_FPS);
      }
      await output.finalize();
      bench[mode] = Math.round((performance.now() - t0) / (frames - warmup) * 10) / 10;
    } catch {
      await output.cancel().catch(() => {});
    }
    ctx.putImageData(snapshot, 0, 0);
  }
  const modes = Object.entries(bench) as [EncoderMode, number][];
  return { mode: modes.length ? modes.sort((a, b) => a[1] - b[1])[0][0] : null, bench };
}

export async function exportLectureMp4(input: LectureExportInput): Promise<ExportResult> {
  const { replay, fromMs, signal, onProgress } = input;
  const toMs = Math.min(input.toMs, replay.total);
  if (!(toMs > fromMs)) throw new Error('내보낼 구간이 비어 있어요.');
  const totalMs = toMs - fromMs;
  const started = performance.now();
  const mb = await import('mediabunny');

  const videoCodec = await mb.getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], { width: SLIDE_WIDTH, height: SLIDE_HEIGHT, quality: mb.QUALITY_HIGH, frameRate: EXPORT_FPS });
  if (!videoCodec) throw new Error('이 브라우저는 영상 인코딩(WebCodecs)을 지원하지 않아요. 최신 크롬에서 다시 해 주세요.');
  const placements = placeAudio(input.clips, fromMs, toMs);
  const audioCodec = placements.length
    ? await mb.getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 1, sampleRate: EXPORT_SAMPLE_RATE, quality: mb.QUALITY_HIGH })
    : null;
  if (placements.length && !audioCodec) throw new Error('이 브라우저는 음성 인코딩을 지원하지 않아요.');

  const canvas = document.createElement('canvas');
  canvas.width = SLIDE_WIDTH; canvas.height = SLIDE_HEIGHT;
  const highlight = document.createElement('canvas');
  highlight.width = SLIDE_WIDTH; highlight.height = SLIDE_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false });
  const hctx = highlight.getContext('2d');
  if (!ctx || !hctx) throw new Error('그림판(canvas)을 만들 수 없어요.');

  const file = input.toFile ? await openFileTarget(mb, totalMs) : null;
  const images = slideImages(input.slideIds, input.slideUrls);
  const readers = new Map<number, ClipReader>();
  const output = new mb.Output({
    format: new mb.Mp4OutputFormat({ fastStart: file ? false : 'in-memory' }),
    target: file ? file.target : new mb.BufferTarget(),
  });
  let finished = false;
  const timings: ExportTimings = { draw: 0, video: 0, audio: 0, hidden: 0 };
  const hidden = hiddenTimer();
  try {
    const frames = planFrames(replay.frameKey, fromMs, toMs);
    // 첫 화면을 그려 두고 인코더를 고른다.
    if (frames.length) {
      const first = replay.frame(frames[0].atMs);
      drawLectureFrame(ctx, hctx, await images.get(first.slideId), first.strokes);
    }
    const { mode: encoder, bench } = await pickEncoder(mb, videoCodec, canvas, ctx);
    const video = new mb.CanvasSource(canvas, {
      codec: videoCodec, quality: mb.QUALITY_HIGH, keyFrameInterval: EXPORT_KEYFRAME_S, ...(encoder ? { hardwareAcceleration: encoder } : {}),
    });
    output.addVideoTrack(video, { frameRate: EXPORT_FPS });
    const audio = audioCodec ? new mb.AudioBufferSource({ codec: audioCodec, quality: mb.QUALITY_HIGH }) : null;
    if (audio) output.addAudioTrack(audio);
    await output.start();

    let next = 0;
    for (let win = 0; win < totalMs; win += EXPORT_WINDOW_MS) {
      const winEnd = Math.min(totalMs, win + EXPORT_WINDOW_MS);
      for (; next < frames.length && frames[next].atMs - fromMs < winEnd; next++) {
        if (signal?.aborted) throw abortError();
        const frame = frames[next];
        const state = replay.frame(frame.atMs);
        const image = await images.get(state.slideId);
        let t = performance.now();
        drawLectureFrame(ctx, hctx, image, state.strokes);
        timings.draw += performance.now() - t;
        t = performance.now();
        await video.add((frame.atMs - fromMs) / 1000, frame.durationMs / 1000);
        timings.video += performance.now() - t;
      }
      if (audio) {
        const t = performance.now();
        const length = Math.round((winEnd - win) * EXPORT_SAMPLE_RATE / 1000);
        const samples = new Float32Array(length);
        for (const read of windowReads(placements, win, length)) {
          const url = input.clips[read.clip].url;
          if (!url) continue;
          let reader = readers.get(read.clip);
          if (!reader) {
            // 앞 클립은 다 읽었으니 닫는다.
            for (const [index, old] of readers) if (index < read.clip) { old.dispose(); readers.delete(index); }
            reader = new ClipReader(mb, url);
            readers.set(read.clip, reader);
          }
          await reader.read(read.srcSample, samples, read.outOffset, read.count);
        }
        // 마이크가 1을 넘긴(찢어진) 소리는 잘라 둔다 — AAC 인코더가 범위 밖 값에서 튀는 소리를 낼 수 있다.
        for (let i = 0; i < length; i++) samples[i] = Math.max(-1, Math.min(1, samples[i]));
        const buffer = new AudioBuffer({ length, numberOfChannels: 1, sampleRate: EXPORT_SAMPLE_RATE });
        buffer.copyToChannel(samples, 0);
        await audio.add(buffer);
        timings.audio += performance.now() - t;
      }
      onProgress?.({ doneMs: winEnd, totalMs, elapsedMs: performance.now() - started, frames: next });
      // 화면(진행 막대)이 멈춘 듯 보이지 않게 한 번씩 양보한다.
      await yieldTask();
    }
    await output.finalize();
    finished = true;
    let blob: Blob;
    if (file) blob = await file.file();
    else {
      const buffer = (output.target as InstanceType<Mediabunny['BufferTarget']>).buffer;
      if (!buffer) throw new Error('영상 파일을 만들지 못했어요.');
      blob = new Blob([buffer], { type: 'video/mp4' });
    }
    return {
      blob, videoCodec, audioCodec, frames: frames.length,
      elapsedMs: performance.now() - started, durationMs: totalMs, storage: file ? 'opfs' : 'memory',
      timings: { ...timings, hidden: hidden.get() }, encoder, bench,
    };
  } catch (error) {
    if (output.state === 'started') await output.cancel().catch(() => {});
    if (!finished) await file?.discard();
    throw error;
  } finally {
    hidden.stop();
    images.close();
    for (const reader of readers.values()) reader.dispose();
  }
}
