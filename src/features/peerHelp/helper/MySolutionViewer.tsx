import '../../../styles/examPractice.css';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../services/supabase';
import { ExamInkReplay } from '../../exam/ink/ExamInkReplay';
import { downloadHelpSolution, type GivenHelp } from '../api';
import { helpReplayData, type HelpSolutionFile } from '../solutionFile';
import { RequesterDialog } from '../requester/RequesterDialog';
import { helpFeedbackText } from './presentation';

/** '내가 보낸 풀이' 다시 보기. 친구가 아직 답하지 않은 열린 요청이면 여기서 바꿔 보내기로 넘어간다. */
export function MySolutionViewer({ row, onClose, onResubmit }: { row: GivenHelp; onClose: () => void; onResubmit: () => void }) {
  const [file, setFile] = useState<HelpSolutionFile | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    downloadHelpSolution(supabase, row.storage_path!).then(value => { if (live) setFile(value); },
      reason => { if (live) setError((reason as Error).message); });
    return () => { live = false; };
  }, [row.storage_path]);
  const client = useMemo(() => ({ getInkReplay: async () => helpReplayData(file!) }), [file]);
  return <RequesterDialog label="내가 보낸 풀이" fullscreen onClose={onClose}>
    <div className="flex h-full min-w-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-700 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div><h2 className="font-bold">내가 보낸 풀이</h2><p className="text-sm text-slate-300">{helpFeedbackText(row.feedback)}</p></div>
        <div className="flex gap-2">
          {row.can_resubmit && <button type="button" onClick={onResubmit} className="min-h-11 rounded-xl bg-indigo-600 px-4">다시 보내기</button>}
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-slate-700 px-5">닫기</button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {error ? <p role="alert" className="text-rose-300">{error}</p> : file
          ? <ExamInkReplay client={client} attemptId={row.request_id} questionId={row.id} imageUrl={row.image_url ?? ''}
              strokes={file.strokes} imageMaxWidth={900} autoOpen persistDock={false} inline />
          : <p role="status">풀이를 불러오는 중…</p>}
      </div>
    </div>
  </RequesterDialog>;
}
