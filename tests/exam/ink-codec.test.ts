import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeInkPoints, decodeInkPoints, encodeInkStroke, decodeInkStroke, decodeInkPayload, encodeInkEvents } from '../../src/features/exam/ink/inkCodec.ts';
import { readInkAtBoundary, saveInkAtBoundary } from '../../src/features/exam/inkApi.ts';
import { buildInkTimeline, inkDelta } from '../../src/features/exam/ink/inkReplay.ts';
import { usesSimulatedPressure } from '../../src/features/exam/ink/inkModel.ts';
import { loadExamInk, forgetExamInk } from '../../src/features/exam/inkLoader.ts';
import type { InkPoint, InkStroke, InkReplayData, LiveInkResponse } from '../../src/features/exam/contract.ts';
import { applyLiveInk } from '../../src/features/exam/ink/inkLive.ts';

const stroke = (id = 'a'): InkStroke => ({ id, tool: 'pen', color: '#123456', size: 4,
  points: Array.from({ length: 70 }, (_, n) => ({ x: .123456 + n * .0007, y: .654321 + Math.sin(n / 6) * .01, pressure: .5, t: n * 8.333 })) });

test('codec bounds quantization, retains negative/large coordinates and exact simulated pressure', () => {
  const points: InkPoint[] = [-100, -1.123456, 0, 1.123456, 100].flatMap((x, i) =>
    [0, .001, .4999, .5, .5001, .999, 1].map(pressure => ({ x, y: -x, pressure, t: Math.min(86400000, i * 21600000 + .1) })));
  const decoded = decodeInkPoints(encodeInkPoints(points))!;
  assert.equal(decoded.length, points.length);
  decoded.forEach((p, i) => {
    assert.ok(Math.abs(p.x - points[i].x) <= .000025 + 1e-12);
    assert.ok(Math.abs(p.y - points[i].y) * 2000 <= .05 + 1e-9);
    assert.ok(Math.abs(p.t - points[i].t) <= .5);
    assert.ok(Math.abs(p.pressure - points[i].pressure) <= 1 / 510 + 1e-12);
    assert.equal(p.pressure === .5, points[i].pressure === .5);
  });
  assert.equal(usesSimulatedPressure(decodeInkPoints(encodeInkPoints(stroke().points))!), true);
  assert.deepEqual(decodeInkPoints(encodeInkPoints([])), []);
  assert.equal(decodeInkPoints(encodeInkPoints(Array(100000).fill({ x: 0, y: 0, pressure: .5, t: 0 })))!.length, 100000);
  assert.throws(() => encodeInkPoints(Array(100001).fill(points[0])), /TOO_LARGE/);
  for (const point of [{ ...points[0], x: NaN }, { ...points[0], y: 101 }, { ...points[0], t: -1 }, { ...points[0], pressure: 2 }]) {
    assert.throws(() => encodeInkPoints([point]), /INVALID/);
  }
});

test('malformed, truncated, noncanonical and out of bounds payloads never throw or partially decode', () => {
  const good = encodeInkPoints(stroke().points);
  for (const p of [null, {}, '', '2.0.', '1.01.', '1.100001.', '1.1.@@', '1.0.AA', '1.1.A',
    good.slice(0,-1), good + 'AA', '1.1.gACAAIAAgAA', '1.1.AAAB_w', '1.1.' + 'A'.repeat(2133345)]) {
    assert.equal(decodeInkPoints(p), null, String(p).slice(0,100));
  }
  assert.throws(() => decodeInkStroke({ ...encodeInkStroke(stroke()), points: [] } as unknown as InkStroke), /INVALID/);
  assert.throws(() => decodeInkPayload([{ ...encodeInkStroke(stroke()), p: 'broken' }]), /INVALID/);
});

test('same 537-stroke document is at least five times smaller including stroke metadata', () => {
  const document = Array.from({ length: 537 }, (_, i) => stroke(`stroke-${i}`));
  const legacy = Buffer.byteLength(JSON.stringify(document));
  const packed = Buffer.byteLength(JSON.stringify(document.map(encodeInkStroke)));
  const pointBytes = document.reduce((sum, s) => sum + encodeInkStroke(s).p.length, 0);
  console.log(`ink capacity fixture: ${legacy} -> ${packed} bytes (${(legacy / packed).toFixed(2)}x), ${(pointBytes / (537 * 70)).toFixed(2)} bytes/point including header`);
  assert.ok(packed < legacy / 5);
  assert.ok(pointBytes / (537 * 70) <= 8);
});

test('mixed API/cache shapes restore replay baselines, replacements, peer and live full/delta', () => {
  const a = stroke('a'), b = { ...stroke('b'), shape: { kind: 'line' as const, from: [0,0] as [number,number], to: [1,2] as [number,number] } };
  const qa = decodeInkStroke(encodeInkStroke(a)), qb = decodeInkStroke(encodeInkStroke(b));
  assert.deepEqual(qb.shape, b.shape);
  const event = inkDelta([a], [b], 'undo');
  const data = decodeInkPayload<InkReplayData>({ revision: 2, strokes: [encodeInkStroke(b)], batches: [
    { id: 'batch', revision: 2, baseRevision: 1, baseline: [encodeInkStroke(a)], events: encodeInkEvents([event]) }] });
  const timeline = buildInkTimeline(data);
  assert.deepEqual(timeline.at(timeline.steps.length), [qb]);
  assert.deepEqual(decodeInkPayload<{ strokes: InkStroke[] }>({ strokes: [a, encodeInkStroke(b)] }).strokes, [a,qb]);
  const delta = decodeInkPayload<LiveInkResponse>({ mode: 'delta', revision: 2, batches: [{ revision: 2, events: encodeInkEvents([event]) }] });
  const full = decodeInkPayload<LiveInkResponse>({ mode: 'full', revision: 2, strokes: [encodeInkStroke(b)] });
  assert.deepEqual(applyLiveInk({ revision: 1, strokes: [qa] }, delta), applyLiveInk(null, full));
});

test('RPC boundary negotiates v2, only falls back on missing RPC and retries pre-upgrade batches unchanged', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const events = [inkDelta([], [stroke()], 'draw')];
  const args = { p_events: events, p_batch_id: 'same-id' };
  const rpc = async (name: string, input: Record<string, unknown>) => {
    calls.push({ name, args: input });
    return { data: 1, error: null };
  };
  await saveInkAtBoundary(rpc, args);
  assert.ok('p' in (calls[0].args.p_events as any)[0].added[0].stroke);
  for (const error of [{ message: 'missing', code: 'PGRST202' }, { message: 'EXAM_REPLAY_BATCH_MISMATCH' }]) {
    calls.length = 0;
    await saveInkAtBoundary(async (name, input) => name.endsWith('_v2') ? { data: null, error } : rpc(name,input), args);
    assert.equal(calls[0].name, 'save_exam_ink_delta');
    assert.equal(calls[0].args.p_events, events);
    assert.equal(calls[0].args.p_batch_id, 'same-id');
  }
  await assert.rejects(readInkAtBoundary(async () => { throw new Error('timeout'); }, 'get_exam_ink', {}), /timeout/);
  forgetExamInk();
  const docs = await loadExamInk((name, input) => readInkAtBoundary(async rpcName => {
    if (rpcName === 'get_exam_ink_index_v2') return [{ questionId: 'q', revision: 1 }];
    if (rpcName === 'get_exam_ink_questions_v2') return [{ questionId: 'q', revision: 1, strokes: [encodeInkStroke(stroke())] }];
    throw new Error(rpcName);
  }, name, input), 'codec-attempt');
  assert.deepEqual(docs[0].strokes, [decodeInkStroke(encodeInkStroke(stroke()))]);
});
