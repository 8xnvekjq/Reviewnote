import React, { useEffect, useRef, useState } from 'react';
import type { LoadedRecording } from '../features/lectures/lectureRecordings';
import { formatDuration } from '../features/lectures/lectureRecordingModel';
import { EXPORT_TEST_MS, clearExportFiles, exportFileName, exportLectureMp4, type ExportProgress, type ExportResult } from '../features/lectures/lectureExport';

// 녹음 재생 화면의 'MP4로 저장' 창: 현재 위치부터 1분 테스트, 또는 전체 영상(브라우저 저장 공간에 쓴 뒤 기기에 저장).
type WakeLockSentinel = { release(): Promise<void> };

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
const seconds = (ms: number) => `${Math.round(ms / 1000)}초`;
const timingText = ({ timings: t, frames }: ExportResult) =>
  `그리기 ${seconds(t.draw)} · 영상 ${seconds(t.video)} · 소리 ${seconds(t.audio)} · 프레임 ${frames.toLocaleString()}${t.hidden > 1000 ? ` · 창 숨김 ${seconds(t.hidden)}` : ''}`;
const remainText = (ms: number) => ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))}초` : `${Math.round(ms / 60_000)}분`;
const CODEC_NAMES: Record<string, string> = { avc: 'H.264', vp9: 'VP9', av1: 'AV1', aac: 'AAC', opus: 'Opus' };

type State =
  | { phase: 'idle' }
  | { phase: 'running'; full: boolean; fromMs: number; toMs: number; progress: ExportProgress | null }
  | { phase: 'done'; result: ExportResult; url: string; name: string }
  | { phase: 'error'; message: string };

export const LectureExportPanel: React.FC<{
  recording: LoadedRecording; slideUrls: string[]; time: number; onClose: () => void;
}> = ({ recording, slideUrls, time, onClose }) => {
  const [state, setState] = useState<State>({ phase: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);
  const total = recording.replay.total;
  // 끝 가까이에서 열면 끝에서 1분을 만든다.
  const testFrom = Math.max(0, Math.min(Math.floor(time / 1000) * 1000, total - EXPORT_TEST_MS));
  const testTo = Math.min(total, testFrom + EXPORT_TEST_MS);

  // 닫으면 만들던 것을 멈추고, 저장 공간에 남은 영상 파일도 지운다(기기에 저장한 파일은 그대로).
  useEffect(() => () => {
    abortRef.current?.abort();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    void clearExportFiles();
  }, []);

  const start = async (full: boolean) => {
    const fromMs = full ? 0 : testFrom, toMs = full ? total : testTo;
    const controller = new AbortController();
    abortRef.current = controller;
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    setState({ phase: 'running', full, fromMs, toMs, progress: null });
    let wake: WakeLockSentinel | null = null;
    try {
      wake = await (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> } }).wakeLock?.request('screen') ?? null;
    } catch { /* 화면 켜짐 유지를 못 해도 계속 */ }
    try {
      const result = await exportLectureMp4({
        replay: recording.replay, slideIds: recording.manifest.slides.map(slide => slide.id), slideUrls, clips: recording.clips,
        fromMs, toMs, toFile: full, signal: controller.signal,
        onProgress: progress => setState(prev => prev.phase === 'running' ? { ...prev, progress } : prev),
      });
      const url = URL.createObjectURL(result.blob);
      urlRef.current = url;
      setState({ phase: 'done', result, url, name: exportFileName(recording.manifest.title, fromMs, toMs, !full) });
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
          <button type="button" onClick={() => void start(true)} className={`${button} w-full bg-indigo-600 border-indigo-400 text-white`}>
            전체 영상 만들기 ({formatDuration(total)})
          </button>
          <button type="button" onClick={() => void start(false)} className={`${button} w-full bg-slate-800 border-slate-600 text-slate-100`}>
            1분 테스트 ({formatDuration(testFrom)}–{formatDuration(testTo)})
          </button>
          <p className="text-[10px] text-slate-500 break-keep">1분 테스트는 재생 막대 위치부터 만들어요.</p>
        </>
      )}

      {state.phase === 'running' && (() => {
        const p = state.progress;
        const ratio = p ? p.doneMs / p.totalMs : 0;
        const remain = p && ratio > 0 ? (p.elapsedMs / ratio) * (1 - ratio) : null;
        return (
          <>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
              <div className="h-full bg-indigo-500 transition-[width]" style={{ width: `${ratio * 100}%` }} />
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
          </dl>
          <div className="flex gap-2">
            <a href={state.url} download={state.name} className={`${button} flex-1 flex items-center justify-center bg-emerald-600 border-emerald-400 text-white`}>⬇ 기기에 저장</a>
            <button type="button" onClick={() => setState({ phase: 'idle' })} className={`${button} bg-slate-800 border-slate-600 text-slate-100`}>다시</button>
          </div>
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
