import type { AdminPaperSubmission, InkReplayData } from '../contract.ts';
import { buildInkClock, buildInkTimeline } from '../ink/inkReplay.ts';

export const compareColumns = (width: number) => width >= 1180 ? 3 : width >= 700 ? 2 : 1;
export const restartCompare = (question: number) => ({ question, time: 0, playing: true });
export const advanceCompare = (time: number, elapsed: number, speed: number, total: number) =>
  Math.min(total, Math.max(0, time + Math.max(0, elapsed) * speed));
export const compareCellProgress = (time: number, duration: number) => ({
  time: Math.min(Math.max(0, time), duration), finished: duration === 0 || time >= duration,
});
export const compareReplayClock = (data: InkReplayData) => buildInkClock(buildInkTimeline(data));

/** 같은 학생의 최근 제출만 비교 후보로 남긴다. */
export function latestSubmissions(rows: AdminPaperSubmission[]) {
  const latest = new Map<string, AdminPaperSubmission>();
  for (const row of rows) {
    if (!row.submittedAt) continue;
    const old = latest.get(row.studentId);
    if (!old || row.submittedAt > old.submittedAt || (row.submittedAt === old.submittedAt && row.attemptId > old.attemptId)) latest.set(row.studentId, row);
  }
  return [...latest.values()];
}

/** 동시 요청 수를 제한하고 실패한 요청은 캐시에서 빼 재시도할 수 있게 한다. */
export function createCompareReplayLoader(fetch: (attemptId: string, questionId: string) => Promise<InkReplayData>) {
  const cache = new Map<string, Promise<InkReplayData>>();
  const queue: Array<() => void> = [];
  let active = 0;
  const run = () => {
    while (active < 4 && queue.length) { active++; queue.shift()!(); }
  };
  return (attemptId: string, questionId: string) => {
    const key = `${attemptId}:${questionId}`;
    const old = cache.get(key);
    if (old) return old;
    const promise = new Promise<InkReplayData>((resolve, reject) => {
      queue.push(() => {
        void Promise.resolve().then(() => fetch(attemptId, questionId)).then(resolve, error => {
          cache.delete(key); reject(error);
        }).finally(() => { active--; run(); });
      });
    });
    cache.set(key, promise); run();
    return promise;
  };
}
