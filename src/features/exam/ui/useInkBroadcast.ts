import { useEffect, useRef } from 'react';
import type { InkStroke } from '../contract';
import type { LiveChannel, LiveTransport } from '../liveTransport';
import { createInkBatcher, watching } from '../ink/inkBroadcast';

export function useInkBroadcast(transport: LiveTransport | undefined, paperId: string, attemptId: string, active: boolean) {
  const change = useRef<(questionId: string, number: number, before: InkStroke[], after: InkStroke[]) => void>(() => {});
  useEffect(() => {
    if (!transport || !active) return;
    const watchers = new Map<string, number>();
    let ink: LiveChannel | undefined, inkReady = false, disposed = false;
    const batcher = createInkBatcher(message => {
      try { if (watching(watchers, Date.now())) ink?.send('ink', message); } catch { /* exam UI stays quiet */ }
    }, { schedule: (fn, ms) => window.setTimeout(fn, ms), cancel: timer => window.clearTimeout(timer as number) }, crypto.randomUUID());
    change.current = (qid, number, before, after) => {
      if (inkReady && watching(watchers, Date.now())) batcher.change(attemptId, qid, number, before, after);
    };
    let watch: LiveChannel | undefined;
    try {
      watch = transport.open(`exam-live-watch:${paperId}`, 'watch', value => {
        if (disposed || !value || typeof value !== 'object') return;
        const m = value as { watcherId: string; state: string };
        if (typeof m.watcherId !== 'string' || m.watcherId.length > 200) return;
        if (m.state === 'watching') watchers.set(m.watcherId, Date.now());
        else if (m.state === 'stopped') watchers.delete(m.watcherId);
        else return;
        if (!watching(watchers, Date.now())) { batcher.clear(); return; }
        if (!ink) {
          try { ink = transport.open(`exam-live:${paperId}`, 'ink', () => {}, ready => { inkReady = ready; }); } catch { /* optional */ }
        }
      }, ready => { if (!ready) { watchers.clear(); batcher.clear(); } });
    } catch { /* optional */ }
    return () => { disposed = true; change.current = () => {}; batcher.clear(); watch?.close(); ink?.close(); };
  }, [transport, paperId, attemptId, active]);
  return (qid: string, number: number, before: InkStroke[], after: InkStroke[]) => change.current(qid, number, before, after);
}
