import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { AdminExamApi, AdminPaperSubmission, InkReplayData } from '../contract';
import { ExamInkReplayFrame } from '../ink/ExamInkReplay';
import { formatReplayTime } from '../ink/inkReplay';
import { loadInkImage } from '../ink/inkImages';
import { advanceCompare, compareCellProgress, compareColumns, compareReplayClock, createCompareReplayLoader, latestSubmissions, restartCompare } from './replayCompareLogic';
import '../../../styles/adminReplayCompare.css';

type Replay = { data: InkReplayData; clock: ReturnType<typeof compareReplayClock> };

export function AdminReplayCompare({ api, paperId, title, onClose }: {
  api: AdminExamApi; paperId: string; title: string; onClose: () => void;
}) {
  const [rows, setRows] = useState<AdminPaperSubmission[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const [question, setQuestion] = useState(1);
  const [focused, setFocused] = useState<string | null>(null);
  const [replays, setReplays] = useState<Map<string, Replay> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [width, setWidth] = useState(window.innerWidth);
  const timeRef = useRef(0);
  const speedRef = useRef(speed);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const historyToken = useRef(crypto.randomUUID());
  const lifecycle = useRef({ active: false });
  const lastFocused = useRef<string | null>(null);
  const loader = useMemo(() => createCompareReplayLoader((a, q) => api.getInkReplay(a, q)), [api]);
  const picked = useMemo(() => (rows ?? []).filter(row => selected.includes(row.attemptId)), [rows, selected]);
  const numbers = useMemo(() => [...new Set(picked.flatMap(row => row.questions.map(q => q.number)))].sort((a, b) => a - b), [picked]);
  const total = replays ? Math.max(0, ...[...replays.values()].map(replay => replay.clock.total)) : 0;
  const controlTotal = focused ? replays?.get(focused)?.clock.total ?? 0 : total;
  speedRef.current = speed;
  onCloseRef.current = onClose;

  useEffect(() => {
    let alive = true;
    setError(null);
    void api.listPaperSubmissions(paperId).then(value => { if (alive) setRows(latestSubmissions(value)); })
      .catch(() => { if (alive) setError('제출한 풀이를 불러오지 못했어요.'); });
    return () => { alive = false; };
  }, [api, paperId, retry]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    const token = historyToken.current;
    const state = lifecycle.current;
    state.active = true;
    if (history.state?.examCompare !== token) history.pushState({ ...history.state, examCompare: token, compareFocus: null }, '');
    const pop = () => {
      if (history.state?.examCompare === token) {
        setFocused(history.state.compareFocus ?? null);
        if (!history.state.compareFocus) requestAnimationFrame(() => {
          const cell = dialogRef.current?.querySelector<HTMLElement>(`[data-attempt-id="${lastFocused.current}"] button`);
          (cell ?? closeRef.current)?.focus();
        });
      }
      else onCloseRef.current();
    };
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    window.addEventListener('popstate', pop);
    return () => {
      document.body.style.overflow = previous; window.removeEventListener('resize', resize);
      window.removeEventListener('popstate', pop); previousFocus?.focus(); state.active = false;
      // StrictMode의 재마운트가 끝나기 전에 기록을 지우지 않는다.
      queueMicrotask(() => { if (!state.active && history.state?.examCompare === token) history.go(history.state.compareFocus ? -2 : -1); });
    };
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); history.back(); }
      if (event.key === 'Tab') {
        const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') ?? [])];
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  useEffect(() => {
    if (!started) return;
    let alive = true;
    setReplays(null); setPlaying(false); setError(null); timeRef.current = 0; setTime(0);
    void Promise.all(picked.map(async row => {
      const q = row.questions.find(value => value.number === question);
      if (!q) return null;
      const [data] = await Promise.all([loader(row.attemptId, q.questionId), loadInkImage(q.imageUrl)]);
      return [row.attemptId, { data, clock: compareReplayClock(data) }] as const;
    })).then(values => {
      if (!alive) return;
      setReplays(new Map(values.filter(value => value !== null)));
      const restart = restartCompare(question);
      timeRef.current = restart.time; setTime(restart.time); setPlaying(restart.playing);
    }).catch(() => { if (alive) setError('필기 기록을 불러오지 못했어요. 다시 시도해 주세요.'); });
    return () => { alive = false; };
  }, [started, picked, question, loader, retry]);

  useEffect(() => {
    if (!playing || !replays) return;
    let frame = 0, last = performance.now();
    const tick = (now: number) => {
      const next = advanceCompare(timeRef.current, now - last, speedRef.current, total);
      last = now; timeRef.current = next; setTime(next);
      if (next >= total) { setPlaying(false); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, replays, total]);
  useEffect(() => {
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);

  const changeQuestion = (number: number) => {
    setPlaying(false); timeRef.current = 0; setTime(0); setReplays(null); setQuestion(number);
  };
  const seek = (next: number) => { setPlaying(false); timeRef.current = Math.min(total, Math.max(0, next)); setTime(timeRef.current); };
  const toggle = () => {
    if (time >= controlTotal) { timeRef.current = 0; setTime(0); }
    setPlaying(value => !value);
  };
  const index = numbers.indexOf(question);
  return createPortal(<div ref={dialogRef} className="exam-compare" role="dialog" aria-modal="true" aria-label="동시 풀이 재생" data-testid="replay-compare">
    <header className="exam-compare-head">
      <strong>{title} · 풀이 비교</strong>
      <button ref={closeRef} type="button" className="rn-button rn-button-compact" onClick={onClose} aria-label="풀이 비교 닫기">닫기</button>
    </header>
    {error && <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>다시 시도</button></p>}
    {!started ? <div className="exam-compare-picker" data-testid="compare-picker">
      <h2>비교할 풀이 고르기</h2><p>최근 제출한 풀이를 최대 12명까지 골라 주세요.</p>
      {!rows && !error && <p role="status">제출한 풀이를 불러오는 중…</p>}
      {rows?.length === 0 && <p>제출한 풀이가 없어요.</p>}
      {rows?.map(row => <label key={row.attemptId}>
        <input type="checkbox" checked={selected.includes(row.attemptId)} disabled={selected.length >= 12 && !selected.includes(row.attemptId)}
          onChange={event => setSelected(old => event.target.checked ? [...old, row.attemptId] : old.filter(id => id !== row.attemptId))} />
        <span>{row.isMine ? `내 풀이 · ${row.studentName}` : row.studentName}<small>{new Date(row.submittedAt).toLocaleString('ko-KR')}</small></span>
      </label>)}
      <button type="button" className="rn-button rn-button-primary" disabled={!selected.length || !numbers.length} onClick={() => { setQuestion(numbers[0]); setStarted(true); }}>함께 재생</button>
    </div> : <>
      <div className="exam-compare-controls">
        {focused ? <button type="button" onClick={() => history.back()}>← 전체 보기</button> : <button type="button" onClick={() => { setPlaying(false); setStarted(false); }}>학생 다시 고르기</button>}
        <button type="button" aria-label="이전 문항" disabled={index <= 0} onClick={() => changeQuestion(numbers[index - 1])}>이전</button>
        <select aria-label="문항 번호" value={question} onChange={event => changeQuestion(Number(event.target.value))}>{numbers.map(number => <option key={number} value={number}>{number}번</option>)}</select>
        <button type="button" aria-label="다음 문항" disabled={index >= numbers.length - 1} onClick={() => changeQuestion(numbers[index + 1])}>다음</button>
        <button type="button" disabled={!replays || controlTotal === 0} onClick={toggle}>{playing ? '일시정지' : '재생'}</button>
        <label>배속 <select aria-label="재생 배속" value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[0.5, 1, 2, 4].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
        <label className="exam-compare-progress">재생 위치 <input type="range" aria-label="필기 재생 위치" min={0} max={Math.max(1, controlTotal)} step={1} value={Math.min(time, controlTotal)} disabled={!replays || controlTotal === 0} onChange={event => seek(Number(event.target.value))} /></label>
        <output>{formatReplayTime(Math.min(time, controlTotal))} / {formatReplayTime(controlTotal)}</output>
      </div>
      {!replays && !error && <p role="status">모든 풀이를 준비하는 중…</p>}
      <div className={`exam-live-grid exam-compare-grid${focused ? ' is-focused' : ''}`} style={{ '--live-columns': focused ? 1 : compareColumns(width) } as CSSProperties} data-testid="compare-grid" data-playing={playing} data-time={time}>
        {picked.filter(row => !focused || row.attemptId === focused).map(row => {
          const q = row.questions.find(value => value.number === question);
          const replay = replays?.get(row.attemptId);
          const progress = compareCellProgress(time, replay?.clock.total ?? 0);
          const empty = !!replays && (!q || !replay || replay.clock.ends.length === 0);
          const finished = !!replays && (empty || progress.finished);
          const Content = focused ? 'div' : 'button';
          return <section key={row.attemptId} className={`exam-live-cell exam-compare-cell${finished ? ' is-finished' : ''}`} data-testid="compare-cell" data-time={progress.time} data-finished={finished} data-attempt-id={row.attemptId}>
            <Content type={focused ? undefined : 'button'} className="exam-compare-cell-open" aria-label={`${row.studentName} 풀이 확대`} onClick={() => {
              if (!focused) { lastFocused.current = row.attemptId; history.pushState({ ...history.state, compareFocus: row.attemptId }, ''); setFocused(row.attemptId); }
            }}>
              <div className="exam-compare-label"><strong>{row.isMine ? `내 풀이 · ${row.studentName}` : row.studentName}</strong><span>{question}번 · 답 {q?.answer ?? '미응답'} {q ? q.isCorrect ? 'O' : 'X' : '—'}</span></div>
              <div className="exam-compare-canvas">
                {q && replay && <ExamInkReplayFrame data={replay.data} clock={replay.clock} time={progress.time} imageUrl={q.imageUrl} imageMaxWidth={focused ? 1000 : 480} />}
                {finished && <div className="exam-compare-ended" data-testid="compare-ended"><span>{empty ? '풀이 없음' : '끝'}</span></div>}
              </div>
            </Content>
          </section>;
        })}
      </div>
    </>}
  </div>, document.body);
}
