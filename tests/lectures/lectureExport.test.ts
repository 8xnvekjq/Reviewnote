import test from 'node:test';
import assert from 'node:assert/strict';
import { exportFileName, placeAudio, planFrames, resample, windowReads } from '../../src/features/lectures/lectureExport.ts';
import { TimelineLog, buildLectureReplay } from '../../src/features/lectures/lectureRecordingModel.ts';
import type { InkStroke } from '../../src/features/exam/contract.ts';

const slides = ['a', 'b'].map((id, i) => ({ id, path: `deck/${id}.webp`, section: '01', label: `슬라이드 ${i + 1}`, bookPage: 100 + i }));
const stroke = (id: string, ms: number): InkStroke => ({
  id, tool: 'pen', color: '#1f2937', size: 4,
  points: [0, 0.25, 0.5, 0.75, 1].map(f => ({ x: 0.1 + f * 0.2, y: 0.2, pressure: 0.6, t: Math.round(f * ms) })),
});

test('frameKey: 슬라이드·끝난 획·그리는 중인 점 수가 같으면 같은 값', () => {
  const log = new TimelineLog();
  log.ink(3000, 'a', [], [stroke('s1', 1000)], 'draw'); // 2000–3000ms에 그린 획
  log.slide(5000, 'b');
  const replay = buildLectureReplay({ slides, initialSlideId: 'a', durationMs: 8000, clips: [] }, log.take());
  assert.equal(replay.frameKey(0), replay.frameKey(1900), '그리기 전');
  assert.notEqual(replay.frameKey(2300), replay.frameKey(2600), '그리는 중에는 점이 늘어난다');
  assert.equal(replay.frameKey(2600), 'a|0|3');
  assert.equal(replay.frameKey(3000), 'a|1|0');
  assert.equal(replay.frameKey(4000), replay.frameKey(4900), '다 그린 뒤 그대로');
  assert.equal(replay.frameKey(5000), 'b');
  // strokesAt은 frameKey와 같은 점 수를 그린다.
  assert.equal(replay.strokesAt('a', 2600)[0].points.length, 3);
  assert.equal(replay.strokesAt('a', 1999).length, 0);
});

test('planFrames: 바뀌지 않은 장면은 앞 프레임을 늘리되 2초마다 다시 넣는다', () => {
  // 0–1000: A, 1000–1100: 매 프레임 바뀜, 이후 끝까지 B
  const key = (ms: number) => ms < 1000 ? 'A' : ms < 1100 ? `X${ms}` : 'B';
  const frames = planFrames(key, 0, 6000, 30, 2000);
  assert.equal(frames[0].atMs, 0);
  assert.equal(frames[0].durationMs, 1000, '정지 장면 한 장');
  const moving = frames.filter(f => f.atMs >= 1000 && f.atMs < 1100);
  assert.equal(moving.length, 3, '바뀌는 동안은 매 프레임(30fps)');
  const still = frames.filter(f => f.atMs >= 1100);
  assert.ok(still.every(f => f.durationMs <= 2000 + 1e-6), '2초보다 길게 붙잡지 않는다');
  assert.equal(still.length, 3, '1.1–6초 정지 구간은 2초마다');
  const sum = frames.reduce((s, f) => s + f.durationMs, 0);
  assert.ok(Math.abs(sum - 6000) < 1e-6, '프레임 길이 합 = 구간 길이');
  for (let i = 1; i < frames.length; i++) assert.ok(Math.abs(frames[i - 1].atMs + frames[i - 1].durationMs - frames[i].atMs) < 1e-6, '빈틈 없이 이어진다');
});

test('planFrames: 구간 중간에서 시작해도 첫 프레임은 시작 시각', () => {
  const frames = planFrames(() => 'same', 30_000, 90_000);
  assert.equal(frames[0].atMs, 30_000);
  assert.equal(frames.length, 30, '60초 정지 = 2초마다 한 장');
  assert.ok(Math.abs(frames.at(-1)!.atMs + frames.at(-1)!.durationMs - 90_000) < 1e-6);
});

test('placeAudio: 구간과 겹치는 클립 부분만, 다음 클립과 겹치지 않게', () => {
  const clips = [{ offsetMs: 0, durationMs: 10_000 }, { offsetMs: 9_900, durationMs: 20_000 }, { offsetMs: 40_000, durationMs: 5_000 }];
  assert.deepEqual(placeAudio(clips, 5_000, 35_000), [
    { clip: 0, srcMs: 5_000, dstMs: 0, lengthMs: 4_900 },
    { clip: 1, srcMs: 0, dstMs: 4_900, lengthMs: 20_000 },
  ]);
  assert.deepEqual(placeAudio(clips, 41_000, 100_000), [{ clip: 2, srcMs: 1_000, dstMs: 0, lengthMs: 4_000 }]);
  assert.deepEqual(placeAudio([], 0, 60_000), []);
});

test('windowReads: 창마다 어느 클립 샘플을 어디에 읽을지', () => {
  const rate = 1000; // 1ms = 샘플 1개
  const placements = [{ clip: 0, srcMs: 10, dstMs: 5, lengthMs: 30 }, { clip: 1, srcMs: 0, dstMs: 35, lengthMs: 100 }];
  assert.deepEqual(windowReads(placements, 0, 20, rate), [{ clip: 0, srcSample: 10, outOffset: 5, count: 15 }]);
  assert.deepEqual(windowReads(placements, 20, 20, rate), [
    { clip: 0, srcSample: 25, outOffset: 0, count: 15 },
    { clip: 1, srcSample: 0, outOffset: 15, count: 5 },
  ], '다음 창은 이어서, 클립이 바뀌는 곳은 나눠 읽는다');
  assert.deepEqual(windowReads(placements, 200, 20, rate), [], '소리 없는 곳');
  // 창들을 이어 붙이면 빈틈·겹침 없이 배치 길이 그대로.
  const all = [0, 20, 40, 60, 80, 100, 120].flatMap(w => windowReads(placements, w, 20, rate));
  assert.equal(all.filter(r => r.clip === 1).reduce((s, r) => s + r.count, 0), 100);
});

test('resample: 44.1kHz → 48kHz 길이와 값', () => {
  const input = Float32Array.from({ length: 441 }, (_, i) => i / 441);
  const out = resample(input, 44_100, 48_000);
  assert.equal(out.length, 480);
  assert.equal(out[0], 0);
  assert.ok(Math.abs(out[240] - 0.5) < 0.01);
  assert.equal(resample(input, 48_000, 48_000), input, '같으면 그대로');
});

test('exportFileName: 파일 이름에 못 쓰는 글자를 빼고 구간을 붙인다', () => {
  assert.equal(exportFileName('개념원리: 명제/역', 60_000, 120_000, true), '개념원리 명제 역 (테스트 1m00s-2m00s).mp4');
  assert.equal(exportFileName('  ', 0, 1, false), '수업.mp4');
});
