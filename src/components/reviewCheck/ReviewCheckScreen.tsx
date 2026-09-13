import { useEffect, useMemo, useState } from 'react';
import type { MistakeEntry } from '../../types';
import { MATH_CURRICULUM, GRADE_LIST } from '../../types';
import '../../styles/examPrep.css';
import '../../styles/reviewCheck.css';
import {
  fetchLatestReviewCheckSession,
  fetchReviewCheckItems,
  startReviewCheckSession,
  submitReviewCheckSession,
  type ReviewCheckSession,
  type ReviewCheckItem,
} from '../../utils/reviewCheckClient';

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
  | { kind: 'error'; message: string };

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
  return (
    <ReviewCheckStart
      schoolGrade={schoolGrade}
      recentGraded={view.recentGraded}
      onStarted={load}
    />
  );
}

function ReviewCheckStart({
  schoolGrade, recentGraded, onStarted,
}: {
  schoolGrade?: string;
  recentGraded: ReviewCheckSession | null;
  onStarted: () => void;
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
      <p className="rn-caption" style={{ marginBottom: 14 }}>복습 완료한 문제 중 최대 5문제를 다시 풀어보고, 선생님 채점을 받아요.</p>

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
  const [error, setError] = useState<string | null>(null);

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
      onSubmitted();
    } catch (err: any) {
      setError(err?.message || '제출하지 못했어요. 잠시 후 다시 시도해 주세요.');
      setSubmitting(false);
    }
  };

  return (
    <div className="rn-surface" style={{ padding: 16 }}>
      <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--rn-muted)', marginBottom: 12 }}>
        {index + 1} / {items.length}
      </div>
      {mistake && (
        <img src={mistake.imageUrl} alt={mistake.title} style={{ width: '100%', borderRadius: 12, marginBottom: 14, display: 'block' }} />
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
            {submitting ? '제출 중...' : '제출하기'}
          </button>
        ) : (
          <button type="button" className="rn-button rn-button-primary" onClick={handleNext} style={{ width: '100%' }}>다음</button>
        )}
      </div>
      {error && <div className="rn-examprep-warning" style={{ marginTop: 10 }}>⚠ {error}</div>}
    </div>
  );
}
