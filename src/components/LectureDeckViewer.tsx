import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { groupSlidesBySection, SLIDE_HEIGHT, SLIDE_WIDTH, type LectureDeck } from '../features/lectures/lectureDecks';
import { ExamInkCanvas } from '../features/exam/ink/ExamInkCanvas';
import type { ExamInkCanvasHandle, InkChangeKind, InkStroke, InkTool } from '../features/exam/contract';
import { LectureRecordingSession } from '../features/lectures/lectureRecorder';
import type { LoadedRecording, RecordingBackend } from '../features/lectures/lectureRecordings';
import { LectureInkToolbar, LectureRecordingControls, LectureReplayBar } from './LectureDeckTools';
import { LectureExportPanel } from './LectureExportPanel';

interface LectureDeckViewerProps {
  deck: LectureDeck;
  /** 슬라이드 순서와 같은 서명 주소 목록 */
  urls: string[];
  onClose: () => void;
  /** 있으면 녹음 버튼을 보인다(관리자). */
  recordingBackend?: RecordingBackend;
  /** 녹음을 하나 끝냈을 때(목록 새로 고침). */
  onRecorded?: () => void;
  /** 저장된 녹음 재생. 이때는 필기·녹음 도구 대신 재생 막대가 나온다. */
  replay?: LoadedRecording;
  /** 처음 보여 줄 슬라이드(이어서 보기). */
  initialIndex?: number;
  /** 넘긴 슬라이드 위치를 알려 준다(재생 중에는 부르지 않는다). */
  onIndexChange?: (index: number) => void;
}

const EMPTY: InkStroke[] = [];
const noop = () => {};

/** 화면 너비·높이(슬라이드 무대). 필기 캔버스는 무대 너비 = 1 단위(1920px)로 좌표를 잰다. */
function useElementSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

// 교재 슬라이드 전체 화면 보기. 가로 태블릿(갤럭시 탭 + S펜) 우선.
// 슬라이드 영역은 1920×1080 좌표계를 그대로 확대/축소하고, 슬라이드마다 필기 레이어를 같은 상자에 겹친다.
export const LectureDeckViewer: React.FC<LectureDeckViewerProps> = ({ deck, urls, onClose, recordingBackend, onRecorded, replay, initialIndex = 0, onIndexChange }) => {
  const [manualIndex, setIndex] = useState(() => Math.max(0, Math.min(deck.slides.length - 1, initialIndex)));
  const onIndexChangeRef = useRef(onIndexChange);
  useEffect(() => { onIndexChangeRef.current = onIndexChange; }, [onIndexChange]);
  useEffect(() => { if (!replay) onIndexChangeRef.current?.(manualIndex); }, [manualIndex, replay]);
  const [tocOpen, setTocOpen] = useState(false);
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const total = deck.slides.length;

  // ── 재생 ──
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const timeRef = useRef(0);
  const speedRef = useRef(speed);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  const replayTotal = replay?.replay.total ?? 0;
  useEffect(() => {
    if (!playing || !replay) return;
    let last = performance.now(), frame = 0;
    const tick = (now: number) => {
      const next = Math.min(replayTotal, timeRef.current + (now - last) * speedRef.current);
      last = now; timeRef.current = next; setTime(next);
      if (next >= replayTotal) { setPlaying(false); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, replay, replayTotal]);
  const seek = (ms: number) => { timeRef.current = Math.max(0, Math.min(replayTotal, ms)); setTime(timeRef.current); };
  const togglePlay = () => {
    if (!playing && timeRef.current >= replayTotal) seek(0);
    setPlaying(p => !p);
  };
  const frame = useMemo(() => replay?.replay.frame(time), [replay, time]);

  const index = frame ? frame.slideIndex : manualIndex;
  const slide = deck.slides[index];
  const groups = useMemo(() => groupSlidesBySection(deck.slides), [deck.slides]);
  const go = useCallback((next: number) => { if (!replay) setIndex(Math.max(0, Math.min(total - 1, next))); }, [total, replay]);
  const currentItemRef = useRef<HTMLButtonElement | null>(null);

  // ── 필기(슬라이드마다 따로) ──
  const [ink, setInk] = useState<Record<string, InkStroke[]>>({});
  const inkStateRef = useRef(ink);
  const [tool, setTool] = useState<InkTool>('pen');
  const [color, setColor] = useState('#1f2937'); // 검정(도구 막대 첫 색)
  const [size, setSize] = useState(4);
  const canvasRef = useRef<ExamInkCanvasHandle>(null);
  const [, setHistoryTick] = useState(0);

  // ── 녹음 ──
  const [session, setSession] = useState<LectureRecordingSession | null>(() => recordingBackend ? new LectureRecordingSession(recordingBackend) : null);
  const subscribe = useCallback((listener: () => void) => session?.subscribe(listener) ?? noop, [session]);
  const recState = useSyncExternalStore(subscribe, () => session?.state ?? null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => setElapsed(session.elapsed()), 250);
    return () => window.clearInterval(id);
  }, [session]);
  useEffect(() => () => session?.dispose(), [session]);
  const [noticeHidden, setNoticeHidden] = useState('');
  const phase = recState?.phase ?? 'idle';
  const notice = recState?.notice && recState.notice !== noticeHidden ? recState.notice : '';

  const onInkChange = useCallback((slideId: string) => (next: InkStroke[], kind: InkChangeKind = 'draw') => {
    const before = inkStateRef.current[slideId] ?? EMPTY;
    inkStateRef.current = { ...inkStateRef.current, [slideId]: next };
    setInk(inkStateRef.current);
    session?.logInk(slideId, before, next, kind);
    setHistoryTick(t => t + 1);
  }, [session]);
  const slideInkChange = useMemo(() => onInkChange(slide.id), [onInkChange, slide.id]);

  // 일시정지 중에는 현재 슬라이드만 기억하고 이어하기 때 이동을 기록한다.
  useEffect(() => { if (!replay) session?.logSlide(slide.id); }, [slide.id, session, replay]);

  // 녹음 중에 창을 닫거나 새로 고치려 하면 묻는다.
  useEffect(() => {
    if (!session) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (session.active || session.unsaved) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [session]);

  const startRecording = () => {
    if (!session) return;
    const now = new Date();
    const stamp = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    void session.start({ deckId: deck.id, title: `${deck.title} · ${stamp} 녹음`, slides: deck.slides, initialSlideId: slide.id, ink: inkStateRef.current });
  };
  const endRecording = async () => {
    if (!session) return;
    await session.end();
    onRecorded?.();
  };
  const newRecording = () => { if (recordingBackend) { session?.dispose(); setSession(new LectureRecordingSession(recordingBackend)); } };

  const close = useCallback(async () => {
    if (session && session.active) {
      if (!confirm('녹음을 끝내고 닫을까요? 지금까지 녹음한 내용은 저장돼요.')) return;
      await session.end();
      onRecorded?.();
    }
    if (session && session.unsaved && !confirm('아직 저장하지 못한 녹음 조각이 있어요. 그래도 닫을까요?')) return;
    onClose();
  }, [session, onClose, onRecorded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (replay) {
        if (e.key === ' ') { e.preventDefault(); togglePlay(); }
        else if (e.key === 'Escape') void close();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); setIndex(i => Math.min(total - 1, i + 1)); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
      else if (e.key === 'Home') setIndex(0);
      else if (e.key === 'End') setIndex(total - 1);
      else if (e.key === 'Escape') { if (tocOpen) setTocOpen(false); else void close(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // 다음(과 이전) 슬라이드를 미리 받아 둔다.
  useEffect(() => {
    for (const i of [index + 1, index - 1, index + 2]) {
      if (i >= 0 && i < total && urls[i]) { const img = new Image(); img.decoding = 'async'; img.src = urls[i]; }
    }
  }, [index, total, urls]);

  useEffect(() => { if (tocOpen) currentItemRef.current?.scrollIntoView({ block: 'center' }); }, [tocOpen]);

  // 손가락 스와이프만 넘김으로 쓴다(S펜·마우스는 필기).
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && !replay) swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = swipe.current; swipe.current = null;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
  };

  const stageRef = useRef<HTMLDivElement>(null);
  const stageSize = useElementSize(stageRef);
  const pageText = (page: number | null) => page != null ? `교재 ${page}쪽` : '';
  const strokes = frame ? frame.strokes : ink[slide.id] ?? EMPTY;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white select-none" role="dialog" aria-modal="true" aria-label={`${deck.title} 슬라이드`}>
      {/* 상단 바 */}
      <div className="flex-none h-12 flex items-center gap-2 px-2 sm:px-3 bg-slate-950/95 border-b border-slate-800">
        <button onClick={() => void close()} aria-label="닫기" className="w-9 h-9 flex-none rounded-full bg-slate-900 border border-slate-800 text-slate-300 text-sm font-bold active:scale-95">✕</button>
        <div className="min-w-[80px] flex-1">
          <div className="text-[11px] sm:text-xs font-black text-slate-100 truncate">{replay ? `▶ ${replay.manifest.title}` : deck.title}</div>
          <div className="text-[10px] text-slate-400 truncate">{slide.section}{slide.section && slide.label ? ' · ' : ''}{slide.label}{slide.bookPage != null ? ` · ${pageText(slide.bookPage)}` : ''}</div>
        </div>
        <div data-slot="pen-toolbar" className="min-w-0 flex items-center gap-1">
          {!replay && (
            <LectureInkToolbar
              tool={tool} color={color} size={size} onTool={setTool} onColor={setColor} onSize={setSize}
              canUndo={!!canvasRef.current?.canUndo()} canRedo={!!canvasRef.current?.canRedo()} canClear={!!ink[slide.id]?.length}
              onUndo={() => canvasRef.current?.undo()} onRedo={() => canvasRef.current?.redo()}
              onClear={() => canvasRef.current?.clear()}
            />
          )}
        </div>
        {session && recState && !replay && (
          <LectureRecordingControls state={recState} elapsedMs={elapsed}
            onStart={startRecording} onPause={() => void session.pause()} onResume={() => void session.resume()}
            onEnd={() => void endRecording()} onRetry={() => session.retry()} onNew={newRecording} />
        )}
        <span data-testid="slide-counter" className="flex-none text-xs font-mono font-bold text-slate-300 px-1">{index + 1} / {total}</span>
        <button
          onClick={() => setTocOpen(open => !open)}
          aria-expanded={tocOpen}
          className={`flex-none h-9 px-3 rounded-xl text-xs font-black border active:scale-95 ${tocOpen ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-300'}`}
        >
          ☰ 목차
        </button>
      </div>

      {notice && (
        <div role="alert" data-testid="recording-notice" className={`flex-none flex items-center gap-2 px-3 py-2 text-xs font-bold ${phase === 'paused' ? 'bg-amber-500/20 text-amber-100 border-b border-amber-500/40' : 'bg-rose-900/60 text-rose-100 border-b border-rose-500/40'}`}>
          <span className="flex-1">{notice}</span>
          {phase === 'paused' && session && <button type="button" onClick={() => void session.resume()} className="h-7 px-2.5 rounded-lg bg-rose-600 text-white text-[11px] font-black">● 이어하기</button>}
          <button type="button" aria-label="안내 닫기" onClick={() => setNoticeHidden(recState?.notice ?? '')} className="h-7 w-7 rounded-lg bg-slate-900/60 text-slate-200">✕</button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex relative">
        {/* 슬라이드 무대: 16:9 유지, 남는 공간은 레터박스 */}
        <div
          className="flex-1 min-w-0 relative flex items-center justify-center touch-pan-y"
          style={{ containerType: 'size' }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { swipe.current = null; }}
        >
          <div
            ref={stageRef}
            data-testid="slide-stage"
            data-slide-id={slide.id}
            className="relative bg-white shadow-2xl"
            style={{ width: `min(100cqw, calc(100cqh * ${SLIDE_WIDTH} / ${SLIDE_HEIGHT}))`, aspectRatio: `${SLIDE_WIDTH} / ${SLIDE_HEIGHT}` }}
          >
            {urls[index] ? (
              <img
                key={index}
                src={urls[index]}
                alt={`${index + 1}번 슬라이드 ${slide.label}`}
                draggable={false}
                onLoad={() => setLoaded(prev => ({ ...prev, [index]: true }))}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              />
            ) : null}
            {!loaded[index] && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs font-bold">
                {urls[index] ? '불러오는 중…' : '슬라이드 주소를 만들지 못했습니다.'}
              </div>
            )}
            {stageSize.height > 0 && (
              <div className="absolute inset-0" data-testid="slide-ink">
                <ExamInkCanvas
                  key={replay ? 'replay' : slide.id}
                  ref={replay ? undefined : canvasRef}
                  imageUrl=""
                  surface={{ height: stageSize.height, transparent: true }}
                  strokes={strokes}
                  onChange={replay ? noop : slideInkChange}
                  onPan={noop}
                  tool={tool} color={color} size={size}
                  penOnly
                  readOnly={!!replay}
                />
              </div>
            )}
          </div>

          {!replay && (
            <>
              <button
                onClick={() => go(index - 1)}
                disabled={index === 0}
                aria-label="이전 슬라이드"
                className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 w-11 h-16 rounded-2xl bg-slate-900/70 border border-slate-700/60 text-xl font-black text-slate-200 disabled:opacity-20 active:scale-95"
              >
                ‹
              </button>
              <button
                onClick={() => go(index + 1)}
                disabled={index === total - 1}
                aria-label="다음 슬라이드"
                className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 w-11 h-16 rounded-2xl bg-slate-900/70 border border-slate-700/60 text-xl font-black text-slate-200 disabled:opacity-20 active:scale-95"
              >
                ›
              </button>
            </>
          )}
        </div>

        {/* 목차: 넓은 화면은 오른쪽 칸, 휴대폰은 덮개 */}
        {tocOpen && (
          <>
            <div className="absolute inset-0 bg-black/50 sm:hidden" onClick={() => setTocOpen(false)} />
            <nav
              aria-label="목차"
              className="absolute sm:static right-0 top-0 bottom-0 w-[82%] max-w-xs sm:w-72 flex-none bg-slate-950 border-l border-slate-800 overflow-y-auto p-2 space-y-3"
            >
              {groups.map((group, gi) => (
                <div key={gi}>
                  {group.section && <div className="px-2 pt-1 pb-1.5 text-[11px] font-black text-amber-300">{group.section}</div>}
                  <div className="space-y-1">
                    {group.indexes.map(i => {
                      const item = deck.slides[i];
                      const current = i === index;
                      return (
                        <button
                          key={item.id}
                          ref={current ? currentItemRef : undefined}
                          aria-current={current ? 'true' : undefined}
                          onClick={() => { go(i); if (window.innerWidth < 640) setTocOpen(false); }}
                          className={`w-full text-left px-2.5 py-2 rounded-xl border flex items-center gap-2 ${current ? 'bg-indigo-600/25 border-indigo-500 text-white' : 'bg-slate-900/60 border-slate-850 text-slate-300 hover:border-slate-700'}`}
                        >
                          <span className="flex-none w-6 text-[10px] font-mono text-slate-500">{i + 1}</span>
                          <span className="flex-1 min-w-0 text-xs font-bold leading-snug break-keep">{item.label}</span>
                          {item.bookPage != null && <span className="flex-none text-[10px] text-slate-400">{pageText(item.bookPage)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </>
        )}
      </div>

      {replay && (
        <LectureReplayBar time={time} total={replayTotal} playing={playing} speed={speed} clips={replay.clips}
          onToggle={togglePlay} onSeek={seek} onSpeed={setSpeed} onExport={() => { setPlaying(false); setExportOpen(open => !open); }} />
      )}
      {replay && exportOpen && <LectureExportPanel recording={replay} slideUrls={urls} onClose={() => setExportOpen(false)} />}
    </div>,
    document.body,
  );
};
