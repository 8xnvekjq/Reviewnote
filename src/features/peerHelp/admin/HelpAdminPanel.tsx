import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../services/supabase';
import type { MistakeEntry } from '../../../types';
import { mapDbMistakeRow } from '../../mistakes/useMistakes';
import { adminListHelp, adminRemoveHelpSolution, downloadHelpSolution, type AdminHelpRow } from '../api';
import { helpReplayData, type HelpSolutionFile } from '../solutionFile';
import { ExamInkReplay } from '../../exam/ink/ExamInkReplay';
import { HelpLabel } from '../helper/HelpLabel';
import '../../../styles/examPractice.css';

function AdminReplay({ row, onClose }: { row: AdminHelpRow; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<HelpSolutionFile | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    downloadHelpSolution(supabase, row.storage_path!).then(value => { if (active) setFile(value); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : '풀이를 불러오지 못했어요.'); });
    return () => { active = false; };
  }, [row.storage_path]);
  const client = useMemo(() => ({ getInkReplay: async () => helpReplayData(file!) }), [file]);
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); onClose(); }} aria-label="도움 풀이 재생" className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-auto bg-slate-950 p-3 text-slate-100 backdrop:bg-black/70">
    <header className="mb-4 flex items-center justify-between gap-3">
      <h3 className="flex flex-wrap items-center gap-1 font-bold"><HelpLabel label={row.requester} /> <span aria-hidden>→</span> {row.helper && <HelpLabel label={row.helper} />}</h3>
      <button type="button" onClick={onClose} className="shrink-0 rounded bg-slate-700 px-4 py-3">닫기</button>
    </header>
    {row.removed_at && <p className="mb-3 text-amber-300">삭제된 풀이예요. 남아 있는 파일을 확인합니다.</p>}
    {error ? <p role="alert" className="text-rose-300">{error}</p> : file ? <ExamInkReplay client={client} attemptId={row.request_id} questionId={row.solution_id!} imageUrl={row.image_url ?? ''} strokes={file.strokes} imageMaxWidth={900} autoOpen persistDock={false} inline /> : <p role="status">풀이를 불러오는 중…</p>}
  </dialog>;
}

const STATUS_TEXT = { open: '⏳ 아직 답 없음', closed: '해결됨', cancelled: '취소한 요청' } as const;
const FEEDBACK_EMOJI = { like: '👍', unclear: '🤔' } as const;
const shortDate = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

export interface HelpAdminPanelProps {
  /** 문제 사진을 누르면 그 학생의 오답노트를 연다(App의 setSelectedEntry). */
  onViewMistake?: (entry: MistakeEntry) => void;
}

export function HelpAdminPanel({ onViewMistake }: HelpAdminPanelProps) {
  const [rows, setRows] = useState<AdminHelpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const removing = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<AdminHelpRow | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    adminListHelp(supabase).then(value => { if (active) setRows(value); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : '도움 기록을 불러오지 못했어요.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  const remove = async (row: AdminHelpRow) => {
    if (!row.solution_id) return;
    if (removing.current || !window.confirm('이 풀이를 지울까요? 도와준 학생과 요청자가 받은 포인트도 회수됩니다.')) return;
    removing.current = true; setBusy(row.solution_id); setError(''); setMessage('');
    try {
      await adminRemoveHelpSolution(supabase, row.solution_id);
      setMessage('풀이를 지우고 지급된 포인트를 회수했어요.');
      setRevision(value => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : '풀이를 지우지 못했어요.'); }
    finally { removing.current = false; setBusy(null); }
  };
  const openMistake = async (row: AdminHelpRow) => {
    if (!row.mistake_id || !onViewMistake) return;
    setError('');
    const { data, error: loadError } = await supabase.from('mistakes').select('*').eq('id', row.mistake_id).maybeSingle();
    if (loadError || !data) { setError('오답노트를 찾지 못했어요(지워진 오답일 수 있어요).'); return; }
    onViewMistake(mapDbMistakeRow(data));
  };
  return <section className="mx-auto max-w-3xl space-y-3 p-3 text-slate-100" aria-label="서로 도와주기 관리">
    <header className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">서로 도와주기 관리</h2><button type="button" disabled={loading || !!busy} onClick={() => setRevision(value => value + 1)} className="rounded bg-slate-700 px-3 py-2 text-sm disabled:opacity-40">새로고침</button></header>
    {error && <p role="alert" className="text-rose-300">{error}</p>}{message && <p role="status" className="text-emerald-300">{message}</p>}
    {loading ? <p role="status">도움 기록을 불러오는 중…</p> : !rows.length && !error ? <p className="text-slate-400">아직 도움 요청이 없어요.</p> :
      <ul className="space-y-2" aria-label="도움 요청·풀이 기록">{rows.map(row => <li key={row.solution_id ?? row.request_id} data-testid="help-admin-row" className="flex gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-2.5">
        <button type="button" disabled={!row.mistake_id || !onViewMistake} onClick={() => void openMistake(row)} aria-label="오답노트 열기" title={row.mistake_title ?? undefined}
          className="h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-white disabled:cursor-default">
          {row.image_url && <img src={row.image_url} alt="도움 요청 문제" loading="lazy" className="h-full w-full object-contain" />}
        </button>
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <div className="flex flex-wrap items-center gap-1"><HelpLabel label={row.requester} /><span className="text-slate-500" aria-label="에게">→</span>
            {row.helper ? <HelpLabel label={row.helper} /> : <span className="text-slate-400">{STATUS_TEXT[row.request_status]}</span>}
            {row.feedback && <span className="text-lg" title={row.feedback === 'like' ? '도움 됐어요' : '이해 못 했어요'}>{FEEDBACK_EMOJI[row.feedback]}</span>}
            {row.removed_at && <span className="text-xs text-amber-300">삭제됨</span>}
          </div>
          <p className="text-xs leading-5 text-slate-400">
            <span className="block">질문 <time dateTime={row.request_created_at}>{shortDate(row.request_created_at)}</time></span>
            {row.solution_created_at && <span className="block">대답 <time dateTime={row.solution_created_at}>{shortDate(row.solution_created_at)}</time></span>}
          </p>
          {row.solution_id && <div className="flex gap-2 pt-0.5">
            <button type="button" disabled={!row.file_available} onClick={() => setSelected(row)} className="rounded bg-indigo-600 px-3 py-1.5 text-xs disabled:opacity-40">{row.file_available ? '풀이 보기' : '파일 없음'}</button>
            <button type="button" disabled={!!busy || !!row.removed_at} onClick={() => void remove(row)} className="rounded bg-rose-900 px-3 py-1.5 text-xs disabled:opacity-40">{busy === row.solution_id ? '지우는 중…' : '지우기'}</button>
          </div>}
        </div>
      </li>)}</ul>}
    {selected && <AdminReplay key={selected.solution_id} row={selected} onClose={() => setSelected(null)} />}
  </section>;
}
