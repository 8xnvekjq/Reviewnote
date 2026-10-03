import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { AdminExamApi } from '../contract';
import { ExamInkCanvas } from '../ink/ExamInkCanvas';
import { inkExtent } from '../ink/inkFit';
import { useLiveExam } from './useLiveExam';

const noop = () => {};
export function AdminLiveView({ api, paperId, title, onClose }: { api: AdminExamApi; paperId: string; title: string; onClose: () => void }) {
  const { students, error, loading } = useLiveExam(api, paperId);
  const [focused, setFocused] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const token = useRef(crypto.randomUUID());
  const lifecycle = useRef({ active: false });
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const historyToken = token.current;
    const lifecycleState = lifecycle.current;
    lifecycleState.active = true;
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    if (history.state?.examLive !== historyToken) history.pushState({ ...history.state, examLive: historyToken, focus: null }, '');
    const pop = () => {
      if (history.state?.examLive === historyToken) setFocused(history.state.focus ?? null);
      else closeRef.current();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); history.back(); }
      if (event.key === 'Tab') {
        const dialog = backRef.current?.closest('[role="dialog"]');
        const buttons = dialog?.querySelectorAll<HTMLButtonElement>('button');
        const first = buttons?.[0], last = buttons?.[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    backRef.current?.focus();
    window.addEventListener('popstate', pop); window.addEventListener('keydown', key);
    const clock = window.setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('popstate', pop); window.removeEventListener('keydown', key);
      window.clearInterval(clock); previousFocus?.focus();
      lifecycleState.active = false;
      // Defer navigation so StrictMode's immediate effect replay keeps a single history entry.
      queueMicrotask(() => {
        if (!lifecycleState.active && history.state?.examLive === historyToken) history.go(history.state.focus ? -2 : -1);
      });
    };
  }, []);
  const selected = students.find(row => row.attemptId === focused);
  useEffect(() => {
    if (!loading && !error && focused && !selected) history.back();
  }, [loading, error, focused, selected]);
  const displayed = selected ? [selected] : students;
  const columns = selected ? 1 : students.length <= 3 ? Math.max(1, students.length) : students.length <= 8 ? 3 : 4;
  return createPortal(<div className="rn-app exam-practice exam-admin-review exam-live-view" role="dialog" aria-modal="true" aria-label={`${title} Live 보기`} data-testid="exam-live-view">
    <header className="exam-admin-review-bar">
      <button ref={backRef} type="button" className="rn-button rn-button-compact" onClick={() => history.back()}>← {focused ? '전체 보기' : '닫기'}</button>
      <div className="exam-admin-review-title"><strong>{title}</strong><span>Live · {students.length}명 · 5초마다 갱신</span></div>
      <span className="exam-admin-review-badge">읽기 전용</span>
    </header>
    <div className="exam-admin-review-body">
      {loading && <p role="status">학생 풀이를 불러오는 중…</p>}
      {error && <p role="alert">갱신하지 못했어요. 잠시 뒤 자동으로 다시 시도해요.</p>}
      {!loading && !error && students.length === 0 && <p role="status">지금 풀고 있는 학생이 없어요</p>}
      <div className="exam-live-grid" style={{ '--live-columns': columns } as CSSProperties} data-focused={selected ? 'true' : 'false'}>
        {displayed.map(row => <section className="exam-live-cell" key={row.attemptId} data-testid="exam-live-cell" data-attempt-id={row.attemptId}>
          <button type="button" className="exam-live-cell-open" aria-label={`${row.studentName} 풀이 확대`} onClick={() => {
            if (focused) return;
            history.pushState({ ...history.state, examLive: token.current, focus: row.attemptId }, ''); setFocused(row.attemptId);
          }}>
            <strong>{row.studentName} · {row.number}번</strong><span>{Math.max(0, Math.floor((now - Date.parse(row.updatedAt)) / 1000))}초 전 갱신</span>
            <div className="exam-live-canvas">
              <ExamInkCanvas imageUrl={row.imageUrl} strokes={row.ink?.strokes ?? []} onChange={noop} tool="pen" color="#2563eb" size={3} readOnly fitToInk={inkExtent(row.ink?.strokes)} imageMaxWidth={selected ? 760 : 480} />
            </div>
          </button>
        </section>)}
      </div>
    </div>
  </div>, document.body);
}
