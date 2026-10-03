import { useEffect, useState } from 'react';
import type { AdminExamApi, AdminLiveStudent } from '../contract';
import { applyLiveInk, type LiveInkState } from '../ink/inkLive';
import { browserPollEnvironment, startLivePolling } from './livePolling';
import { acceptLiveSequence, applyBroadcast, parseLiveInk, reconcileLiveView, WATCH_INTERVAL_MS } from '../ink/inkBroadcast';
import type { LiveChannel } from '../liveTransport';

export type LiveStudentView = AdminLiveStudent & { ink: LiveInkState | null };
export function useLiveExam(api: AdminExamApi, paperId: string) {
  const [students, setStudents] = useState<LiveStudentView[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    let previous = new Map<string, LiveStudentView>();
    // Only RPC results enter this map: optimistic strokes must never become a delta baseline.
    const sequences = new Map<string, number>();
    const watcherId = crypto.randomUUID();
    let watch: LiveChannel | undefined, broadcast: LiveChannel | undefined, watchReady = false, broadcastReady = false;
    const signal = (state: 'watching' | 'stopped') => watch?.send('watch', { watcherId, state });
    const visible = () => { if (watchReady) signal(document.hidden || !broadcastReady ? 'stopped' : 'watching'); };
    try {
      broadcast = api.liveTransport?.open(`exam-live:${paperId}`, 'ink', value => {
        if (!alive || document.hidden) return;
        const message = parseLiveInk(value);
        if (!message || !previous.has(message.attemptId)) return;
        if (!acceptLiveSequence(sequences, message)) return;
        setStudents(rows => rows.map(row => {
          if (row.attemptId !== message.attemptId) return row;
          const same = row.questionId === message.questionId;
          return { ...row, questionId: message.questionId, number: message.number,
            imageUrl: same ? row.imageUrl : '', updatedAt: new Date().toISOString(),
            ink: { revision: same ? row.ink?.revision ?? 0 : 0,
              strokes: applyBroadcast(same ? row.ink?.strokes ?? [] : [], message) } };
        }));
      }, ready => { broadcastReady = ready; queueMicrotask(() => { if (alive) visible(); }); });
      watch = api.liveTransport?.open(`exam-live-watch:${paperId}`, 'watch', () => {}, ready => {
        watchReady = ready;
        // Defer to allow even synchronous test transports to return their channel handle.
        if (ready) queueMicrotask(() => { if (alive) visible(); });
      });
    } catch { /* Realtime is optional; keep the unchanged polling loop. */ }
    const heartbeat = window.setInterval(() => { if (watchReady && broadcastReady && !document.hidden) signal('watching'); }, WATCH_INTERVAL_MS);
    document.addEventListener('visibilitychange', visible);
    setStudents([]); setLoading(true); setError(false);
    const stop = startLivePolling(async () => {
      try {
        const rows = (await api.getLiveExam(paperId)).slice(0, 12);
        if (!alive || document.hidden) return;
        const next: LiveStudentView[] = [];
        const refreshed = new Set<string>();
        // Sequential requests bound peak load on the small DB instance.
        for (const row of rows) {
          if (!alive || document.hidden) return;
          const old = previous.get(row.attemptId);
          let ink = old?.questionId === row.questionId ? old.ink : null;
          if (!ink || ink.revision !== row.revision) {
            refreshed.add(row.attemptId);
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
        if (alive) {
          setStudents(current => {
            const views = new Map(current.map(row => [row.attemptId, row]));
            return next.map(row => reconcileLiveView(row, views.get(row.attemptId), refreshed.has(row.attemptId)));
          });
          setLoading(false); setError(false);
        }
      } catch (err) { if (alive) { setError(true); setLoading(false); } throw err; }
    }, browserPollEnvironment);
    return () => {
      alive = false; stop(); signal('stopped');
      window.clearInterval(heartbeat); document.removeEventListener('visibilitychange', visible);
      watch?.close(); broadcast?.close();
    };
  }, [api, paperId]);
  return { students, error, loading };
}
