import type { InkChangeKind, InkReplayData, InkReplayEvent, InkStroke } from '../contract.ts';

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
