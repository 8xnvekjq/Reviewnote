// 전체화면 풀이: 상단 바(나가기·필기도구·이전/다음·번호·스톱워치·남은 시간) + 상단 답안 줄 + 문항 이미지/필기.
// 전체 문제 보기·OMR 검토·나가기/제출 확인은 이 화면 위에 겹쳐 띄운다(전체화면을 유지한 채).
// v2: 자유 모드에서 채점해 본 문항(checked)은 답을 잠근다 — 이어 풀기로 다시 열어도 서버 payload 의 items[].checked 로 유지.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ExamAttempt, ExamClient, ExamInkCanvasHandle, ExamItemState, ExamResult, InkChangeKind, InkStroke, InkTool } from '../contract';
import { ExamInkCanvas, preloadInkImages } from '../ink/ExamInkCanvas';

/** 문항 이미지 표시 너비(CSS px) — 모든 문항이 같은 원본 너비로 잘려 있어 글자 크기가 항상 같다. */
const QUESTION_IMAGE_WIDTH = 480;
import { AnswerBar, type FreeCheck } from './AnswerBar';
import { OmrCard } from './OmrCard';
import { QuestionOverview } from './QuestionOverview';
import { useExamInk } from './useExamInk';
import {
  countAnswered, createStopwatch, crossedAlerts, elapsedFor, formatClock, normalizeShortAnswer, pauseStopwatch, remainingMs,
  switchStopwatch, toggleChoice, questionAnswerType, type StopwatchState,
} from './examLogic';

const SAVE_DEBOUNCE_MS = 2500;
const INK_SAVE_DEBOUNCE_MS = 800;
const PEN_COLORS = [
  { value: '#1f2937', label: '검정' },
  { value: '#2563eb', label: '파랑' },
  { value: '#dc2626', label: '빨강' },
  { value: '#16a34a', label: '초록' },
];
const SIZES = [
  { value: 2, label: '가늘게' },
  { value: 4, label: '보통' },
  { value: 7, label: '굵게' },
];

interface LocalItem { answer: string | null; unsure: boolean; visits: number; checked: FreeCheck | null }
type Overlay = null | 'overview' | 'review' | 'exit' | 'submit';

interface Props {
  client: ExamClient;
  attempt: ExamAttempt;
  /** 나가기(진행 상황은 저장된 뒤). */
  onExit: () => void;
  onSubmitted: (result: ExamResult) => void;
}

function initialItems(attempt: ExamAttempt): Record<string, LocalItem> {
  const map: Record<string, LocalItem> = {};
  for (const q of attempt.questions) map[q.id] = { answer: null, unsure: false, visits: 0, checked: null };
  for (const item of attempt.items) {
    if (!map[item.questionId]) continue;
    const q = attempt.questions.find(x => x.id === item.questionId);
    const answer = q && questionAnswerType(q) === 'digits' ? normalizeShortAnswer(item.answer) : item.answer;
    const checked = item.checked ? { isCorrect: item.checked.isCorrect, correctAnswer: item.checked.correctAnswer } : null;
    map[item.questionId] = { answer, unsure: item.unsure, visits: item.visits, checked };
  }
  return map;
}

function initialIndex(attempt: ExamAttempt): number {
  const last = attempt.visitOrder[attempt.visitOrder.length - 1];
  const index = attempt.questions.findIndex(q => q.number === last);
  return index >= 0 ? index : 0;
}

export function ExamSolveView({ client, attempt, onExit, onSubmitted }: Props) {
  const questions = attempt.questions;
  const hanneung = attempt.kind === 'hanneung';
  const [pageZoom, setPageZoom] = useState(false);
  const [pagePan, setPagePan] = useState(hanneung);
  const isReal = attempt.mode === 'real';
  const [items, setItems] = useState(() => initialItems(attempt));
  const [index, setIndex] = useState(() => initialIndex(attempt));
  const inkSync = useExamInk(client, attempt.id, questions.map(q => q.id));
  const strokes = inkSync.strokes;
  const [tool, setTool] = useState<InkTool>('pen');
  const [color, setColor] = useState(PEN_COLORS[0].value);
  const [size, setSize] = useState(SIZES[1].value);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [checking, setChecking] = useState(false);
  const [historyTick, setHistoryTick] = useState(0); // 실행 취소/다시 실행 버튼 상태 갱신용

  const question = questions[index];
  const pageQuestions = questions.filter(candidate => candidate.imageUrl === question.imageUrl);
  const inkKey = hanneung ? pageQuestions[0].id : question.id;
  const pageUrls = [...new Set(questions.map(candidate => candidate.imageUrl))];
  const itemsRef = useRef(items);
  const visitOrderRef = useRef<number[]>([...attempt.visitOrder]);
  const swRef = useRef<StopwatchState>(createStopwatch(Object.fromEntries(attempt.items.map(item => [item.questionId, item.timeSpentMs]))));
  const inkRef = useRef<ExamInkCanvasHandle>(null);
  // 문항을 넘길 때 깜박이지 않게 이 시험의 문항 이미지를 미리 받아 둔다.
  useEffect(() => { if (!hanneung) preloadInkImages(questions.map(q => q.imageUrl)); }, [questions, hanneung]);
  const saveTimer = useRef<number | null>(null);
  const inkTimers = useRef(new Map<string, number>());
  const submittedRef = useRef(false);
  const autoSubmitTriedRef = useRef(false);
  const openedRef = useRef<string | null>(null);
  const prevRemaining = useRef<number | null>(null);

  useEffect(() => { itemsRef.current = items; }, [items]);

  // ── 저장 ──
  const snapshot = useCallback((): ExamItemState[] => {
    const t = Date.now();
    return questions.map(q => {
      const item = itemsRef.current[q.id];
      return {
        questionId: q.id,
        answer: item?.answer ?? null,
        unsure: item?.unsure ?? false,
        timeSpentMs: Math.round(elapsedFor(swRef.current, q.id, t)),
        visits: item?.visits ?? 0,
        checked: item?.checked ?? null,
      };
    });
  }, [questions]);

  const saveNow = useCallback(async () => {
    if (saveTimer.current != null) { window.clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (submittedRef.current) return true;
    setSaveState('saving');
    let ok = false;
    try { ok = await client.saveProgress(attempt.id, snapshot(), [...visitOrderRef.current]); } catch { ok = false; }
    setSaveState(ok ? 'saved' : 'failed');
    return ok;
  }, [client, attempt.id, snapshot]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { saveTimer.current = null; void saveNow(); }, SAVE_DEBOUNCE_MS);
  }, [saveNow]);

  const flushInk = useCallback(async () => {
    for (const timer of inkTimers.current.values()) window.clearTimeout(timer);
    inkTimers.current.clear();
    return inkSync.flush();
  }, [inkSync]);

  // ── 문항 열기: visits+1, visitOrder 기록, 스톱워치 전환 ──
  useEffect(() => {
    if (openedRef.current === question.id) return;
    openedRef.current = question.id;
    visitOrderRef.current.push(question.number);
    setItems(prev => ({ ...prev, [question.id]: { ...prev[question.id], visits: (prev[question.id]?.visits ?? 0) + 1 } }));
    swRef.current = switchStopwatch(swRef.current, document.hidden ? null : question.id, Date.now());
    if (document.hidden) swRef.current = { ...swRef.current, activeId: question.id };
    scheduleSave();
  }, [question.id, question.number, scheduleSave]);

  // 검토 화면에선 문항 스톱워치를 멈춘다
  useEffect(() => {
    const t = Date.now();
    if (overlay === 'review' || overlay === 'submit') swRef.current = pauseStopwatch(swRef.current, t);
    else if (!document.hidden && swRef.current.runningSince == null) swRef.current = switchStopwatch(swRef.current, openedRef.current, t);
  }, [overlay]);

  // 탭이 숨겨지면 멈추고 저장, 돌아오면 다시
  useEffect(() => {
    const onVisibility = () => {
      const t = Date.now();
      if (document.hidden) {
        swRef.current = pauseStopwatch(swRef.current, t);
        void flushInk();
        void saveNow();
      } else if (overlay !== 'review' && overlay !== 'submit') {
        swRef.current = switchStopwatch(swRef.current, openedRef.current, t);
      }
    };
    const onPageHide = () => { void flushInk(); void saveNow(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [overlay, flushInk, saveNow]);

  // 화면에서 나갈 때 남은 저장분 정리
  useEffect(() => () => {
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    void flushInk();
  }, [flushInk]);

  // ── 시계 ──
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  // 실전 모드: 화면 꺼짐 방지
  useEffect(() => {
    if (!isReal) return;
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } };
    let sentinel: Sentinel | null = null;
    let disposed = false;
    const acquire = async () => {
      try {
        const next = await nav.wakeLock?.request('screen');
        if (disposed) { void next?.release(); return; }
        sentinel = next ?? null;
      } catch { /* 지원 안 함/거부 — 무시 */ }
    };
    const onVisible = () => { if (!document.hidden) void acquire(); };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [isReal]);

  // ── 제출 ──
  const submit = useCallback(async (auto: boolean) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    swRef.current = pauseStopwatch(swRef.current, Date.now());
    if (saveTimer.current != null) { window.clearTimeout(saveTimer.current); saveTimer.current = null; }
    try {
      if (!await flushInk()) throw new Error('필기를 서버에 저장하지 못했어요. 저장 상태를 확인하고 다시 제출해 주세요.');
      const result = await client.submitAttempt(attempt.id, snapshot(), [...visitOrderRef.current]);
      onSubmitted(result);
    } catch (error) {
      submittedRef.current = false;
      setSubmitting(false);
      setSubmitError(error instanceof Error ? error.message : '제출하지 못했어요.');
      setOverlay(auto ? 'review' : 'submit');
    }
  }, [client, attempt.id, snapshot, flushInk, onSubmitted]);

  const remaining = remainingMs(attempt.startedAt, attempt.timeLimitMinutes, now);
  useEffect(() => {
    if (remaining == null) return;
    const crossed = crossedAlerts(prevRemaining.current, remaining);
    prevRemaining.current = remaining;
    if (crossed.length) setToast(`${Math.round(crossed[crossed.length - 1] / 60000)}분 남았어요. 차분하게 마무리해요!`);
    if (remaining <= 0 && !submittedRef.current && !autoSubmitTriedRef.current && inkSync.ready) {
      autoSubmitTriedRef.current = true;
      setToast('시간이 다 되어 자동으로 제출할게요.');
      void submit(true);
    }
  }, [remaining, submit, inkSync.ready]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  // ── 조작 ──
  const goTo = useCallback((next: number) => {
    if (next < 0 || next >= questions.length) return;
    setIndex(next);
  }, [questions.length]);

  const updateItem = useCallback((qid: string, patch: Partial<LocalItem>) => {
    setItems(prev => ({ ...prev, [qid]: { ...prev[qid], ...patch } }));
    scheduleSave();
  }, [scheduleSave]);

  const setAnswer = useCallback((next: string | null) => {
    if (itemsRef.current[question.id]?.checked) return; // 채점해 본 문항은 잠김
    updateItem(question.id, { answer: next });
  }, [question.id, updateItem]);

  const onInkChange = (next: InkStroke[], kind?: InkChangeKind) => {
    if (submittedRef.current) return;
    const qid = inkKey;
    inkSync.change(qid, next, kind);
    const old = inkTimers.current.get(qid);
    if (old != null) window.clearTimeout(old);
    inkTimers.current.set(qid, window.setTimeout(() => {
      inkTimers.current.delete(qid);
      void inkSync.flush();
    }, INK_SAVE_DEBOUNCE_MS));
    setHistoryTick(t => t + 1);
  };

  // 키보드(데스크톱 편의): ←/→ 이전·다음, 1~5 객관식
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (overlay || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1); }
      else if (questionAnswerType(question) !== 'digits' && (question.answerType === 'choice10' ? /^[0-9]$/ : question.answerType === 'choice4' ? /^[1-4]$/ : /^[1-5]$/).test(e.key)) {
        e.preventDefault();
        setAnswer(toggleChoice(itemsRef.current[question.id]?.answer ?? null, e.key === '0' ? 10 : Number(e.key)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay, goTo, index, question, setAnswer]);

  const runFreeCheck = async () => {
    const answer = items[question.id]?.answer;
    if (answer == null || items[question.id]?.checked) return;
    const qid = question.id;
    setChecking(true);
    try {
      const res = await client.checkAnswer(attempt.id, qid, answer);
      // 서버가 이 답을 저장하고 문항을 잠갔다 — 화면도 같은 답으로 잠근다.
      updateItem(qid, { answer, checked: { isCorrect: res.isCorrect, correctAnswer: res.correctAnswer } });
      setRevealed(prev => ({ ...prev, [qid]: false }));
    } catch (error) {
      setToast(error instanceof Error ? error.message : '채점하지 못했어요. 잠시 뒤 다시 해 볼까요?');
    } finally {
      setChecking(false);
    }
  };

  const closeOverlay = useCallback(() => setOverlay(null), []);

  const confirmExit = async () => {
    swRef.current = pauseStopwatch(swRef.current, Date.now());
    const results = await Promise.all([flushInk(), saveNow()]);
    if (results.some(ok => !ok)) {
      setOverlay(null);
      setToast('서버에 저장하지 못했어요. 화면을 닫지 말고 저장을 다시 시도해 주세요.');
      return;
    }
    onExit();
  };

  const answeredCount = useMemo(() => countAnswered(Object.values(items)), [items]);
  const emptyCount = questions.length - answeredCount;
  const unsureCount = Object.values(items).filter(item => item.unsure).length;
  const elapsed = elapsedFor(swRef.current, question.id, now);
  const current = items[question.id] ?? { answer: null, unsure: false, visits: 0, checked: null };
  void historyTick;
  const canUndo = inkRef.current?.canUndo() ?? false;
  const canRedo = inkRef.current?.canRedo() ?? false;
  const lowTime = remaining != null && remaining <= 5 * 60_000;

  return (
    <div className="exam-solve" data-testid="exam-solve" data-mode={attempt.mode} data-question={question.number}>
      <header className="exam-topbar">
        <div className="exam-topbar-main">
          <button type="button" className="rn-button rn-button-ghost rn-button-compact exam-exit" onClick={() => setOverlay('exit')}>
            나가기
          </button>
          <div className="exam-tools" role="toolbar" aria-label="필기 도구">
            <div className="exam-tool-group">
              {([['pen', '펜', '✏️'], ['highlighter', '형광펜', '🖍️'], ['eraser', '지우개', '🧽']] as const).map(([value, label, icon]) => (
                <button key={value} type="button" className={`exam-tool${tool === value && !pagePan ? ' is-on' : ''}`} aria-pressed={tool === value && !pagePan} aria-label={label} title={label} onClick={() => { setTool(value); setPagePan(false); }}>
                  <span aria-hidden="true">{icon}</span>
                </button>
              ))}
            </div>
            <div className="exam-tool-group">
              {PEN_COLORS.map(c => (
                <button key={c.value} type="button" className={`exam-color${color === c.value ? ' is-on' : ''}`} style={{ '--swatch': c.value } as CSSProperties} aria-pressed={color === c.value} aria-label={`${c.label}색`} onClick={() => { setColor(c.value); if (tool === 'eraser') setTool('pen'); }} />
              ))}
            </div>
            <div className="exam-tool-group">
              {SIZES.map(s => (
                <button key={s.value} type="button" className={`exam-size${size === s.value ? ' is-on' : ''}`} aria-pressed={size === s.value} aria-label={`굵기 ${s.label}`} onClick={() => setSize(s.value)}>
                  <i style={{ width: s.value + 3, height: s.value + 3 }} />
                </button>
              ))}
            </div>
            <div className="exam-tool-group">
              <button type="button" className="exam-tool" aria-label="실행 취소" title="실행 취소" disabled={!canUndo} onClick={() => { inkRef.current?.undo(); setHistoryTick(t => t + 1); }}>↶</button>
              <button type="button" className="exam-tool" aria-label="다시 실행" title="다시 실행" disabled={!canRedo} onClick={() => { inkRef.current?.redo(); setHistoryTick(t => t + 1); }}>↷</button>
              <button type="button" className="exam-tool exam-tool-text" disabled={!(strokes.get(inkKey)?.length)} onClick={() => { inkRef.current?.clear(); setHistoryTick(t => t + 1); }}>
                {hanneung ? '이 페이지 필기 지우기' : '이 문항 필기 지우기'}
              </button>
            </div>
          </div>
          <div className="exam-nav">
            <button type="button" className="rn-icon-button exam-nav-btn" aria-label="이전 문항" disabled={index === 0} onClick={() => goTo(index - 1)}>◀</button>
            <button type="button" className="exam-nav-count" aria-label={`${question.number}번 / ${questions.length} — 전체 문제 보기`} aria-haspopup="dialog" onClick={() => setOverlay('overview')} data-testid="exam-counter">
              <strong>{question.number}</strong> / {questions.length}
            </button>
            <button type="button" className="rn-icon-button exam-nav-btn" aria-label="다음 문항" disabled={index === questions.length - 1} onClick={() => goTo(index + 1)}>▶</button>
            <button type="button" className="exam-overview-open" aria-haspopup="dialog" onClick={() => setOverlay('overview')} data-testid="exam-overview-open">
              <span aria-hidden="true">▦</span> 전체 문제
            </button>
          </div>
          <span className="exam-stopwatch" title="이 문항에 쓴 시간" data-testid="exam-stopwatch" data-ms={Math.round(elapsed)}>
            <span aria-hidden="true">⏱</span> {formatClock(elapsed)}
          </span>
          {remaining != null && (
            <span className={`exam-remaining${lowTime ? ' is-low' : ''}`} title="남은 시간" data-testid="exam-remaining">
              남은 {formatClock(remaining)}
            </span>
          )}
          <button type="button" className="rn-button rn-button-primary rn-button-compact exam-submit-open" onClick={() => setOverlay('review')}>
            제출
          </button>
        </div>
      </header>

      <AnswerBar
        key={question.id}
        question={question}
        answer={current.answer}
        unsure={current.unsure}
        onAnswer={setAnswer}
        onUnsure={next => updateItem(question.id, { unsure: next })}
        free={isReal ? undefined : {
          check: current.checked,
          checking,
          revealed: revealed[question.id] ?? false,
          onCheck: () => { void runFreeCheck(); },
          onReveal: () => setRevealed(prev => ({ ...prev, [question.id]: true })),
        }}
      />

      <main className="exam-body" data-testid="exam-body">
        <div className="exam-paper">
          <div className="exam-paper-meta rn-caption">
            {question.number}번 · {question.points}점 · {question.isChoice ? '객관식' : '단답형'}
            {saveState === 'failed' && <span className="exam-save-failed"> · 저장이 잠깐 안 됐어요(다시 시도할게요)</span>}
          </div>
          <div className="exam-ink-sync" role="status" data-testid="exam-ink-sync">
            {inkSync.status === 'loading' ? '저장된 필기를 불러오는 중…'
              : inkSync.status === 'saved' ? '필기 서버 저장 완료 · 다른 기기에서도 볼 수 있어요'
              : inkSync.status === 'pending' || inkSync.status === 'saving' ? '필기 저장 중…'
              : inkSync.status === 'conflict' ? '다른 기기에서 풀이가 변경됐어요. 이 기기 필기를 덮어쓰지 않았어요.'
              : '필기를 서버와 동기화하지 못했어요. 화면을 닫지 말고 다시 시도해 주세요.'}
            {inkSync.status === 'failed' && <button type="button" className="rn-button rn-button-compact" onClick={() => {
              if (inkSync.ready) void inkSync.flush(); else void inkSync.load().then(() => inkSync.flush());
            }}>다시 시도</button>}
            {inkSync.status === 'conflict' && <button type="button" className="rn-button rn-button-compact" onClick={() => {
              if (window.confirm('이 기기의 미저장 필기 대신 서버에 저장된 필기를 사용할까요?')) void inkSync.load(true);
            }}>서버 필기 사용</button>}
          </div>
          {hanneung && <nav className="exam-page-nav" aria-label="원본 페이지 문항">
            <span className="rn-caption">원본 {pageUrls.indexOf(question.imageUrl) + 1} / {pageUrls.length}쪽</span>
            {pageQuestions.map(candidate => <button key={candidate.id} type="button" className="rn-button rn-button-compact" aria-pressed={candidate.id === question.id} onClick={() => goTo(questions.indexOf(candidate))}>{candidate.number}번</button>)}
            <button type="button" className="rn-button rn-button-compact" aria-pressed={pageZoom} onClick={() => setPageZoom(prev => !prev)}>{pageZoom ? '화면에 맞추기' : '원본 확대'}</button>
            <button type="button" className="rn-button rn-button-compact" aria-pressed={pagePan} onClick={() => setPagePan(prev => !prev)}>{pagePan ? '필기하기' : '화면 이동'}</button>
          </nav>}
          <div className={hanneung ? 'exam-original-scroll' : undefined}>
          <div style={hanneung && pageZoom ? { minWidth: 1100 } : undefined}>
          <ExamInkCanvas
            key={`${inkKey}:${inkSync.generation}`}
            ref={inkRef}
            imageUrl={question.imageUrl}
            strokes={strokes.get(inkKey) ?? []}
            onChange={onInkChange}
            tool={tool}
            color={color}
            size={size}
            penOnlyWhenPenDetected
            shapeSnap
            readOnly={!inkSync.ready || submitting || (hanneung && pagePan)}
            imageMaxWidth={hanneung ? (pageZoom ? 1100 : 980) : QUESTION_IMAGE_WIDTH}
          />
          </div>
          </div>
          {/* 이전·다음은 상단 화살표로 충분하다. 마지막 문항에서만 OMR 확인으로 이어 준다. */}
          {index === questions.length - 1 && (
            <div className="exam-paper-foot">
              <button type="button" className="rn-button rn-button-primary" onClick={() => setOverlay('review')}>OMR 확인하기</button>
            </div>
          )}
        </div>
      </main>

      {toast && <div className="exam-toast" role="status" aria-live="assertive">{toast}</div>}

      {overlay === 'overview' && (
        <QuestionOverview
          wholePages={hanneung}
          questions={questions}
          items={items}
          currentIndex={index}
          answeredCount={answeredCount}
          onPick={i => { goTo(i); setOverlay(null); }}
          onClose={closeOverlay}
          onOpenOmr={() => setOverlay('review')}
        />
      )}

      {(overlay === 'review' || overlay === 'submit') && (
        <div className="exam-overlay exam-overlay-full" role="dialog" aria-modal="true" aria-label="OMR 검토" data-testid="exam-review">
          <div className="exam-review">
            <div className="exam-sheet-head">
              <h2>OMR 검토</h2>
              <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={() => setOverlay(null)} disabled={submitting}>풀이로 돌아가기</button>
            </div>
            <p className="exam-review-summary">
              응답 <strong>{answeredCount}</strong> / {questions.length}
              {emptyCount > 0 && <span className="is-empty"> · 빈 문항 {emptyCount}</span>}
              {unsureCount > 0 && <span className="is-unsure"> · 🤔 {unsureCount}</span>}
              {remaining != null && <span> · 남은 {formatClock(remaining)}</span>}
            </p>
            <p className="rn-caption">줄을 누르면 그 문항으로 가요.</p>
            <OmrCard questions={questions} items={items} onPick={i => { goTo(i); setOverlay(null); }} />
            {submitError && <p className="exam-error" role="alert">{submitError}</p>}
            <button type="button" className="rn-button rn-button-primary exam-sheet-wide" onClick={() => setOverlay('submit')} disabled={submitting}>
              제출하기
            </button>
          </div>
          {overlay === 'submit' && (
            <div className="exam-confirm" role="alertdialog" aria-modal="true" aria-label="제출 확인">
              <div className="exam-confirm-box">
                <h3>정말 제출할까요?</h3>
                <p className="rn-caption">
                  {emptyCount > 0 ? `아직 빈 문항이 ${emptyCount}개 있어요. ` : '모든 문항에 답했어요. '}
                  제출하면 답을 바꿀 수 없어요.
                </p>
                <div className="exam-confirm-actions">
                  <button type="button" className="rn-button rn-button-secondary" onClick={() => setOverlay('review')} disabled={submitting}>조금 더 볼게요</button>
                  <button type="button" className="rn-button rn-button-primary" onClick={() => { void submit(false); }} disabled={submitting} data-testid="exam-submit-confirm">
                    {submitting ? '채점 중…' : '제출하기'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {overlay === 'exit' && (
        <div className="exam-confirm" role="alertdialog" aria-modal="true" aria-label="나가기 확인">
          <div className="exam-confirm-box">
            <h3>잠깐 나갈까요?</h3>
            <p className="rn-caption">
              답과 필기는 저장돼서 나중에 이어 풀 수 있어요.
              {isReal && ' 실전 모드는 나가 있어도 시간이 계속 흘러요.'}
            </p>
            <div className="exam-confirm-actions">
              <button type="button" className="rn-button rn-button-secondary" onClick={() => setOverlay(null)}>계속 풀기</button>
              <button type="button" className="rn-button rn-button-destructive" onClick={() => { void confirmExit(); }} data-testid="exam-exit-confirm">나가기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
