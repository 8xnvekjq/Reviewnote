import { useEffect, useState } from 'react';
import type { AdminExamApi, AdminLiveStudent } from '../contract';
import { applyLiveInk, type LiveInkState } from '../ink/inkLive';
import { browserPollEnvironment, startLivePolling } from './livePolling';

export type LiveStudentView = AdminLiveStudent & { ink: LiveInkState | null };
export function useLiveExam(api: AdminExamApi, paperId: string) {
  const [students, setStudents] = useState<LiveStudentView[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    let previous = new Map<string, LiveStudentView>();
    setStudents([]); setLoading(true); setError(false);
    const stop = startLivePolling(async () => {
      try {
        const rows = (await api.getLiveExam(paperId)).slice(0, 12);
        if (!alive || document.hidden) return;
        const next: LiveStudentView[] = [];
        // Sequential requests bound peak load on the small DB instance.
        for (const row of rows) {
          if (!alive || document.hidden) return;
          const old = previous.get(row.attemptId);
          let ink = old?.questionId === row.questionId ? old.ink : null;
          if (!ink || ink.revision !== row.revision) {
            const response = await api.getLiveInk(row.attemptId, row.questionId, ink?.revision ?? null);
            if (!alive || document.hidden) return;
            const applied = applyLiveInk(ink, response);
            ink = applied ?? applyLiveInk(null, await api.getLiveInk(row.attemptId, row.questionId, null));
            if (!alive || document.hidden) return;
            if (!ink) throw new Error('LIVE_INK_GAP');
          }
          const updated = { ...row, ink };
          next.push(updated);
          previous.set(row.attemptId, updated);
        }
        previous = new Map(next.map(row => [row.attemptId, row]));
        if (alive) { setStudents(next); setLoading(false); setError(false); }
      } catch (err) { if (alive) { setError(true); setLoading(false); } throw err; }
    }, browserPollEnvironment);
    return () => { alive = false; stop(); };
  }, [api, paperId]);
  return { students, error, loading };
}
