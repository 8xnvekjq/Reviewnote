import test from 'node:test';
import assert from 'node:assert/strict';
import type { InkStroke } from '../../src/features/exam/contract.ts';
import {
  HelpInkLog, decodeHelpSolution, encodeHelpSolution, helpDurationMs, helpReplayData, helpSolutionStats, helpTooShortReason, parseHelpSolution,
} from '../../src/features/peerHelp/solutionFile.ts';

const stroke = (id: string, ms = 1000): InkStroke => ({
  id, tool: 'pen', color: '#1f2937', size: 4,
  points: [0, 0.5, 1].map(f => ({ x: 0.1 + f * 0.2, y: 0.2, pressure: 0.6, t: Math.round(f * ms) })),
});

test('필기 변화를 재생 이벤트로 모으고, 바뀐 게 없으면 남기지 않는다', () => {
  let now = 10_000;
  const log = new HelpInkLog(() => now);
  const a = stroke('a'), b = stroke('b');
  log.record([], [a]); now += 30_000;
  log.record([a], [a]); // 변화 없음
  log.record([a], [a, b], 'draw'); now += 1000;
  log.record([a, b], [a], 'undo');
  assert.deepEqual(log.events.map(e => e.kind), ['draw', 'draw', 'undo']);
  // 첫 획을 1초 동안 그렸으니 시작은 9초, 끝은 41초 → 32초
  assert.equal(helpDurationMs(log.events), 32_000);
  assert.deepEqual(helpSolutionStats(log.events, [a]), { strokeCount: 1, durationMs: 32_000 });
  assert.equal(helpDurationMs([]), 0);
});

test('최소 분량 안내(서버와 같은 기준: 획 5개, 5초)', () => {
  assert.match(helpTooShortReason({ strokeCount: 4, durationMs: 60_000 })!, /획 5개/);
  assert.match(helpTooShortReason({ strokeCount: 9, durationMs: 4_999 })!, /5초/);
  assert.equal(helpTooShortReason({ strokeCount: 5, durationMs: 5_000 }), null);
});

test('풀이 파일: gzip으로 저장했다가 그대로 재생 데이터로 연다', async () => {
  let now = 0;
  const log = new HelpInkLog(() => (now += 5000));
  const strokes = ['a', 'b', 'c'].map(id => stroke(id));
  strokes.forEach((s, i) => log.record(strokes.slice(0, i), strokes.slice(0, i + 1)));
  const blob = await encodeHelpSolution(log.events, strokes);
  assert.equal(blob.type, 'application/gzip');
  const file = await decodeHelpSolution(blob);
  assert.deepEqual(file.strokes.map(s => s.id), ['a', 'b', 'c']);
  // 시험 필기와 같은 압축이라 좌표는 아주 조금 반올림된다.
  file.strokes[0].points.forEach((p, i) => {
    const o = strokes[0].points[i];
    assert.ok(Math.abs(p.x - o.x) < 1e-3 && Math.abs(p.y - o.y) < 1e-3 && Math.abs(p.t - o.t) <= 1, '압축 점이 거의 그대로 풀린다');
  });
  const replay = helpReplayData(file);
  assert.equal(replay.batches[0].events.length, 3);
  assert.equal(replay.batches[0].events[2].added[0].stroke.id, 'c');
  assert.throws(() => parseHelpSolution({ format: 'other', events: [], strokes: [] }), /형식/);
  assert.throws(() => parseHelpSolution({ format: 'reviewnotes.help-solution', version: 99, events: [], strokes: [] }), /새로운 앱/);
});
