import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ExamClient, TeacherAudioClip } from '../contract';
import { formatClock } from '../ui/examLogic';
import type { TeacherAudioCapture } from './audioRecorder';

type Confirm = null | { kind: 'clip'; id: string; label: string } | { kind: 'reset' };

const startLabel = (startedAt: number) =>
  new Date(startedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** 선생님 녹음 관리: 이 문항 녹음 목록·하나 지우기·"처음부터 다시"(필기+녹음). 지우기 전에는 항상 한 번 더 묻는다. */
export function TeacherAudioManager({ client, capture, attemptId, questionId, onReset }: {
  client: ExamClient; capture: TeacherAudioCapture; attemptId: string; questionId: string;
  /** 이 문항의 녹음과 필기를 모두 지운다(이 기기 초안 → 서버). 실패하면 throw. */
  onReset?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [clips, setClips] = useState<TeacherAudioClip[] | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const local = capture.state.uploads.filter(row => row.questionId === questionId && row.state !== 'done');
  const doneCount = capture.state.uploads.filter(row => row.state === 'done').length;

  const refresh = useCallback(async () => {
    if (!client.listSolutionAudio) { setClips([]); return; }
    try { setClips(await client.listSolutionAudio(attemptId, questionId)); setError(''); }
    catch { setError('녹음 목록을 불러오지 못했어요. 다시 열어 주세요.'); }
  }, [client, attemptId, questionId]);
  useEffect(() => { if (open) void refresh(); }, [open, refresh, doneCount]);
  useEffect(() => { setOpen(false); setConfirm(null); setClips(null); }, [questionId]);
  useEffect(() => { (confirm ? confirmRef : dialogRef).current?.focus(); }, [open, confirm]);

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true); setError('');
    try { await action(); setConfirm(null); }
    catch { setError(failure); setConfirm(null); }
    finally { setBusy(false); void refresh(); }
  };
  const removeClip = (id: string) => run(async () => {
    // 이 기기 초안·진행 중 업로드를 먼저 정리해야 지운 녹음이 다시 올라가지 않는다.
    await capture.discardClip(id);
    await client.deleteSolutionAudio?.(id);
  }, '녹음을 지우지 못했어요. 다시 시도해 주세요.');
  const reset = () => run(async () => { await onReset?.(); }, '처음부터 다시 하지 못했어요. 필기와 녹음은 그대로예요. 다시 시도해 주세요.');

  const serverIds = new Set(clips?.map(clip => clip.id));
  const rows = [
    ...(clips ?? []).map(clip => ({ id: clip.id, label: `${startLabel(clip.startedAt)} 시작 · ${formatClock(clip.durationMs)}`, state: null as string | null })),
    ...local.filter(row => !serverIds.has(row.id)).map(row => ({ id: row.id, label: '이 기기에 저장된 녹음',
      state: row.state === 'uploading' ? '업로드 중' : '업로드 실패' })),
  ];
  const keepFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' && event.key !== 'Escape') return;
    event.stopPropagation(); // 겹친 확인 창이 바깥 목록 창의 처리와 겹치지 않게
    if (event.key === 'Escape') { if (!busy) { if (confirm) setConfirm(null); else setOpen(false); } return; }
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
    event.preventDefault();
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
  };

  return <>
    <button type="button" className="exam-tool exam-tool-text" data-testid="exam-audio-manage" aria-haspopup="dialog"
      onClick={() => setOpen(true)}>녹음 관리</button>
    {open && <div ref={dialogRef} tabIndex={-1} className="exam-confirm" role="dialog" aria-modal="true" aria-label="녹음 관리"
      data-testid="exam-audio-manager" onKeyDown={keepFocus}>
      <div className="exam-confirm-box exam-audio-manager">
        <h3>이 문제 녹음</h3>
        {clips == null && !error ? <p className="rn-caption" role="status">불러오는 중…</p>
          : rows.length ? <ol className="exam-audio-clips" data-testid="exam-audio-clips">
            {rows.map((row, index) => <li key={row.id} data-testid="exam-audio-clip">
              <span>{index + 1}. {row.label}{row.state && <span className="rn-caption"> · {row.state}</span>}</span>
              <button type="button" className="rn-button rn-button-compact" disabled={busy}
                aria-label={`${index + 1}번 녹음 지우기`}
                onClick={() => setConfirm({ kind: 'clip', id: row.id, label: `${index + 1}번 녹음` })}>지우기</button>
            </li>)}
          </ol> : <p className="rn-caption" data-testid="exam-audio-empty">이 문제에는 녹음이 없어요.</p>}
        {error && <p className="exam-error" role="alert">{error}</p>}
        <p className="rn-caption">녹음을 멈췄다가 다시 누르면 이어서 새 녹음이 더해져요.</p>
        <div className="exam-confirm-actions">
          {onReset && <button type="button" className="rn-button rn-button-destructive" disabled={busy}
            data-testid="exam-audio-reset" onClick={() => setConfirm({ kind: 'reset' })}>처음부터 다시</button>}
          <button type="button" className="rn-button rn-button-secondary" disabled={busy} onClick={() => setOpen(false)}>닫기</button>
        </div>
      </div>
      {confirm && <div ref={confirmRef} tabIndex={-1} className="exam-confirm" role="alertdialog" aria-modal="true"
        aria-label={confirm.kind === 'reset' ? '처음부터 다시 확인' : '녹음 지우기 확인'} data-testid="exam-audio-confirm" onKeyDown={keepFocus}>
        <div className="exam-confirm-box">
          <h3>{confirm.kind === 'reset' ? '처음부터 다시 풀까요?' : `${confirm.label}을 지울까요?`}</h3>
          <p className="rn-caption">{confirm.kind === 'reset'
            ? '이 문제의 필기와 녹음을 모두 지우고 처음부터 다시 풀어요. 지운 뒤에는 되돌릴 수 없어요.'
            : '지운 녹음은 되돌릴 수 없어요. 학생 화면에서도 바로 사라져요.'}</p>
          <div className="exam-confirm-actions">
            <button type="button" className="rn-button rn-button-secondary" disabled={busy} onClick={() => setConfirm(null)}>취소</button>
            <button type="button" className="rn-button rn-button-destructive" disabled={busy} data-testid="exam-audio-confirm-delete"
              onClick={() => { if (confirm.kind === 'reset') void reset(); else void removeClip(confirm.id); }}>
              {busy ? '지우는 중…' : confirm.kind === 'reset' ? '모두 지우고 다시 풀기' : '지우기'}
            </button>
          </div>
        </div>
      </div>}
    </div>}
  </>;
}
