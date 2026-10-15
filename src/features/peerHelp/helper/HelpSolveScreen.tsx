import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../services/supabase';
import { HELP_REWARD, submitHelpSolution, type OpenHelpRequest } from '../api';
import { HelpInkLog, helpSolutionStats, helpTooShortReason } from '../solutionFile';
import { ExamInkCanvas } from '../../exam/ink/ExamInkCanvas';
import type { ExamInkCanvasHandle, InkChangeKind, InkStroke, InkTool } from '../../exam/contract';
import { HelpLabel } from './HelpLabel';
import { ExamInkToolbar } from '../../exam/ui/ExamInkToolbar';
import { PEN_COLORS, PEN_SIZES } from '../../exam/ui/inkToolbarOptions';
import '../../../styles/examPractice.css';

export function HelpSolveScreen({ request, userId, onClose, onSent }: {
  request: OpenHelpRequest; userId: string; onClose: () => void; onSent: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<ExamInkCanvasHandle>(null);
  const [log] = useState(() => new HelpInkLog());
  const current = useRef<InkStroke[]>([]);
  const [strokes, setStrokes] = useState<InkStroke[]>([]);
  const [tool, setTool] = useState<InkTool>('pen');
  const [color, setColor] = useState(PEN_COLORS[0].value);
  const [size, setSize] = useState(PEN_SIZES[1].value);
  const [, setHistoryTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);
  useEffect(() => {
    dialog.current?.showModal();
    const warn = (event: BeforeUnloadEvent) => {
      if (log.events.length) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [log]);
  const change = (next: InkStroke[], kind?: InkChangeKind) => {
    log.record(current.current, next, kind);
    current.current = next;
    setStrokes(next);
  };
  const leave = () => {
    canvas.current?.finish();
    if (!sending.current && (!log.events.length || window.confirm('아직 보내지 않은 풀이가 있어요. 나가면 필기가 사라져요. 나갈까요?'))) onClose();
  };
  const stats = helpSolutionStats(log.events, strokes);
  const reason = helpTooShortReason(stats);
  const hint = reason ? `현재 ${stats.strokeCount}획 · ${(stats.durationMs / 1000).toFixed(1)}초 / 최소 5획 · 20초의 풀이가 필요해요.` : '풀이를 보낼 수 있어요!';
  const send = async () => {
    canvas.current?.finish();
    if (sending.current || helpTooShortReason(helpSolutionStats(log.events, current.current))) return;
    sending.current = true; setBusy(true); setError('');
    try {
      await submitHelpSolution(supabase, request.id, userId, log.events, current.current);
      log.clear(); onSent();
    } catch (err) { setError(err instanceof Error ? err.message : '풀이를 보내지 못했어요.'); }
    finally { sending.current = false; setBusy(false); }
  };
  return <dialog ref={dialog} aria-label="친구 문제 풀기" onCancel={event => { event.preventDefault(); leave(); }}
    className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-slate-950 p-0 text-slate-100 backdrop:bg-black/70">
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 p-3">
        <div><h2 className="font-bold">친구 문제 풀기</h2><HelpLabel label={request.requester} /></div>
        <button type="button" disabled={busy} onClick={leave} className="rounded bg-slate-700 px-4 py-3 disabled:opacity-50">나가기</button>
      </header>
      {/* 기출문제 풀이와 같은 필기 도구(레이저는 리플레이에 남지 않아 뺀다). */}
      <div className="px-3 py-2">
        <ExamInkToolbar tool={tool} color={color} size={size} laser={false} inert={busy}
          onTool={setTool} onColor={setColor} onSize={setSize}
          canUndo={!busy && !!canvas.current?.canUndo()} canRedo={!busy && !!canvas.current?.canRedo()}
          onUndo={() => { canvas.current?.undo(); setHistoryTick(t => t + 1); }}
          onRedo={() => { canvas.current?.redo(); setHistoryTick(t => t + 1); }} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-slate-200" data-testid="help-drawing">
        <ExamInkCanvas ref={canvas} imageUrl={request.image_url} strokes={strokes} onChange={change} tool={tool} color={color} size={size}
          penOnlyWhenPenDetected shapeSnap readOnly={busy} imageMaxWidth={900} />
      </div>
      <footer className="space-y-2 border-t border-slate-700 p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <p aria-live="polite" className="text-sm text-slate-300">{hint}</p>
        {error && <p role="alert" className="text-rose-300">{error}</p>}
        <button type="button" disabled={busy || !!reason} onClick={() => void send()} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-bold disabled:opacity-40">{busy ? '보내는 중…' : '보내기'}</button>
        <p className="text-xs text-slate-400">친구가 좋아요를 누르면 +{HELP_REWARD.like}P, 이해 안 돼요는 +{HELP_REWARD.unclear}P</p>
      </footer>
    </div>
  </dialog>;
}
