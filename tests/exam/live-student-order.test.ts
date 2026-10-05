import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileLiveStudentOrder, sortLiveStudents } from '../../src/features/exam/ui/liveStudentOrder.ts';

const student = (studentName: string, studentId: string, updatedAt = 0) =>
  ({ studentName, studentId, attemptId: `attempt-${studentId}`, updatedAt });
const ids = (rows: ReturnType<typeof student>[]) => sortLiveStudents(rows).map(row => row.studentId);

test('가나다순 표시, 동명이인은 학생 id순, 입력 배열과 행은 보존한다', () => {
  const rows = [student('이학생', 'i'), student('김학생', 'b'), student('박학생', 'p'), student('김학생', 'a')];
  const before = [...rows];
  Object.freeze(rows);
  rows.forEach(Object.freeze);
  const sorted = sortLiveStudents(rows);
  assert.deepEqual(sorted.map(row => row.studentId), ['a', 'b', 'p', 'i']);
  assert.deepEqual(rows, before);
  assert.equal(sorted[0], rows[3]);
  assert.notEqual(sorted, rows);
  assert.deepEqual(sortLiveStudents([]), []);
});

test('서버의 최근 활동 정렬이 매번 바뀌어도 학생 표시 순서는 고정된다', () => {
  const rows = [student('이학생', 'i', 1), student('김학생', 'k', 2), student('박학생', 'p', 3)];
  const expected = ['k', 'p', 'i'];
  for (let n = 0; n < 12; n++) {
    rows[n % rows.length] = { ...rows[n % rows.length], updatedAt: n + 10 };
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    assert.deepEqual(ids(rows), expected);
  }
});

test('신규 학생은 이름 위치에 삽입, 이탈 전까지 기존 학생의 상대 순서와 확대 대상 id를 유지한다', () => {
  const rows = [student('이학생', 'i'), student('김학생', 'k')];
  const focused = rows[0].attemptId;
  const added = [...rows, student('박학생', 'p')];
  assert.deepEqual(ids(added), ['k', 'p', 'i']);
  assert.deepEqual(sortLiveStudents(added).filter(row => row.studentId !== 'p'), sortLiveStudents(rows));
  assert.equal(sortLiveStudents(added).find(row => row.attemptId === focused), rows[0]);
  // 10분 만료 판정과 최근 활동 12명 제한은 서버가 맡는다. 전달된 구성원만 정렬한다.
  assert.deepEqual(ids(added.filter(row => row.studentId !== 'k')), ['p', 'i']);
});

test('표시 이름이 같거나 빈 경우에도 서버 입력 순서와 무관한 학생 id순이다', () => {
  const rows = [student('', 'z'), student('', 'a'), student('김학생', 'b'), student('김학생', 'a')];
  assert.deepEqual(ids(rows), ['a', 'z', 'a', 'b']);
  assert.deepEqual(ids([...rows].reverse()), ids(rows));
});

const counts = new Map([['k', 10], ['i', 30], ['p', 20]]);
test('누적 복습 완료 수 내림차순과 이름·id 동점 처리', () => {
  const rows = [student('김학생', 'k'), student('이학생', 'i'), student('박학생', 'p')];
  assert.deepEqual(sortLiveStudents(rows, counts).map(row => row.studentId), ['i', 'p', 'k']);
  assert.deepEqual(sortLiveStudents(rows, new Map([['k', 5], ['i', 5], ['p', 5]])).map(row => row.studentId), ['k', 'p', 'i']);
  assert.deepEqual(sortLiveStudents([student('김학생', 'b'), student('김학생', 'a')], new Map([['a', 1], ['b', 1]])).map(row => row.studentId), ['a', 'b']);
});
test('확정 뒤 기존 순서 유지와 신규 삽입', () => {
  const rows = [student('김학생', 'k'), student('이학생', 'i'), student('박학생', 'p')];
  const changed = new Map([['k', 100], ['i', 0], ['p', 20]]);
  const next = reconcileLiveStudentOrder(['i', 'k'], rows, changed, new Set(['i', 'k']));
  assert.deepEqual(next.map(row => row.studentId), ['p', 'i', 'k']);
  assert.deepEqual(next.filter(row => row.studentId !== 'p').map(row => row.studentId), ['i', 'k']);
  assert.deepEqual(reconcileLiveStudentOrder(['i', 'p', 'k'], [rows[0], rows[2]], counts, new Set(['i', 'p', 'k'])).map(row => row.studentId), ['p', 'k']);
});
test('초기 카운트 응답 한 번 정렬', () => {
  const rows = [student('김학생', 'k'), student('이학생', 'i')];
  assert.deepEqual(reconcileLiveStudentOrder(['k', 'i'], rows, counts, new Set()).map(row => row.studentId), ['i', 'k']);
  const newCounts = new Map([['k', 100], ['i', 0]]);
  assert.deepEqual(reconcileLiveStudentOrder(['i', 'k'], rows, newCounts, new Set(['i', 'k'])).map(row => row.studentId), ['i', 'k']);
});
