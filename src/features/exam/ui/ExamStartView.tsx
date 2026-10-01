// 시작 화면: A4 비율 시험지 카드 격자 → (진행 중이면) 이어 풀기 / (아니면) 모드(실전/자유) → 선택과목 → 시작. 아래엔 지난 OMR 결과.
// v2: 시험지마다 따로 진행한다 — 한 시험지를 풀다 나와도 다른 시험지는 새로 시작할 수 있고, 같은 시험지는 이어 풀기만.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ExamAttempt, ExamClient, ExamElective, ExamMode, ExamPaperSummary, ExamResult, ExamPaperMetadata } from '../contract';
import { ELECTIVE_SHORT, ELECTIVES, formatClock, formatElapsed, progressRatio, remainingMs, roundLabel } from './examLogic';

type PastResult = Pick<ExamResult, 'attemptId' | 'paperTitle' | 'mode' | 'elective' | 'score' | 'estimatedGrade' | 'submittedAt' | keyof ExamPaperMetadata>;

interface Props {
  client: ExamClient;
  currentUserId: string;
  busy: boolean;
  error: string | null;
  onStart: (paper: ExamPaperSummary, mode: ExamMode, elective: ExamElective | null) => void;
  onResume: (attempt: ExamAttempt) => void;
  onOpenResult: (attemptId: string) => void;
  onOpenHistory: (paper: ExamPaperSummary) => void;
  initialPaperId?: string;
  onExit: () => void;
}

const MODES: Array<{ value: ExamMode; title: string; desc: string }> = [
  { value: 'real', title: '실전 모드', desc: '100분 타이머, 제출하기 전엔 정답이 보이지 않아요.' },
  { value: 'free', title: '자유 모드', desc: '시간 제한 없이, 문항마다 채점해 볼 수 있어요.' },
];


function electiveKey(userId: string) { return `rn-exam-elective:${userId}`; }

function paperGrade(paper: ExamPaperMetadata) {
  return (paper.kind ?? 'csat') === 'csat' ? 3 : paper.grade;
}

function formatDate(iso: string) {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function PaperCard({ paper, selected, busy, now, onClick }: { paper: ExamPaperSummary; selected: boolean; busy: boolean; now: number; onClick: () => void }) {
  const total = paper.questionCount ?? 30;
  const school = paper.kind === 'school';
  const progress = paper.inProgress ?? null;
  const last = paper.lastResult ?? null;
  const count = paper.resultCount ?? 0;
  const remaining = progress ? remainingMs(progress.startedAt, progress.timeLimitMinutes, now) : null;
  const cta = progress ? '이어 풀기' : count > 0 ? '다시 풀기' : '새로 풀기';
  const ratio = progress ? progressRatio(progress.answeredCount, total) : 0;

  return (
    <button
      type="button"
      className={`exam-paper-card${selected ? ' is-on' : ''}${progress ? ' is-progress' : ''}`}
      aria-pressed={selected}
      aria-label={`${paper.title} — ${cta}`}
      disabled={busy}
      onClick={onClick}
      data-testid="exam-paper-card"
      data-paper-id={paper.id}
      data-state={progress ? 'in-progress' : count > 0 ? 'done' : 'new'}
    >
      <span className="exam-paper-sheet-head" aria-hidden="true">
        <span>수학 영역</span>
        <span>{paper.timeLimitMinutes}분 · {total}문항</span>
      </span>
      <strong className="exam-paper-title">{paper.title}</strong>
      {paper.published === false && <span className="exam-review-badge">검토 중(학생 비공개)</span>}

      <span className="exam-paper-body">
        {progress && (
          <span className="exam-paper-progress" data-testid="exam-paper-progress">
            <span className="exam-paper-line"><b>{roundLabel(progress.round)} 진행 중</b></span>
            <span className="exam-progress-bar" role="progressbar" aria-label="푼 문제" aria-valuemin={0} aria-valuemax={total} aria-valuenow={progress.answeredCount}>
              <i style={{ '--ratio': ratio } as CSSProperties} />
            </span>
            <span className="exam-paper-line">
              푼 문제 <b>{progress.answeredCount}/{total}</b> · 진행 <b>{formatElapsed(progress.elapsedMs)}</b>
            </span>
            <span className="exam-paper-line is-muted">
              {progress.mode === 'real' ? '실전' : '자유'}{progress.elective && ` · ${ELECTIVE_SHORT[progress.elective]}`}
              {remaining != null && ` · 남은 ${formatClock(remaining)}`}
            </span>
          </span>
        )}
        {last && (
          <span className="exam-paper-last" data-testid="exam-paper-last">
            <span className="exam-paper-line">최근 {roundLabel(last.round) && `${roundLabel(last.round)} · `}<b>{last.score}점{school && ` / ${paper.maxScore ?? 100}`}</b>{!school && last.estimatedGrade != null && <> · <b>{last.estimatedGrade}등급</b></>}</span>
          </span>
        )}
        {!progress && !last && <span className="exam-paper-line is-muted">아직 풀지 않았어요</span>}
      </span>

      <span className={`exam-paper-cta${progress ? ' is-primary' : ''}`}>{cta}</span>
    </button>
  );
}

export function ExamStartView({ client, currentUserId, busy, error, onStart, onResume, onOpenResult, onOpenHistory, onExit, initialPaperId }: Props) {
  const [papers, setPapers] = useState<ExamPaperSummary[] | null>(null);
  const [paperId, setPaperId] = useState<string | null>(initialPaperId ?? null);
  const [grade, setGrade] = useState(3);
  const [past, setPast] = useState<PastResult[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resuming, setResuming] = useState<string | null>(null);
  const [mode, setMode] = useState<ExamMode>('real');
  const [elective, setElective] = useState<ExamElective | null>(() => {
    try {
      const saved = localStorage.getItem(electiveKey(currentUserId));
      return ELECTIVES.includes(saved as ExamElective) ? saved as ExamElective : null;
    } catch { return null; }
  });
  const setupRef = useRef<HTMLElement>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    client.listPapers()
      .then(list => {
        if (!alive) return;
        setPapers(list);
        const initialPaper = list.find(candidate => candidate.id === initialPaperId);
        if (initialPaper) setGrade(paperGrade(initialPaper) ?? 3);
      })
      .catch(() => { if (alive) setLoadError('시험지를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'); });
    void client.listMyResults().then(r => { if (alive) setPast(r); }).catch(() => {});
    return () => { alive = false; };
  }, [client, initialPaperId]);

  const visiblePapers = papers?.filter(candidate => candidate.kind === 'hanneung' || paperGrade(candidate) === grade) ?? [];
  const paper = visiblePapers.find(p => p.id === paperId) ?? null;
  const showSetup = paper != null && !paper.inProgress;

  useEffect(() => {
    if (showSetup) setupRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [showSetup, paperId]);

  const pickElective = (next: ExamElective) => {
    setElective(next);
    try { localStorage.setItem(electiveKey(currentUserId), next); } catch { /* 무시 */ }
  };

  const resume = async (target: ExamPaperSummary) => {
    setResuming(target.id);
    setResumeError(null);
    try {
      const attempt = await client.getActiveAttempt(target.id);
      if (attempt) { onResume(attempt); return; }
      // 그사이 제출됐으면 새로 시작할 수 있게 카드를 갱신한다.
      setPapers(prev => prev?.map(p => (p.id === target.id ? { ...p, inProgress: null } : p)) ?? prev);
      setPaperId(target.id);
    } catch {
      setResumeError('풀던 시험을 불러오지 못했어요. 잠시 뒤 다시 해 볼까요?');
    } finally {
      setResuming(null);
    }
  };

  const onCard = (target: ExamPaperSummary) => {
    if (target.inProgress) { void resume(target); return; }
    setPaperId(target.id);
  };

  return (
    <div className="exam-start" data-testid="exam-start">
      <div className="exam-start-head">
        <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={onExit}>← 돌아가기</button>
      </div>
      <p className="rn-eyebrow">기출문제 풀이</p>
      <h1 className="rn-title">시험지 고르기</h1>

      <div className="exam-option-grid exam-option-grid-3" role="group" aria-label="학년 선택">
        {[1, 2, 3].map(value => (
          <button key={value} type="button" aria-pressed={grade === value}
            className={`exam-option exam-option-small${grade === value ? ' is-on' : ''}`}
            disabled={!papers || busy || resuming != null}
            onClick={() => {
              if (grade === value) return;
              setGrade(value);
              setPaperId(null);
              setResumeError(null);
            }}>
            <strong>고{value}</strong>
          </button>
        ))}
      </div>

      {loadError && <p className="exam-error" role="alert">{loadError}</p>}
      {!papers && !loadError && <div className="rn-loading"><div className="rn-skeleton rn-loading-card" /></div>}

      {papers && visiblePapers.length === 0 && <div className="rn-empty">아직 고{grade} 시험지가 없어요.</div>}

      {visiblePapers.length > 0 && (
        <>
          <p className="rn-caption">시험지를 눌러 시작해요. 풀던 시험지는 이어서 풀 수 있어요.</p>
          {(['csat', 'school', 'hanneung'] as const).map(kind => {
            const group = visiblePapers.filter(p => (p.kind ?? 'csat') === kind);
            return group.length > 0 ? <section key={kind} aria-label={kind === 'school' ? '내신' : kind === 'csat' ? '수능·모평' : '한능검'}>
            <h2 className="exam-setup-title">{kind === 'school' ? '내신' : kind === 'csat' ? '수능·모평' : '한능검'}</h2>
            <div className="exam-paper-list" aria-label="시험지">
            {group.map(p => (
              <div key={p.id} className="exam-paper-entry">
                <PaperCard paper={p} selected={p.id === paperId} busy={busy || resuming != null} now={now} onClick={() => onCard(p)} />
                <button type="button" className="rn-button rn-button-ghost rn-button-compact exam-history-open"
                  disabled={busy || resuming != null} onClick={() => onOpenHistory(p)}
                  aria-label={`${p.title} 풀이 기록 보기`} data-testid="exam-history-open" data-paper-id={p.id}>풀이 기록 보기</button>
              </div>
            ))}
          </div></section> : null;
          })}
        </>
      )}
      {(resumeError || (!showSetup && error)) && <p className="exam-error" role="alert">{resumeError || error}</p>}

      {paper && showSetup && (
        <section ref={setupRef} className="rn-surface exam-setup" aria-label="풀이 설정" data-testid="exam-setup">
          <p className="rn-caption exam-setup-paper">{paper.title}</p>
          <h2 className="exam-setup-title">어떻게 풀까요?</h2>
          <div className="exam-option-grid" role="radiogroup" aria-label="모드">
            {MODES.map(m => (
              <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} className={`exam-option${mode === m.value ? ' is-on' : ''}`} onClick={() => setMode(m.value)}>
                <strong>{m.title}</strong>
                <span>{m.value === 'real' ? m.desc.replace('100분', `${paper.timeLimitMinutes}분`) : m.desc}</span>
              </button>
            ))}
          </div>

          {paper.electives.length > 0 && <>
          <h2 className="exam-setup-title">선택과목</h2>
          <div className="exam-option-grid exam-option-grid-3" role="radiogroup" aria-label="선택과목">
            {paper.electives.map(e => (
              <button key={e} type="button" role="radio" aria-checked={elective === e} className={`exam-option exam-option-small${elective === e ? ' is-on' : ''}`} onClick={() => pickElective(e)}>
                <strong>{ELECTIVE_SHORT[e]}</strong>
                <span>{e}</span>
              </button>
            ))}
          </div>

          </>}
          {error && <p className="exam-error" role="alert">{error}</p>}
          <button
            type="button"
            className="rn-button rn-button-primary exam-start-button"
            disabled={(paper.electives.length > 0 && !elective) || busy}
            onClick={() => { if (!paper.electives.length || elective) onStart(paper, mode, paper.electives.length ? elective : null); }}
            data-testid="exam-start-button"
          >
            {busy ? '준비 중…' : (!paper.electives.length || elective) ? `${mode === 'real' ? '실전' : '자유'} 모드로 시작하기` : '선택과목을 골라 주세요'}
          </button>
          <p className="rn-caption exam-start-hint">시작하면 화면이 꽉 차게 바뀌어요. 애플펜슬로 문제 위에 바로 풀 수 있어요.</p>
        </section>
      )}

      {past.length > 0 && (
        <section className="exam-past" aria-label="지난 OMR 결과">
          <h2 className="exam-setup-title">지난 OMR 결과</h2>
          <ul>
            {past.map(r => (
              <li key={r.attemptId}>
                <button type="button" className="exam-past-row" onClick={() => onOpenResult(r.attemptId)}>
                  <span><strong>{r.score}점{r.kind === 'school' && ` / ${r.maxScore ?? 100}`}</strong>{r.kind !== 'school' && r.estimatedGrade != null && ` · 추정 ${r.estimatedGrade}등급`}</span>
                  <span className="rn-caption">{r.paperTitle} · {r.mode === 'real' ? '실전' : '자유'}{r.elective && ` · ${ELECTIVE_SHORT[r.elective]}`} · {formatDate(r.submittedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
