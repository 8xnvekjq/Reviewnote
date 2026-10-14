// 교재 수업 녹음(음성 + 필기·슬라이드 기록)의 순수 모델. 화면 녹화는 하지 않는다.
// 저장된 파일(manifest.json, ink-0001.json…, audio-0001.webm…)만으로 언제든 다시 재생(이후 MP4 변환)할 수 있어야 한다.
import type { InkChangeKind, InkReplayEvent, InkStroke } from '../exam/contract.ts';
import { decodeInkPayload, encodeInkStroke } from '../exam/ink/inkCodec.ts';
import { applyInkEvent, buildInkTimeline, inkDelta } from '../exam/ink/inkReplay.ts';
import { SLIDE_HEIGHT, SLIDE_WIDTH, type LectureSlide } from './lectureDecks.ts';

export const RECORDING_FORMAT = 'reviewnotes.lecture-recording';
export const RECORDING_VERSION = 1;
export const RECORDING_BUCKET = 'lecture-recordings';
/** 이 간격마다 끝난 음성 조각과 필기 기록을 올린다(앱이 죽어도 잃는 건 최대 이만큼). */
export const RECORDING_FLUSH_MS = 2 * 60 * 1000;
/** 필기 기록 파일 하나에 넣는 최대 항목 수(아주 긴 오프라인 구간도 파일이 너무 커지지 않게). */
export const CHUNK_MAX_ENTRIES = 2000;

export type RecordingStatus = 'recording' | 'done';

// ── 녹음 시계: 일시정지한 시간은 빼고 잰다 ─────────────────────────────────────
export class RecordingClock {
  private before = 0;
  private since: number | null = null;
  private readonly wall: () => number;
  constructor(wall: () => number = () => performance.now()) { this.wall = wall; }
  get running() { return this.since !== null; }
  /** 지금까지 녹음된 시간(ms). 일시정지 중이면 멈춘 시각에 고정된다. */
  now() { return Math.round(this.before + (this.since !== null ? this.wall() - this.since : 0)); }
  resume() { if (this.since === null) this.since = this.wall(); return this.now(); }
  pause() { if (this.since !== null) { this.before += this.wall() - this.since; this.since = null; } return this.now(); }
}

// ── 기록 항목 ─────────────────────────────────────────────────────────────
/** at은 모두 녹음 시각(ms, 일시정지 제외). 일시정지 중의 변화는 멈춘 시각에 기록돼 재생에서는 이어하기 순간에 나타난다. */
export type TimelineEntry =
  | { type: 'slide'; at: number; slideId: string }
  | { type: 'ink'; at: number; slideId: string; event: InkReplayEvent };

/** 기록을 모으고, 아직 올리지 않은 부분만 떼어 준다. */
export class TimelineLog {
  private pending: TimelineEntry[] = [];
  private lastSlide: string | null = null;
  slide(at: number, slideId: string) {
    if (slideId === this.lastSlide) return;
    this.lastSlide = slideId;
    this.pending.push({ type: 'slide', at, slideId });
  }
  /** 실행 취소·지우개 등도 같은 모양(exam 재생 이벤트)으로 남긴다. 바뀐 게 없으면 남기지 않는다. */
  ink(at: number, slideId: string, before: InkStroke[], after: InkStroke[], kind: InkChangeKind) {
    const event = inkDelta(before, after, kind, at);
    if (!event.added.length && !event.removed.length) return null;
    this.pending.push({ type: 'ink', at, slideId, event });
    return event;
  }
  /** 녹음 전에 이미 써 둔 필기(자유 연습)를 0초 상태로 남긴다. */
  baseline(ink: Record<string, InkStroke[]>) {
    for (const [slideId, strokes] of Object.entries(ink)) {
      if (!strokes.length) continue;
      this.pending.push({ type: 'ink', at: 0, slideId, event: {
        id: crypto.randomUUID(), kind: 'restore', at: 0, removed: [],
        added: strokes.map((stroke, index) => ({ index, stroke })),
      } });
    }
  }
  get size() { return this.pending.length; }
  take(): TimelineEntry[] { const out = this.pending; this.pending = []; return out; }
}

// ── 필기 기록 파일(ink-0001.json) ──────────────────────────────────────────
export interface InkChunk { seq: number; fromMs: number; toMs: number; entries: TimelineEntry[] }

export const chunkFileName = (seq: number) => `ink-${String(seq).padStart(4, '0')}.json`;
export const audioFileName = (seq: number, mime: string) => `audio-${String(seq).padStart(4, '0')}.${mime.startsWith('audio/webm') ? 'webm' : 'm4a'}`;

/** 쌓인 항목을 순번이 붙은 파일 단위로 나눈다. */
export function splitIntoChunks(entries: TimelineEntry[], firstSeq: number, maxEntries = CHUNK_MAX_ENTRIES): InkChunk[] {
  const chunks: InkChunk[] = [];
  for (let i = 0; i < entries.length; i += maxEntries) {
    const part = entries.slice(i, i + maxEntries);
    chunks.push({ seq: firstSeq + chunks.length, fromMs: Math.min(...part.map(e => e.at)), toMs: Math.max(...part.map(e => e.at)), entries: part });
  }
  return chunks;
}

/** 파일 순서(순번)대로 이어 붙인다. 같은 시각은 기록된 순서를 지킨다. */
export function mergeChunks(chunks: InkChunk[]): TimelineEntry[] {
  return [...chunks].sort((a, b) => a.seq - b.seq).flatMap(chunk => chunk.entries);
}

/** 파일에 쓰는 모양: 획 점은 exam 필기와 같은 압축 문자열(inkCodec). */
export function serializeChunk(chunk: InkChunk) {
  return {
    format: RECORDING_FORMAT, version: RECORDING_VERSION, kind: 'ink', seq: chunk.seq, fromMs: chunk.fromMs, toMs: chunk.toMs,
    entries: chunk.entries.map(entry => entry.type === 'slide' ? entry : {
      ...entry, event: { ...entry.event, added: entry.event.added.map(add => ({ ...add, stroke: encodeInkStroke(add.stroke) })) },
    }),
  };
}
export function parseChunk(raw: unknown): InkChunk {
  const data = decodeInkPayload<Record<string, unknown>>(raw);
  if (!data || data.format !== RECORDING_FORMAT || data.kind !== 'ink' || !Number.isInteger(data.seq) || !Array.isArray(data.entries)) {
    throw new Error('필기 기록 파일 형식이 올바르지 않습니다.');
  }
  const entries = (data.entries as TimelineEntry[]).filter(entry => entry && Number.isFinite(entry.at) && typeof entry.slideId === 'string'
    && (entry.type === 'slide' || (entry.type === 'ink' && entry.event && Array.isArray(entry.event.added) && Array.isArray(entry.event.removed))));
  return { seq: data.seq as number, fromMs: Number(data.fromMs) || 0, toMs: Number(data.toMs) || 0, entries };
}

// ── manifest.json ─────────────────────────────────────────────────────────
export type ChunkEncoding = 'gzip' | 'identity';
export interface ManifestChunk { file: string; seq: number; fromMs: number; toMs: number; entries: number; encoding: ChunkEncoding; bytes: number }
/** 한 클립 = 끊김 없이 녹음한 한 구간. files를 순서대로 이어 붙이면 재생 가능한 한 파일이 된다(MediaRecorder 조각). */
export interface ManifestClip { id: string; offsetMs: number; durationMs: number; mime: string; files: string[]; bytes: number }
export interface LectureRecordingManifest {
  format: typeof RECORDING_FORMAT;
  version: number;
  recordingId: string;
  deckId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: RecordingStatus;
  durationMs: number;
  /** 필기 좌표: x, y 모두 슬라이드 너비 = 1 단위(1920px = 1). 1920×1080 픽셀로는 x·1920, y·1920. */
  coordinateSpace: { width: number; height: number; unit: 'slide-width' };
  /** 녹음할 때의 슬라이드 목록(덱이 바뀌어도 그대로 재생). */
  slides: LectureSlide[];
  initialSlideId: string;
  clips: ManifestClip[];
  chunks: ManifestChunk[];
}

export function createManifest(input: { recordingId: string; deckId: string; title: string; slides: LectureSlide[]; initialSlideId: string; createdAt?: string }): LectureRecordingManifest {
  const now = input.createdAt ?? new Date().toISOString();
  return {
    format: RECORDING_FORMAT, version: RECORDING_VERSION, recordingId: input.recordingId, deckId: input.deckId, title: input.title,
    createdAt: now, updatedAt: now, status: 'recording', durationMs: 0,
    coordinateSpace: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT, unit: 'slide-width' },
    slides: input.slides.map(({ id, path, section, label, bookPage }) => ({ id, path, section, label, bookPage })),
    initialSlideId: input.initialSlideId, clips: [], chunks: [],
  };
}

export function parseManifest(raw: unknown): LectureRecordingManifest {
  const data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as LectureRecordingManifest;
  if (!data || data.format !== RECORDING_FORMAT || typeof data.recordingId !== 'string' || !Array.isArray(data.slides) || !data.slides.length
    || !Array.isArray(data.clips) || !Array.isArray(data.chunks)) throw new Error('녹음 정보 파일(manifest.json) 형식이 올바르지 않습니다.');
  if (data.version > RECORDING_VERSION) throw new Error('더 새로운 앱에서 만든 녹음입니다. 앱을 새로 고친 뒤 열어 주세요.');
  return data;
}

// ── gzip(CompressionStream) ───────────────────────────────────────────────
export async function encodeChunkFile(chunk: InkChunk): Promise<{ blob: Blob; encoding: ChunkEncoding }> {
  const json = JSON.stringify(serializeChunk(chunk));
  if (typeof CompressionStream === 'function') {
    try {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
      return { blob: new Blob([await new Response(stream).arrayBuffer()], { type: 'application/gzip' }), encoding: 'gzip' };
    } catch { /* 지원하지 않으면 그대로 */ }
  }
  return { blob: new Blob([json], { type: 'application/json' }), encoding: 'identity' };
}
export async function decodeChunkFile(blob: Blob, encoding: ChunkEncoding): Promise<InkChunk> {
  const text = encoding === 'gzip'
    ? await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : await blob.text();
  return parseChunk(JSON.parse(text));
}

// ── 재생 ─────────────────────────────────────────────────────────────────
type SlideInk = { events: InkReplayEvent[]; ats: number[]; timeline: ReturnType<typeof buildInkTimeline> };

function upperBound(values: number[], t: number) {
  let low = 0, high = values.length;
  while (low < high) { const mid = (low + high) >> 1; if (values[mid] <= t) low = mid + 1; else high = mid; }
  return low;
}

/** 한 획만 새로 그린 단계면 그 획(그리는 모습을 점 시각대로 보여 준다). */
function drawnStroke(event: InkReplayEvent | undefined) {
  if (!event || event.kind !== 'draw' || event.removed.length || event.added.length !== 1) return null;
  return event.added[0];
}

export interface LectureReplayFrame { slideId: string; slideIndex: number; strokes: InkStroke[] }

/** 기록 항목에서 시각별 상태(보이는 슬라이드 + 그 슬라이드 필기)를 만든다. */
export function buildLectureReplay(manifest: Pick<LectureRecordingManifest, 'slides' | 'initialSlideId' | 'durationMs' | 'clips'>, entries: TimelineEntry[]) {
  const indexOf = new Map(manifest.slides.map((slide, i) => [slide.id, i]));
  const ordered = entries.map((entry, i) => ({ entry, i })).sort((a, b) => a.entry.at - b.entry.at || a.i - b.i).map(row => row.entry);
  const slideChanges: { at: number; slideId: string }[] = [{ at: 0, slideId: manifest.initialSlideId }];
  const bySlide = new Map<string, InkReplayEvent[]>();
  for (const entry of ordered) {
    if (!indexOf.has(entry.slideId)) continue;
    if (entry.type === 'slide') slideChanges.push({ at: entry.at, slideId: entry.slideId });
    else {
      const list = bySlide.get(entry.slideId) ?? [];
      list.push({ ...entry.event, at: entry.at });
      bySlide.set(entry.slideId, list);
    }
  }
  const slideInk = new Map<string, SlideInk>();
  for (const [slideId, events] of bySlide) {
    const strokes = events.reduce(applyInkEvent, [] as InkStroke[]);
    const timeline = buildInkTimeline({ batches: [{ id: slideId, revision: 1, baseRevision: 0, baseline: null, events }], strokes, revision: 1 });
    slideInk.set(slideId, { events, ats: events.map(e => e.at), timeline });
  }
  const changeAts = slideChanges.map(c => c.at);
  const total = Math.max(manifest.durationMs, ...entries.map(e => e.at), ...manifest.clips.map(c => c.offsetMs + c.durationMs), 0);

  const strokesAt = (slideId: string, time: number): InkStroke[] => {
    const ink = slideInk.get(slideId);
    if (!ink) return [];
    const done = upperBound(ink.ats, time);
    const base = ink.timeline.at(done);
    const next = ink.events[done];
    const added = drawnStroke(next);
    if (!added) return base;
    // 획은 실제로 그린 속도대로: 끝난 시각(at)에서 그린 시간만큼 앞에서 시작한다.
    const drawMs = Math.max(0, ...added.stroke.points.map(p => p.t));
    const elapsed = time - (next.at - drawMs);
    if (elapsed < 0) return base;
    const points = added.stroke.points.filter(p => p.t <= elapsed);
    if (!points.length) return base;
    const out = base.slice();
    out.splice(Math.min(added.index, out.length), 0, { ...added.stroke, points, shape: undefined });
    return out;
  };

  const slideAt = (time: number) => slideChanges[Math.max(0, upperBound(changeAts, time) - 1)].slideId;

  return {
    total, slideChanges, slideAt, strokesAt,
    frame(time: number): LectureReplayFrame {
      const slideId = slideAt(time);
      return { slideId, slideIndex: indexOf.get(slideId) ?? 0, strokes: strokesAt(slideId, time) };
    },
    /** 재생을 끝까지 했을 때 각 슬라이드의 필기(검사·내보내기용). */
    finalInk(): Record<string, InkStroke[]> {
      return Object.fromEntries([...slideInk].map(([id, ink]) => [id, ink.timeline.at(ink.events.length)]));
    },
  };
}
export type LectureReplay = ReturnType<typeof buildLectureReplay>;

export function formatDuration(ms: number) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
