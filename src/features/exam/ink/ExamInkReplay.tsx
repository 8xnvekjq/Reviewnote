import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import type { ExamClient, ExamInkCanvasHandle, InkChangeKind, InkReplayData, InkStroke, InkTool } from '../contract';
import { ExamInkCanvas } from './ExamInkCanvas';
import { inkExtent, replayStrokeLists } from './inkFit';
import { REPLAY_MAX_PAUSE_MS, buildInkClock, buildInkTimeline, formatReplayTime } from './inkReplay';

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
  notes?: ReplayNotes;
}
export function ExamInkReplay({ client, attemptId, questionId, imageUrl, strokes, imageMaxWidth, autoOpen = false, notes }: Props) {
  const [open, setOpen] = useState(autoOpen);
  const [data, setData] = useState<InkReplayData | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  // 재생 위치는 획 개수가 아니라 시간(ms)이다. 슬라이더·배속 모두 이 시간 축을 따른다.
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [folded, setFolded] = useState(false);
  const timeline = useMemo(() => data ? buildInkTimeline(data) : null, [data]);
  const clock = useMemo(() => timeline ? buildInkClock(timeline) : null, [timeline]);
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
  const seek = (next: number) => { setPlaying(false); setTime(Math.max(0, Math.min(total, next))); };
  const togglePlay = () => {
    if (time >= total) { timeRef.current = 0; setTime(0); }
    setPlaying(value => !value);
  };
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
    <div className="exam-replay-bar">
      <button type="button" className="rn-button rn-button-compact" aria-expanded={open} onClick={toggleOpen}>{open ? '최종 풀이 보기' : '필기 순서 보기'}</button>
      {notes && !open && notes.toolbar}
    </div>
    {/* 재생 컨트롤은 화면 왼쪽에 떠 있는 작은 상자 — 풀이를 아래로 스크롤해도 늘 보이고 바로 멈출 수 있다. */}
    {open && <div className={`exam-replay-dock${folded ? ' is-folded' : ''}`} role="group" aria-label="필기 재생" data-testid="exam-replay-dock">
      {folded ? <>
        <button type="button" className="exam-replay-icon" aria-label={playLabel} disabled={stepCount === 0} onClick={togglePlay}>{playing ? '⏸' : '▶'}</button>
        <button type="button" className="exam-replay-icon" aria-label="재생 상자 펼치기" aria-expanded={false} onClick={() => setFolded(false)}>⇥</button>
      </> : <>
        <div className="exam-replay-dock-head">
          <strong>필기 과정</strong>
          <button type="button" className="exam-replay-icon is-small" aria-label="재생 상자 접기" aria-expanded onClick={() => setFolded(true)}>⇤</button>
          <button type="button" className="exam-replay-icon is-small" aria-label="재생 닫기" onClick={toggleOpen}>✕</button>
        </div>
        {!data && !error && <p role="status">필기 기록을 불러오는 중…</p>}
        {error && <p role="alert">기록을 불러오지 못했어요. <button type="button" className="exam-replay-link" onClick={() => { setError(false); setRetry(n => n + 1); }}>다시 시도</button></p>}
        {timeline && clock && <>
          <input className="exam-replay-slider" type="range" aria-label="필기 재생 위치" min={0} max={sliderMax} step={SLIDER_STEP}
            value={time >= total ? sliderMax : Math.round(time)} disabled={stepCount === 0}
            aria-valuetext={`${formatReplayTime(time)} / ${formatReplayTime(total)}`} onChange={event => seek(Number(event.target.value))} />
          <output data-testid="exam-replay-position" data-step={done} data-steps={stepCount}>
            {formatReplayTime(time)} / {formatReplayTime(total)}{currentLabel ? ` · ${currentLabel}` : ''}
          </output>
          <div className="exam-replay-buttons">
            <button type="button" className="exam-replay-icon" aria-label="처음" title="처음" disabled={time <= 0} onClick={() => seek(0)}>⏮</button>
            <button type="button" className="exam-replay-icon" aria-label="이전 필기 단계" title="이전 단계" disabled={time <= 0} onClick={() => seek(previousBoundary())}>‹</button>
            <button type="button" className="exam-replay-icon is-play" aria-label={playLabel} title={playLabel} disabled={stepCount === 0} onClick={togglePlay}>{playing ? '⏸' : '▶'}</button>
            <button type="button" className="exam-replay-icon" aria-label="다음 필기 단계" title="다음 단계" disabled={time >= total} onClick={() => seek(nextBoundary())}>›</button>
            <button type="button" className="exam-replay-icon" aria-label="마지막" title="마지막" disabled={time >= total} onClick={() => seek(total)}>⏭</button>
          </div>
          <label className="exam-replay-speed">배속 <select value={speed} onChange={event => setSpeed(Number(event.target.value))}>
            {[0.5, 1, 2, 4].map(value => <option key={value} value={value}>{value}배</option>)}
          </select></label>
          <p className="exam-replay-note">{stepCount === 0 ? '아직 저장된 필기 기록이 없어요.' : timeline.approximate
            ? '예전 필기는 남은 획·저장 상태만 보여요.'
            : `실제 쓴 속도로 재생해요(${REPLAY_MAX_PAUSE_MS / 1000}초보다 긴 멈춤은 줄임).`}</p>
        </>}
      </>}
    </div>}
    <ExamInkCanvas key={notes?.canvasKey} ref={notes?.inkRef} imageUrl={imageUrl} strokes={displayed}
      onChange={writable ? notes!.onChange : () => {}}
      tool={notes?.tool ?? 'pen'} color={notes?.color ?? '#1f2937'} size={notes?.size ?? 4}
      penOnlyWhenPenDetected shapeSnap readOnly={!writable} imageMaxWidth={imageMaxWidth} fitToInk={fit} />
  </div>;
}
