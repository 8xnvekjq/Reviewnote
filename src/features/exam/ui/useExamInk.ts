import { useEffect, useMemo, useReducer } from 'react';
import type { ExamClient } from '../contract';
import { InkSync } from './inkSync';

export function useExamInk(client: ExamClient, attemptId: string, questionIds: string[]) {
  const [, redraw] = useReducer(n => n + 1, 0);
  const ids = questionIds.join(',');
  const sync = useMemo(() => new InkSync(client, attemptId, redraw, undefined, new Set(ids.split(','))), [client, attemptId, ids]);
  useEffect(() => {
    let active = true;
    void sync.load().then(() => { if (active && sync.pending) void sync.flush({ background: true }); });
    const retry = () => {
      if (sync.status === 'conflict') return;
      if (!sync.ready) void sync.load(false, { background: true }).then(() => { if (active && sync.ready && sync.pending) void sync.flush({ background: true }); });
      else if (sync.pending) void sync.flush({ background: true });
    };
    const refresh = () => {
      if (document.hidden) { if (sync.pending) void sync.flush(); return; }
      if (sync.status === 'saved') void sync.load();
      else retry();
    };
    const timer = window.setInterval(retry, 10000);
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', refresh);
      if (sync.pending) void sync.flush();
    };
  }, [sync]);
  return sync;
}
