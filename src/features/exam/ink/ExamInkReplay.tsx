import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react';
import type { ExamClient, ExamInkCanvasHandle, InkChangeKind, InkReplayData, InkStroke, InkTool } from '../contract';
import { ReplayAudio } from '../audio/ReplayAudio';
import { ExamInkCanvas } from './ExamInkCanvas';
import { inkExtent, replayStrokeLists } from './inkFit';
import { REPLAY_MAX_PAUSE_MS, buildInkClock, buildInkTimeline, formatReplayTime } from './inkReplay';

/** 여러 풀이가 하나의 시계를 공유할 때 기존 캔버스로 지정 시각의 프레임만 표시한다. */
export const ExamInkReplayFrame = memo(function ExamInkReplayFrame({ data, clock, time, imageUrl, imageMaxWidth, notes }: {
  data: InkReplayData; clock: ReturnType<typeof buildInkClock>; time: number; imageUrl: string; imageMaxWidth: number;
  notes?: ReplayNotes;
}) {
  const fit = useMemo(() => inkExtent(data.strokes, ...replayStrokeLists(data)), [data]);
  return <div className="exam-replay-frame">
    <ExamInkCanvas imageUrl={imageUrl} strokes={clock.frame(time)} onChange={() => {}}
      tool="pen" color="#1f2937" size={4} readOnly imageMaxWidth={imageMaxWidth} fitToInk={fit} />
    {notes && <div className="exam-compare-notes" data-testid="compare-notes">
      <ExamInkCanvas key={notes.canvasKey} ref={notes.inkRef} imageUrl={imageUrl} strokes={notes.strokes}
        onChange={notes.onChange} tool={notes.tool} color={notes.color} size={notes.size}
        penOnlyWhenPenDetected={false} readOnly={!notes.ready} imageMaxWidth={imageMaxWidth} fitToInk={fit} />
    </div>}
  </div>;
});

/** 결과 화면 덧쓰기(이 기기 전용). 재생 중에는 쓰지 않고 재생 프레임만 보여 준다. */
export interface ReplayNotes {
  strokes: InkStroke[];
  onChange: (next: InkStroke[], kind?: InkChangeKind) => void;
  tool: InkTool;
  color: string;
  size: number;
  inkRef: Ref<ExamInkCanvasHandle>;
  /** 쓰기 도구 막대(재생 중에는 숨긴다). */
  toolbar: ReactNode;
  /** false면 아직 원래 필기를 불러오는 중이라 쓰지 않는다. */
  ready: boolean;
  /** 덧쓰기를 처음부터 다시(원래 풀이로 되돌리기) 할 때 바꿔 캔버스 실행 취소 기록을 비운다. */
  canvasKey?: string | number;
}

interface Props {
  client: Pick<ExamClient, 'getInkReplay'>;
  attemptId: string;
  questionId: string;
  imageUrl: string;
  strokes: InkStroke[];
  imageMaxWidth?: number;
  /** 열자마자 필기 순서를 불러와 재생한다(관리자 검토). */
  autoOpen?: boolean;
  /** Anonymous peer viewers never read or write browser storage, including dock position. */
  persistDock?: boolean;
  inline?: boolean;
  /** 다른 풀이에서는 짧게 탭해 재생을 멈추거나 이어 간다. */
  peerPlayback?: boolean;
  notes?: ReplayNotes;
  /** 재생 막대 줄 끝에 늘 보이는 버튼(예: 다른 학생 풀이). */
  barExtra?: ReactNode;
}
/** 재생 상자 아이콘(이모지 ⏮⏭⏸는 윈도우·안드로이드에서 파란 네모 이모지로 나와 SVG로 그린다). */
const ICON_PATHS = {
  first: 'M6 5v14M18 5 9 12l9 7z',
  prev: 'M15 5l-7 7 7 7',
  play: 'M8 5v14l11-7z',
  pause: 'M8 5v14M16 5v14',
  next: 'M9 5l7 7-7 7',
  last: 'M18 5v14M6 5l9 7-9 7z',
  fold: 'M15 6l-6 6 6 6',
  unfold: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6 6 18',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
} as const;
export function ReplayIcon({ name }: { name: keyof typeof ICON_PATHS }) {
  const filled = name === 'play' || name === 'first' || name === 'last';
  return <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth={name === 'pause' || name === 'grip' ? 3 : 2.2} strokeLinecap="round" strokeLinejoin="round"><path d={ICON_PATHS[name]} /></svg>;
}

/** 재생 상자 위치(화면 px, 왼쪽 위 기준). 끌어 옮긴 자리를 다음에도 쓴다(이 기기에서만). */
const DOCK_POS_KEY = 'rn-exam-replay-dock-pos:v1';
type DockPos = { x: number; y: number };
function readDockPos(): DockPos | null {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DOCK_POS_KEY) ?? 'null');
    if (parsed && typeof parsed === 'object' && Number.isFinite((parsed as DockPos).x) && Number.isFinite((parsed as DockPos).y)) return parsed as DockPos;
  } catch { /* 저장소를 못 쓰면 기본 자리 */ }
  return null;
}
const clampDock = (pos: DockPos, el: HTMLElement | null): DockPos => {
  const w = el?.offsetWidth ?? 160, h = el?.offsetHeight ?? 60;
  return {
    x: Math.max(4, Math.min(window.innerWidth - w - 4, pos.x)),
    y: Math.max(4, Math.min(window.innerHeight - h - 4, pos.y)),
  };
};

/** 재생 상자 위쪽 줄(손잡이)을 잡고 끌어 옮긴다. 버튼을 누른 건 끌기로 보지 않는다. */
function useDockDrag(persist: boolean) {
  const dockRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<DockPos | null>(() => persist ? readDockPos() : null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  // 화면 크기가 바뀌어(가로·세로 전환 등) 상자가 화면 밖으로 나가지 않게
  useEffect(() => {
    if (!pos) return;
    const fit = () => setPos(prev => prev && clampDock(prev, dockRef.current));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos === null]);
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button, input, select')) return;
    const rect = dockRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    drag.current = { id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* 합성 이벤트 등 */ }
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    setPos(clampDock({ x: event.clientX - d.dx, y: event.clientY - d.dy }, dockRef.current));
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    drag.current = null;
    setPos(prev => {
      if (persist && prev) try { window.localStorage.setItem(DOCK_POS_KEY, JSON.stringify(prev)); } catch { /* 저장 불가 */ }
      return prev;
    });
  };
  const handle = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
  const style: CSSProperties | undefined = pos ? { left: pos.x, top: pos.y, bottom: 'auto', transform: 'none' } : undefined;
  return { dockRef, handle, style };
}

export function ExamInkReplay({ client, attemptId, questionId, imageUrl, strokes, imageMaxWidth, autoOpen = false, persistDock = true, inline = false, peerPlayback = false, notes, barExtra }: Props) {
  const [open, setOpen] = useState(autoOpen);
  const [data, setData] = useState<InkReplayData | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  // 재생 위치는 획 개수가 아니라 시간(ms)이다. 슬라이더·배속 모두 이 시간 축을 따른다.
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [folded, setFolded] = useState(false);
  const pointers = useRef(new Set<number>());
  const tap = useRef<{ id: number; x: number; y: number; at: number } | null>(null);
  const [feedback, setFeedback] = useState<{ id: number; x: number; y: number; playing: boolean } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!peerPlayback) return;
    const cancel = () => { tap.current = null; };
    const otherPointer = (event: PointerEvent) => {
      if (tap.current && event.pointerId !== tap.current.id) cancel();
    };
    window.addEventListener('scroll', cancel, true);
    document.addEventListener('pointerdown', otherPointer, true);
    return () => {
      window.removeEventListener('scroll', cancel, true);
      document.removeEventListener('pointerdown', otherPointer, true);
      clearTimeout(feedbackTimer.current);
    };
  }, [peerPlayback]);
  const dock = useDockDrag(persistDock && !inline);
  // 휴대폰 고정 막대가 줄바꿈하거나 음성 안내가 나타나도 문항 끝을 가리지 않는다.
  useEffect(() => {
    const element = dock.dockRef.current;
    const viewer = inline && open ? element?.closest<HTMLElement>('.exam-viewer-overlay .exam-viewer') : null;
    if (!element || !viewer) return;
    const measure = () => viewer.style.setProperty('--exam-viewer-dock-height', `${element.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(element);
    return () => { observer.disconnect(); viewer.style.removeProperty('--exam-viewer-dock-height'); };
  }, [inline, open, dock.dockRef]);
  const toggleInDock = inline && !notes && !barExtra;
  const timeline = useMemo(() => data ? buildInkTimeline(data) : null, [data]);
  const hasAudio = !!data?.audioClips?.length;
  const clock = useMemo(() => timeline ? buildInkClock(timeline, hasAudio
    ? { origin: data?.audioOriginMs ?? 0, clips: data?.audioClips ?? [] } : undefined) : null,
    [timeline, hasAudio, data?.audioOriginMs, data?.audioClips]);
  const total = clock?.total ?? 0;
  const stepCount = timeline?.steps.length ?? 0;
  const speedRef = useRef(speed);
  const timeRef = useRef(time);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { timeRef.current = time; }, [time]);

  // 덧쓴 필기는 이 창을 연 순간의 범위만 반영한다 — 쓰는 도중 배율이 바뀌어 획이 튀지 않게.
  const [notesAtOpen] = useState(() => notes?.strokes ?? null);
  const fit = useMemo(() => inkExtent(strokes, notesAtOpen, ...replayStrokeLists(data)), [strokes, notesAtOpen, data]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void client.getInkReplay(attemptId, questionId).then(value => {
      // 불러오면 바로 처음부터 재생한다(다시 '재생'을 누르지 않아도 된다).
      if (alive) { setData(value); setError(false); timeRef.current = 0; setTime(0); setPlaying(true); }
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [client, attemptId, questionId, open, retry]);

  // 재생: 프레임마다 흐른 시간 × 배속만큼 앞으로. 슬라이더가 매끄럽게 움직인다.
  useEffect(() => {
    if (!playing || !clock) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(clock.total, timeRef.current + (now - last) * speedRef.current);
      last = now;
      timeRef.current = next;
      setTime(next);
      if (next >= clock.total) { setPlaying(false); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, clock]);
  useEffect(() => {
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);

  const toggleOpen = () => {
    setPlaying(false); setError(false); setTime(0); setFolded(false);
    if (!open) setData(null);
    setOpen(value => !value);
  };
  const seek = (next: number) => { setPlaying(false); timeRef.current = Math.max(0, Math.min(total, next)); setTime(timeRef.current); };
  const togglePlay = () => {
    if (time >= total) { timeRef.current = 0; setTime(0); }
    setPlaying(value => !value);
  };
  const controls = (event: ReactPointerEvent<HTMLDivElement>) =>
    (event.target as Element).closest('button, input, select, a, [role="button"]');
  const canvasGesture = peerPlayback ? {
    onPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
      pointers.current.add(event.pointerId);
      tap.current = pointers.current.size === 1 && event.isPrimary && event.button === 0 && !controls(event)
        ? { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() } : null;
    },
    onPointerMoveCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = tap.current;
      if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) tap.current = null;
    },
    onPointerUpCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = tap.current;
      pointers.current.delete(event.pointerId);
      tap.current = null;
      if (!start || start.id !== event.pointerId || performance.now() - start.at > 300 ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8 || controls(event) ||
        !open || !clock || (stepCount === 0 && !hasAudio)) return;
      const rect = event.currentTarget.getBoundingClientRect();
      setFeedback({ id: performance.now(), x: event.clientX - rect.left, y: event.clientY - rect.top, playing: !playing });
      clearTimeout(feedbackTimer.current);
      feedbackTimer.current = setTimeout(() => setFeedback(null), 650);
      togglePlay();
    },
    onPointerCancelCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
      pointers.current.delete(event.pointerId); tap.current = null;
    },
    onPointerLeave: () => { pointers.current.clear(); tap.current = null; },
  } : {};
  const done = clock ? clock.completedAt(time) : 0;
  // 이전/다음: 획(단계) 경계로 이동한다.
  const previousBoundary = () => {
    if (!clock) return 0;
    for (let i = stepCount - 1; i >= 0; i--) if (clock.ends[i] < time) return clock.ends[i];
    return 0;
  };
  const nextBoundary = () => clock && done < stepCount ? clock.ends[done] : total;
  // 키보드 화살표는 0.1초씩. 끝(End)이 단위에 맞도록 최대값은 0.1초 단위로 올린다.
  const SLIDER_STEP = 100;
  const sliderMax = Math.max(SLIDER_STEP, Math.ceil(total / SLIDER_STEP) * SLIDER_STEP);
  const finalStrokes = notes ? notes.strokes : data?.strokes ?? strokes;
  const displayed = open && clock ? clock.frame(time) : finalStrokes;
  const currentLabel = timeline && done > 0 ? timeline.steps[done - 1]?.label : null;
  const writable = Boolean(notes && !open && notes.ready);
  const playLabel = playing ? '일시정지' : '재생';
  return <div className="exam-ink-replay" data-testid="exam-ink-replay" data-replaying={open ? 'true' : 'false'}>
    {/* 도구도 다른 버튼도 없는 얇은 막대(다른 풀이)는 재생 중이면 토글 한 줄을 없애고 재생 막대 안의 ✕로 닫는다. */}
    {!(toggleInDock && open) && <div className="exam-replay-bar">
      <button type="button" className="rn-button rn-button-compact" aria-expanded={open} onClick={toggleOpen}>{open ? '최종 풀이 보기' : '필기 순서 보기'}</button>
      {/* 재생 중에는 쓸 수 없으니 덧쓰기 도구를 숨긴다(최종 풀이 보기로 닫으면 다시 나온다). */}
      {notes && !open && <div className="exam-replay-notes">{notes.toolbar}</div>}
      {barExtra}
    </div>}
    {/* 재생 컨트롤은 화면 왼쪽에 떠 있는 작은 상자 — 풀이를 아래로 스크롤해도 늘 보이고 바로 멈출 수 있다. */}
    {open && <div ref={dock.dockRef} style={inline ? undefined : dock.style} className={`exam-replay-dock${inline ? ' exam-replay-inline' : ''}${folded ? ' is-folded' : ''}`} role="group" aria-label="필기 재생" data-testid="exam-replay-dock">
      {hasAudio && <ReplayAudio clips={clock?.audioClips ?? []} time={time} playing={playing} speed={speed} shift={0} />}
      {folded ? <>
        <span className="exam-replay-grip" aria-hidden="true" title="끌어서 옮기기" {...dock.handle}><ReplayIcon name="grip" /></span>
        <button type="button" className="exam-replay-icon" aria-label={playLabel} disabled={stepCount === 0 && !hasAudio} onClick={togglePlay}><ReplayIcon name={playing ? 'pause' : 'play'} /></button>
        <button type="button" className="exam-replay-icon" aria-label="재생 상자 펼치기" aria-expanded={false} onClick={() => setFolded(false)}><ReplayIcon name="unfold" /></button>
      </> : <>
        <div className="exam-replay-dock-head" title="끌어서 옮기기" {...dock.handle}>
          <span className="exam-replay-grip" aria-hidden="true"><ReplayIcon name="grip" /></span>
          <strong>필기 과정</strong>
          <button type="button" className="exam-replay-icon is-small" aria-label="재생 상자 접기" aria-expanded onClick={() => setFolded(true)}><ReplayIcon name="fold" /></button>
          <button type="button" className="exam-replay-icon is-small" aria-label="재생 닫기" onClick={toggleOpen}><ReplayIcon name="close" /></button>
        </div>
        {toggleInDock && <button type="button" className="exam-replay-icon exam-replay-final" aria-expanded aria-label="최종 풀이 보기"
          title="최종 풀이 보기" onClick={toggleOpen}><ReplayIcon name="close" /></button>}
        {!data && !error && <p role="status">필기 기록을 불러오는 중…</p>}
        {error && <p role="alert">기록을 불러오지 못했어요. <button type="button" className="exam-replay-link" onClick={() => { setError(false); setRetry(n => n + 1); }}>다시 시도</button></p>}
        {timeline && clock && <>
          <div className="exam-replay-progress">
            <input className="exam-replay-slider" type="range" aria-label="필기 재생 위치" min={0} max={sliderMax} step={SLIDER_STEP}
              value={time >= total ? sliderMax : Math.round(time)} disabled={stepCount === 0 && !hasAudio}
              aria-valuetext={`${formatReplayTime(time)} / ${formatReplayTime(total)}`} onChange={event => seek(Number(event.target.value))} />
          </div>
          <output data-testid="exam-replay-position" data-step={done} data-steps={stepCount}>
            {formatReplayTime(time)} / {formatReplayTime(total)}{currentLabel ? ` · ${currentLabel}` : ''}
          </output>
          <div className="exam-replay-buttons">
            <button type="button" className="exam-replay-icon" aria-label="처음" title="처음" disabled={time <= 0} onClick={() => seek(0)}><ReplayIcon name="first" /></button>
            <button type="button" className="exam-replay-icon" aria-label="이전 필기 단계" title="이전 단계" disabled={time <= 0} onClick={() => seek(previousBoundary())}><ReplayIcon name="prev" /></button>
            <button type="button" className="exam-replay-icon is-play" aria-label={playLabel} title={playLabel} disabled={stepCount === 0 && !hasAudio} onClick={togglePlay}><ReplayIcon name={playing ? 'pause' : 'play'} /></button>
            <button type="button" className="exam-replay-icon" aria-label="다음 필기 단계" title="다음 단계" disabled={time >= total} onClick={() => seek(nextBoundary())}><ReplayIcon name="next" /></button>
            <button type="button" className="exam-replay-icon" aria-label="마지막" title="마지막" disabled={time >= total} onClick={() => seek(total)}><ReplayIcon name="last" /></button>
          </div>
          <div className="exam-replay-speed" role="group" aria-label="배속">
            {[0.5, 1, 2, 4].map(value => <button key={value} type="button" aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value}×</button>)}
          </div>
          <p className="exam-replay-note">{hasAudio ? '녹음 중에는 그대로 재생하고, 녹음 밖의 긴 멈춤은 줄여요.' : stepCount === 0 ? '아직 저장된 필기 기록이 없어요.' : timeline.approximate
            ? '예전 필기는 남은 획·저장 상태만 보여요.'
            : `실제 쓴 속도로 재생해요(${REPLAY_MAX_PAUSE_MS / 1000}초보다 긴 멈춤은 줄임).`}</p>
        </>}
      </>}
    </div>}
    <div className="exam-replay-canvas" data-testid={peerPlayback ? 'exam-peer-canvas' : undefined} {...canvasGesture}>
    <ExamInkCanvas key={notes?.canvasKey} ref={notes?.inkRef} imageUrl={imageUrl} strokes={displayed}
      onChange={writable ? notes!.onChange : () => {}}
      tool={notes?.tool ?? 'pen'} color={notes?.color ?? '#1f2937'} size={notes?.size ?? 4}
      penOnlyWhenPenDetected shapeSnap readOnly={!writable} imageMaxWidth={imageMaxWidth} fitToInk={fit} />
    {feedback && <span key={feedback.id} className="exam-replay-feedback" data-testid="exam-replay-feedback" aria-hidden="true"
      style={{ left: feedback.x, top: feedback.y }}><ReplayIcon name={feedback.playing ? 'play' : 'pause'} /></span>}
    </div>
  </div>;
}
