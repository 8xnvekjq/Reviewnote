import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInkClock, buildInkTimeline, buildReplayTimeMap, formatThinkingPause, inkDelta } from '../../src/features/exam/ink/inkReplay.ts';
import type { InkStroke, SolutionAudioClip } from '../../src/features/exam/contract.ts';

const clip = (id: string, offsetMs: number, durationMs: number): SolutionAudioClip => ({
  id, offsetMs, durationMs, mime: 'audio/wav', sizeBytes: 1, storagePath: `${id}.wav`,
});
const makeClock = (ends: number[], clips?: SolutionAudioClip[], duration = 200) => {
  let previous: InkStroke[] = [];
  const events = ends.map((at, i) => {
    const stroke: InkStroke = { id: String(i), tool: 'pen', color: '#123456', size: 4,
      points: [0, duration / 2, duration].map(t => ({ x: t / duration, y: .5, pressure: .5, t })) };
    const next = [...previous, stroke];
    const event = inkDelta(previous, next, 'draw', at);
    previous = next;
    return event;
  });
  return buildInkClock(buildInkTimeline({ revision: 1, strokes: previous,
    batches: [{ id: 'batch', baseRevision: 0, revision: 1, baseline: [], events }] }),
  clips ? { origin: 100000, clips } : undefined);
};

test('seven hours outside recording become 1.5 seconds; a silent recording stays intact', () => {
  const hours = 7 * 3600000;
  const clock = makeClock([100000, 100000 + hours + 50000], [clip('voice', hours, 90000)]);
  assert.equal(clock.total, 200 + 1500 + 90000);
  assert.equal(clock.audioClips[0].offsetMs, 1700);
  assert.equal(clock.ends[1], 51700);
  assert.equal(clock.pauses[0].label, '7시간 고민');
  assert.equal(clock.pauses[0].durationMs, hours);
  assert.equal(clock.toReal(51700), hours + 50000);
  assert.equal(clock.toReplay(hours + 50000), 51700);
  assert.equal(clock.frame(51600)[1].points.length, 2);
});

test('multiple overlapping and adjacent recordings preserve all durations and offsets', () => {
  const clock = makeClock([], [clip('a', 0, 60000), clip('b', 50000, 20000),
    clip('c', 70000, 10000), clip('d', 1000000, 30000)]);
  assert.equal(clock.total, 111500);
  assert.deepEqual(clock.audioClips.map(c => c.offsetMs), [0, 50000, 70000, 81500]);
  for (const original of [clip('a', 0, 60000), clip('b', 50000, 20000), clip('c', 70000, 10000), clip('d', 1000000, 30000)]) {
    const mapped = clock.audioClips.find(c => c.id === original.id)!;
    for (const elapsed of [0, original.durationMs / 2, original.durationMs]) {
      assert.equal(clock.toReplay(original.offsetMs + elapsed), mapped.offsetMs + elapsed);
      assert.equal(clock.toReal(mapped.offsetMs + elapsed), original.offsetMs + elapsed);
    }
  }
  assert.equal(clock.pauses.length, 1);
});

test('ink before, between and after recordings protects activity, including strokes spanning clip edges', () => {
  const clock = makeClock([100000, 120000, 140000, 160000], [clip('a', 10000, 1000), clip('b', 39900, 500)]);
  assert.deepEqual(clock.starts, [0, 4200, 5900, 8000]);
  assert.deepEqual(clock.audioClips.map(c => c.offsetMs), [1700, 6000]);
  assert.equal(clock.total, 8200);
  assert.equal(clock.frame(clock.total).length, 4);
  for (const end of clock.ends) assert.equal(clock.toReplay(clock.toReal(end)), end);
});

test('ink-only clock retains short gaps and produces accessible long-pause labels and reversible seeks', () => {
  const clock = makeClock([100000, 150200, 150600]);
  assert.deepEqual(clock.starts, [300, 2000, 2400]);
  assert.equal(clock.pauses.length, 1);
  assert.equal(clock.pauses[0].label, '50초 고민');
  for (const real of [100000, 110000, 150000, 150200]) {
    assert.ok(Math.abs(clock.toReal(clock.toReplay(real)) - real) < .0001);
  }
  assert.equal(clock.frame(clock.ends[0]).length, 1);
  assert.equal(clock.frame(clock.ends[1]).length, 2);
  const anonymous = makeClock([0, 50200, 50600]);
  assert.deepEqual(anonymous.starts, clock.starts);
  assert.deepEqual(anonymous.pauses, clock.pauses);
});

test('gap thresholds, short silence, negative origins, empty timelines and clamped bidirectional seeks', () => {
  const map = buildReplayTimeMap([{ start: -500, end: 0 }, { start: 1000, end: 2000 },
    { start: 11999, end: 12000 }, { start: 22000, end: 23000 }]);
  assert.equal(map.pauses.length, 1);
  assert.equal(map.pauses[0].durationMs, 10000);
  assert.equal(map.toReplay(-500), 0);
  assert.equal(map.toReal(-1), -500);
  assert.equal(map.toReplay(1000), 1500);
  assert.equal(map.toReplay(Infinity), map.total);
  assert.equal(map.toReal(Infinity), 23000);
  assert.equal(buildReplayTimeMap([]).total, 0);
  assert.equal(buildReplayTimeMap([]).toReal(12), 0);
});

test('long ink inside audio is never shortened and duration labels use Korean units', () => {
  const clock = makeClock([100000], [clip('voice', -60000, 60000)], 50000);
  assert.equal(clock.starts[0], 10000);
  assert.equal(clock.ends[0], 60000);
  assert.equal(clock.frame(35000)[0].points.length, 2);
  assert.equal(formatThinkingPause(50000), '50초 고민');
  assert.equal(formatThinkingPause(120000), '2분 고민');
  assert.equal(formatThinkingPause(7 * 3600000), '7시간 고민');
  assert.equal(formatThinkingPause(3661000), '1시간 1분 1초 고민');
});
