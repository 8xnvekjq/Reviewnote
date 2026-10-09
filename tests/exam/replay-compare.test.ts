import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceCompare, compareCellProgress, compareColumns, restartCompare, latestSubmissions, createCompareReplayLoader } from '../../src/features/exam/ui/replayCompareLogic.ts';
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
