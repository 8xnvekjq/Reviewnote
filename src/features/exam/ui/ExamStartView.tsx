// 시작 화면: A4 비율 시험지 카드 격자 → (진행 중이면) 이어 풀기 / (아니면) 모드(실전/자유) → 선택과목 → 시작. 아래엔 지난 OMR 결과.
// v2: 시험지마다 따로 진행한다 — 한 시험지를 풀다 나와도 다른 시험지는 새로 시작할 수 있고, 같은 시험지는 이어 풀기만.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AdminExamApi, AdminPaperStudentActivity, ExamAttempt, ExamClient, ExamElective, ExamMode, ExamPaperSummary, ExamResult, ExamPaperMetadata } from '../contract';
import { AdminAttemptReview } from './AdminAttemptReview';
import { AdminLiveView } from './AdminLiveView';
import { browserPollEnvironment } from './livePolling';
import { startLiveBadgePolling } from './liveBadgePolling';
import { ELECTIVE_SHORT, ELECTIVES, formatClock, formatElapsed, progressRatio, remainingMs, roundLabel } from './examLogic';
import { HANNEUNG_ERAS } from './hanneungEra';
import { resultGradeLabel } from './hanneungLogic';

type PastResult = Pick<ExamResult, 'attemptId' | 'paperTitle' | 'mode' | 'elective' | 'score' | 'estimatedGrade' | 'submittedAt' | keyof ExamPaperMetadata>;

interface Props {
  client: ExamClient;
  currentUserId: string;
  admin?: AdminExamApi;
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

/** 학년 탭: 1~3은 고1~고3, 9는 중3(학교 학년 1~12 기준), 한능검. */
const GRADE_TABS = [9, 1, 2, 3, 'hanneung'] as const;
function gradeLabel(value: number | 'hanneung') {
  return value === 'hanneung' ? '한능검' : value <= 6 ? `고${value}` : `중${value - 6}`;
}

function paperGrade(paper: ExamPaperMetadata) {
  if (paper.kind === 'hanneung') return 'hanneung';
  return (paper.kind ?? 'csat') === 'csat' ? 3 : paper.grade;
}

function formatDate(iso: string) {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function activityDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function activityScore(row: AdminPaperStudentActivity) {
  return row.status === 'submitted' ? `${row.score ?? 0}/${row.maxScore}점` : `풀이 중 ${row.answeredCount}/${row.questionCount}`;
}

/** 관리자: 시험지 카드 아래 — 가장 최근 응시자 한 줄 + 학생별 최근 점수 목록(누르면 전체 화면 검토). */
function PaperActivity({ students, onOpen }: { students: AdminPaperStudentActivity[]; onOpen: (row: AdminPaperStudentActivity) => void }) {
  const latest = students[0];
  if (!latest) return <p className="exam-admin-activity is-empty" data-testid="exam-admin-activity">아직 응시한 학생이 없어요</p>;
  return (
    <div className="exam-admin-activity" data-testid="exam-admin-activity">
      <button type="button" className="exam-admin-activity-latest" onClick={() => onOpen(latest)} data-testid="exam-admin-latest">
        <span className="exam-admin-activity-label">최근 응시</span>
        <strong>{latest.studentName}</strong>
        <span><b>{activityScore(latest)}</b> · {activityDate(latest.submittedAt ?? latest.startedAt)}</span>
      </button>
      <details className="exam-admin-activity-more">
        <summary>학생별 최근 점수 ({students.length}명)</summary>
        <ul>
          {students.map(row => (
            <li key={row.studentId}>
              <button type="button" className="exam-admin-activity-row" onClick={() => onOpen(row)} data-testid="exam-admin-student">
                <span className="exam-admin-activity-name">{row.studentName}</span>
                <span className="exam-admin-activity-score">{activityScore(row)}</span>
                <span className="exam-admin-activity-meta">{row.round}차{row.attemptCount > 1 ? ` (총 ${row.attemptCount}회)` : ''}{row.status === 'submitted' && row.inProgress ? ' · 다시 푸는 중' : ''} · {activityDate(row.submittedAt ?? row.startedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function PaperCard({ paper, selected, busy, now, onClick }: { paper: ExamPaperSummary; selected: boolean; busy: boolean; now: number; onClick: () => void }) {
  const total = paper.questionCount ?? 30;
  const era = paper.practiceEra;
  const school = paper.kind === 'school' || paper.kind === 'worksheet';
  const progress = paper.inProgress ?? null;
  const last = paper.lastResult ?? null;
  const count = paper.resultCount ?? 0;
  const remaining = progress ? remainingMs(progress.startedAt, progress.timeLimitMinutes, now) : null;
  const cta = progress ? '이어 풀기' : count > 0 ? '다시 풀기' : '새로 풀기';
  const ratio = progress ? progressRatio(progress.answeredCount, total) : 0;

  return (
    <button
      type="button"
      className={`exam-paper-card${era ? ' exam-era-card' : ''}${selected ? ' is-on' : ''}${progress ? ' is-progress' : ''}`}
      aria-pressed={selected}
      aria-label={`${paper.title} — ${cta}`}
      disabled={busy}
      onClick={onClick}
      data-testid={era ? "exam-era-card" : "exam-paper-card"}
      data-paper-id={paper.id}
      data-state={progress ? 'in-progress' : count > 0 ? 'done' : 'new'}
    >
      <span className="exam-paper-sheet-head" aria-hidden="true">
        <span>{era ? '시대별 모아 풀기' : paper.kind === 'hanneung' ? `한국사 ${paper.hanneungLevel === 'basic' ? '기본' : '심화'}` : '수학 영역'}</span>
        <span>{era ? '자유 모드' : paper.kind === 'worksheet' ? '시간 제한 없음' : `${paper.timeLimitMinutes}분`} · {total}문항</span>
      </span>
      <strong className="exam-paper-title">{era ? HANNEUNG_ERAS.find(row => row.id === era)?.label : paper.title}</strong>
      {paper.kind === 'worksheet' && <span className="rn-caption">{paper.schoolName} · {paper.unitName}</span>}
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
            <span className="exam-paper-line">최근 {roundLabel(last.round) && `${roundLabel(last.round)} · `}<b>{era ? `${last.score}/${total}문항` : `${last.score}점`}{school && ` / ${paper.maxScore ?? 100}`}</b>{resultGradeLabel(paper, last.estimatedGrade) && <> · <b>{resultGradeLabel(paper, last.estimatedGrade)}</b></>}</span>
          </span>
        )}
        {!progress && !last && <span className="exam-paper-line is-muted">아직 풀지 않았어요</span>}
      </span>

      <span className={`exam-paper-cta${progress ? ' is-primary' : ''}`}>{cta}</span>
    </button>
  );
}

export function ExamStartView({ client, currentUserId, admin, busy, error, onStart, onResume, onOpenResult, onOpenHistory, onExit, initialPaperId }: Props) {
  const [papers, setPapers] = useState<ExamPaperSummary[] | null>(null);
  const [paperId, setPaperId] = useState<string | null>(initialPaperId ?? null);
  const [grade, setGrade] = useState<number | 'hanneung'>(3);
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
  const [activity, setActivity] = useState<Map<string, AdminPaperStudentActivity[]> | null>(null);
  const [reviewing, setReviewing] = useState<AdminPaperStudentActivity | null>(null);
  const [liveCounts, setLiveCounts] = useState<Map<string, number>>(new Map());
  const [livePaper, setLivePaper] = useState<ExamPaperSummary | null>(null);
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

  // 관리자만 시험지별 학생 응시 현황과 Live 배지를 받는다(학생이면 서버가 null). 화면이 보이는 동안 자동 갱신.
  useEffect(() => {
    if (!admin || livePaper || reviewing) return;
    return startLiveBadgePolling(admin, browserPollEnvironment, { activity: rows => setActivity(new Map(rows.map(row => [row.paperId, row.students]))), counts: setLiveCounts });
  }, [admin, livePaper, reviewing]);

  const visiblePapers = papers?.filter(candidate => paperGrade(candidate) === grade) ?? [];
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

      <div className="exam-option-grid exam-category-grid" role="group" aria-label="시험 분류">
        {GRADE_TABS.map(value => (
          <button key={value} type="button" aria-pressed={grade === value}
            className={`exam-option exam-option-small${grade === value ? ' is-on' : ''}`}
            disabled={!papers || busy || resuming != null}
            onClick={() => {
              if (grade === value) return;
              setGrade(value);
              setPaperId(null);
              setResumeError(null);
            }}>
            <strong>{gradeLabel(value)}</strong>
          </button>
        ))}
      </div>

      {loadError && <p className="exam-error" role="alert">{loadError}</p>}
      {!papers && !loadError && <div className="rn-loading"><div className="rn-skeleton rn-loading-card" /></div>}

      {papers && visiblePapers.length === 0 && <div className="rn-empty">아직 {gradeLabel(grade)} 시험지가 없어요.</div>}

      {visiblePapers.length > 0 && (
        <>
          <p className="rn-caption">시험지를 눌러 시작해요. 풀던 시험지는 이어서 풀 수 있어요.</p>
          {(['era', 'csat', 'school', 'worksheet', 'hanneung'] as const).map(kind => {
            const group = kind === 'era' ? HANNEUNG_ERAS.flatMap(era => visiblePapers.filter(p => p.practiceEra === era.id)) : visiblePapers.filter(p => !p.practiceEra && (p.kind ?? 'csat') === kind);
            return group.length > 0 ? <section key={kind} aria-label={kind === 'era' ? '시대별 모아 풀기' : kind === 'worksheet' ? '학교 프린트' : kind === 'school' ? '내신' : kind === 'csat' ? '수능·모평' : '한능검'}>
            <h2 className="exam-setup-title">{kind === 'era' ? '시대별 모아 풀기' : kind === 'worksheet' ? '학교 프린트' : kind === 'school' ? '내신' : kind === 'csat' ? '수능·모평' : '한능검'}</h2>
            <div className={kind === 'era' ? 'exam-era-card-list' : 'exam-paper-list'} aria-label={kind === 'era' ? '시대 묶음' : '시험지'}>
            {group.map(p => (
              <div key={p.id} className="exam-paper-entry">
                {activity && (liveCounts.get(p.id) ?? 0) > 0 && <button type="button" className="exam-live-badge" data-testid="exam-live-badge" aria-label={`${p.title} Live 보기`} onClick={() => setLivePaper(p)}><i aria-hidden="true" />Live</button>}
                <PaperCard paper={p} selected={p.id === paperId} busy={busy || resuming != null} now={now} onClick={() => onCard(p)} />
                <button type="button" className="rn-button rn-button-ghost rn-button-compact exam-history-open"
                  disabled={busy || resuming != null} onClick={() => onOpenHistory(p)}
                  aria-label={`${p.title} 풀이 기록 보기`} data-testid="exam-history-open" data-paper-id={p.id}>풀이 기록 보기</button>
                {activity && <PaperActivity students={activity.get(p.id) ?? []} onOpen={setReviewing} />}
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
            {((paper.practiceEra || paper.kind === 'worksheet') ? MODES.filter(m => m.value === 'free') : MODES).map(m => (
              <button key={m.value} type="button" role="radio" aria-checked={((paper.practiceEra || paper.kind === 'worksheet') ? 'free' : mode) === m.value} className={`exam-option${((paper.practiceEra || paper.kind === 'worksheet') ? 'free' : mode) === m.value ? ' is-on' : ''}`} onClick={() => setMode(m.value)}>
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
            onClick={() => { if (!paper.electives.length || elective) onStart(paper, (paper.practiceEra || paper.kind === 'worksheet') ? 'free' : mode, paper.electives.length ? elective : null); }}
            data-testid="exam-start-button"
          >
            {busy ? '준비 중…' : (!paper.electives.length || elective) ? `${!paper.practiceEra && paper.kind !== 'worksheet' && mode === 'real' ? '실전' : '자유'} 모드로 시작하기` : '선택과목을 골라 주세요'}
          </button>
          <p className="rn-caption exam-start-hint">시작하면 화면이 꽉 차게 바뀌어요. 애플펜슬로 문제 위에 바로 풀 수 있어요.</p>
        </section>
      )}

      {reviewing && admin && <AdminAttemptReview key={reviewing.attemptId} target={reviewing} studentName={reviewing.studentName}
        api={admin} onClose={() => setReviewing(null)} />}
      {livePaper && admin && <AdminLiveView api={admin} paperId={livePaper.id} title={livePaper.title} onClose={() => setLivePaper(null)} />}

      {past.length > 0 && (
        <section className="exam-past" aria-label="지난 OMR 결과">
          <h2 className="exam-setup-title">지난 OMR 결과</h2>
          <ul>
            {past.map(r => (
              <li key={r.attemptId}>
                <button type="button" className="exam-past-row" onClick={() => onOpenResult(r.attemptId)}>
                  <span><strong>{r.practiceEra ? `${r.score}/${r.questionCount}문항` : `${r.score}점`}{(r.kind === 'school' || r.kind === 'worksheet') && ` / ${r.maxScore ?? 100}`}</strong>{resultGradeLabel(r, r.estimatedGrade) && ` · ${resultGradeLabel(r, r.estimatedGrade)}`}</span>
                  <span className="rn-caption">{r.paperTitle} · {r.mode === 'real' ? '실전' : '자유'}{r.elective && ` · ${ELECTIVE_SHORT[r.elective]}`} · {formatDate(r.submittedAt)}</span>
                  <span className="exam-past-arrow" aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
