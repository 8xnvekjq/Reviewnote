import type { InkChangeKind, InkReplayData, InkReplayEvent, InkStroke, SolutionAudioClip } from '../contract.ts';

export function inkDelta(before: InkStroke[], after: InkStroke[], kind: InkChangeKind, at = Date.now()): InkReplayEvent {
  const old = new Map(before.map(stroke => [stroke.id, stroke]));
  const current = new Map(after.map(stroke => [stroke.id, stroke]));
  const changed = (a: InkStroke, b?: InkStroke) => !b || (a !== b && JSON.stringify(a) !== JSON.stringify(b));
  return {
    id: crypto.randomUUID(), kind, at,
    removed: before.filter(stroke => changed(stroke, current.get(stroke.id))).map(stroke => stroke.id),
    added: after.flatMap((stroke, index) => changed(stroke, old.get(stroke.id)) ? [{ index, stroke }] : []),
  };
}

/** 서버(save_exam_ink_delta)와 결과 필기를 맞춰 보는 값: 획 id를 순서대로 '\n'으로 이은 문자열의 SHA-256(hex). */
export async function inkIdsHash(strokes: InkStroke[]): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(strokes.map(stroke => stroke.id).join('\n')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function applyInkEvent(strokes: InkStroke[], event: InkReplayEvent): InkStroke[] {
  const removed = new Set(event.removed);
  const next = strokes.filter(stroke => !removed.has(stroke.id));
  for (const addition of event.added) next.splice(addition.index, 0, addition.stroke);
  return next;
}

export const INK_EVENT_LABEL: Record<InkChangeKind, string> = {
  draw: '필기', erase: '지우개', undo: '실행 취소', redo: '다시 실행', clear: '전체 지우기', restore: '기존 필기 가져오기',
};
type ReplayStep = { label: string; at: number; event?: InkReplayEvent; snapshot?: InkStroke[] };

/** Sparse checkpoints keep slider seeking fast without retaining a full drawing for every step. */
export function buildInkTimeline(data: InkReplayData) {
  const steps: ReplayStep[] = [];
  let current: InkStroke[] = [];
  let previousRevision = 0;
  let approximate = false;
  for (const batch of data.batches) {
    if (batch.baseline !== null) {
      if (batch.baseRevision !== previousRevision || batch.baseline.length > 0) {
        steps.push({ label: '이전 저장 상태', at: 0, snapshot: batch.baseline });
        approximate = true;
      }
      current = batch.baseline;
    }
    for (const event of batch.events) {
      steps.push({ label: INK_EVENT_LABEL[event.kind], at: event.at, event });
      if (event.kind === 'restore') approximate = true;
      current = applyInkEvent(current, event);
    }
    previousRevision = batch.revision;
  }
  if (data.batches.length === 0) {
    approximate = data.strokes.length > 0;
    for (let i = 0; i < data.strokes.length; i++) steps.push({ label: '남아 있는 획', at: 0,
      event: { id: `legacy-${i}`, kind: 'restore', at: 0, added: [{ index: i, stroke: data.strokes[i] }], removed: [] } });
  } else if (previousRevision !== data.revision || JSON.stringify(current) !== JSON.stringify(data.strokes)) {
    steps.push({ label: '최근 저장 상태', at: 0, snapshot: data.strokes });
    approximate = true;
  }
  const checkpoints = new Map<number, InkStroke[]>([[0, []]]);
  current = [];
  steps.forEach((step, index) => {
    current = step.snapshot ?? applyInkEvent(current, step.event!);
    if ((index + 1) % 50 === 0) checkpoints.set(index + 1, current);
  });
  checkpoints.set(steps.length, current);
  return {
    steps, approximate,
    at(position: number) {
      const target = Math.max(0, Math.min(steps.length, Math.floor(position)));
      if (checkpoints.has(target)) return checkpoints.get(target)!;
      const start = Math.floor(target / 50) * 50;
      let strokes = checkpoints.get(start)!;
      for (let i = start; i < target; i++) strokes = steps[i].snapshot ?? applyInkEvent(strokes, steps[i].event!);
      return strokes;
    },
  };
}

/** 생각하느라 멈춘 시간은 이 길이로 줄여 재생한다(실제 간격이 더 짧으면 그대로). */
export const REPLAY_MAX_PAUSE_MS = 1500;
/** 처음(0초)은 빈 화면에서 시작하도록 첫 단계 앞에 두는 여유. */
const REPLAY_LEAD_IN_MS = 300;
/** 시각 정보가 없는 단계(예전 필기·저장 상태) 사이 간격. */
const REPLAY_UNKNOWN_GAP_MS = 400;
/** 한 획을 그린 시간 상한(비정상 값 방지). */
const REPLAY_MAX_STROKE_MS = 15000;

type InkTimeline = ReturnType<typeof buildInkTimeline>;

function drawnStroke(step: ReplayStep) {
  const event = step.event;
  if (!event || event.kind !== 'draw' || event.removed.length > 0 || event.added.length !== 1) return null;
  return event.added[0];
}

export const REPLAY_THINKING_PAUSE_MS = 10000;
type TimeSegment = { realStart: number; realEnd: number; start: number; end: number };
export type ReplayPause = { start: number; end: number; durationMs: number; label: string };

export function formatThinkingPause(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
  const parts = [hours ? `${hours}시간` : '', minutes ? `${minutes}분` : '', seconds % 60 ? `${seconds % 60}초` : ''];
  return `${parts.filter(Boolean).join(' ')} 고민`;
}

function timeMapping(segments: TimeSegment[], total: number) {
  const map = (value: number, inverse: boolean) => {
    if (!segments.length) return 0;
    const fromStart = inverse ? 'start' : 'realStart', fromEnd = inverse ? 'end' : 'realEnd';
    const toStart = inverse ? 'realStart' : 'start', toEnd = inverse ? 'realEnd' : 'end';
    const t = Math.max(segments[0][fromStart], Math.min(segments.at(-1)![fromEnd], value));
    let low = 0, high = segments.length - 1;
    while (low < high) { const mid = (low + high) >> 1; if (segments[mid][fromEnd] < t) low = mid + 1; else high = mid; }
    const s = segments[low], length = s[fromEnd] - s[fromStart];
    return s[toStart] + (length ? (t - s[fromStart]) / length : 0) * (s[toEnd] - s[toStart]);
  };
  return { total, toReplay: (real: number) => map(real, false), toReal: (replay: number) => map(replay, true) };
}

/** 녹음과 획의 활동 구간을 합치고, 그 밖의 빈 구간만 줄인다. 시계는 양방향으로 변환한다. */
export function buildReplayTimeMap(activity: readonly { start: number; end: number }[], origin = 0) {
  const intervals = activity.filter(s => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start)
    .map(s => ({ ...s })).sort((a, b) => a.start - b.start);
  const merged: typeof intervals = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push(interval);
  }
  const segments: TimeSegment[] = [], pauses: ReplayPause[] = [];
  let real = Math.min(origin, merged[0]?.start ?? origin), clock = 0;
  for (const interval of merged) {
    const gap = interval.start - real;
    if (gap > 0) {
      const end = clock + Math.min(gap, REPLAY_MAX_PAUSE_MS);
      segments.push({ realStart: real, realEnd: interval.start, start: clock, end });
      if (gap >= REPLAY_THINKING_PAUSE_MS) pauses.push({ start: clock, end, durationMs: gap, label: formatThinkingPause(gap) });
      clock = end;
    }
    const end = clock + interval.end - interval.start;
    segments.push({ realStart: interval.start, realEnd: interval.end, start: clock, end });
    clock = end; real = interval.end;
  }
  return { ...timeMapping(segments, clock), pauses };
}

/**
 * 단계 목록을 시간 축으로 펼친다. 획은 실제로 그린 속도대로, 획 사이의 긴 대기는 줄여서 놓는다.
 * frame(ms)는 그 시각의 필기(그리는 중인 획은 그때까지 그린 부분만)를 돌려준다.
 */
export function buildInkClock(timeline: InkTimeline, audio?: { origin: number; clips: readonly SolutionAudioClip[] }) {
  const { steps } = timeline;
  const starts: number[] = [];
  const ends: number[] = [];
  let clock = 0;
  let previousEnd: number | null = null; // 직전 단계의 실제 시각(익명 풀이의 0도 유효함)
  const pauses: ReplayPause[] = [];
  const segments: TimeSegment[] = [];
  const durationOf = (step: ReplayStep) => {
    const added = drawnStroke(step);
    const lastT = added ? Math.max(0, ...added.stroke.points.map(point => point.t)) : 0;
    return Math.max(1, Math.min(audio ? Infinity : REPLAY_MAX_STROKE_MS, Number.isFinite(lastT) ? lastT : 0));
  };
  const audioMap = audio ? buildReplayTimeMap([
    ...audio.clips.map(clip => ({ start: clip.offsetMs, end: clip.offsetMs + clip.durationMs })),
    ...steps.filter(step => step.event).map(step => ({ start: step.at - audio.origin - durationOf(step), end: step.at - audio.origin })),
  ]) : null;
  steps.forEach((step, index) => {
    const added = drawnStroke(step);
    // 지우기·실행 취소처럼 순간인 단계도 1ms를 줘서, 시작 시각에는 아직 일어나지 않은 상태로 보이게 한다.
    const duration = durationOf(step);
    if (audio && audioMap) {
      const realEnd = step.at - audio.origin;
      const start = step.event ? audioMap.toReplay(realEnd - duration) : clock;
      starts.push(start);
      clock = Math.max(clock, start + 1, step.event ? audioMap.toReplay(realEnd) : start + duration);
      ends.push(clock);
      return;
    }
    const knownTime = !!step.event && (step.at > 0 || !timeline.approximate);
    const realStart = knownTime ? step.at - (added ? duration : 0) : 0;
    const gap = index === 0 ? REPLAY_LEAD_IN_MS
      : knownTime && previousEnd !== null ? Math.min(REPLAY_MAX_PAUSE_MS, Math.max(0, realStart - previousEnd))
      : REPLAY_UNKNOWN_GAP_MS;
    if (index > 0 && knownTime && previousEnd !== null) {
      const realGap = Math.max(0, realStart - previousEnd);
      if (realGap >= REPLAY_THINKING_PAUSE_MS) pauses.push({ start: clock, end: clock + gap, durationMs: realGap, label: formatThinkingPause(realGap) });
      if (realGap > 0) segments.push({ realStart: previousEnd, realEnd: realStart, start: clock, end: clock + gap });
    }
    clock += gap;
    starts.push(clock);
    if (knownTime) segments.push({ realStart, realEnd: realStart + duration, start: clock, end: clock + duration });
    clock += duration;
    ends.push(clock);
    previousEnd = knownTime ? step.at : null;
  });
  const total = Math.max(clock, audioMap?.total ?? 0);
  const mapping = audioMap ?? timeMapping(segments, total);
  const audioClips = audio?.clips.map(clip => ({ ...clip, offsetMs: mapping.toReplay(clip.offsetMs) })) ?? [];
  /** time 시각까지 끝난 단계 수. */
  const completedAt = (time: number) => {
    let low = 0, high = steps.length;
    while (low < high) { const mid = (low + high) >> 1; if (ends[mid] <= time) low = mid + 1; else high = mid; }
    return low;
  };
  return {
    total, starts, ends, completedAt, audioClips, pauses: audioMap?.pauses ?? pauses,
    toReplay: mapping.toReplay, toReal: mapping.toReal,
    frame(time: number): InkStroke[] {
      const t = Math.max(0, Math.min(total, time));
      const done = completedAt(t);
      const base = timeline.at(done);
      const next = steps[done];
      const added = next && starts[done] <= t ? drawnStroke(next) : null;
      if (!added) return base;
      const elapsed = t - starts[done];
      const points = added.stroke.points.filter(point => point.t <= elapsed);
      if (points.length === 0) return base;
      const partial: InkStroke = { ...added.stroke, points, shape: undefined };
      const out = base.slice();
      out.splice(Math.min(added.index, out.length), 0, partial);
      return out;
    },
  };
}

export function formatReplayTime(ms: number) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
