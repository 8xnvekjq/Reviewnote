import type { AdminExamApi, AdminLiveStudent } from '../contract.ts';
import { reconcileLiveStudentOrder } from './liveStudentOrder.ts';

export const LIVE_STUDENT_ORDER_THROTTLE_MS = 60_000;
interface OrderClock {
  now(): number;
  later(callback: () => void, delay: number): unknown;
  cancel(handle: unknown): void;
}
const browserClock: OrderClock = {
  now: () => Date.now(), later: (callback, delay) => setTimeout(callback, delay),
  cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Live 한 번 열기마다 독립적인 순서·카운트 스냅샷. 목록/필기 폴링을 기다리게 하지 않는다. */
export function createLiveStudentOrderSession(
  fetch: AdminExamApi['getLiveStudentOrder'], changed: () => void, clock: OrderClock = browserClock,
) {
  const counts = new Map<string, number>();
  const locked = new Set<string>();
  let previous: string[] = [], current: string[] = [];
  let lastRequest = -Infinity, pending = false, disposed = false;
  let timer: unknown;
  const request = () => {
    if (disposed || pending || timer !== undefined) return;
    const ids = current.filter(id => !counts.has(id));
    if (!ids.length) return;
    const remaining = LIVE_STUDENT_ORDER_THROTTLE_MS - (clock.now() - lastRequest);
    if (remaining > 0) {
      timer = clock.later(() => { timer = undefined; request(); }, remaining);
      return;
    }
    lastRequest = clock.now(); pending = true;
    // Promise 턴에서 호출하여 동기 예외도 이름순 대체로 처리한다.
    void Promise.resolve().then(() => fetch(ids)).then(rows => {
      if (disposed) return;
      for (const id of ids) {
        const count = rows.find(row => row.studentId === id)?.completedCount ?? 0;
        counts.set(id, Number.isFinite(count) && count >= 0 ? count : 0);
      }
    }).catch(() => {
      if (!disposed) for (const id of ids) counts.set(id, 0);
    }).finally(() => {
      pending = false;
      if (!disposed) { changed(); request(); }
    });
  };
  return {
    apply<T extends Pick<AdminLiveStudent, 'studentId' | 'studentName'>>(students: readonly T[]): T[] {
      const next = reconcileLiveStudentOrder(previous, students, counts, locked);
      previous = next.map(row => row.studentId);
      current = [...new Set(previous)];
      for (const id of current) if (counts.has(id)) locked.add(id);
      request();
      return next;
    },
    dispose() { disposed = true; if (timer !== undefined) clock.cancel(timer); },
  };
}
