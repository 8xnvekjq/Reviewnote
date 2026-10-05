import type { AdminLiveStudent } from '../contract.ts';

type Student = Pick<AdminLiveStudent, 'studentName' | 'studentId'>;

/** 누적 복습 완료 수 내림차순, 동점은 가나다순 → 학생 id순. 미조회·실패는 0으로 취급한다. */
export function compareLiveStudents(a: Student, b: Student, counts: ReadonlyMap<string, number>): number {
  return (counts.get(b.studentId) ?? 0) - (counts.get(a.studentId) ?? 0)
    || a.studentName.localeCompare(b.studentName, 'ko')
    || (a.studentId < b.studentId ? -1 : a.studentId > b.studentId ? 1 : 0);
}

export function sortLiveStudents<T extends Student>(students: readonly T[], counts: ReadonlyMap<string, number> = new Map()): T[] {
  return [...students].sort((a, b) => compareLiveStudents(a, b, counts));
}

/** 확정된 기존 학생의 상대 순서를 유지하고, 미확정 학생만 자기 위치에 삽입한다. */
export function reconcileLiveStudentOrder<T extends Student>(
  previous: readonly string[], students: readonly T[], counts: ReadonlyMap<string, number>, locked: ReadonlySet<string>,
): T[] {
  const byId = new Map(students.map(row => [row.studentId, row]));
  const result = previous.filter(id => locked.has(id) && byId.has(id)).map(id => byId.get(id)!);
  const retained = new Set(result.map(row => row.studentId));
  for (const row of sortLiveStudents(students.filter(row => !retained.has(row.studentId)), counts)) {
    const position = result.findIndex(other => compareLiveStudents(row, other, counts) < 0);
    result.splice(position < 0 ? result.length : position, 0, row);
  }
  return result;
}
