import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveStudentOrderSession } from '../../src/features/exam/ui/liveStudentOrderSession.ts';
import type { LiveStudentOrderCount } from '../../src/features/exam/contract.ts';

const rows = [{ studentId: 'k', studentName: '김학생' }, { studentId: 'i', studentName: '이학생' }];
const ids = (students: typeof rows) => students.map(row => row.studentId);
const flush = async () => { for (let n = 0; n < 10; n++) await Promise.resolve(); };
function clock() {
  let now = 0;
  const jobs = new Map<object, { callback: () => void; at: number }>();
  return {
    now: () => now,
    later(callback: () => void, delay: number) { const key = {}; jobs.set(key, { callback, at: now + delay }); return key; },
    cancel(handle: unknown) { jobs.delete(handle as object); },
    advance(ms: number) { now += ms; for (const [key, job] of [...jobs]) if (job.at <= now) { jobs.delete(key); job.callback(); } },
    jobs,
  };
}
test('초기 응답 정렬, 중복 방지, 60초 스로틀과 스냅샷 고정', async () => {
  const time = clock(), calls: string[][] = [];
  let resolve!: (rows: LiveStudentOrderCount[]) => void;
  const fetch = (studentIds: string[]) => { calls.push(studentIds); return new Promise<LiveStudentOrderCount[]>(r => { resolve = r; }); };
  let current = rows, shown = rows;
  const session = createLiveStudentOrderSession(fetch, () => { shown = session.apply(current); }, time);
  shown = session.apply(current);
  assert.deepEqual(ids(shown), ['k', 'i']);
  await flush();
  for (let n = 0; n < 20; n++) session.apply([...current].reverse());
  assert.equal(calls.length, 1, 'RPC 호출 제한을 유지한다');
  resolve([{ studentId: 'k', completedCount: 10 }, { studentId: 'i', completedCount: 30 }]);
  await flush();
  assert.deepEqual(ids(shown), ['i', 'k']);
  current = [...rows, { studentId: 'p', studentName: '박학생' }];
  shown = session.apply(current);
  time.advance(59_999); await flush(); assert.equal(calls.length, 1);
  time.advance(1); await flush(); assert.deepEqual(calls[1], ['p']);
  // 기존 카운트 변경이 섞여 와도 확정된 순서는 유지한다.
  resolve([{ studentId: 'p', completedCount: 20 }, { studentId: 'k', completedCount: 100 }]);
  await flush(); assert.deepEqual(ids(shown), ['i', 'p', 'k']);
  for (let n = 0; n < 20; n++) { time.advance(5000); session.apply([...current].reverse()); await flush(); }
  assert.equal(calls.length, 2, 'RPC 호출 제한을 유지한다');
  session.dispose();
});
test('진행 중 신규 학생의 후속 조회와 삽입', async () => {
  const time = clock(), calls: string[][] = [];
  let resolve!: (rows: LiveStudentOrderCount[]) => void;
  let current = rows, shown = rows;
  const session = createLiveStudentOrderSession(studentIds => { calls.push(studentIds); return new Promise(r => { resolve = r; }); },
    () => { shown = session.apply(current); }, time);
  session.apply(current); await flush();
  current = [...rows, { studentId: 'p', studentName: '박학생' }]; session.apply(current);
  resolve([{ studentId: 'i', completedCount: 30 }, { studentId: 'k', completedCount: 10 }]); await flush();
  time.advance(60_000); await flush(); assert.deepEqual(calls, [['k', 'i'], ['p']]);
  resolve([{ studentId: 'p', completedCount: 40 }]); await flush();
  assert.deepEqual(ids(shown), ['p', 'i', 'k']); session.dispose();
});
test('실패 이름순 대체와 재시도 제한', async () => {
  const time = clock(); let calls = 0;
  let current = rows, shown = rows;
  const session = createLiveStudentOrderSession(async studentIds => {
    if (++calls === 1) throw new Error('offline');
    return studentIds.map(studentId => ({ studentId, completedCount: 40 }));
  }, () => { shown = session.apply(current); }, time);
  session.apply(current); await flush(); assert.deepEqual(ids(shown), ['k', 'i']);
  time.advance(60_000); session.apply(rows); await flush(); assert.equal(calls, 1);
  current = [...rows, { studentId: 'p', studentName: '박학생' }]; session.apply(current); await flush();
  assert.deepEqual(ids(shown), ['p', 'k', 'i']); session.dispose();
});
test('빈 목록·종료·재열기 및 타이머 취소', async () => {
  const time = clock(); let calls = 0, changes = 0;
  let resolve!: (rows: LiveStudentOrderCount[]) => void;
  const session = createLiveStudentOrderSession(() => { calls++; return new Promise(r => { resolve = r; }); }, () => { changes++; }, time);
  session.apply([]); await flush(); assert.equal(calls, 0);
  session.apply(rows); await flush(); session.dispose(); resolve([]); await flush(); assert.equal(changes, 0);
  const reopened = createLiveStudentOrderSession(async studentIds => { calls++; return studentIds.map(studentId => ({ studentId, completedCount: 0 })); }, () => {}, time);
  reopened.apply(rows); await flush(); assert.equal(calls, 2);
  reopened.apply([...rows, { studentId: 'p', studentName: '박학생' }]); assert.equal(time.jobs.size, 1);
  reopened.dispose(); assert.equal(time.jobs.size, 0); time.advance(60_000); await flush(); assert.equal(calls, 2);
});
