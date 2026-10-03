import { useEffect, useState } from 'react';
import type { AdminExamApi, AdminLiveStudent } from '../contract';
import { applyLiveInk, type LiveInkState } from '../ink/inkLive';
import { preloadInkImages } from '../ink/inkImages';
import { browserPollEnvironment, startLivePolling } from './livePolling';
import {
  acceptLiveSequence, composeLiveView, liveSequenceGap, parseLiveInk, parseLiveSaved, receiveLiveInk, receiveLiveSaved,
  settleLiveHints, trustedLiveImage, vanishedStrokes, WATCH_INTERVAL_MS, type LiveHints, type LiveSequenceState,
} from '../ink/inkBroadcast';
import type { LiveChannel } from '../liveTransport';

export type LiveStudentView = AdminLiveStudent & { ink: LiveInkState | null };
/** Admin-console only: `window.__examLiveStats` and `[exam-live]` console lines.
 *  `lateMessages` arrived after a later sequence (accepted, replayed in order); gaps minus late ≈ really lost. */
export interface LiveDiagnostics { messages: number; savedSignals: number; sequenceGaps: number; lateMessages: number; vanishedOnPoll: number }
const INK_CACHE_MAX = 240;
/** Broadcasts of attempts the poll has not listed yet (first load, list changes) are kept for this many attempts. */
const HINT_ATTEMPTS_MAX = 24;

export function useLiveExam(api: AdminExamApi, paperId: string) {
  const [students, setStudents] = useState<LiveStudentView[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [broadcastConnected, setBroadcastConnected] = useState(false);
  useEffect(() => {
    setBroadcastConnected(false);
    let alive = true;
    // Poll results only. Broadcasts live in `hints` and are replayed on top, so a server snapshot taken
    // before the student's 5-second save can never erase newer strokes. Hints leave only on a save signal or TTL.
    let server: LiveStudentView[] = [];
    const hints = new Map<string, LiveHints>();
    // RPC results only (never optimistic strokes): per question delta baselines and switch-back bases.
    const inkCache = new Map<string, LiveInkState>();
    // Question images from polls and from validated broadcast paths of this paper. No extra DB request.
    const images = new Map<string, string>();
    const sequences = new Map<string, LiveSequenceState>();
    const stats: LiveDiagnostics = { messages: 0, savedSignals: 0, sequenceGaps: 0, lateMessages: 0, vanishedOnPoll: 0 };
    (window as unknown as { __examLiveStats?: LiveDiagnostics }).__examLiveStats = stats;
    let shown = new Map<string, LiveStudentView>();
    const inkKey = (attemptId: string, questionId: string) => `${attemptId}:${questionId}`;
    const remember = (attemptId: string, questionId: string, ink: LiveInkState) => {
      const key = inkKey(attemptId, questionId);
      inkCache.delete(key); inkCache.set(key, ink);
      if (inkCache.size > INK_CACHE_MAX) inkCache.delete(inkCache.keys().next().value!);
    };
    const settle = (attemptId: string, now: number) => {
      const state = hints.get(attemptId);
      if (!state) return;
      const row = server.find(item => item.attemptId === attemptId);
      // A sequential poll fills the cache before publishing its rows. For the shown question,
      // confirm against the published canon, which composeLiveView actually replays hints on.
      const next = settleLiveHints(state, questionId => questionId === row?.questionId
        ? row.ink?.revision : inkCache.get(inkKey(attemptId, questionId))?.revision, now, row?.questionId);
      // Attempts the poll no longer lists keep only what can still be shown once they reappear.
      if (next && (row || next.log.length || next.saved.length)) hints.set(attemptId, next); else hints.delete(attemptId);
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
    let watch: LiveChannel | undefined, broadcast: LiveChannel | undefined, watchReady = false, broadcastReady = false;
    const watcherId = crypto.randomUUID();
    const signal = (state: 'watching' | 'stopped') => watch?.send('watch', { watcherId, state });
    const visible = () => { if (watchReady) signal(document.hidden || !broadcastReady ? 'stopped' : 'watching'); };
    try {
      broadcast = api.liveTransport?.open(`exam-live:${paperId}`, 'ink', value => {
        if (!alive || document.hidden) return;
        const message = parseLiveInk(value) ?? parseLiveSaved(value);
        if (!message) return;
        const known = hints.has(message.attemptId) || server.some(row => row.attemptId === message.attemptId);
        if (!known && hints.size >= HINT_ATTEMPTS_MAX) return;
        const gap = liveSequenceGap(sequences, message);
        const late = (sequences.get(`${message.attemptId}:${message.sessionId}`)?.max ?? 0) > message.sequence;
        if (!acceptLiveSequence(sequences, message)) return;
        stats.messages++;
        if (late) stats.lateMessages++;
        if (gap) {
          stats.sequenceGaps += gap;
          console.info(`[exam-live] 방송 순번 공백 ${gap}개 (누적 ${stats.sequenceGaps}, 늦게 도착 ${stats.lateMessages}, 받은 ${stats.messages})`);
        }
        const now = Date.now();
        if ('kind' in message) {
          stats.savedSignals++;
          hints.set(message.attemptId, receiveLiveSaved(hints.get(message.attemptId), message, now));
          // The poll may already hold that revision.
          settle(message.attemptId, now);
        } else {
          const imageUrl = trustedLiveImage(paperId, message.imageUrl);
          if (imageUrl) images.set(message.questionId, imageUrl);
          hints.set(message.attemptId, receiveLiveInk(hints.get(message.attemptId), { ...message, imageUrl }, now));
        }
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
        const now = Date.now();
        for (const attemptId of [...hints.keys()]) settle(attemptId, now);
        preloadInkImages(next.map(row => row.imageUrl));
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
