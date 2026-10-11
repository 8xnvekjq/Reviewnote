import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { InkReplayData, PeerSolution, PeerSolutionCandidate } from '../contract';
import { ExamInkReplay } from '../ink/ExamInkReplay';
import { formatPeerTime, isPeerChanged, peerSolutionLabel, peerSolutionLabelParts, type PeerSolutionSession } from './peerSolution';

interface Props {
  session: PeerSolutionSession | null;
  eligible: boolean;
  attemptId: string;
  questionId: string;
  imageUrl: string;
  children: (peerButton: ReactNode) => ReactNode;
  /** 자유 모드 보기 창은 열자마자 목록을 펼친다. */
  autoPick?: boolean;
  active?: boolean;
  onBack?: () => void;
}

export function PeerSolutionLabel({ label }: { label: PeerSolution['label'] }) {
  const parts = peerSolutionLabelParts(label);
  return <span className="exam-peer-label" data-testid="exam-peer-label" aria-label={peerSolutionLabel(label)}>
    <span className="exam-peer-face" aria-hidden="true">{parts.face}</span>
    {parts.isTeacher ? <span>선생님 풀이</span>
      : parts.title ? <span className={`exam-peer-title px-2 py-0.5 rounded-full border text-[11px] ${parts.title.style}`} data-testid="exam-peer-title">
        <span aria-hidden="true">{parts.title.icon}</span> <span>{parts.title.text}</span>
      </span>
      : <span>익명 학생</span>}
    {parts.grade && <span className="exam-peer-grade">{parts.grade}</span>}
  </span>;
}
export function PeerSolutionSwitch({ session, eligible, attemptId, questionId, imageUrl, children, autoPick = false, active, onBack }: Props) {
  const [rows, setRows] = useState<PeerSolutionCandidate[] | undefined>();
  const [solution, setSolution] = useState<(PeerSolutionCandidate & { strokes: InkReplayData['strokes'] }) | null>(null);
  const [replay, setReplay] = useState<InkReplayData | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [menuStyle, setMenuStyle] = useState<CSSProperties>();
  const pickerRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  const pending = useRef(false);
  const epoch = useRef(0);
  const hadSolution = useRef(false);
  const menuId = useId();
  const replayClient = useMemo(() => ({ getInkReplay: async () => replay! }), [replay]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const close = (focus = true) => {
    setOpen(false);
    if (focus) triggerRef.current?.focus();
  };
  const showList = async () => {
    if (!session || pending.current) return;
    const requestEpoch = epoch.current;
    const current = () => alive.current && requestEpoch === epoch.current;
    pending.current = true;
    setLoading(true); setMessage('');
    try {
      const value = await session.list(questionId, true);
      if (current()) { setRows(value); setOpen(value.length > 0); }
    } catch { if (current()) setMessage('풀이를 불러오지 못했어요. 다시 눌러 주세요.'); }
    finally { if (current()) { pending.current = false; setLoading(false); } }
  };
  useEffect(() => { if ((autoPick || active) && eligible) void showList(); }, [autoPick, active, eligible]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      setMenuStyle({ left: Math.max(8, Math.min(trigger.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8)),
        top: Math.max(8, Math.min(trigger.bottom + 4, window.innerHeight - menu.offsetHeight - 8)) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, rows]);
  useEffect(() => {
    if (solution || hadSolution.current) triggerRef.current?.focus();
    hadSolution.current = !!solution;
  }, [solution]);
  useEffect(() => {
    if (!open || loading) return;
    const selected = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]');
    (selected ?? menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]'))?.focus();
    const outside = (event: PointerEvent) => { if (!pickerRef.current?.contains(event.target as Node)) close(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, loading, rows]);

  const choose = async (row: PeerSolutionCandidate) => {
    if (!session || pending.current) return;
    const requestEpoch = epoch.current;
    const current = () => alive.current && requestEpoch === epoch.current;
    pending.current = true; setLoading(true); setMessage('');
    try {
      // 선택할 때마다 서버 자격을 확인한다. 재생 도구를 다시 열 때만 응답을 재사용한다.
      const value = await session.replay(questionId, row.solutionKey, true);
      if (current()) { setSolution({ ...row, strokes: value.strokes }); setReplay(value); close(); }
    } catch (error) {
      if (!current()) return;
      if (isPeerChanged(error)) {
        setSolution(null); setReplay(null);
        try { const value = await session.list(questionId, true); if (current()) { setRows(value); setOpen(value.length > 0); } }
        catch { if (current()) setMessage('목록을 불러오지 못했어요. 다시 눌러 주세요.'); }
        if (current()) setMessage('풀이가 바뀌었어요. 새 목록에서 다시 골라 주세요.');
      } else setMessage('풀이를 불러오지 못했어요. 다시 골라 주세요.');
    } finally { if (current()) { pending.current = false; setLoading(false); } }
  };

  const back = () => { ++epoch.current; pending.current = false; setLoading(false); setSolution(null); setReplay(null); close(false); onBack?.(); };
  useEffect(() => { if (active === false) { ++epoch.current; pending.current = false; setLoading(false); setSolution(null); setReplay(null); setOpen(false); } }, [active]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (open) { event.preventDefault(); close(); }
      else if (active || solution) { event.preventDefault(); back(); }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  });
  if (!session || !eligible) return <>{children(null)}</>;
  const none = rows?.length === 0;
  const picker = <span className="exam-peer-picker" ref={pickerRef}>
    <button ref={triggerRef} type="button" className="exam-tool exam-tool-text exam-peer-toggle" data-testid="exam-peer-toggle"
      disabled={loading} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => { if (open) close(); else void showList(); }}>
      {loading ? '불러오는 중…' : none ? '다른 풀이 없음' : '다른 학생 풀이'}
    </button>
    {open && <div id={menuId} ref={menuRef} style={menuStyle} className="exam-peer-menu" role="menu" aria-label="풀이 고르기" data-testid="exam-peer-list"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
        if (event.key === 'Tab') {
          event.preventDefault(); event.stopPropagation();
          const root = triggerRef.current?.closest('[role="dialog"]') ?? document;
          const focusable = [...root.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]')]
            .filter(el => el.getClientRects().length > 0 && !el.closest('[inert]') && !menuRef.current?.contains(el));
          const i = focusable.indexOf(triggerRef.current!);
          close(false);
          focusable[(i + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length]?.focus();
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (i + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
      {rows?.map(row => <button type="button" key={row.solutionKey} role="menuitemradio" disabled={loading}
        aria-checked={solution?.solutionKey === row.solutionKey} className="exam-peer-row" data-testid="exam-peer-row"
        onClick={() => { void choose(row); }}>
        <PeerSolutionLabel label={row.label} />{row.hasAudio && <span aria-label="음성 해설 있음">🎙️</span>}<span className="exam-peer-time">{formatPeerTime(row.timeSpentMs)}</span>
      </button>)}
    </div>}
  </span>;
  return <div className="exam-peer-inline" onKeyDown={event => {
    if (event.key === 'Escape' && (active || solution)) { event.preventDefault(); event.stopPropagation(); back(); }
  }}>
    {active && !solution && <div className="exam-peer-head">{picker}<button type="button" className="exam-tool exam-tool-text" data-testid="exam-peer-back" onClick={back}>내 풀이로 돌아가기</button></div>}
    {active !== false && none && <p className="exam-peer-note" role="status">아직 이 문제를 맞힌 다른 풀이가 없어요</p>}
    {active !== false && message && <p className="exam-peer-note" role="status">{message}</p>}
    {solution && replay && <section className="exam-peer" aria-label="다른 학생의 풀이" data-testid="exam-peer-solution">
      <div className="exam-peer-head">
        <PeerSolutionLabel label={solution.label} />
        <span className="exam-peer-time">{formatPeerTime(solution.timeSpentMs)}</span>
        <span className="exam-peer-caption">다른 풀이 · 읽기 전용</span>
        <button type="button" className="exam-tool exam-tool-text" data-testid="exam-peer-back"
          onClick={back}>내 풀이로 돌아가기</button>
        {picker}
      </div>
      <ExamInkReplay key={solution.solutionKey} client={replayClient} attemptId={attemptId} questionId={questionId}
        imageUrl={imageUrl} strokes={solution.strokes} imageMaxWidth={480} persistDock={false} inline autoOpen peerPlayback />
    </section>}
    {/* 목록을 고를 때는 내 문항을 보여 주고, 풀이가 열려도 필기와 실행 취소 상태를 보존한다. */}
    <div hidden={!!solution}>{children(solution || active !== undefined ? null : picker)}</div>
  </div>;
}
