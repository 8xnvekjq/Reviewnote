import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExamClient, InkReplayData, InkStroke } from '../contract';
import { ExamInkCanvas } from './ExamInkCanvas';
import { REPLAY_MAX_PAUSE_MS, buildInkClock, buildInkTimeline, formatReplayTime } from './inkReplay';

interface Props {
  client: Pick<ExamClient, 'getInkReplay'>;
  attemptId: string;
  questionId: string;
  imageUrl: string;
  strokes: InkStroke[];
  imageMaxWidth?: number;
}
export function ExamInkReplay({ client, attemptId, questionId, imageUrl, strokes, imageMaxWidth }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<InkReplayData | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  // 재생 위치는 획 개수가 아니라 시간(ms)이다. 슬라이더·배속 모두 이 시간 축을 따른다.
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timeline = useMemo(() => data ? buildInkTimeline(data) : null, [data]);
  const clock = useMemo(() => timeline ? buildInkClock(timeline) : null, [timeline]);
  const total = clock?.total ?? 0;
  const stepCount = timeline?.steps.length ?? 0;
  const speedRef = useRef(speed);
  const timeRef = useRef(time);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { timeRef.current = time; }, [time]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void client.getInkReplay(attemptId, questionId).then(value => {
      if (alive) { setData(value); setError(false); setTime(0); }
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

  const seek = (next: number) => { setPlaying(false); setTime(Math.max(0, Math.min(total, next))); };
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
  const displayed = open && clock ? clock.frame(time) : data?.strokes ?? strokes;
  const currentLabel = timeline && done > 0 ? timeline.steps[done - 1]?.label : null;
  return <div className="exam-ink-replay" data-testid="exam-ink-replay">
    <div className="exam-replay-controls">
      <div className="exam-replay-buttons">
        <strong>필기 과정</strong>
        <button type="button" className="rn-button rn-button-compact" aria-expanded={open} onClick={() => {
          setPlaying(false); setError(false); setTime(0);
          if (!open) setData(null);
          setOpen(value => !value);
        }}>{open ? '최종 풀이 보기' : '필기 순서 보기'}</button>
      </div>
      {open && <>
        {!data && !error && <p role="status">서버에서 필기 기록을 불러오는 중…</p>}
        {error && <p role="alert">기록을 불러오지 못했어요. <button type="button" className="rn-button rn-button-compact" onClick={() => { setError(false); setRetry(n => n + 1); }}>다시 시도</button></p>}
        {timeline && clock && <>
          <p className="rn-caption">{timeline.approximate
            ? '예전 필기는 남은 획 또는 저장 상태만 보여요. 기록 시작 이후의 추가·삭제는 실제 쓴 속도로 재생해요.'
            : `실제로 쓴 속도로 재생해요. ${REPLAY_MAX_PAUSE_MS / 1000}초보다 긴 멈춤은 줄여서 보여 줘요.`}</p>
          <label className="exam-replay-slider">필기 재생 위치
            <input type="range" min={0} max={sliderMax} step={SLIDER_STEP} value={time >= total ? sliderMax : Math.round(time)} disabled={stepCount === 0}
              aria-valuetext={`${formatReplayTime(time)} / ${formatReplayTime(total)}`} onChange={event => seek(Number(event.target.value))} />
          </label>
          <output data-testid="exam-replay-position" data-step={done} data-steps={stepCount}>
            {formatReplayTime(time)} / {formatReplayTime(total)}{currentLabel ? ` · ${currentLabel}` : ''}
          </output>
          <div className="exam-replay-buttons">
            <button type="button" className="rn-button rn-button-compact" disabled={time <= 0} onClick={() => seek(0)}>처음</button>
            <button type="button" className="rn-button rn-button-compact" aria-label="이전 필기 단계" disabled={time <= 0} onClick={() => seek(previousBoundary())}>◀ 이전</button>
            <button type="button" className="rn-button rn-button-compact" disabled={stepCount === 0} onClick={() => {
              if (time >= total) { timeRef.current = 0; setTime(0); }
              setPlaying(value => !value);
            }}>{playing ? '일시정지' : '재생'}</button>
            <button type="button" className="rn-button rn-button-compact" aria-label="다음 필기 단계" disabled={time >= total} onClick={() => seek(nextBoundary())}>다음 ▶</button>
            <button type="button" className="rn-button rn-button-compact" disabled={time >= total} onClick={() => seek(total)}>마지막</button>
            <label>배속 <select value={speed} onChange={event => setSpeed(Number(event.target.value))}>
              {[0.5, 1, 2, 4].map(value => <option key={value} value={value}>{value}배</option>)}
            </select></label>
          </div>
          {stepCount === 0 && <p className="rn-caption">아직 저장된 필기 기록이 없어요.</p>}
        </>}
      </>}
    </div>
    <ExamInkCanvas imageUrl={imageUrl} strokes={displayed} onChange={() => {}} tool="pen" color="#1f2937"
      size={4} readOnly imageMaxWidth={imageMaxWidth} />
  </div>;
}
