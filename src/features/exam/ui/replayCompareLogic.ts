import type { AdminPaperSubmission, InkReplayData } from '../contract.ts';
import { inkExtent, replayStrokeLists, type InkExtent } from '../ink/inkFit.ts';
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


/** 화면 방향과 최소 너비에 맞춰 같은 크기의 칸을 고른다. */
export function compareGridShape(count: number, width: number, height: number) {
  const columns = width <= 640 ? 1 : Math.min(Math.max(1, count), width < height ? 2 : count === 4 ? 2 : 3, Math.max(1, Math.floor(width / 220)));
  return { columns, rows: Math.ceil(count / columns) || 1 };
}
/** 지운 획도 포함해 모든 학생과 문항 이미지의 범위를 합친다. */
export function sharedCompareFit(data: InkReplayData[], aspect = 0): InkExtent {
  const extent = inkExtent(...data.flatMap(replayStrokeLists));
  return { maxX: Math.max(1, extent.maxX), maxY: Math.max(aspect, extent.maxY) };
}
export function comparePrefetchOrder(numbers: number[], current: number) {
  const index = numbers.indexOf(current);
  return index < 0 ? [] : [numbers[index + 1], numbers[index - 1]].filter((n): n is number => n !== undefined);
}
/** 현재 문항을 우선하고, 완료한 요청은 재사용하며 실패한 요청은 다시 시도한다. */
export function createCompareReplayLoader(fetch: (attemptId: string, questionId: string) => Promise<InkReplayData>) {
  type Job = { key: string; background: boolean; run: () => void; reject: (error: Error) => void };
  const cache = new Map<string, Promise<InkReplayData>>();
  const ready = new Map<string, InkReplayData>();
  const queue: Job[] = [];
  let active = 0;
  const run = () => {
    queue.sort((a, b) => Number(a.background) - Number(b.background));
    while (active < 4 && queue.length) { active++; queue.shift()!.run(); }
  };
  const load = (attemptId: string, questionId: string, background = false) => {
    const key = `${attemptId}:${questionId}`;
    const old = cache.get(key);
    if (old) {
      const job = queue.find(value => value.key === key);
      if (job && !background) job.background = false;
      return old;
    }
    const promise = new Promise<InkReplayData>((resolve, reject) => {
      queue.push({ key, background, reject, run: () => {
        void Promise.resolve().then(() => fetch(attemptId, questionId)).then(data => {
          ready.set(key, data); resolve(data);
        }, error => { cache.delete(key); reject(error); }).finally(() => { active--; run(); });
      } });
    });
    cache.set(key, promise); run();
    return promise;
  };
  return Object.assign(load, {
    peek: (a: string, q: string) => ready.get(`${a}:${q}`),
    prioritize: (requests: Array<{ attemptId: string; questionId: string }>) => {
      const keys = new Set(requests.map(({ attemptId, questionId }) => `${attemptId}:${questionId}`));
      for (const job of queue) job.background = !keys.has(job.key);
    },
    clearPrefetch: () => {
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].background) {
        const [job] = queue.splice(i, 1); cache.delete(job.key); job.reject(new Error('AbortError'));
      }
    },
  });
}
