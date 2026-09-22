import { useEffect, useMemo, useState } from 'react';
import type { MistakeEntry } from '../../types';
import { MATH_CURRICULUM, GRADE_LIST } from '../../types';
import '../../styles/examPrep.css';
import '../../styles/reviewCheck.css';
import {
  fetchLatestReviewCheckSession,
  fetchReviewCheckItems,
  fetchStudentReviewCheckSessions,
  startReviewCheckSession,
  submitReviewCheckSession,
  requestReviewCheckAiGrading,
  type ReviewCheckSession,
  type ReviewCheckItem,
} from '../../utils/reviewCheckClient';
import { AppIcon } from '../ui/AppIcon';
import { LaTeXRenderer } from '../LaTeXRenderer';
import { ReviewCheckImageZoom } from './ReviewCheckImageZoom';

interface Props {
  currentUserId: string;
  schoolGrade?: string;
  mistakes: MistakeEntry[];
}

const FALLBACK_GRADE = MATH_CURRICULUM['공통수학2'] ? '공통수학2' : GRADE_LIST[0];
function defaultGradeFor(schoolGrade?: string): string {
  if (schoolGrade === '고2' && MATH_CURRICULUM['미적분Ⅰ']) return '미적분Ⅰ';
  return FALLBACK_GRADE;
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'start'; recentGraded: ReviewCheckSession | null }
  | { kind: 'quiz'; session: ReviewCheckSession; items: ReviewCheckItem[] }
  | { kind: 'waiting' }
  | { kind: 'history' }
  | { kind: 'historyDetail'; session: ReviewCheckSession }
  | { kind: 'error'; message: string };

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
}

// 학생용 "복습체크" — 범위 선택 -> 최대 5문제 -> 주관식 제출 -> 채점 대기, 만 알면 되도록
// 화면 하나에 한 흐름만 보여준다. DB 상태(session 원본/RLS/RPC)는 여기서 절대 노출하지 않는다.
export function ReviewCheckScreen({ currentUserId, schoolGrade, mistakes }: Props) {
  const [view, setView] = useState<ViewState>({ kind: 'loading' });
  const mistakeById = useMemo(() => new Map(mistakes.map(m => [m.id, m])), [mistakes]);

  const load = async () => {
    setView({ kind: 'loading' });
    try {
      const latest = await fetchLatestReviewCheckSession(currentUserId);
      if (!latest) {
        setView({ kind: 'start', recentGraded: null });
        return;
      }
      if (latest.status === 'in_progress') {
        const items = await fetchReviewCheckItems(latest.id);
        setView({ kind: 'quiz', session: latest, items });
        return;
      }
      if (latest.status === 'submitted') {
        setView({ kind: 'waiting' });
        return;
      }
      setView({ kind: 'start', recentGraded: latest });
    } catch (err: any) {
      setView({ kind: 'error', message: err?.message || '불러오는 중 문제가 발생했어요.' });
    }
  };

  useEffect(() => { load(); }, [currentUserId]);

  if (view.kind === 'loading') {
    return <div className="rn-empty"><span>불러오는 중...</span></div>;
  }
  if (view.kind === 'error') {
    return (
      <div className="rn-empty">
        <span>{view.message}</span>
        <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={load} style={{ marginTop: 8 }}>다시 시도</button>
      </div>
    );
  }
  if (view.kind === 'waiting') {
    return (
      <div className="rn-surface" style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 750, marginBottom: 6 }}>복습체크 제출 완료</div>
        <p className="rn-caption">선생님이 채점하면<br />결과를 확인할 수 있어요.</p>
      </div>
    );
  }
  if (view.kind === 'quiz') {
    return (
      <ReviewCheckQuiz
        session={view.session}
        items={view.items}
        mistakeById={mistakeById}
        onSubmitted={load}
      />
    );
  }
  if (view.kind === 'history') {
    return (
      <ReviewCheckStudentHistoryList
        studentId={currentUserId}
        onBack={load}
        onSelect={session => setView({ kind: 'historyDetail', session })}
      />
    );
  }
  if (view.kind === 'historyDetail') {
    return (
      <ReviewCheckStudentHistoryDetail
        session={view.session}
        mistakeById={mistakeById}
        onBack={() => setView({ kind: 'history' })}
      />
    );
  }
  return (
    <ReviewCheckStart
      schoolGrade={schoolGrade}
      recentGraded={view.recentGraded}
      onStarted={load}
      onShowHistory={() => setView({ kind: 'history' })}
    />
  );
}

function ReviewCheckStart({
  schoolGrade, recentGraded, onStarted, onShowHistory,
}: {
  schoolGrade?: string;
  recentGraded: ReviewCheckSession | null;
  onStarted: () => void;
  onShowHistory: () => void;
}) {
  const [grade, setGrade] = useState(() => defaultGradeFor(schoolGrade));
  const chapters = MATH_CURRICULUM[grade] || [];
  const [startChapter, setStartChapter] = useState(chapters[0] || '');
  const [endChapter, setEndChapter] = useState(chapters[chapters.length - 1] || '');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptyRange, setEmptyRange] = useState(false);

  const handleGradeChange = (g: string) => {
    setGrade(g);
    setEmptyRange(false);
    const list = MATH_CURRICULUM[g] || [];
    setStartChapter(list[0] || '');
    setEndChapter(list[list.length - 1] || '');
  };

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    setEmptyRange(false);
    try {
      const startIdx = chapters.indexOf(startChapter);
      const endIdx = chapters.indexOf(endChapter);
      const rangeChapters = startIdx !== -1 && endIdx !== -1 && startIdx <= endIdx
        ? chapters.slice(startIdx, endIdx + 1)
        : [];
      const result = await startReviewCheckSession({ grade, startChapter, endChapter, rangeChapters });
      if (!result.sessionId) {
        // 후보 0개 — 자연스러운 빈 상태. 세션 자체가 생기지 않았으니 이 화면에 머문 채 안내만.
        setEmptyRange(true);
        setStarting(false);
        return;
      }
      onStarted();
    } catch (err: any) {
      setError(err?.message || '시작하지 못했어요. 잠시 후 다시 시도해 주세요.');
      setStarting(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <p className="rn-caption" style={{ margin: 0 }}>복습 완료한 문제 중 최대 5문제를 다시 풀어보고, 선생님 채점을 받아요.</p>
        <button type="button" className="rn-reviewcheck-history-link" onClick={onShowHistory} style={{ flex: 'none' }}>
          지난 기록 보기
          <AppIcon name="arrow" width={12} height={12} />
        </button>
      </div>

      {recentGraded && (
        <div className="rn-surface" style={{ padding: 16, marginBottom: 14 }}>
          <h3 className="rn-section" style={{ fontSize: 14, fontWeight: 750, marginBottom: 6 }}>복습체크 결과</h3>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--rn-text)' }}>{recentGraded.correctCount} / {recentGraded.totalCount}</div>
          <div style={{ fontSize: 12.5, color: 'var(--rn-success)', marginTop: 4 }}>완벽! {recentGraded.correctCount}문제</div>
          {recentGraded.totalCount - recentGraded.correctCount > 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--rn-muted)' }}>다시 복습 {recentGraded.totalCount - recentGraded.correctCount}문제</div>
          )}
        </div>
      )}

      <div className="rn-examprep-range-bar">
        <div className="rn-examprep-range-field">
          <label htmlFor="rc-grade">과목/교재</label>
          <select id="rc-grade" value={grade} onChange={e => handleGradeChange(e.target.value)}>
            {GRADE_LIST.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="rn-examprep-range-field">
          <label htmlFor="rc-start">시작</label>
          <select id="rc-start" value={startChapter} onChange={e => { setStartChapter(e.target.value); setEmptyRange(false); }}>
            {chapters.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="rn-examprep-range-field">
          <label htmlFor="rc-end">끝</label>
          <select id="rc-end" value={endChapter} onChange={e => { setEndChapter(e.target.value); setEmptyRange(false); }}>
            {chapters.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button type="button" className="rn-button rn-button-primary" onClick={handleStart} disabled={starting} style={{ flex: 'none' }}>
          {starting ? '준비 중...' : '복습체크 시작'}
        </button>
      </div>
      {emptyRange && <div className="rn-empty"><span>이 범위에는 아직 복습체크할 문제가 없어요.</span></div>}
      {error && <div className="rn-examprep-warning">⚠ {error}</div>}
    </div>
  );
}

function ReviewCheckQuiz({
  session, items, mistakeById, onSubmitted,
}: {
  session: ReviewCheckSession;
  items: ReviewCheckItem[];
  mistakeById: Map<string, MistakeEntry>;
  onSubmitted: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 확대 오버레이는 이 컴포넌트를 언마운트하지 않고 위에 겹쳐 그려지므로, 닫아도 answers는 그대로 남는다.
  const [zoomOpen, setZoomOpen] = useState(false);

  if (items.length === 0) {
    return (
      <div className="rn-empty">
        <span>이번 범위에는 아직 복습체크할 문제가 없어요.</span>
      </div>
    );
  }

  const current = items[index];
  const mistake = mistakeById.get(current.mistakeId);
  const isLast = index === items.length - 1;

  const handleNext = () => {
    if (isLast) return;
    setIndex(i => i + 1);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = items.map(it => ({ mistakeId: it.mistakeId, answer: (answers[it.mistakeId] || '').trim() }));
      await submitReviewCheckSession(session.id, payload);
      // 제출 자체는 이미 성공했으니, AI 채점이 실패하거나 느려도 이 결과를 기다리다 학생을 막지
      // 않는다(requestReviewCheckAiGrading은 절대 throw하지 않음) — 실패해도 곧바로 이어지는
      // onSubmitted()가 기존 "선생님이 채점하면..." 대기 화면으로 자연스럽게 폴백시켜 준다.
      setGrading(true);
      await requestReviewCheckAiGrading(session.id);
      onSubmitted();
    } catch (err: any) {
      setError(err?.message || '제출하지 못했어요. 잠시 후 다시 시도해 주세요.');
      setSubmitting(false);
      setGrading(false);
    }
  };

  return (
    <div className="rn-surface" style={{ padding: 16 }}>
      <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--rn-muted)', marginBottom: 12 }}>
        {index + 1} / {items.length}
      </div>
      {mistake && (
        <button type="button" className="rn-reviewcheck-zoomable-image" onClick={() => setZoomOpen(true)} aria-label="문제 이미지 확대해서 보기">
          <img src={mistake.imageUrl} alt={mistake.title} />
          <span className="rn-reviewcheck-zoom-hint">🔍 눌러서 확대</span>
        </button>
      )}
      <div className="rn-examprep-range-field" style={{ width: '100%' }}>
        <label htmlFor="rc-answer">내 답</label>
        <input
          id="rc-answer"
          type="text"
          value={answers[current.mistakeId] || ''}
          onChange={e => setAnswers(prev => ({ ...prev, [current.mistakeId]: e.target.value }))}
          style={{ minHeight: 44, padding: '8px 10px', borderRadius: 'var(--rn-radius-sm)', background: 'var(--rn-elevated)', border: '1px solid var(--rn-line)', color: 'var(--rn-text)', fontSize: 14, fontWeight: 600 }}
          placeholder="답을 입력해 주세요"
        />
      </div>
      <div style={{ marginTop: 16 }}>
        {isLast ? (
          <button type="button" className="rn-button rn-button-primary" onClick={handleSubmit} disabled={submitting} style={{ width: '100%' }}>
            {grading ? '채점 중...' : submitting ? '제출 중...' : '제출하기'}
          </button>
        ) : (
          <button type="button" className="rn-button rn-button-primary" onClick={handleNext} style={{ width: '100%' }}>다음</button>
        )}
      </div>
      {error && <div className="rn-examprep-warning" style={{ marginTop: 10 }}>⚠ {error}</div>}
      {zoomOpen && mistake && (
        <ReviewCheckImageZoom src={mistake.imageUrl} alt={mistake.title} onClose={() => setZoomOpen(false)} />
      )}
    </div>
  );
}

// 학생 본인의 복습체크 기록 목록 — 관리자 오버레이의 history-row와 같은 카드 스타일을 재사용하되,
// in_progress(아직 풀이 중) 세션은 "완료된 기록"이 아니므로 이 목록에서 제외한다. submitted인데
// 아직 관리자 확인이 안 끝난 세션은 correctCount/totalCount가 아직 최종값이 아닐 수 있어 구체적인
// 숫자 대신 "선생님 확인 중"으로만 안내한다(에러처럼 보이지 않게).
function ReviewCheckStudentHistoryList({
  studentId, onBack, onSelect,
}: {
  studentId: string;
  onBack: () => void;
  onSelect: (session: ReviewCheckSession) => void;
}) {
  const [sessions, setSessions] = useState<ReviewCheckSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStudentReviewCheckSessions(studentId)
      .then(rows => { if (!cancelled) setSessions(rows); })
      .catch((err: any) => { if (!cancelled) setError(err?.message || '불러오는 중 문제가 발생했어요.'); });
    return () => { cancelled = true; };
  }, [studentId]);

  const records = useMemo(() => (sessions || []).filter(s => s.status !== 'in_progress'), [sessions]);

  return (
    <div>
      <div className="rn-reviewcheck-sticky-header is-on-page-bg">
        <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={onBack}>
          <AppIcon name="arrow" width={14} height={14} style={{ transform: 'rotate(180deg)' }} />
          돌아가기
        </button>
        <h3 className="rn-section" style={{ fontSize: 14, fontWeight: 750, margin: 0 }}>지난 기록</h3>
        <span style={{ width: 60 }} />
      </div>
      {error && <div className="rn-examprep-warning">⚠ {error}</div>}
      {!error && sessions === null && <div className="rn-empty"><span>불러오는 중...</span></div>}
      {!error && sessions !== null && records.length === 0 && (
        <div className="rn-empty"><span>아직 복습체크 기록이 없어요.</span></div>
      )}
      {!error && records.length > 0 && (
        <div className="rn-reviewcheck-history-list">
          {records.map(s => (
            <button type="button" key={s.id} className="rn-reviewcheck-history-row" onClick={() => onSelect(s)}>
              <span className="date">{formatDateLabel(s.createdAt)}</span>
              {s.status === 'graded' ? (
                <span className="result">{s.correctCount} / {s.totalCount}문제 정답</span>
              ) : (
                <span className="pending">선생님 확인 중 · {s.totalCount}문제</span>
              )}
              <AppIcon name="arrow" width={14} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 학생 본인의 복습체크 기록 상세 — 관리자용 채점 화면과 같은 정보(문제 이미지/정답/학생답/AI 풀이)를
// 보여주되, O/X를 매기거나 고칠 수 있는 어떤 컨트롤도 없다(읽기 전용). 최종 결과는 반드시
// item.grade를 그대로 렌더한다 — admin이 override했다면 aiVerdict가 아니라 이 필드에만 진짜 최종
// 판정이 반영돼 있다.
function ReviewCheckStudentHistoryDetail({
  session, mistakeById, onBack,
}: {
  session: ReviewCheckSession;
  mistakeById: Map<string, MistakeEntry>;
  onBack: () => void;
}) {
  const [items, setItems] = useState<ReviewCheckItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [zoomImage, setZoomImage] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchReviewCheckItems(session.id)
      .then(rows => { if (!cancelled) setItems(rows); })
      .catch((err: any) => { if (!cancelled) setError(err?.message || '불러오는 중 문제가 발생했어요.'); });
    return () => { cancelled = true; };
  }, [session.id]);

  const header = (
    <div className="rn-reviewcheck-sticky-header">
      <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={onBack}>
        <AppIcon name="arrow" width={14} height={14} style={{ transform: 'rotate(180deg)' }} />
        목록
      </button>
      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--rn-muted)' }}>{formatDateLabel(session.createdAt)}</span>
    </div>
  );

  if (error) {
    return <div className="rn-surface" style={{ padding: 16 }}>{header}<div className="rn-empty"><span>{error}</span></div></div>;
  }
  if (!items) {
    return <div className="rn-surface" style={{ padding: 16 }}>{header}<div className="rn-empty"><span>불러오는 중...</span></div></div>;
  }
  if (items.length === 0) {
    return <div className="rn-surface" style={{ padding: 16 }}>{header}<div className="rn-empty"><span>이 기록에는 문제가 없어요.</span></div></div>;
  }

  const current = items[index];
  const mistake = mistakeById.get(current.mistakeId);
  const resultLabel = current.grade === 'correct' ? 'O 정답' : current.grade === 'incorrect' ? 'X 오답' : '확인 중';
  const resultClass = current.grade === 'correct' ? 'is-correct' : current.grade === 'incorrect' ? 'is-incorrect' : 'is-pending';

  return (
    <div className="rn-surface" style={{ padding: 16 }}>
      {header}
      <div style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--rn-muted)', marginBottom: 10 }}>
        {index + 1} / {items.length}
      </div>

      {mistake && (
        <button
          type="button"
          className="rn-reviewcheck-zoomable-image"
          onClick={() => setZoomImage({ src: mistake.imageUrl, alt: mistake.title })}
          aria-label="문제 이미지 확대해서 보기"
        >
          <img src={mistake.imageUrl} alt={mistake.title} />
          <span className="rn-reviewcheck-zoom-hint">🔍 눌러서 확대</span>
        </button>
      )}
      {mistake?.title && <h3 style={{ fontSize: 14, fontWeight: 750, margin: '0 0 10px' }}>{mistake.title}</h3>}

      <div className="rn-reviewcheck-answer-block">
        <div className="label">내가 쓴 답</div>
        <div className="value">{current.submittedAnswer?.trim() || '(빈 답안)'}</div>
      </div>
      <div className="rn-reviewcheck-answer-block">
        <div className="label">저장된 정답</div>
        <div className="value">{mistake?.analysis?.finalAnswer?.trim() || '저장된 정답 없음'}</div>
      </div>

      <div className={`rn-reviewcheck-result-badge ${resultClass}`}>
        {resultLabel}
        {current.grade === null && <span className="rn-reviewcheck-result-sub">선생님이 확인하고 있어요, 조금만 기다려 주세요</span>}
      </div>

      {mistake?.analysis?.solvingProcess && (
        <details className="rn-reviewcheck-collapse">
          <summary>AI 풀이 다시 보기</summary>
          <LaTeXRenderer text={mistake.analysis.solvingProcess} className="rn-reviewcheck-solving" />
        </details>
      )}

      {mistake?.userActionPlan && (
        <div className="rn-reviewcheck-answer-block">
          <div className="label">나의 학습 대책</div>
          <div className="value">{mistake.userActionPlan}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          type="button"
          className="rn-button rn-button-ghost"
          style={{ flex: 1 }}
          disabled={index === 0}
          onClick={() => setIndex(i => i - 1)}
        >‹ 이전 문제</button>
        <button
          type="button"
          className="rn-button rn-button-ghost"
          style={{ flex: 1 }}
          disabled={index === items.length - 1}
          onClick={() => setIndex(i => i + 1)}
        >다음 문제 ›</button>
      </div>

      {zoomImage && (
        <ReviewCheckImageZoom src={zoomImage.src} alt={zoomImage.alt} onClose={() => setZoomImage(null)} />
      )}
    </div>
  );
}
