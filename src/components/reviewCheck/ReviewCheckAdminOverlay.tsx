import { useEffect, useState } from 'react';
import type { MistakeEntry } from '../../types';
import {
  fetchStudentReviewCheckSessions,
  fetchReviewCheckItems,
  gradeReviewCheckSession,
  updateReviewCheckItemGrade,
  type ReviewCheckSession,
  type ReviewCheckItem,
} from '../../utils/reviewCheckClient';
import { AppIcon } from '../ui/AppIcon';
import '../../styles/examPrep.css';
import '../../styles/reviewCheck.css';

interface Props {
  studentId: string;
  studentName: string;
  mistakes: MistakeEntry[];
  onClose: () => void;
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
}

// 관리자 전용 "복습체크" 전체화면 오버레이 — 학생 카드에서 [채점하기]/[내역]을 누르면 열린다.
// 안에서 목록 <-> 상세(채점/수정)를 전환한다(새 창/모달-위-모달 없음).
export function ReviewCheckAdminOverlay({ studentId, studentName, mistakes, onClose }: Props) {
  const [sessions, setSessions] = useState<ReviewCheckSession[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mistakeById = new Map(mistakes.map(m => [m.id, m]));

  const load = async () => {
    const rows = await fetchStudentReviewCheckSessions(studentId);
    setSessions(rows);
  };

  useEffect(() => { load(); }, [studentId]);

  const selected = selectedId ? sessions?.find(s => s.id === selectedId) || null : null;

  return (
    <div className="rn-reviewcheck-overlay" role="dialog" aria-modal="true">
      <div className="rn-reviewcheck-overlay-header">
        <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={selected ? () => setSelectedId(null) : onClose}>
          <AppIcon name="arrow" width={14} height={14} style={{ transform: 'rotate(180deg)' }} />
          {selected ? '복습체크 내역' : '닫기'}
        </button>
        <h2 className="rn-title" style={{ fontSize: 15 }}>{studentName} · 복습체크</h2>
        <span style={{ width: 60 }} />
      </div>
      <div className="rn-reviewcheck-overlay-body">
        {!sessions ? (
          <div className="rn-empty"><span>불러오는 중...</span></div>
        ) : selected ? (
          <ReviewCheckSessionDetail
            key={selected.id}
            session={selected}
            mistakeById={mistakeById}
            onChanged={load}
          />
        ) : (
          <ReviewCheckHistoryList sessions={sessions} onSelect={setSelectedId} />
        )}
      </div>
    </div>
  );
}

function ReviewCheckHistoryList({ sessions, onSelect }: { sessions: ReviewCheckSession[]; onSelect: (id: string) => void }) {
  if (sessions.length === 0) {
    return <div className="rn-empty"><span>아직 복습체크 기록이 없어요.</span></div>;
  }
  return (
    <div className="rn-reviewcheck-history-list">
      {sessions.map(s => (
        <button type="button" key={s.id} className="rn-reviewcheck-history-row" onClick={() => onSelect(s.id)}>
          <span className="date">{formatDateLabel(s.createdAt)}</span>
          {s.status === 'graded' ? (
            <span className="result">{s.correctCount}/{s.totalCount}</span>
          ) : s.status === 'submitted' ? (
            <span className="pending">채점 대기 · {s.totalCount}문제</span>
          ) : (
            <span className="pending">진행 중 · {s.totalCount}문제</span>
          )}
          <AppIcon name="arrow" width={14} />
        </button>
      ))}
    </div>
  );
}

function ReviewCheckSessionDetail({
  session, mistakeById, onChanged,
}: {
  session: ReviewCheckSession;
  mistakeById: Map<string, MistakeEntry>;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<ReviewCheckItem[] | null>(null);

  // session.status를 의존성에 넣는다 — 채점 완료 직후 session은 submitted->graded로 바뀌지만
  // session.id는 그대로라서, status만 보고도 다시 fetch해야 방금 매긴 grade가 반영된 items를
  // 받는다(안 넣으면 채점 직후 화면이 다시 열기 전까지 전부 미채점처럼 보이는 버그가 있었음).
  useEffect(() => {
    setItems(null);
    fetchReviewCheckItems(session.id).then(setItems);
  }, [session.id, session.status]);

  if (!items) {
    return <div className="rn-empty"><span>불러오는 중...</span></div>;
  }
  if (items.length === 0) {
    return <div className="rn-empty"><span>이 세션에는 출제된 문제가 없어요.</span></div>;
  }

  if (session.status === 'submitted') {
    return <ReviewCheckGrading session={session} items={items} mistakeById={mistakeById} onGraded={onChanged} />;
  }
  if (session.status === 'graded') {
    return <ReviewCheckGradedReview session={session} items={items} mistakeById={mistakeById} onEdited={onChanged} />;
  }
  return <div className="rn-empty"><span>학생이 아직 풀이 중이에요.</span></div>;
}

// 채점 UX 핵심: 문제 이미지 -> 기존 정답 -> 학생 답 -> 큰 O/X. 한 번 누르면 자동으로 다음
// 문제로 — 5문제를 연속으로 빠르게 채점할 수 있게.
function ReviewCheckGrading({
  session, items, mistakeById, onGraded,
}: {
  session: ReviewCheckSession;
  items: ReviewCheckItem[];
  mistakeById: Map<string, MistakeEntry>;
  onGraded: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [judgments, setJudgments] = useState<Record<string, 'correct' | 'incorrect'>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = items[index];
  const mistake = mistakeById.get(current.mistakeId);
  const allJudged = items.every(it => !!judgments[it.mistakeId]);

  const judge = (grade: 'correct' | 'incorrect') => {
    setJudgments(prev => ({ ...prev, [current.mistakeId]: grade }));
    if (index < items.length - 1) setIndex(index + 1);
  };

  const handleComplete = async () => {
    if (submitting || !allJudged) return;
    setSubmitting(true);
    setError(null);
    try {
      const grades = items.map(it => ({ mistakeId: it.mistakeId, grade: judgments[it.mistakeId] }));
      await gradeReviewCheckSession(session.id, grades);
      onGraded();
    } catch (err: any) {
      setError(err?.message || '채점을 완료하지 못했어요.');
      setSubmitting(false);
    }
  };

  return (
    <div className="rn-surface" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--rn-muted)' }}>{index + 1} / {items.length}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {items.map((it, i) => (
            <button
              type="button"
              key={it.id}
              onClick={() => setIndex(i)}
              aria-label={`${i + 1}번 문제로 이동`}
              style={{
                width: 8, height: 8, borderRadius: '50%', border: 'none', padding: 0,
                background: judgments[it.mistakeId] === 'correct' ? 'var(--rn-success)' : judgments[it.mistakeId] === 'incorrect' ? 'var(--rn-danger)' : 'var(--rn-line)',
              }}
            />
          ))}
        </div>
      </div>

      {mistake && <img src={mistake.imageUrl} alt={mistake.title} style={{ width: '100%', borderRadius: 12, marginBottom: 12, display: 'block' }} />}

      <div className="rn-reviewcheck-answer-block">
        <div className="label">문제카드 정답</div>
        <div className="value">{mistake?.analysis?.finalAnswer?.trim() || '저장된 정답 없음'}</div>
      </div>
      <div className="rn-reviewcheck-answer-block">
        <div className="label">학생 답</div>
        <div className="value">{current.submittedAnswer?.trim() || '(빈 답안)'}</div>
      </div>

      <div className="rn-reviewcheck-ox-row">
        <button type="button" className="rn-reviewcheck-ox-btn is-correct" onClick={() => judge('correct')}>O 정답</button>
        <button type="button" className="rn-reviewcheck-ox-btn is-incorrect" onClick={() => judge('incorrect')}>X 오답</button>
      </div>

      <button
        type="button"
        className="rn-button rn-button-primary"
        style={{ width: '100%', marginTop: 14 }}
        disabled={!allJudged || submitting}
        onClick={handleComplete}
      >
        {submitting ? '처리 중...' : '채점 완료'}
      </button>
      {error && <div className="rn-examprep-warning" style={{ marginTop: 10 }}>⚠ {error}</div>}
    </div>
  );
}

// 채점 완료 후 열람/정정 화면 — 문제사진 중심의 compact 리스트, 항목별로 O<->X 토글.
function ReviewCheckGradedReview({
  session, items, mistakeById, onEdited,
}: {
  session: ReviewCheckSession;
  items: ReviewCheckItem[];
  mistakeById: Map<string, MistakeEntry>;
  onEdited: () => void;
}) {
  const [localItems, setLocalItems] = useState(items);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleToggle = async (mistakeId: string, newGrade: 'correct' | 'incorrect') => {
    if (pendingId) return;
    setPendingId(mistakeId);
    try {
      await updateReviewCheckItemGrade(session.id, mistakeId, newGrade);
      setLocalItems(prev => prev.map(it => it.mistakeId === mistakeId ? { ...it, grade: newGrade } : it));
      onEdited();
    } catch (err) {
      console.error('Failed to update review check grade:', err);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="rn-reviewcheck-graded-list">
      {localItems.map((it, i) => {
        const mistake = mistakeById.get(it.mistakeId);
        return (
          <div key={it.id} className="rn-surface rn-reviewcheck-graded-row">
            <div className="rn-reviewcheck-graded-thumb">
              {mistake && <img src={mistake.imageUrl} alt={mistake.title} />}
            </div>
            <div className="rn-reviewcheck-graded-info">
              <div style={{ fontSize: 11, color: 'var(--rn-muted)', fontWeight: 700 }}>{i + 1}번</div>
              <div className="rn-reviewcheck-answer-block compact">
                <div className="label">정답</div>
                <div className="value">{mistake?.analysis?.finalAnswer?.trim() || '저장된 정답 없음'}</div>
              </div>
              <div className="rn-reviewcheck-answer-block compact">
                <div className="label">학생 답</div>
                <div className="value">{it.submittedAnswer?.trim() || '(빈 답안)'}</div>
              </div>
            </div>
            <div className="rn-reviewcheck-graded-ox">
              <button
                type="button"
                className={`rn-reviewcheck-ox-btn is-correct compact ${it.grade === 'correct' ? 'is-active' : ''}`}
                disabled={pendingId === it.mistakeId}
                onClick={() => handleToggle(it.mistakeId, 'correct')}
              >O</button>
              <button
                type="button"
                className={`rn-reviewcheck-ox-btn is-incorrect compact ${it.grade === 'incorrect' ? 'is-active' : ''}`}
                disabled={pendingId === it.mistakeId}
                onClick={() => handleToggle(it.mistakeId, 'incorrect')}
              >X</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
