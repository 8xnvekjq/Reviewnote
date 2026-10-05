import { useEffect, useRef } from 'react';
import type { InkStroke } from '../contract';
import type { LiveChannel, LiveTransport } from '../liveTransport';
import { createInkBatcher, watching } from '../ink/inkBroadcast';

export interface InkBroadcast {
  focus(questionId: string, number: number, imageUrl?: string): void;
  /** `eventId`: the InkSync edit this change was recorded as (undefined = not saved to the server). */
  change(questionId: string, number: number, before: InkStroke[], after: InkStroke[], eventId?: string, imageUrl?: string): void;
  /** InkSync.onSaved: a save of the question at `revision` contained these edits. */
  saved(questionId: string, revision: number, eventIds: string[]): void;
}

export function useInkBroadcast(transport: LiveTransport | undefined, paperId: string, attemptId: string, active: boolean): InkBroadcast {
  const current = useRef<InkBroadcast>({ change() {}, saved() {}, focus() {} });
  const stable = useRef<InkBroadcast>({
    focus: (...args) => current.current.focus(...args),
    change: (...args) => current.current.change(...args),
    saved: (...args) => current.current.saved(...args),
  });
  const focus = useRef<{ questionId: string; number: number; imageUrl?: string } | undefined>(undefined);
  useEffect(() => {
    if (!transport || !active) return;
    const watchers = new Map<string, number>();
    let ink: LiveChannel | undefined, inkReady = false, disposed = false;
    const batcher = createInkBatcher(message => {
      try { if (watching(watchers, Date.now())) ink?.send('ink', message); } catch { /* exam UI stays quiet */ }
    }, { schedule: (fn, ms) => window.setTimeout(fn, ms), cancel: timer => window.clearTimeout(timer as number) }, crypto.randomUUID());
    const live = () => inkReady && watching(watchers, Date.now());
    const announceFocus = () => {
      if (live() && focus.current) batcher.focus(attemptId, focus.current.questionId, focus.current.number, focus.current.imageUrl);
    };
    current.current = {
      focus(questionId, number, imageUrl) { focus.current = { questionId, number, imageUrl }; announceFocus(); },
      change(qid, number, before, after, eventId, imageUrl) { if (live()) batcher.change(attemptId, qid, number, before, after, eventId, imageUrl); },
      saved(qid, revision, eventIds) { if (live()) batcher.saved(attemptId, qid, revision, eventIds); },
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
          try { ink = transport.open(`exam-live:${paperId}`, 'ink', () => {}, ready => { inkReady = ready; announceFocus(); }); } catch { /* optional */ }
        } else announceFocus();
      }, ready => { if (!ready) { watchers.clear(); batcher.clear(); } });
    } catch { /* optional */ }
    return () => { disposed = true; current.current = { change() {}, saved() {}, focus() {} }; batcher.clear(); watch?.close(); ink?.close(); };
  }, [transport, paperId, attemptId, active]);
  return stable.current;
}
