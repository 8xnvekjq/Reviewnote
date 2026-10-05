import test from 'node:test';
import assert from 'node:assert/strict';
import { freshPointerSamples } from '../../src/features/exam/ink/inkInput.ts';
import { holdStillStart } from '../../src/features/exam/ink/shapeSnap.ts';
import { usesSimulatedPressure } from '../../src/features/exam/ink/inkModel.ts';

const sample = (timeStamp: number) => ({ timeStamp, x: timeStamp, y: 0, pressure: .2 + timeStamp / 100 });
const batch = (times: number[]) => ({ ...sample(times.at(-1)!), getCoalescedEvents: () => times.map(sample) });

test('overlapping coalesced batches keep only strictly newer raw samples, including pointerdown', () => {
  let last = 0;
  const points = [sample(0)];
  for (const times of [[0,4,8,12,17,21,25], [4,8,12,17,21,25], [33,29,33,38], [46,50,46,50,54,58], [54,58,63,67,63,67]]) {
    const fresh = freshPointerSamples(batch(times), last);
    last = fresh.lastTimeStamp;
    points.push(...fresh.samples);
  }
  assert.deepEqual(points.map(p => p.timeStamp), [0,4,8,12,17,21,25,33,38,46,50,54,58,63,67]);
  assert.deepEqual(points, points.map(p => sample(p.timeStamp)), 'coordinates and real pressure are untouched');
  assert.equal(usesSimulatedPressure(points), false);
  assert.equal(last, 67);
});

test('missing or empty coalesced lists apply the same watermark to the event itself', () => {
  assert.deepEqual(freshPointerSamples(sample(10), 10).samples, []);
  assert.deepEqual(freshPointerSamples(sample(9), 10).samples, []);
  assert.deepEqual(freshPointerSamples(sample(11), 10).samples, [sample(11)]);
  const empty = { ...sample(12), getCoalescedEvents: () => [] };
  assert.deepEqual(freshPointerSamples(empty, 11).samples, [empty]);
  assert.deepEqual(freshPointerSamples(empty, 12).samples, []);
});

test('raw sub-ms timestamps remain distinct even if stored rounded times are equal', () => {
  const fresh = freshPointerSamples(batch([10, 10.1, 10.2, 10.1, 10.3]), 10);
  assert.deepEqual(fresh.samples.map(p => p.timeStamp), [10.1,10.2,10.3]);
  assert.deepEqual(fresh.samples.map(p => Math.round(p.timeStamp)), [10,10,10]);
});

test('a sample discarded by the distance threshold still advances the received watermark', () => {
  const close = { ...sample(20), x: 0 };
  const first = freshPointerSamples({ ...close, getCoalescedEvents: () => [close] }, 10);
  // 호출부가 같은 자리 점을 버려도 이전 샘플을 다음 배치에서 다시 받지 않는다.
  const next = freshPointerSamples(batch([15,20,21]), first.lastTimeStamp);
  assert.deepEqual(next.samples, [sample(21)]);
});

test('watermarks reset per gesture and ignore predicted samples', () => {
  const event = { ...batch([1,2]), getPredictedEvents: () => [sample(100)] };
  assert.equal(freshPointerSamples(event, 0).lastTimeStamp, 2);
  assert.deepEqual(freshPointerSamples(batch([2,3]), 2).samples, [sample(3)]);
  assert.deepEqual(freshPointerSamples(batch([1,2]), 0).samples, [sample(1), sample(2)]);
});

test('overlap filtering preserves hold detection and aligned arrival times', () => {
  const points = [{ x: 0, y: 0 }], arrivals = [0];
  let last = 0;
  for (let t = 10; t <= 1200; t += 10) {
    const fresh = freshPointerSamples(batch([t - 20, t - 10, t]), last);
    last = fresh.lastTimeStamp;
    for (const ev of fresh.samples) {
      points.push({ x: Math.min(ev.timeStamp / 500, 1), y: 0 });
      arrivals.push(t);
    }
  }
  assert.equal(points.length, arrivals.length);
  assert.equal(points.length, 121);
  const start = holdStillStart(points, arrivals, 1200, 650, .01);
  assert.ok(start >= 0, 'a completed line followed by a stationary hold still snaps');
  assert.ok(arrivals[start] >= 490, 'the moving portion stays whole');
  assert.equal(holdStillStart(points.slice(0, 91), arrivals.slice(0, 91), 900, 650, .01), -1, 'a short pause does not snap');
});
