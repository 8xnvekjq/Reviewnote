// 서로 도와주기 풀이 파일(help-solutions/<uid>/<uuid>.json.gz). 시험 필기 리플레이와 같은 재생 이벤트를 담아
// ExamInkReplay로 그대로 다시 그릴 수 있다. 획 점은 시험 필기와 같은 압축 문자열(inkCodec)로 줄인다.
import type { InkChangeKind, InkReplayData, InkReplayEvent, InkStroke } from '../exam/contract.ts';
import { decodeInkPayload, encodeInkEvents, encodeInkStroke } from '../exam/ink/inkCodec.ts';
import { inkDelta } from '../exam/ink/inkReplay.ts';

export const HELP_FILE_FORMAT = 'reviewnotes.help-solution';
export const HELP_FILE_VERSION = 1;
/** 서버(submit_help_solution)와 같은 최소 분량. */
export const HELP_MIN_STROKES = 5;
export const HELP_MIN_DURATION_MS = 5_000;
export const HELP_MAX_BYTES = 1024 * 1024;

export interface HelpSolutionFile {
  format: typeof HELP_FILE_FORMAT;
  version: number;
  events: InkReplayEvent[];
  strokes: InkStroke[];
}

/** 풀이 화면의 필기 변화를 재생 이벤트로 모은다(지우개·실행 취소도 같은 모양으로 남는다). */
export class HelpInkLog {
  private list: InkReplayEvent[] = [];
  private readonly now: () => number;
  constructor(now: () => number = () => Date.now()) { this.now = now; }
  record(before: InkStroke[], after: InkStroke[], kind: InkChangeKind = 'draw') {
    const event = inkDelta(before, after, kind, this.now());
    if (event.added.length || event.removed.length) this.list.push(event);
  }
  get events(): InkReplayEvent[] { return this.list; }
  clear() { this.list = []; }
}

/** 풀이 시간: 첫 획을 긋기 시작한 때부터 마지막 변화까지(ms). */
export function helpDurationMs(events: InkReplayEvent[]): number {
  if (!events.length) return 0;
  const first = events[0];
  const firstDraw = Math.max(0, ...first.added.flatMap(add => add.stroke.points.map(point => point.t)));
  return Math.max(0, events[events.length - 1].at - (first.at - firstDraw));
}

export function helpSolutionStats(events: InkReplayEvent[], strokes: InkStroke[]) {
  return { strokeCount: strokes.length, durationMs: helpDurationMs(events) };
}

/** 보내기 전에 화면에 띄울 안내(서버도 같은 기준으로 거절한다). 통과면 null. */
export function helpTooShortReason(stats: { strokeCount: number; durationMs: number }): string | null {
  if (stats.strokeCount < HELP_MIN_STROKES) return `풀이 과정을 조금 더 써 주세요(획 ${HELP_MIN_STROKES}개 이상).`;
  if (stats.durationMs < HELP_MIN_DURATION_MS) return `풀이 과정을 조금 더 자세히 써 주세요(${HELP_MIN_DURATION_MS / 1000}초 이상).`;
  return null;
}

export function serializeHelpSolution(events: InkReplayEvent[], strokes: InkStroke[]) {
  return {
    format: HELP_FILE_FORMAT, version: HELP_FILE_VERSION,
    events: encodeInkEvents(events), strokes: strokes.map(stroke => encodeInkStroke(stroke)),
  };
}

export async function encodeHelpSolution(events: InkReplayEvent[], strokes: InkStroke[]): Promise<Blob> {
  const json = JSON.stringify(serializeHelpSolution(events, strokes));
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Blob([await new Response(stream).arrayBuffer()], { type: 'application/gzip' });
}

export function parseHelpSolution(raw: unknown): HelpSolutionFile {
  const data = decodeInkPayload<Record<string, unknown>>(raw);
  if (!data || data.format !== HELP_FILE_FORMAT || !Array.isArray(data.events) || !Array.isArray(data.strokes)) {
    throw new Error('풀이 파일 형식이 올바르지 않아요.');
  }
  if (Number(data.version) > HELP_FILE_VERSION) throw new Error('더 새로운 앱에서 만든 풀이예요. 앱을 새로 고친 뒤 열어 주세요.');
  return { format: HELP_FILE_FORMAT, version: Number(data.version), events: data.events as InkReplayEvent[], strokes: data.strokes as InkStroke[] };
}

export async function decodeHelpSolution(blob: Blob): Promise<HelpSolutionFile> {
  const text = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return parseHelpSolution(JSON.parse(text));
}

/** ExamInkReplay가 받는 재생 데이터 모양으로. */
export function helpReplayData(file: HelpSolutionFile): InkReplayData {
  return { batches: [{ id: 'help', revision: 1, baseRevision: 0, baseline: null, events: file.events }], strokes: file.strokes, revision: 1 };
}
