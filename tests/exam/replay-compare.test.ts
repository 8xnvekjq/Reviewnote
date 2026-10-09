import test from 'node:test';
import assert from 'node:assert/strict';
import { compareGridShape, sharedCompareFit, comparePrefetchOrder, advanceCompare, compareCellProgress, compareColumns, restartCompare, latestSubmissions, createCompareReplayLoader } from '../../src/features/exam/ui/replayCompareLogic.ts';
import type { AdminPaperSubmission, InkReplayData } from '../../src/features/exam/contract.ts';

test('shared clock clamps each cell and leaves completed cells on their final frame', () => {
  const time = advanceCompare(0, 500, 2, 3000);
  assert.equal(time, 1000);
  assert.deepEqual(compareCellProgress(time, 400), { time: 400, finished: true });
  assert.deepEqual(compareCellProgress(time, 3000), { time: 1000, finished: false });
  assert.deepEqual(compareCellProgress(0, 0), { time: 0, finished: true });
  assert.equal(advanceCompare(time, 2000, 4, 3000), 3000);
  assert.equal(advanceCompare(time, 1000, .5, 3000), 1500);
  assert.deepEqual(restartCompare(2), { question: 2, time: 0, playing: true });
});
test('columns follow phone and tablet widths', () => {
  assert.deepEqual([390, 820, 1180].map(compareColumns), [1, 2, 3]);
});
test('latest submitted per student includes the admin and rejects unsubmitted rows', () => {
  const row = (studentId: string, attemptId: string, submittedAt: string, isMine = false): AdminPaperSubmission => ({ studentId, attemptId, submittedAt, isMine, studentName: studentId, questions: [] });
  const picked = latestSubmissions([row('a', 'old', '2026-01-01'), row('a', 'latest', '2026-02-01'), row('a', 'active', ''), row('admin', 'mine', '2026-01-01', true)]);
  assert.deepEqual(picked.map(r => r.attemptId), ['latest', 'mine']);
  assert.equal(picked[1].isMine, true);
});
test('loader caps concurrency at four, deduplicates cache, and retries failures', async () => {
  let active = 0, max = 0, calls = 0, fail = true;
  const data: InkReplayData = { batches: [], strokes: [], revision: 0 };
  const load = createCompareReplayLoader(async (id) => {
    calls++; active++; max = Math.max(max, active);
    await new Promise(resolve => setTimeout(resolve, 5)); active--;
    if (id === 'fail' && fail) { fail = false; throw new Error('offline'); }
    return data;
  });
  await Promise.all(Array.from({ length: 12 }, (_, i) => load(String(i), 'q')));
  assert.equal(max, 4); assert.equal(calls, 12);
  await load('0', 'q'); assert.equal(calls, 12);
  await assert.rejects(load('fail', 'q'), /offline/);
  await load('fail', 'q'); assert.equal(calls, 14);
  await load('0', 'q2'); assert.equal(calls, 15);
});

test('grid shape fits six and respects portrait, phone and minimum width', () => {
  for (const [w, h, columns, rows] of [[1180,820,3,2], [820,1180,2,3], [1366,768,3,2], [1920,1080,3,2], [390,844,1,6]]) {
    assert.deepEqual(compareGridShape(6,w,h), { columns, rows });
  }
  assert.deepEqual(compareGridShape(4,1180,820), { columns: 2, rows: 2 });
  assert.deepEqual(compareGridShape(5,820,1180), { columns: 2, rows: 3 });
  assert.deepEqual(compareGridShape(12,700,680), { columns: 3, rows: 4 });
  assert.deepEqual(compareGridShape(1,1180,820), { columns: 1, rows: 1 });
});
test('shared fit includes the image, long ink and erased baseline ink', () => {
  const stroke = (x: number, y: number) => ({ id: 's', tool: 'pen' as const, color: '#000', size: 4, points: [{ x, y, pressure: .5 }] });
  const data: InkReplayData = { strokes: [stroke(2,3)], revision: 1, batches: [] };
  const erased: InkReplayData = { strokes: [], revision: 1, batches: [{ id: 'b', baseRevision: 0, revision: 1, baseline: [stroke(3,4)], events: [] }] };
  const fit = sharedCompareFit([data,erased], 5);
  assert.ok(fit.maxX > 3); assert.equal(fit.maxY, 5);
  assert.deepEqual(sharedCompareFit([], 2), { maxX: 1, maxY: 2 });
});
test('prefetch visits next then previous; current requests bypass queued prefetch and reuse cache', async () => {
  assert.deepEqual(comparePrefetchOrder([1,2,3],2), [3,1]);
  assert.deepEqual(comparePrefetchOrder([1,2,3],1), [2]);
  assert.deepEqual(comparePrefetchOrder([1,2,3],3), [2]);
  const calls: string[] = [];
  const releases: Array<() => void> = [];
  const data: InkReplayData = { strokes: [], batches: [], revision: 0 };
  const load = createCompareReplayLoader(async (_a,q) => {
    calls.push(q); await new Promise<void>(resolve => releases.push(resolve)); return data;
  });
  const current = Array.from({ length: 4 }, (_, i) => load(String(i),'current'));
  await Promise.resolve();
  const obsolete = load('a','obsolete',true).catch(error => error.message);
  const background = load('a','next',true);
  const promoted = load('a','next');
  assert.equal(background,promoted);
  const changed = load('b','changed');
  load.clearPrefetch();
  assert.equal(await obsolete, 'AbortError');
  releases.splice(0).forEach(release => release());
  await Promise.all(current);
  await new Promise(resolve => setTimeout(resolve,0));
  assert.deepEqual(calls, ['current','current','current','current','next','changed']);
  releases.splice(0).forEach(release => release());
  await Promise.all([background,changed]);
  assert.equal(load.peek('a','next'),data);
  await load('a','next'); assert.equal(calls.length,6);
});

test('a rapid question change cancels obsolete queued current requests and promotes the new question', async () => {
  const data: InkReplayData = { strokes: [], batches: [], revision: 0 };
  const calls: string[] = [];
  const releases: Array<() => void> = [];
  const load = createCompareReplayLoader(async (_a,q) => {
    calls.push(q); await new Promise<void>(resolve => releases.push(resolve)); return data;
  });
  const active = Array.from({ length: 4 }, (_, i) => load(String(i),'old'));
  const obsolete = load('queued','old').catch(error => error.message);
  const next = load('queued','next',true);
  await Promise.resolve();
  load.prioritize([{ attemptId: 'queued', questionId: 'next' }]);
  load.clearPrefetch();
  assert.equal(await obsolete,'AbortError');
  const current = load('queued','next');
  assert.equal(next,current);
  releases.splice(0).forEach(release => release());
  await Promise.all(active);
  await new Promise(resolve => setTimeout(resolve,0));
  assert.deepEqual(calls,['old','old','old','old','next']);
  releases.splice(0).forEach(release => release());
  await current;
});
