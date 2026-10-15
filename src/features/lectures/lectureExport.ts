// 저장된 수업 녹음(슬라이드 + 필기 기록 + 음성)을 MP4 영상으로 만든다. 화면을 녹화하지 않고 기록을 다시 그려서
// 인코딩하므로 실제 길이보다 빨리 끝난다. 바뀌지 않는 장면은 프레임을 늘려(가변 프레임) 건너뛴다.
import type { InkStroke, SolutionAudioClip } from '../exam/contract.ts';
import { HIGHLIGHTER_OPACITY, INK_REFERENCE_WIDTH } from '../exam/ink/inkModel.ts';
import { drawStroke } from '../exam/ink/inkRender.ts';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from './lectureDecks.ts';
import type { LectureReplay } from './lectureRecordingModel.ts';

export const EXPORT_FPS = 30;
/** 바뀌지 않는 장면도 이 간격마다 프레임을 다시 넣는다(키프레임·탐색용). */
export const EXPORT_MAX_HOLD_MS = 2000;
/** 시험 내보내기 길이. */
export const EXPORT_TEST_MS = 60_000;
export const EXPORT_SAMPLE_RATE = 48_000;
/** 영상과 음성을 이 길이씩 번갈아 넣는다(인코더·메모리가 한쪽에 몰리지 않게). */
export const EXPORT_WINDOW_MS = 5000;

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

/** 구간 [fromMs, toMs)의 모노 샘플을 out(구간 시작 = 0)에 채운다. 클립 소리는 decoded[clip]에서 읽는다. */
export function mixWindow(out: Float32Array, windowFromMs: number, placements: AudioPlacement[], decoded: (Float32Array | null)[], sampleRate = EXPORT_SAMPLE_RATE) {
  out.fill(0);
  const ms = (value: number) => Math.round(value * sampleRate / 1000);
  for (const p of placements) {
    const samples = decoded[p.clip];
    if (!samples) continue;
    const winStart = ms(windowFromMs);
    const dst0 = ms(p.dstMs), dst1 = ms(p.dstMs + p.lengthMs);
    const from = Math.max(dst0, winStart), to = Math.min(dst1, winStart + out.length);
    for (let d = from; d < to; d++) {
      const s = ms(p.srcMs) + (d - dst0);
      if (s >= samples.length) break;
      out[d - winStart] = samples[s];
    }
  }
}

export function exportFileName(title: string, fromMs: number, toMs: number, test: boolean) {
  const clean = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || '수업';
  const m = (ms: number) => `${Math.floor(ms / 60000)}m${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}s`;
  return test ? `${clean} (테스트 ${m(fromMs)}-${m(toMs)}).mp4` : `${clean}.mp4`;
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
export interface ExportProgress { doneMs: number; totalMs: number; elapsedMs: number }
export interface ExportResult { blob: Blob; videoCodec: string; audioCodec: string | null; frames: number; elapsedMs: number; durationMs: number }

export interface LectureExportInput {
  replay: LectureReplay;
  /** manifest.slides 순서의 슬라이드 그림 주소. */
  slideIds: string[];
  slideUrls: string[];
  clips: SolutionAudioClip[];
  fromMs: number;
  toMs: number;
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
}

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

/** 클립 하나를 48kHz 모노로 푼다(OfflineAudioContext가 표본율을 맞춘다). */
async function decodeClip(url: string): Promise<Float32Array> {
  const bytes = await (await fetch(url)).arrayBuffer();
  const audio = await new OfflineAudioContext(1, 1, EXPORT_SAMPLE_RATE).decodeAudioData(bytes);
  if (audio.numberOfChannels === 1) return audio.getChannelData(0);
  const mono = new Float32Array(audio.length);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const data = audio.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += data[i] / audio.numberOfChannels;
  }
  return mono;
}

const abortError = () => new DOMException('내보내기를 취소했어요.', 'AbortError');

export async function exportLectureMp4(input: LectureExportInput): Promise<ExportResult> {
  const { replay, fromMs, signal, onProgress } = input;
  const toMs = Math.min(input.toMs, replay.total);
  if (!(toMs > fromMs)) throw new Error('내보낼 구간이 비어 있어요.');
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

  const images = slideImages(input.slideIds, input.slideUrls);
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
  try {
    const video = new mb.CanvasSource(canvas, { codec: videoCodec, quality: mb.QUALITY_HIGH, keyFrameInterval: EXPORT_MAX_HOLD_MS / 1000 });
    output.addVideoTrack(video, { frameRate: EXPORT_FPS });
    const audio = audioCodec ? new mb.AudioBufferSource({ codec: audioCodec, quality: mb.QUALITY_HIGH }) : null;
    if (audio) output.addAudioTrack(audio);
    await output.start();

    // 필요한 클립만 푼다(시험 1분이면 한두 개).
    const decoded: (Float32Array | null)[] = input.clips.map(() => null);
    for (const index of new Set(placements.map(p => p.clip))) {
      if (signal?.aborted) throw abortError();
      const url = input.clips[index].url;
      decoded[index] = url ? await decodeClip(url) : null;
    }

    const frames = planFrames(replay.frameKey, fromMs, toMs);
    const totalMs = toMs - fromMs;
    let next = 0;
    for (let win = 0; win < totalMs; win += EXPORT_WINDOW_MS) {
      const winEnd = Math.min(totalMs, win + EXPORT_WINDOW_MS);
      for (; next < frames.length && frames[next].atMs - fromMs < winEnd; next++) {
        if (signal?.aborted) throw abortError();
        const frame = frames[next];
        const state = replay.frame(frame.atMs);
        drawLectureFrame(ctx, hctx, await images.get(state.slideId), state.strokes);
        await video.add((frame.atMs - fromMs) / 1000, frame.durationMs / 1000);
      }
      if (audio) {
        const length = Math.round((winEnd - win) * EXPORT_SAMPLE_RATE / 1000);
        const buffer = new AudioBuffer({ length, numberOfChannels: 1, sampleRate: EXPORT_SAMPLE_RATE });
        const samples = new Float32Array(length);
        mixWindow(samples, win, placements, decoded);
        buffer.copyToChannel(samples, 0);
        await audio.add(buffer);
      }
      onProgress?.({ doneMs: winEnd, totalMs, elapsedMs: performance.now() - started });
      // 화면(진행 막대)이 멈춘 듯 보이지 않게 한 번씩 양보한다.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer) throw new Error('영상 파일을 만들지 못했어요.');
    return {
      blob: new Blob([buffer], { type: 'video/mp4' }), videoCodec, audioCodec, frames: frames.length,
      elapsedMs: performance.now() - started, durationMs: totalMs,
    };
  } catch (error) {
    if (output.state === 'started') await output.cancel().catch(() => {});
    throw error;
  } finally {
    images.close();
  }
}
