import test from 'node:test';
import assert from 'node:assert/strict';
import { REPLAY_MAX_PAUSE_MS, applyInkEvent, buildInkClock, buildInkTimeline, inkDelta } from '../../src/features/exam/ink/inkReplay.ts';
import type { InkStroke } from '../../src/features/exam/contract.ts';
const stroke = (id: string): InkStroke => ({ id, tool: 'pen', color: '#123456', size: 4, points: [{ x: .1, y: .2, pressure: .5, t: 0 }] });

test('replay retains draw, erasure, undo, redo and clear, and seeks both directions', () => {
  const a = stroke('a'), b = stroke('b');
  const snapshots = [[], [a], [a, b], [b], [a, b], [b], []];
  const kinds = ['draw','draw','erase','undo','redo','clear'] as const;
  const events = kinds.map((kind, i) => inkDelta(snapshots[i], snapshots[i + 1], kind, 1000 * i));
  const timeline = buildInkTimeline({ batches: [{ id: 'batch', revision: 1, baseRevision: 0, baseline: [], events }], strokes: [], revision: 1 });
  assert.equal(timeline.approximate, false);
  for (const i of [0, 3, 6, 2, 5, 1, 4]) assert.deepEqual(timeline.at(i), snapshots[i]);
  assert.equal(timeline.steps[3].label, '실행 취소');
});

test('restored strokes retain their original drawing order including a middle stroke', () => {
  const a = stroke('a'), b = stroke('b'), c = stroke('c');
  assert.deepEqual(applyInkEvent([a, c], inkDelta([a, c], [a, b, c], 'undo')), [a, b, c]);
  const changed = { ...a, color: '#000000' };
  assert.deepEqual(applyInkEvent([a, b], inkDelta([a, b], [changed, b], 'draw')), [changed, b]);
});

test('old ink is labelled approximate and gaps made by old clients become explicit snapshots', () => {
  const a = stroke('a');
  const legacy = buildInkTimeline({ batches: [], strokes: [a], revision: 2 });
  assert.equal(legacy.approximate, true); assert.deepEqual(legacy.at(0), []); assert.deepEqual(legacy.at(1), [a]);
  const mixed = buildInkTimeline({ batches: [{ id: 'batch', revision: 1, baseRevision: 0, baseline: [], events: [inkDelta([], [a], 'draw')] }], strokes: [], revision: 2 });
  assert.equal(mixed.approximate, true); assert.deepEqual(mixed.at(1), [a]); assert.deepEqual(mixed.at(2), []);
});

test('checkpoint seeking equals sequential replay across a long stream', () => {
  let previous: InkStroke[] = [];
  const snapshots: InkStroke[][] = [[]];
  const events = [];
  for (let i = 0; i < 210; i++) {
    const next = i % 3 === 0 ? previous.slice(1) : [...previous, stroke(String(i))];
    events.push(inkDelta(previous, next, i % 3 === 0 ? 'erase' : 'draw', i));
    snapshots.push(next); previous = next;
  }
  const timeline = buildInkTimeline({ batches: [{ id: 'batch', baseRevision: 0, revision: 1, baseline: [], events }], strokes: previous, revision: 1 });
  for (let i = 210; i >= 0; i--) assert.deepEqual(timeline.at(i), snapshots[i]);
});

test('time clock follows real drawing speed, shortens long pauses and draws strokes progressively', () => {
  const drawn = (id: string, ms: number): InkStroke => ({ id, tool: 'pen', color: '#123456', size: 4,
    points: [0, ms / 2, ms].map((t, i) => ({ x: .1 * i, y: .2, pressure: .5, t })) });
  const a = drawn('a', 800), b = drawn('b', 400);
  // a: 10:00:00.000~.800, 60초 고민, b: 10:01:00.800~10:01:01.200, 그리고 200ms 뒤 지우기
  const t0 = 1_800_000_000_000;
  const events = [
    inkDelta([], [a], 'draw', t0 + 800),
    inkDelta([a], [a, b], 'draw', t0 + 800 + 60_000 + 400),
    inkDelta([a, b], [b], 'erase', t0 + 800 + 60_000 + 400 + 200),
  ];
  const clock = buildInkClock(buildInkTimeline({ batches: [{ id: 'x', revision: 1, baseRevision: 0, baseline: [], events }], strokes: [b], revision: 1 }));
  const [sa, sb, se] = clock.starts;
  assert.equal(clock.ends[0] - sa, 800);                      // 실제로 그린 시간 그대로
  assert.equal(sb - clock.ends[0], REPLAY_MAX_PAUSE_MS);      // 60초 고민은 줄인다
  assert.equal(se - clock.ends[1], 200);                      // 짧은 간격은 그대로
  assert.deepEqual(clock.frame(0), []);                       // 처음은 빈 화면
  const half = clock.frame(sa + 400);                         // 첫 획을 반쯤 그린 순간
  assert.equal(half.length, 1); assert.equal(half[0].points.length, 2);
  assert.deepEqual(clock.frame(clock.ends[0]), [a]);
  assert.deepEqual(clock.frame(sb - 1), [a]);                 // 고민하는 동안 그대로
  assert.deepEqual(clock.frame(clock.ends[1]), [a, b]);
  assert.deepEqual(clock.frame(clock.total), [b]);            // 마지막 = 지운 뒤
  assert.deepEqual(clock.frame(sa + 400), half);              // 되돌려도 같은 화면
});
