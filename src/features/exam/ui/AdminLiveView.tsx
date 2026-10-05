import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ExamAssistOverlay } from './ExamAssistOverlay';
import type { AdminExamApi } from '../contract';
import { ExamInkCanvas } from '../ink/ExamInkCanvas';
import { inkExtent } from '../ink/inkFit';
import { INK_IMAGE_RETRY_MS, inkImageFailed, inkImageReady, inkImageSettled, loadInkImage } from '../ink/inkImages';
import { nextImageRecovery, nextLiveFrame, type LiveFrame, type LiveImageRecovery } from './liveFrame';
import { useLiveExam, type LiveStudentView } from './useLiveExam';

const noop = () => {};
const NO_STROKES: LiveFrame['strokes'] = [];
const NO_RECOVERY: LiveImageRecovery = { url: '', failed: false, generation: 0 };

/** Image and ink switch together once the new question image is decoded (the previous frame stays meanwhile).
 *  A failed or timed-out image (loader deadline) switches anyway with a notice; later updates retry it. */
function useLiveFrame(row: LiveStudentView) {
  const incoming = useMemo<LiveFrame>(() => ({ questionId: row.questionId, number: row.number, imageUrl: row.imageUrl,
    strokes: row.ink?.strokes ?? NO_STROKES }), [row.questionId, row.number, row.imageUrl, row.ink?.strokes]);
  const [shown, setShown] = useState<LiveFrame | null>(null);
  const frame = nextLiveFrame(shown, incoming, inkImageSettled);
  if (frame !== shown) setShown(frame);
  const [, setLoaded] = useState(0);
  useEffect(() => {
    const url = incoming.imageUrl;
    if (!url || inkImageReady(url)) return;
    let alive = true, timer: number | undefined;
    const attempt = () => void loadInkImage(url).then(() => {
      if (!alive) return;
      setLoaded(n => n + 1);
      if (inkImageFailed(url)) timer = window.setTimeout(attempt, INK_IMAGE_RETRY_MS);
    });
    attempt();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [incoming.imageUrl]);
  return frame;
}

function LiveCell({ row, now, focused, wide, onOpen, transport }: { row: LiveStudentView; now: number; focused: boolean; wide: boolean; onOpen: () => void; transport?: AdminExamApi['liveTransport'] }) {
  const frame = useLiveFrame(row);
  const [pen, setPen] = useState(false);
  const [clearToken, setClearToken] = useState(0);
  const imageFailed = !!frame && inkImageFailed(frame.imageUrl);
  // A retry that succeeds after a failure remounts the canvas so its broken <img> loads again.
  const [recovery, setRecovery] = useState(NO_RECOVERY);
  const nextRecovery = nextImageRecovery(recovery, frame?.imageUrl ?? '', imageFailed);
  if (nextRecovery !== recovery) setRecovery(nextRecovery);
  // 전체 보기의 기본 버튼 접근성을 유지하고, 확대 화면에서는 입력 캔버스를 버튼 밖에 둔다.
  const CellContent = focused ? 'div' : 'button';
  return <section className="exam-live-cell" data-testid="exam-live-cell" data-attempt-id={row.attemptId}>
    <CellContent type={focused ? undefined : 'button'} className="exam-live-cell-open" aria-label={`${row.studentName} 풀이 확대`} onClick={() => { if (!focused) onOpen(); }}>
      <strong>{row.studentName} · {frame?.number ?? row.number}번</strong><span>{Math.max(0, Math.floor((now - Date.parse(row.updatedAt)) / 1000))}초 전 갱신</span>
      <div className="exam-live-canvas" data-question-id={frame?.questionId ?? ''}>
        {frame
          ? <ExamInkCanvas key={nextRecovery.generation} imageUrl={frame.imageUrl} strokes={frame.strokes} onChange={noop} tool="pen" color="#2563eb" size={3} readOnly overlay={focused ? imageWidth => <ExamAssistOverlay key={row.questionId} transport={transport} attemptId={row.attemptId} questionId={row.questionId} imageWidth={imageWidth} admin enabled={pen && frame.questionId === row.questionId} active={frame.questionId === row.questionId} clearToken={clearToken} /> : undefined} fitToInk={inkExtent(frame.strokes)} imageMaxWidth={wide ? 760 : 480} />
          : <div className="exam-live-image-pending" data-testid="exam-live-image-pending" role="status" aria-label="문항 이미지를 불러오는 중" />}
      </div>
      {imageFailed && <small className="exam-live-image-failed" data-testid="exam-live-image-failed" role="status">문항 이미지를 불러오지 못했어요 · 다시 시도 중</small>}
    </CellContent>
    {focused && <div style={{ display: 'flex', gap: 8, padding: 8 }}>
      <button type="button" className="rn-button rn-button-compact" aria-pressed={pen} onClick={() => setPen(value => !value)}>도와주기 펜</button>
      <button type="button" className="rn-button rn-button-compact" onClick={() => setClearToken(value => value + 1)}>지우기 (Clear)</button>
    </div>}
  </section>;
}
export function AdminLiveView({ api, paperId, title, onClose }: { api: AdminExamApi; paperId: string; title: string; onClose: () => void }) {
  const { students, error, loading, broadcastConnected } = useLiveExam(api, paperId);
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
      <div className="exam-admin-review-title"><strong>{title}</strong><span>Live · {students.length}명 · <span role="status" data-testid="exam-live-broadcast-status">{broadcastConnected ? '실시간 연결됨' : '폴링만 · 5초마다 갱신'}</span></span></div>
      <span className="exam-admin-review-badge">{selected ? '도와주기 가능' : '읽기 전용'}</span>
    </header>
    <div className="exam-admin-review-body">
      {loading && <p role="status">학생 풀이를 불러오는 중…</p>}
      {error && <p role="alert">갱신하지 못했어요. 잠시 뒤 자동으로 다시 시도해요.</p>}
      {!loading && !error && students.length === 0 && <p role="status">지금 풀고 있는 학생이 없어요</p>}
      <div className="exam-live-grid" style={{ '--live-columns': columns } as CSSProperties} data-focused={selected ? 'true' : 'false'}>
        {displayed.map(row => <LiveCell key={row.attemptId} row={row} now={now} focused={!!focused} wide={!!selected} transport={api.liveTransport} onOpen={() => {
          history.pushState({ ...history.state, examLive: token.current, focus: row.attemptId }, ''); setFocused(row.attemptId);
        }} />)}
      </div>
    </div>
  </div>, document.body);
}
