import { useEffect, useState } from 'react';
import type { AdminExamApi, AdminLiveStudent } from '../contract';
import { applyLiveInk, type LiveInkState } from '../ink/inkLive';
import { preloadInkImages } from '../ink/inkImages';
import { browserPollEnvironment, startLivePolling } from './livePolling';
import {
  acceptLiveSequence, addLiveHint, composeLiveView, liveSequenceGap, parseLiveInk, pruneLiveHints, vanishedStrokes, WATCH_INTERVAL_MS,
  type LiveHintEntry,
} from '../ink/inkBroadcast';
import type { LiveChannel } from '../liveTransport';

export type LiveStudentView = AdminLiveStudent & { ink: LiveInkState | null };
/** Admin-console only: `window.__examLiveStats` and `[exam-live]` console lines. */
export interface LiveDiagnostics { messages: number; sequenceGaps: number; vanishedOnPoll: number }
const INK_CACHE_MAX = 240;

export function useLiveExam(api: AdminExamApi, paperId: string) {
  const [students, setStudents] = useState<LiveStudentView[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [broadcastConnected, setBroadcastConnected] = useState(false);
  useEffect(() => {
    setBroadcastConnected(false);
    let alive = true;
    // Poll results only. Broadcasts live in `hints` and are replayed on top, so a server
    // snapshot taken before the student's 5-second save can never erase newer strokes.
    let server: LiveStudentView[] = [];
    let attempts = new Set<string>();
    const hints = new Map<string, LiveHintEntry[]>();
    // RPC results only (never optimistic strokes): per question delta baselines and switch-back bases.
    const inkCache = new Map<string, LiveInkState>();
    const images = new Map<string, string>();
    const questionsLoaded = new Set<string>();
    const sequences = new Map<string, number>();
    const stats: LiveDiagnostics = { messages: 0, sequenceGaps: 0, vanishedOnPoll: 0 };
    (window as unknown as { __examLiveStats?: LiveDiagnostics }).__examLiveStats = stats;
    let shown = new Map<string, LiveStudentView>();
    const inkKey = (attemptId: string, questionId: string) => `${attemptId}:${questionId}`;
    const remember = (attemptId: string, questionId: string, ink: LiveInkState) => {
      const key = inkKey(attemptId, questionId);
      inkCache.delete(key); inkCache.set(key, ink);
      if (inkCache.size > INK_CACHE_MAX) inkCache.delete(inkCache.keys().next().value!);
    };
    const publish = (fromPoll: boolean) => {
      const views = server.map(row => composeLiveView(row, hints.get(row.attemptId),
        questionId => inkCache.get(inkKey(row.attemptId, questionId)), questionId => images.get(questionId)));
      if (fromPoll) {
        let vanished = 0;
        for (const view of views) {
          const before = shown.get(view.attemptId);
          if (before?.questionId === view.questionId) vanished += vanishedStrokes(before.ink?.strokes, view.ink?.strokes);
        }
        if (vanished) {
          stats.vanishedOnPoll += vanished;
          console.info(`[exam-live] 폴링 정본 교체로 사라진 획 ${vanished}개 (누적 ${stats.vanishedOnPoll})`);
        }
      }
      shown = new Map(views.map(view => [view.attemptId, view]));
      setStudents(views);
    };
    // Every question image of the paper, so a question switch never waits for a download.
    const loadQuestions = async (attemptId: string) => {
      if (questionsLoaded.has(attemptId) || questionsLoaded.size >= 12) return;
      questionsLoaded.add(attemptId);
      try {
        const attempt = await api.getAttempt(attemptId);
        if (!alive) return;
        for (const question of attempt?.questions ?? []) images.set(question.id, question.imageUrl);
        preloadInkImages([...images.values()]);
        publish(false);
      } catch { /* the polled imageUrl still arrives every five seconds */ }
    };
    let watch: LiveChannel | undefined, broadcast: LiveChannel | undefined, watchReady = false, broadcastReady = false;
    const watcherId = crypto.randomUUID();
    const signal = (state: 'watching' | 'stopped') => watch?.send('watch', { watcherId, state });
    const visible = () => { if (watchReady) signal(document.hidden || !broadcastReady ? 'stopped' : 'watching'); };
    try {
      broadcast = api.liveTransport?.open(`exam-live:${paperId}`, 'ink', value => {
        if (!alive || document.hidden) return;
        const message = parseLiveInk(value);
        if (!message || !attempts.has(message.attemptId)) return;
        const gap = liveSequenceGap(sequences, message);
        if (!acceptLiveSequence(sequences, message)) return;
        stats.messages++;
        if (gap) {
          stats.sequenceGaps += gap;
          console.info(`[exam-live] 방송 순번 공백 ${gap}개 (누적 ${stats.sequenceGaps}/${stats.messages + stats.sequenceGaps})`);
        }
        hints.set(message.attemptId, addLiveHint(hints.get(message.attemptId), message, Date.now()));
        if (!images.has(message.questionId)) void loadQuestions(message.attemptId);
        publish(false);
      }, ready => {
        broadcastReady = ready;
        if (alive) setBroadcastConnected(watchReady && broadcastReady);
        queueMicrotask(() => { if (alive) visible(); });
      });
      watch = api.liveTransport?.open(`exam-live-watch:${paperId}`, 'watch', () => {}, ready => {
        watchReady = ready;
        if (alive) setBroadcastConnected(watchReady && broadcastReady);
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
        // Sequential requests bound peak load on the small DB instance.
        for (const row of rows) {
          if (!alive || document.hidden) return;
          if (row.imageUrl) images.set(row.questionId, row.imageUrl);
          let ink = inkCache.get(inkKey(row.attemptId, row.questionId)) ?? null;
          if (!ink || ink.revision !== row.revision) {
            const response = await api.getLiveInk(row.attemptId, row.questionId, ink?.revision ?? null);
            if (!alive || document.hidden) return;
            const applied = applyLiveInk(ink, response);
            ink = applied ?? applyLiveInk(null, await api.getLiveInk(row.attemptId, row.questionId, null));
            if (!alive || document.hidden) return;
            if (!ink) throw new Error('LIVE_INK_GAP');
            remember(row.attemptId, row.questionId, ink);
          }
          next.push({ ...row, ink });
        }
        server = next;
        attempts = new Set(next.map(row => row.attemptId));
        const now = Date.now();
        for (const [attemptId, log] of hints) {
          const pruned = attempts.has(attemptId)
            ? pruneLiveHints(log, questionId => inkCache.get(inkKey(attemptId, questionId))?.strokes, now) : [];
          if (pruned.length) hints.set(attemptId, pruned); else hints.delete(attemptId);
        }
        preloadInkImages(next.map(row => row.imageUrl));
        if (next[0] && !questionsLoaded.size) void loadQuestions(next[0].attemptId);
        if (alive) {
          publish(true);
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
  return { students, error, loading, broadcastConnected };
}
