import React from 'react';
import type { InkTool } from '../features/exam/contract';
import { LassoIcon } from '../features/exam/ui/LassoIcon';
import { ReplayAudio } from '../features/exam/audio/ReplayAudio';
import type { SolutionAudioClip } from '../features/exam/contract';
import { formatDuration } from '../features/lectures/lectureRecordingModel';
import type { RecordingSessionState } from '../features/lectures/lectureRecorder';
import '../styles/lectureDeck.css';

// 교재 슬라이드 보기의 도구 막대: 펜 도구, 녹음 버튼, 재생 막대.
const LECTURE_PEN_COLORS = [
  { value: '#1f2937', label: '검정' },
  { value: '#2563eb', label: '파랑' },
  { value: '#dc2626', label: '빨강' },
  { value: '#16a34a', label: '초록' },
];
const LECTURE_PEN_SIZES = [
  { value: 2, label: '가늘게' },
  { value: 4, label: '보통' },
  { value: 7, label: '굵게' },
];
const TOOLS: ReadonlyArray<readonly [InkTool, string, string | null]> = [
  ['pen', '펜', '✏️'], ['highlighter', '형광펜', '🖍️'], ['eraser', '지우개', '🧽'], ['lasso', '올가미(옮기기·크기·회전)', null],
];

const iconButton = 'flex-none w-8 h-8 rounded-lg flex items-center justify-center text-sm border active:scale-95 disabled:opacity-30';
const off = 'bg-slate-900 border-slate-800 text-slate-300';
const on = 'bg-indigo-600 border-indigo-400 text-white';

export const LectureInkToolbar: React.FC<{
  tool: InkTool; color: string; size: number;
  onTool: (tool: InkTool) => void; onColor: (color: string) => void; onSize: (size: number) => void;
  canUndo: boolean; canRedo: boolean; canClear: boolean;
  onUndo: () => void; onRedo: () => void; onClear: () => void;
}> = props => (
  <div role="toolbar" aria-label="필기 도구" className="flex items-center gap-1 overflow-x-auto max-w-full" data-testid="lecture-pen-toolbar">
    {TOOLS.map(([value, label, icon]) => (
      <button key={value} type="button" aria-label={label} title={label} aria-pressed={props.tool === value}
        className={`${iconButton} ${props.tool === value ? on : off}`} onClick={() => props.onTool(value)}>
        {icon ? <span aria-hidden="true">{icon}</span> : <LassoIcon />}
      </button>
    ))}
    <span className="flex-none w-px h-6 bg-slate-800 mx-0.5" />
    {LECTURE_PEN_COLORS.map(c => (
      <button key={c.value} type="button" aria-label={`${c.label}색`} aria-pressed={props.color === c.value}
        className={`flex-none w-6 h-6 rounded-full border-2 active:scale-95 ${props.color === c.value ? 'border-white' : 'border-slate-700'}`}
        style={{ background: c.value }}
        onClick={() => { props.onColor(c.value); if (props.tool === 'eraser' || props.tool === 'lasso') props.onTool('pen'); }} />
    ))}
    <span className="flex-none w-px h-6 bg-slate-800 mx-0.5" />
    {LECTURE_PEN_SIZES.map(s => (
      <button key={s.value} type="button" aria-label={`굵기 ${s.label}`} aria-pressed={props.size === s.value}
        className={`${iconButton} ${props.size === s.value ? on : off}`} onClick={() => props.onSize(s.value)}>
        <i className="block rounded-full bg-current" style={{ width: s.value + 3, height: s.value + 3 }} />
      </button>
    ))}
    <span className="flex-none w-px h-6 bg-slate-800 mx-0.5" />
    <button type="button" aria-label="실행 취소" title="실행 취소" disabled={!props.canUndo} className={`${iconButton} ${off}`} onClick={props.onUndo}>↶</button>
    <button type="button" aria-label="다시 실행" title="다시 실행" disabled={!props.canRedo} className={`${iconButton} ${off}`} onClick={props.onRedo}>↷</button>
    <button type="button" aria-label="이 슬라이드 필기 지우기" title="이 슬라이드 필기 지우기" disabled={!props.canClear} className={`${iconButton} ${off}`} onClick={props.onClear}>🗑️</button>
  </div>
);

const pill = 'flex-none h-8 px-2.5 rounded-lg text-[11px] font-black border active:scale-95 disabled:opacity-40 whitespace-nowrap';

export const LectureRecordingControls: React.FC<{
  state: RecordingSessionState; elapsedMs: number;
  onStart: () => void; onPause: () => void; onResume: () => void; onEnd: () => void; onRetry: () => void; onNew: () => void;
}> = ({ state, elapsedMs, onStart, onPause, onResume, onEnd, onRetry, onNew }) => {
  const { phase } = state;
  const time = formatDuration(elapsedMs);
  const saveText = state.failed ? null : state.uploading ? '저장 중…' : state.savedAt ? '저장됨' : '';
  return (
    <div className="flex-none flex items-center gap-1" data-testid="lecture-recording" data-phase={phase}>
      {phase === 'idle' && (
        <button type="button" onClick={onStart} className={`${pill} bg-rose-600 border-rose-400 text-white`}>● 녹음 시작</button>
      )}
      {phase === 'starting' && <span className={`${pill} flex items-center bg-slate-900 border-slate-700 text-slate-300`}>마이크 준비 중…</span>}
      {phase === 'recording' && (
        <span role="status" data-testid="recording-indicator" className={`${pill} flex items-center gap-1.5 bg-rose-600 border-rose-400 text-white`}>
          <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" aria-hidden="true" />녹음 중 <span className="font-mono">{time}</span>
        </span>
      )}
      {phase === 'paused' && (
        <span role="status" className={`${pill} flex items-center gap-1 bg-amber-500/20 border-amber-400/60 text-amber-200`}>
          ⏸ 일시정지 <span className="font-mono">{time}</span>
        </span>
      )}
      {phase === 'recording' && <button type="button" onClick={onPause} className={`${pill} bg-slate-900 border-slate-700 text-slate-100`}>⏸ 일시정지</button>}
      {phase === 'paused' && <button type="button" onClick={onResume} className={`${pill} bg-rose-600 border-rose-400 text-white`}>● 이어하기</button>}
      {(phase === 'recording' || phase === 'paused') && (
        <button type="button" onClick={onEnd} className={`${pill} bg-slate-900 border-slate-700 text-slate-100`}>■ 끝내기</button>
      )}
      {phase === 'ending' && <span className={`${pill} flex items-center bg-slate-900 border-slate-700 text-slate-300`}>녹음 저장 중…</span>}
      {phase === 'done' && (
        <>
          <span className={`${pill} flex items-center bg-emerald-600/20 border-emerald-500/50 text-emerald-200`}>✓ 녹음 끝 {time}</span>
          <button type="button" onClick={onNew} className={`${pill} bg-slate-900 border-slate-700 text-slate-100`}>● 새 녹음</button>
        </>
      )}
      {phase !== 'idle' && (state.failed > 0 ? (
        <button type="button" onClick={onRetry} data-testid="recording-save-state" data-save="failed"
          className={`${pill} bg-rose-950 border-rose-500 text-rose-200`}>⚠ 저장 안 됨 {state.failed} · 다시 시도</button>
      ) : saveText ? (
        <span data-testid="recording-save-state" data-save={state.uploading ? 'saving' : 'saved'} className="flex-none text-[10px] font-bold text-slate-400 px-1 whitespace-nowrap">{saveText}</span>
      ) : null)}
    </div>
  );
};

export const LectureReplayBar: React.FC<{
  time: number; total: number; playing: boolean; speed: number; clips: SolutionAudioClip[];
  onToggle: () => void; onSeek: (ms: number) => void; onSpeed: (speed: number) => void; onExport?: () => void;
}> = ({ time, total, playing, speed, clips, onToggle, onSeek, onSpeed, onExport }) => (
  <div className="lecture-replay flex-none flex items-center gap-2 px-2 sm:px-3 py-1.5 bg-slate-950/95 border-t border-slate-800" data-testid="lecture-replay-bar">
    <button type="button" onClick={onToggle} aria-label={playing ? '일시정지' : '재생'}
      className="flex-none w-10 h-10 rounded-full bg-indigo-600 border border-indigo-400 text-white text-base font-black active:scale-95">
      {playing ? '❚❚' : '▶'}
    </button>
    <span className="flex-none text-[11px] font-mono text-slate-300" data-testid="replay-time">{formatDuration(time)} / {formatDuration(total)}</span>
    <input type="range" min={0} max={Math.max(1, total)} step={100} value={Math.min(time, total)} aria-label="재생 위치"
      onChange={e => onSeek(Number(e.target.value))} className="flex-1 min-w-0 accent-indigo-500" />
    <div className="flex-none flex items-center gap-0.5" role="group" aria-label="배속">
      {[1, 1.5, 2].map(value => (
        <button key={value} type="button" aria-pressed={speed === value} onClick={() => onSpeed(value)}
          className={`h-8 px-2 rounded-lg text-[11px] font-black border ${speed === value ? on : off}`}>{value}×</button>
      ))}
    </div>
    {onExport && (
      <button type="button" onClick={onExport} aria-label="MP4로 저장" title="MP4로 저장"
        className={`flex-none h-8 px-2 rounded-lg text-[11px] font-black border ${off}`}>🎬 MP4</button>
    )}
    {clips.length > 0 && <ReplayAudio clips={clips} time={time} playing={playing} speed={speed} shift={0} />}
  </div>
);
