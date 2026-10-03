export interface PollEnvironment {
  hidden(): boolean;
  schedule(callback: () => void, ms: number): unknown;
  cancel(timer: unknown): void;
  subscribe(callback: () => void): () => void;
}
export const pollBackoff = (failures: number, interval = 5000) => Math.min(60000, interval * 2 ** Math.min(failures, 4));

/** One request chain at a time, even when visibility changes during an in-flight request. */
export function startLivePolling(task: () => Promise<void>, env: PollEnvironment, interval = 5000) {
  let stopped = false, running = false, failures = 0;
  let timer: unknown;
  const clear = () => { if (timer !== undefined) env.cancel(timer); timer = undefined; };
  const run = async () => {
    clear();
    if (stopped || running || env.hidden()) return;
    running = true;
    try { await task(); failures = 0; } catch { failures++; }
    finally {
      running = false;
      if (!stopped && !env.hidden()) timer = env.schedule(() => { void run(); }, pollBackoff(failures, interval));
    }
  };
  const unsubscribe = env.subscribe(() => { clear(); if (!env.hidden()) void run(); });
  void run();
  return () => { stopped = true; clear(); unsubscribe(); };
}

export const browserPollEnvironment: PollEnvironment = {
  hidden: () => document.hidden,
  schedule: (callback, ms) => window.setTimeout(callback, ms),
  cancel: timer => window.clearTimeout(timer as number),
  subscribe: callback => {
    document.addEventListener('visibilitychange', callback);
    return () => document.removeEventListener('visibilitychange', callback);
  },
};
