import '../../../styles/examPractice.css';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../services/supabase';
import { ExamInkReplay } from '../../exam/ink/ExamInkReplay';
import { formatPeerTime, peerSolutionLabelParts } from '../../exam/ui/peerSolution';
import { downloadHelpSolution, giveHelpFeedback, HELP_REWARD, listHelpSolutions, type HelpFeedback, type HelpSolutionRow } from '../api';
import { helpReplayData, type HelpSolutionFile } from '../solutionFile';
import { feedbackMessage } from './model';
import { RequesterDialog } from './RequesterDialog';
import { refreshHelpRequests } from './useMyHelpRequests';

export interface HelpSolutionsViewerProps {
  requestId: string;
  imageUrl: string;
  onClose: () => void;
  onPointsChanged?: () => void;
  onRequestClosed?: () => void;
}

export function HelpSolutionsViewer({ requestId, imageUrl, onClose, onPointsChanged, onRequestClosed }: HelpSolutionsViewerProps) {
  const [rows, setRows] = useState<HelpSolutionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState<{ row: HelpSolutionRow; file: HelpSolutionFile } | null>(null);
  const [opening, setOpening] = useState(false);
  const [rating, setRating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    void listHelpSolutions(supabase, requestId).then(result => {
      if (live) setRows(result);
    }, reason => { if (live) setError(reason.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [requestId, retry]);
  const replayClient = useMemo(() => ({ getInkReplay: async () => helpReplayData(active!.file) }), [active]);
  const closeSolution = () => {
    if (busy || opening) return;
    if (active && !active.row.feedback) setRating(true);
    else if (active) setActive(null);
    else onClose();
  };
  const openSolution = async (row: HelpSolutionRow) => {
    setOpening(true); setError(''); setMessage('');
    try {
      const file = await downloadHelpSolution(supabase, row.storage_path);
      setActive({ row, file });
      refreshHelpRequests();
    } catch (reason) { setError((reason as Error).message); }
    finally { setOpening(false); }
  };
  const rate = async (kind: HelpFeedback) => {
    if (!active || busy) return;
    setBusy(true); setError('');
    try {
      const result = await giveHelpFeedback(supabase, active.row.id, kind);
      setRows(previous => previous.map(row => row.id === active.row.id ? { ...row, feedback: kind } : row));
      setMessage(feedbackMessage(result.requester_reward));
      setRating(false); setActive(null);
      refreshHelpRequests();
      if (result.closed) onRequestClosed?.();
      onPointsChanged?.();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  return <RequesterDialog label="친구 풀이 보기" fullscreen onClose={closeSolution}>
    <div className="flex h-full min-w-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-700 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <h2 className="font-bold">{active ? '친구의 풀이 재생' : `풀이 보기 (${rows.length})`}</h2>
        <button type="button" className="min-h-11 rounded-xl bg-slate-700 px-5" disabled={opening || busy} onClick={closeSolution}>닫기</button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {error && !rating && <div className="mb-3 text-rose-300"><p role="alert">{error}</p>
          {!active && !opening && <button type="button" className="min-h-11" onClick={() => setRetry(value => value + 1)}>다시 시도</button>}
        </div>}
        {message && <p role="status" className="mb-3 text-emerald-300">{message}</p>}
        {loading ? <p role="status">풀이를 불러오는 중이에요…</p> : active ?
          <ExamInkReplay key={active.row.id} client={replayClient} attemptId={requestId} questionId={active.row.id}
            imageUrl={imageUrl} strokes={active.file.strokes} autoOpen persistDock={false} inline peerPlayback /> :
          <ul className="mx-auto max-w-3xl space-y-3">
            {!rows.length && <li>아직 도착한 풀이가 없어요.</li>}
            {rows.map(row => {
              const label = peerSolutionLabelParts({ ...row.helper, isTeacher: false });
              return <li key={row.id}><button type="button" disabled={opening || !row.file_available}
                onClick={() => void openSolution(row)} className="flex min-h-16 w-full flex-wrap items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 p-4 text-left disabled:opacity-50">
                <span>{label.face}</span>
                {label.title ? <span className={`rounded px-2 py-1 ${label.title.style}`}>{label.title.icon} {label.title.text}</span> : <span>익명 학생</span>}
                <span>{label.grade}</span><span className="text-sm text-slate-400">{formatPeerTime(row.duration_ms)}</span>
                {row.feedback && <span>{row.feedback === 'like' ? '👍 좋아요' : '🤔 이해 안 돼요'}</span>}
                {!row.file_available && <span>삭제된 풀이</span>}
              </button></li>;
            })}
          </ul>}
        {opening && <p role="status">풀이를 여는 중이에요…</p>}
      </div>
    </div>
    {rating && <RequesterDialog label="풀이 피드백" onClose={() => { if (!busy) { setRating(false); setActive(null); } }}>
      <h3 className="mb-3 text-lg font-bold">친구의 풀이가 도움이 됐나요?</h3>
      {error && <p role="alert" className="mb-3 text-rose-300">{error}</p>}
      <div className="flex flex-col gap-3">
        <button type="button" disabled={busy} onClick={() => void rate('like')} className="min-h-12 rounded-xl bg-indigo-600 p-3">👍 좋아요 (풀어 준 친구 +{HELP_REWARD.like}P)</button>
        <button type="button" disabled={busy} onClick={() => void rate('unclear')} className="min-h-12 rounded-xl bg-slate-700 p-3">🤔 이해 안 돼요 (+{HELP_REWARD.unclear}P)</button>
        <button type="button" disabled={busy} onClick={() => { setRating(false); setActive(null); }} className="min-h-11 text-sm text-slate-400">나중에</button>
      </div>
      <p className="mt-3 text-xs text-slate-400">좋아요를 누르면 요청이 해결됨으로 바뀌어요. 피드백을 남기면 최대 {HELP_REWARD.requester}P를 받아요. 포인트는 보상 조건에 따라 지급돼요.</p>
    </RequesterDialog>}
  </RequesterDialog>;
}
