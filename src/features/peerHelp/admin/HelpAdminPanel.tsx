import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../services/supabase';
import { adminListHelp, adminRemoveHelpSolution, downloadHelpSolution, type AdminHelpRow } from '../api';
import { helpReplayData, type HelpSolutionFile } from '../solutionFile';
import { ExamInkReplay } from '../../exam/ink/ExamInkReplay';
import { helpFeedbackText } from '../helper/presentation';
import '../../../styles/examPractice.css';

function AdminReplay({ row, onClose }: { row: AdminHelpRow; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<HelpSolutionFile | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    downloadHelpSolution(supabase, row.storage_path).then(value => { if (active) setFile(value); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : '풀이를 불러오지 못했어요.'); });
    return () => { active = false; };
  }, [row.storage_path]);
  const client = useMemo(() => ({ getInkReplay: async () => helpReplayData(file!) }), [file]);
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); onClose(); }} aria-label="도움 풀이 재생" className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-auto bg-slate-950 p-3 text-slate-100 backdrop:bg-black/70">
    <header className="mb-4 flex items-center justify-between gap-3"><h3 className="font-bold">도움 풀이 재생</h3><button type="button" onClick={onClose} className="rounded bg-slate-700 px-4 py-3">닫기</button></header>
    {row.removed_at && <p className="mb-3 text-amber-300">삭제된 풀이예요. 남아 있는 파일을 확인합니다.</p>}
    {error ? <p role="alert" className="text-rose-300">{error}</p> : file ? <ExamInkReplay client={client} attemptId={row.request_id} questionId={row.solution_id} imageUrl={row.image_url ?? ''} strokes={file.strokes} imageMaxWidth={900} autoOpen persistDock={false} inline /> : <p role="status">풀이를 불러오는 중…</p>}
  </dialog>;
}

export function HelpAdminPanel() {
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
    if (removing.current || !window.confirm('이 풀이를 지울까요? 도와준 학생과 요청자가 받은 포인트도 회수됩니다.')) return;
    removing.current = true; setBusy(row.solution_id); setError(''); setMessage('');
    try {
      await adminRemoveHelpSolution(supabase, row.solution_id);
      setMessage('풀이를 지우고 지급된 포인트를 회수했어요.');
      setRevision(value => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : '풀이를 지우지 못했어요.'); }
    finally { removing.current = false; setBusy(null); }
  };
  return <section className="space-y-4 p-4 text-slate-100" aria-label="서로 도와주기 관리">
    <header className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">서로 도와주기 관리</h2><button type="button" disabled={loading || !!busy} onClick={() => setRevision(value => value + 1)} className="rounded bg-slate-700 px-3 py-3 disabled:opacity-40">새로고침</button></header>
    {error && <p role="alert" className="text-rose-300">{error}</p>}{message && <p role="status" className="text-emerald-300">{message}</p>}
    {loading ? <p role="status">도움 기록을 불러오는 중…</p> : !rows.length && !error ? <p className="text-slate-400">아직 도움 풀이가 없어요.</p> : <div className="max-w-full overflow-x-auto rounded-xl border border-slate-700">
      <table className="w-full min-w-[850px] text-left text-sm"><caption className="sr-only">도움 풀이 및 포인트 지급 기록</caption><thead className="bg-slate-800"><tr>{['문제', '도와준 학생', '요청 학생', '피드백', '포인트 (도우미 / 요청자)', '날짜', '관리'].map(text => <th key={text} scope="col" className="p-3">{text}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.solution_id} className="border-t border-slate-700 align-top">
          <td className="p-3">{row.image_url && <img src={row.image_url} alt="도움 요청 문제" loading="lazy" className="h-20 w-28 rounded bg-white object-contain" />}<p className="mt-1 max-w-40 break-words">{row.mistake_title}</p></td>
          <td className="p-3">{row.helper.face} {row.helper.name || '이름 없음'}</td><td className="p-3">{row.requester.face} {row.requester.name || '이름 없음'}</td>
          <td className="p-3">{helpFeedbackText(row.feedback)}{row.removed_at && <p className="text-amber-300">삭제됨</p>}</td>
          <td className="p-3">{row.helper_reward}P / {row.requester_reward}P</td><td className="p-3"><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString('ko-KR')}</time></td>
          <td className="space-y-2 p-3"><button type="button" disabled={!row.file_available} onClick={() => setSelected(row)} className="block rounded bg-indigo-600 px-3 py-3 disabled:opacity-40">풀이 보기</button>{!row.file_available && <p className="text-xs text-slate-400">파일 없음</p>}<button type="button" disabled={!!busy || !!row.removed_at} onClick={() => void remove(row)} className="block rounded bg-rose-900 px-3 py-3 disabled:opacity-40">{busy === row.solution_id ? '지우는 중…' : '지우기'}</button></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {selected && <AdminReplay key={selected.solution_id} row={selected} onClose={() => setSelected(null)} />}
  </section>;
}
