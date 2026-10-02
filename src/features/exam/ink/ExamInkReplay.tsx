import { useEffect, useMemo, useState } from 'react';
import type { ExamClient, InkReplayData, InkStroke } from '../contract';
import { ExamInkCanvas } from './ExamInkCanvas';
import { buildInkTimeline } from './inkReplay';

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
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timeline = useMemo(() => data ? buildInkTimeline(data) : null, [data]);
  const count = timeline?.steps.length ?? 0;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void client.getInkReplay(attemptId, questionId).then(value => {
      if (alive) { setData(value); setError(false); setPosition(0); }
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [client, attemptId, questionId, open, retry]);

  useEffect(() => {
    if (!playing || !timeline || position >= count) return;
    const currentTime = timeline.steps[position - 1]?.at ?? 0;
    const nextTime = timeline.steps[position].at;
    // Step playback deliberately skips long thinking pauses; source timestamps remain on the server.
    const delay = Math.min(1200, Math.max(250, currentTime && nextTime > currentTime ? nextTime - currentTime : 650)) / speed;
    const timer = window.setTimeout(() => {
      setPosition(previous => previous + 1);
      if (position + 1 >= count) setPlaying(false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [playing, position, count, speed, timeline]);
  useEffect(() => {
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);

  const seek = (next: number) => { setPlaying(false); setPosition(Math.max(0, Math.min(count, next))); };
  const displayed = open && timeline ? timeline.at(position) : data?.strokes ?? strokes;
  return <div className="exam-ink-replay" data-testid="exam-ink-replay">
    <div className="exam-replay-controls">
      <div className="exam-replay-buttons">
        <strong>필기 과정</strong>
        <button type="button" className="rn-button rn-button-compact" aria-expanded={open} onClick={() => {
          setPlaying(false); setError(false); setPosition(0);
          if (!open) setData(null);
          setOpen(value => !value);
        }}>{open ? '최종 풀이 보기' : '필기 순서 보기'}</button>
      </div>
      {open && <>
        {!data && !error && <p role="status">서버에서 필기 기록을 불러오는 중…</p>}
        {error && <p role="alert">기록을 불러오지 못했어요. <button type="button" className="rn-button rn-button-compact" onClick={() => { setError(false); setRetry(n => n + 1); }}>다시 시도</button></p>}
        {timeline && <>
          <p className="rn-caption">{timeline.approximate ? '예전 필기는 남은 획 또는 저장 상태만 보여요. 기록 시작 이후의 추가·삭제 순서는 그대로 재생해요.' : '작성·지우기·실행 취소 순서예요. 긴 대기 시간은 줄여서 재생해요.'}</p>
          <label className="exam-replay-slider">필기 재생 위치
            <input type="range" min={0} max={count} step={1} value={position} disabled={count === 0}
              aria-valuetext={`${position} / ${count}단계`} onChange={event => seek(Number(event.target.value))} />
          </label>
          <output data-testid="exam-replay-position">{position} / {count}단계 · {position === 0 ? '시작' : timeline.steps[position - 1]?.label}</output>
          <div className="exam-replay-buttons">
            <button type="button" className="rn-button rn-button-compact" disabled={position === 0} onClick={() => seek(0)}>처음</button>
            <button type="button" className="rn-button rn-button-compact" aria-label="이전 필기 단계" disabled={position === 0} onClick={() => seek(position - 1)}>◀ 이전</button>
            <button type="button" className="rn-button rn-button-compact" disabled={count === 0} onClick={() => {
              if (position >= count) setPosition(0);
              setPlaying(value => !value);
            }}>{playing ? '일시정지' : '재생'}</button>
            <button type="button" className="rn-button rn-button-compact" aria-label="다음 필기 단계" disabled={position >= count} onClick={() => seek(position + 1)}>다음 ▶</button>
            <button type="button" className="rn-button rn-button-compact" disabled={position >= count} onClick={() => seek(count)}>마지막</button>
            <label>배속 <select value={speed} onChange={event => setSpeed(Number(event.target.value))}>
              {[0.5, 1, 2, 4].map(value => <option key={value} value={value}>{value}배</option>)}
            </select></label>
          </div>
          {count === 0 && <p className="rn-caption">아직 저장된 필기 기록이 없어요.</p>}
        </>}
      </>}
    </div>
    <ExamInkCanvas imageUrl={imageUrl} strokes={displayed} onChange={() => {}} tool="pen" color="#1f2937"
      size={4} readOnly imageMaxWidth={imageMaxWidth} />
  </div>;
}
