import type { InkChangeKind, InkReplayData, InkStroke } from '../../src/features/exam/contract.ts';
import { inkDelta } from '../../src/features/exam/ink/inkReplay.ts';

export const replayUuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

/** Real codec data: 160 batches, 700 events, 650 final strokes, about 2 MB. */
export function largeReplayFixture(): InkReplayData {
  let seed = 91723;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const originals: InkStroke[] = Array.from({ length: 650 }, (_, n) => ({
    id: `large-${n}`, tool: 'pen', color: '#123456', size: 4,
    points: Array.from({ length: 360 }, (_, i) => ({
      x: random(), y: random(), pressure: .5, t: i * 8,
    })),
  }));
  const strokes = originals.map((s, n) => n < 50 ? { ...s, color: '#abcdef' } : s);
  const events = Array.from({ length: 700 }, (_, n) => ({
    id: replayUuid(10000 + n), kind: 'draw' as const, at: 1800000000000 + n * 1400,
    removed: n < 650 ? [] : [originals[n - 650].id],
    added: [{ index: n < 650 ? n : n - 650, stroke: n < 650 ? originals[n] : strokes[n - 650], extra: n }],
    extra: { sequence: n },
  }));
  return { revision: 160, strokes, batches: Array.from({ length: 160 }, (_, b) => ({
    id: replayUuid(20000 + b), baseRevision: b, revision: b + 1, baseline: null,
    events: events.slice(Math.floor(b * 700 / 160), Math.floor((b + 1) * 700 / 160)),
  })) };
}

export function replayFixture(): InkReplayData {
  const batches: InkReplayData['batches'] = [];
  let current: InkStroke[] = [];
  let previous: InkStroke[] = [];
  let at = 1800000000000;
  let seed = 12345;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const stroke = (n: number): InkStroke => ({ id: `stroke-${n}`, tool: n % 3 ? 'pen' : 'highlighter',
    color: n % 3 ? '#123456' : '#ffe600', size: n % 3 ? 4 : 12,
    points: Array.from({ length: 150 }, (_, i) => ({ x: .1 + random() * .3, y: .2 + random() * .2,
      pressure: .5, t: i * 8 })),
    ...(n === 3 ? { shape: { kind: 'line' as const, from: [.1, .2] as [number, number], to: [.4, .4] as [number, number] } } : {}),
  });
  for (let b = 0; b < 16; b++) {
    const baseline = b === 0 ? [] : null;
    const events = [];
    for (let j = 0; j < 5; j++) {
      const n = b * 5 + j;
      let next = [...current, stroke(n)];
      let kind: InkChangeKind = 'draw';
      if (n === 5) { next = current.slice(1); kind = 'erase'; }
      if (n === 6) { next = previous; kind = 'undo'; }
      if (n === 7) { next = current.slice(1); kind = 'redo'; }
      if (n === 10) { next = []; kind = 'clear'; }
      if (n === 11) { next = previous; kind = 'undo'; }
      // 올가미 이동은 같은 ID의 제거와 바뀐 본문 추가로 저장된다.
      if (n === 15) { next = current.map((s, i) => i ? s : { ...s, points: s.points.map(p => ({ ...p, x: p.x + .1 })) }); }
      if (n === 16) { next = previous; kind = 'undo'; }
      if (n === 20) { next = current.filter((_, i) => i % 2); kind = 'erase'; }
      if (n === 21) { next = previous; kind = 'undo'; }
      if (n === 25) { next = [...current.slice(1), { ...current[0], color: '#abcdef' }]; }
      at += n % 9 === 0 ? 60000 : 1400;
      events.push({ ...inkDelta(current, next, kind, at), id: replayUuid(1000 + n) });
      previous = current; current = next;
    }
    batches.push({ id: replayUuid(2000 + b), baseRevision: b, revision: b + 1, baseline, events });
  }
  return { batches, strokes: current, revision: 16 };
}
