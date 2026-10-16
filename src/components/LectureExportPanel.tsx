import React, { useEffect, useRef, useState } from 'react';
import { deleteLectureRecording, type LoadedRecording } from '../features/lectures/lectureRecordings';
import { supabase } from '../services/supabase';
import { formatDuration } from '../features/lectures/lectureRecordingModel';
import { clearExportFiles, exportFileName, exportLectureMp4, lectureVideoTitle, type ExportProgress, type ExportResult } from '../features/lectures/lectureExport';

// 녹음 재생 화면의 'MP4로 저장' 창: 전체 영상을 브라우저 저장 공간에 만든 뒤 기기에 저장한다.
type WakeLockSentinel = { release(): Promise<void> };

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
const seconds = (ms: number) => `${Math.round(ms / 1000)}초`;
const timingText = ({ timings: t, frames }: ExportResult) =>
  `그리기 ${seconds(t.draw)} · 영상 ${seconds(t.video)} · 소리 ${seconds(t.audio)} · 프레임 ${frames.toLocaleString()}${t.hidden > 1000 ? ` · 창 숨김 ${seconds(t.hidden)}` : ''}`;
const ENCODER_NAMES = { 'prefer-hardware': '하드웨어', 'prefer-software': '소프트웨어' } as const;
const encoderText = ({ encoder, bench }: ExportResult) => {
  const measured = (Object.keys(ENCODER_NAMES) as (keyof typeof ENCODER_NAMES)[])
    .filter(mode => bench[mode] != null).map(mode => `${ENCODER_NAMES[mode]} ${bench[mode]}ms`).join(' / ');
  return `${encoder ? ENCODER_NAMES[encoder] : '기본'}${measured ? ` (프레임당 ${measured})` : ''}`;
};
const remainText = (ms: number) => ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))}초` : `${Math.round(ms / 60_000)}분`;
const CODEC_NAMES: Record<string, string> = { avc: 'H.264', vp9: 'VP9', av1: 'AV1', aac: 'AAC', opus: 'Opus' };

type State =
  | { phase: 'idle' }
  | { phase: 'running'; fromMs: number; toMs: number; progress: ExportProgress | null }
  | { phase: 'done'; result: ExportResult; url: string; name: string }
  | { phase: 'error'; message: string };

export const LectureExportPanel: React.FC<{
  recording: LoadedRecording; slideUrls: string[]; onClose: () => void;
  /** 유튜브 제목용 학년·교재(수업자료 덱) */
  deck?: { grade?: string | null; book?: string | null };
}> = ({ recording, slideUrls, onClose, deck }) => {
  const [state, setState] = useState<State>({ phase: 'idle' });
  // 파일 이름 = 유튜브 제목 양식(고칠 수 있다)
  // 영상을 기기에 저장하면 서버의 녹음(필기 기록·음성)은 바로 지운다 — 저장 공간(무료 1GB)을 아끼려고.
  // 이 창이 열려 있는 동안은 녹음이 메모리에 남아 있어 '다시'로 영상을 또 만들 수 있다.
  const [serverCopy, setServerCopy] = useState<'kept' | 'deleting' | 'deleted' | 'failed'>('kept');
  const removeServerCopy = () => {
    if (serverCopy === 'deleting' || serverCopy === 'deleted') return;
    setServerCopy('deleting');
    // 다운로드가 시작될 시간을 조금 준다.
    window.setTimeout(() => {
      deleteLectureRecording(supabase, recording.manifest.recordingId)
        .then(() => setServerCopy('deleted'), () => setServerCopy('failed'));
    }, 1500);
  };
  const [title, setTitle] = useState(() => lectureVideoTitle({
    createdAt: recording.manifest.createdAt, grade: deck?.grade, className: recording.manifest.className,
    book: deck?.book, sections: recording.manifest.slides.map(slide => slide.section),
  }));
  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);
  const total = recording.replay.total;

  // 닫으면 만들던 것을 멈추고, 저장 공간에 남은 영상 파일도 지운다(기기에 저장한 파일은 그대로).
  useEffect(() => () => {
    abortRef.current?.abort();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    void clearExportFiles();
  }, []);

  const start = async () => {
    const fromMs = 0, toMs = total;
    const controller = new AbortController();
    abortRef.current = controller;
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    setState({ phase: 'running', fromMs, toMs, progress: null });
    let wake: WakeLockSentinel | null = null;
    let lastPaint = 0;
    try {
      wake = await (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> } }).wakeLock?.request('screen') ?? null;
    } catch { /* 화면 켜짐 유지를 못 해도 계속 */ }
    try {
      const result = await exportLectureMp4({
        replay: recording.replay, slideIds: recording.manifest.slides.map(slide => slide.id), slideUrls, clips: recording.clips,
        fromMs, toMs, toFile: true, signal: controller.signal,
        // 진행 표시는 1초에 한 번만 바꾼다 — 화면을 자주 다시 그리면 크롬 영상 인코더가 느려진다.
        onProgress: progress => {
          const now = performance.now();
          if (now - lastPaint < 1000 && progress.doneMs < progress.totalMs) return;
          lastPaint = now;
          setState(prev => prev.phase === 'running' ? { ...prev, progress } : prev);
        },
      });
      const url = URL.createObjectURL(result.blob);
      urlRef.current = url;
      setState({ phase: 'done', result, url, name: exportFileName(recording.manifest.title) });
    } catch (error) {
      if (controller.signal.aborted) setState({ phase: 'idle' });
      else setState({ phase: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      void wake?.release().catch(() => {});
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const button = 'h-9 px-3 rounded-xl text-xs font-black border active:scale-95 disabled:opacity-40';
  return (
    <div role="region" aria-label="MP4로 저장" data-testid="lecture-export" data-phase={state.phase}
      className="absolute right-2 bottom-16 z-20 w-[min(22rem,calc(100%-1rem))] rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-3 space-y-2.5 text-slate-100">
      <div className="flex items-center gap-2">
        <div className="flex-1 text-sm font-black">🎬 MP4로 저장</div>
        <button type="button" onClick={onClose} aria-label="MP4 창 닫기" className="w-8 h-8 rounded-lg text-slate-400 hover:text-white">✕</button>
      </div>

      {state.phase === 'idle' && (
        <>
          <p className="text-[11px] leading-relaxed text-slate-300 break-keep">
            1920×1080 영상으로 만들어요. 태블릿은 만드는 동안 화면을 켜 두세요(다른 앱으로 가면 멈췄다가 돌아오면 이어서 만들어요).
          </p>
          <button type="button" onClick={() => void start()} className={`${button} w-full bg-indigo-600 border-indigo-400 text-white`}>
            전체 영상 만들기 ({formatDuration(total)})
          </button>
        </>
      )}

      {state.phase === 'running' && (() => {
        const p = state.progress;
        const ratio = p ? p.doneMs / p.totalMs : 0;
        const remain = p && ratio > 0 ? (p.elapsedMs / ratio) * (1 - ratio) : null;
        return (
          <>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
              <div className="h-full bg-indigo-500" style={{ width: `${ratio * 100}%` }} />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-300">
              <span data-testid="export-progress">{Math.round(ratio * 100)}% · 영상 {formatDuration(p?.doneMs ?? 0)} / {formatDuration(state.toMs - state.fromMs)}</span>
              <span>{remain != null ? `약 ${remainText(remain)} 남음` : '준비 중…'}</span>
            </div>
            <button type="button" onClick={() => abortRef.current?.abort()} className={`${button} w-full bg-slate-800 border-slate-600 text-slate-100`}>취소</button>
          </>
        );
      })()}

      {state.phase === 'done' && (
        <>
          <video src={state.url} controls playsInline className="w-full rounded-lg bg-black aspect-video" data-testid="export-preview" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-slate-300" data-testid="export-stats">
            <dt className="text-slate-500">길이</dt><dd>{formatDuration(state.result.durationMs)}</dd>
            <dt className="text-slate-500">만든 시간</dt><dd>{(state.result.elapsedMs / 1000).toFixed(1)}초 (실제 길이의 {Math.round(state.result.elapsedMs / state.result.durationMs * 100)}%)</dd>
            <dt className="text-slate-500">크기</dt><dd>{megabytes(state.result.blob.size)}</dd>
            <dt className="text-slate-500">형식</dt>
            <dd>{CODEC_NAMES[state.result.videoCodec] ?? state.result.videoCodec}{state.result.audioCodec ? ` + ${CODEC_NAMES[state.result.audioCodec] ?? state.result.audioCodec}` : ' (소리 없음)'}</dd>
            <dt className="text-slate-500">걸린 곳</dt>
            <dd data-testid="export-timings">{timingText(state.result)}</dd>
            <dt className="text-slate-500">인코더</dt>
            <dd data-testid="export-encoder">{encoderText(state.result)}</dd>
          </dl>
          <label className="block space-y-1">
            <span className="text-[11px] text-slate-400">파일 이름 (유튜브 제목)</span>
            <input value={title} onChange={event => setTitle(event.target.value)} aria-label="파일 이름"
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs text-slate-100" />
          </label>
          <div className="flex gap-2">
            <a href={state.url} download={exportFileName(title || recording.manifest.title)} onClick={removeServerCopy} className={`${button} flex-1 flex items-center justify-center bg-emerald-600 border-emerald-400 text-white`}>⬇ 기기에 저장</a>
            <button type="button" onClick={() => setState({ phase: 'idle' })} className={`${button} bg-slate-800 border-slate-600 text-slate-100`}>다시</button>
          </div>
          <p data-testid="export-server-copy" className={`text-[11px] break-keep ${serverCopy === 'failed' ? 'text-rose-300' : serverCopy === 'deleted' ? 'text-emerald-300' : 'text-slate-400'}`}>
            {serverCopy === 'kept' ? '저장하면 이 녹음은 서버에서 지워져요(이 창을 닫기 전까지는 다시 만들 수 있어요).'
              : serverCopy === 'deleting' ? '서버의 녹음을 지우는 중…'
              : serverCopy === 'deleted' ? '✓ 서버의 녹음을 지웠어요. 창을 닫기 전까지는 다시 만들 수 있어요.'
              : '서버의 녹음을 지우지 못했어요. 녹음 목록에서 직접 지워 주세요.'}
          </p>
        </>
      )}

      {state.phase === 'error' && (
        <>
          <p role="alert" className="text-[11px] text-rose-200 bg-rose-950/60 border border-rose-800 rounded-lg p-2 break-keep">{state.message}</p>
          <button type="button" onClick={() => setState({ phase: 'idle' })} className={`${button} w-full bg-slate-800 border-slate-600 text-slate-100`}>다시 시도</button>
        </>
      )}
    </div>
  );
};
