import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { AdminExamApi, AdminPaperSubmission, InkReplayData, InkStroke, InkTool } from '../contract';
import { ExamInkReplayFrame, ReplayIcon } from '../ink/ExamInkReplay';
import { formatReplayTime } from '../ink/inkReplay';
import { loadInkImage } from '../ink/inkImages';
import { advanceCompare, compareCellProgress, compareColumns, compareReplayClock, createCompareReplayLoader, latestSubmissions, restartCompare } from './replayCompareLogic';
import { ScratchNotesTools } from './ResultInkNotes';
import '../../../styles/examPractice.css';
import '../../../styles/adminReplayCompare.css';

type Replay = { data: InkReplayData; clock: ReturnType<typeof compareReplayClock> };

export function AdminReplayCompare({ api, paperId, title, onClose }: {
  api: AdminExamApi; paperId: string; title: string; onClose: () => void;
}) {
  const [rows, setRows] = useState<AdminPaperSubmission[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const [question, setQuestion] = useState(1);
  const [questionRevision, setQuestionRevision] = useState(0);
  const [overview, setOverview] = useState(false);
  const [notes, setNotes] = useState<InkStroke[]>([]);
  const [noteTool, setNoteTool] = useState<InkTool>('pen');
  const [noteColor, setNoteColor] = useState('#dc2626');
  const [noteGeneration, setNoteGeneration] = useState(0);
  const overviewRef = useRef<HTMLDivElement>(null);
  const overviewTrigger = useRef<HTMLElement | null>(null);
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
  const numbers = useMemo(() => [...new Set((rows ?? []).flatMap(row => row.questions.map(q => q.number)))].sort((a, b) => a - b), [rows]);
  const questionImages = useMemo(() => new Map((rows ?? []).flatMap(row => row.questions.map(q => [q.number, q.imageUrl] as const))), [rows]);
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
        setOverview(!!history.state.compareOverview);
        setFocused(history.state.compareFocus ?? null);
        const trigger = overviewTrigger.current;
        if (!history.state.compareOverview && trigger) {
          requestAnimationFrame(() => trigger.focus()); overviewTrigger.current = null;
        } else if (!history.state.compareFocus) requestAnimationFrame(() => {
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
      queueMicrotask(() => { if (!state.active && history.state?.examCompare === token) history.go(-1 - (history.state.compareFocus ? 1 : 0) - (history.state.compareOverview ? 1 : 0)); });
    };
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); history.back(); }
      if (event.key === 'Tab') {
        const items = [...((overviewRef.current ?? dialogRef.current)?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? [])];
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
  }, [started, picked, question, questionRevision, loader, retry]);

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

  useEffect(() => {
    setNotes([]); setNoteGeneration(value => value + 1);
  }, [question, questionRevision, focused]);
  useEffect(() => { if (overview) overviewRef.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, [overview]);
  const openOverview = (trigger: HTMLElement) => {
    overviewTrigger.current = trigger;
    history.pushState({ ...history.state, compareOverview: true }, ''); setOverview(true);
  };
  const changeQuestion = (number: number) => {
    setPlaying(false); timeRef.current = 0; setTime(0); setReplays(null); setQuestion(number);
    setQuestionRevision(value => value + 1);
  };
  const seek = (next: number) => { setPlaying(false); timeRef.current = Math.min(controlTotal, Math.max(0, next)); setTime(timeRef.current); };
  const toggle = () => {
    if (time >= controlTotal) { timeRef.current = 0; setTime(0); }
    setPlaying(value => !value);
  };
  const index = numbers.indexOf(question);
  return createPortal(<div ref={dialogRef} className="exam-compare" role="dialog" aria-modal="true" aria-label="동시 풀이 재생" data-testid="replay-compare">
    <header className="exam-admin-review-bar exam-compare-head">
      <strong>{title} · 풀이 비교</strong>
      {started && <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={() => {
        if (focused) history.back();
        setPlaying(false); setStarted(false); setNotes([]);
      }}>학생 다시 고르기</button>}
      <button ref={closeRef} type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={onClose} aria-label="풀이 비교 닫기">닫기</button>
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
      <div className="exam-compare-navigation">
        {focused && <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={() => history.back()}>← 전체 보기</button>}
        <div className="exam-nav">
          <button type="button" className="rn-icon-button exam-nav-btn" aria-label="이전 문항" disabled={index <= 0} onClick={() => changeQuestion(numbers[index - 1])}>◀</button>
          <button type="button" className="exam-nav-count" aria-haspopup="dialog" data-testid="compare-counter" onClick={event => openOverview(event.currentTarget)}><strong>{question}번</strong> / 총{numbers.length}</button>
          <button type="button" className="rn-icon-button exam-nav-btn" aria-label="다음 문항" disabled={index >= numbers.length - 1} onClick={() => changeQuestion(numbers[index + 1])}>▶</button>
        </div>
        <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={event => openOverview(event.currentTarget)}>▦ 전체 문제</button>
      </div>
      <div className="exam-replay-dock exam-compare-dock" role="group" aria-label="필기 재생" data-testid="compare-dock">
        <div className="exam-replay-progress">
          <div className="exam-replay-slider exam-compare-track" role="slider" tabIndex={0} aria-label="필기 재생 위치"
            aria-valuemin={0} aria-valuemax={controlTotal} aria-valuenow={Math.min(time, controlTotal)}
            aria-valuetext={`${formatReplayTime(Math.min(time, controlTotal))} / ${formatReplayTime(controlTotal)}`} aria-disabled={!replays || controlTotal === 0}
            onPointerDown={event => {
              if (!replays || !controlTotal) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              const rect = event.currentTarget.getBoundingClientRect(); seek((event.clientX - rect.left) / rect.width * controlTotal);
            }}
            onPointerMove={event => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const rect = event.currentTarget.getBoundingClientRect(); seek((event.clientX - rect.left) / rect.width * controlTotal);
            }}
            onKeyDown={event => {
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? controlTotal : event.key === 'ArrowLeft' ? time - 3000 : event.key === 'ArrowRight' ? time + 3000 : null;
              if (next !== null && replays && controlTotal) { event.preventDefault(); seek(next); }
            }}>
            <span style={{ width: `${controlTotal ? Math.min(time / controlTotal, 1) * 100 : 0}%` }} />
          </div>
        </div>
        <output data-testid="compare-position">{formatReplayTime(Math.min(time, controlTotal))} / {formatReplayTime(controlTotal)}</output>
        <div className="exam-replay-buttons">
          <button type="button" className="exam-replay-icon" aria-label="처음" disabled={!replays || time <= 0} onClick={() => seek(0)}><ReplayIcon name="first" /></button>
          <button type="button" className="exam-replay-icon" aria-label="3초 뒤로" disabled={!replays || time <= 0} onClick={() => seek(time - 3000)}><ReplayIcon name="prev" /></button>
          <button type="button" className="exam-replay-icon is-play" aria-label={playing ? '일시정지' : '재생'} disabled={!replays || controlTotal === 0} onClick={toggle}><ReplayIcon name={playing ? 'pause' : 'play'} /></button>
          <button type="button" className="exam-replay-icon" aria-label="3초 앞으로" disabled={!replays || time >= controlTotal} onClick={() => seek(time + 3000)}><ReplayIcon name="next" /></button>
          <button type="button" className="exam-replay-icon" aria-label="마지막" disabled={!replays || time >= controlTotal} onClick={() => seek(controlTotal)}><ReplayIcon name="last" /></button>
        </div>
        <div className="exam-replay-speed" role="group" aria-label="배속">
          {[0.5, 1, 2, 4].map(value => <button key={value} type="button" aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value}×</button>)}
        </div>
      </div>
      {focused && <ScratchNotesTools tool={noteTool} color={noteColor} onTool={setNoteTool} onColor={setNoteColor}
        onClear={() => { setNotes([]); setNoteGeneration(value => value + 1); }} />}
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
                {q && replay && <ExamInkReplayFrame data={replay.data} clock={replay.clock} time={progress.time} imageUrl={q.imageUrl} imageMaxWidth={focused ? 1000 : 480}
                  notes={focused ? { strokes: notes, onChange: setNotes, tool: noteTool, color: noteColor, size: 4,
                    inkRef: null, toolbar: null, ready: true, canvasKey: noteGeneration } : undefined} />}
                {finished && <div className="exam-compare-ended" data-testid="compare-ended"><span>{empty ? '풀이 없음' : '끝'}</span></div>}
              </div>
            </Content>
          </section>;
        })}
      </div>
    </>}
    {overview && <div ref={overviewRef} className="exam-overlay exam-overlay-full" role="dialog" aria-modal="true" aria-label="전체 문제" data-testid="compare-overview">
      <div className="exam-overview">
        <div className="exam-sheet-head"><h2>전체 문제</h2><button type="button" className="rn-button rn-button-ghost rn-button-compact exam-overview-close" aria-label="전체 문제 닫기" onClick={() => history.back()}>✕</button></div>
        <div className="exam-thumbs">
          {numbers.map(number => {
            return <button key={number} type="button" className={`exam-thumb${question === number ? ' is-current' : ''}`} aria-current={question === number ? 'true' : undefined}
              aria-label={`${number}번 문항`} onClick={() => { changeQuestion(number); history.back(); }}>
              <span className="exam-thumb-paper"><img src={questionImages.get(number)} alt={`${number}번 문항`} loading="lazy" draggable={false} /></span><span className="exam-thumb-num">{number}</span>
            </button>;
          })}
        </div>
      </div>
    </div>}
  </div>, document.body);
}
