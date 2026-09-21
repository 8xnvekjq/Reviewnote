import { useEffect, useState } from 'react';
import type { MistakeEntry } from '../../types';
import { supabase } from '../../services/supabase';
import { mapDbMistakeRow } from '../../features/mistakes/useMistakes';
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
  onClose: () => void;
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
}

function reviewStateLabel(state: string): string {
  if (state === 'O') return 'O';
  if (state === 'X') return 'X';
  if (state === 'star') return '★';
  return '-';
}

// AI 자동채점 결과를 정답/학생답 블록 옆에 한 줄로 보여준다 — admin이 이 문항을 다시 판단할
// 필요가 있는지(ai_verdict가 없거나 manual_review) 한눈에 구분되도록 색을 다르게 준다.
function ReviewCheckAiHint({ item }: { item: ReviewCheckItem }) {
  if (!item.aiVerdict) return null;
  if (item.aiVerdict === 'manual_review') {
    return (
      <div className="rn-reviewcheck-ai-hint is-manual">
        AI: 확인 필요{item.aiReason ? ` · ${item.aiReason}` : ''}
      </div>
    );
  }
  const label = item.aiVerdict === 'correct' ? '정답' : '오답';
  const confidencePct = item.aiConfidence != null ? Math.round(item.aiConfidence * 100) : null;
  return (
    <div className="rn-reviewcheck-ai-hint is-confident">
      AI: {label}{confidencePct != null ? ` (신뢰도 ${confidencePct}%)` : ''}
    </div>
  );
}

// 관리자 전용 "복습체크" 전체화면 오버레이 — 전체메뉴 "복습체크" 화면의 학생 목록에서 학생을
// 선택하면 열린다. 안에서 목록 <-> 상세(채점/수정) <-> 문제별 상세를 전환한다(새 창 없음).
//
// mistakes는 더 이상 상위(호출부)에서 prop으로 받지 않는다 — 이 오버레이가 열릴 때마다 해당
// 학생의 mistakes만 직접 scoped query로 가져온다. 예전에는 AdminPanel이 이미 로드해 둔 "전체
// 학생 mistakes"를 그대로 넘겨줬지만, 그 책임을 여기로 옮기면서(어드민 패널에는 더 이상 복습체크
// 관련 상태가 없음) 오버레이가 스스로 필요한 데이터를 책임지는 편이 더 자연스럽다.
export function ReviewCheckAdminOverlay({ studentId, studentName, onClose }: Props) {
  const [sessions, setSessions] = useState<ReviewCheckSession[] | null>(null);
  const [mistakeById, setMistakeById] = useState<Map<string, MistakeEntry> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    const rows = await fetchStudentReviewCheckSessions(studentId);
    setSessions(rows);
  };

  useEffect(() => {
    load();
    supabase
      .from('mistakes')
      .select('*')
      .eq('user_id', studentId)
      .then(({ data, error }) => {
        if (error) { console.error('Failed to load student mistakes:', error); return; }
        setMistakeById(new Map((data || []).map(mapDbMistakeRow).map(m => [m.id, m])));
      });
  }, [studentId]);

  const selected = selectedId ? sessions?.find(s => s.id === selectedId) || null : null;
  const ready = sessions && mistakeById;

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
        {!ready ? (
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
  // AI가 이미 자신 있게 채점한 문항(item.grade가 채워져 있음 — manual_review는 grade가 계속
  // null이라 여기 해당 안 됨)은 admin이 다시 고를 필요가 없으니, 그 문항으로 매번 다시 눈길이
  // 가지 않도록 아직 결정 안 된 첫 문항부터 바로 보여준다("확인 필요만 모아서 빠르게").
  const [index, setIndex] = useState(() => {
    const firstUndecided = items.findIndex(it => it.grade !== 'correct' && it.grade !== 'incorrect');
    return firstUndecided === -1 ? 0 : firstUndecided;
  });
  // AI가 이미 confident하게 매긴 grade는 admin이 다시 판단할 필요가 없도록 미리 채워 둔다 —
  // 그래도 judge()는 그대로 동작해서 admin이 클릭 한 번으로 언제든 뒤집을 수 있다(AI 판정이
  // 최종은 아니고 admin의 판단이 항상 우선한다).
  const [judgments, setJudgments] = useState<Record<string, 'correct' | 'incorrect'>>(() => {
    const initial: Record<string, 'correct' | 'incorrect'> = {};
    for (const it of items) {
      if (it.grade === 'correct' || it.grade === 'incorrect') initial[it.mistakeId] = it.grade;
    }
    return initial;
  });
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
      <ReviewCheckAiHint item={current} />

      <div className="rn-reviewcheck-ox-row">
        <button
          type="button"
          className={`rn-reviewcheck-ox-btn is-correct ${judgments[current.mistakeId] === 'correct' ? 'is-active' : ''}`}
          onClick={() => judge('correct')}
        >O 정답</button>
        <button
          type="button"
          className={`rn-reviewcheck-ox-btn is-incorrect ${judgments[current.mistakeId] === 'incorrect' ? 'is-active' : ''}`}
          onClick={() => judge('incorrect')}
        >X 오답</button>
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

// 채점 완료 후 열람/정정 화면 — 기본은 문제사진 중심의 compact 리스트, 항목을 누르면 문제별
// 전체 상세(큰 이미지 + 기존 채점 정보 + Prev/Next)로 들어간다. 리스트의 O/X 토글은 그대로 둬서
// 목록에서 바로 빠르게 정정도 가능하게 유지한다.
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
  const [detailIndex, setDetailIndex] = useState<number | null>(null);

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

  if (detailIndex !== null) {
    return (
      <ReviewCheckGradedDetail
        items={localItems}
        index={detailIndex}
        mistakeById={mistakeById}
        pendingId={pendingId}
        onNavigate={setDetailIndex}
        onToggle={handleToggle}
        onBack={() => setDetailIndex(null)}
      />
    );
  }

  return (
    <div className="rn-reviewcheck-graded-list">
      {localItems.map((it, i) => {
        const mistake = mistakeById.get(it.mistakeId);
        return (
          <div key={it.id} className="rn-surface rn-reviewcheck-graded-row">
            <button
              type="button"
              className="rn-reviewcheck-graded-open"
              onClick={() => setDetailIndex(i)}
              aria-label={`${i + 1}번 문제 상세 열기`}
            >
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
                {it.gradedSource && (
                  <div className="rn-reviewcheck-ai-hint is-source">
                    {it.gradedSource === 'ai' ? 'AI 자동채점' : '선생님 채점'}{it.gradedSource === 'ai' && it.aiReason ? ` · ${it.aiReason}` : ''}
                  </div>
                )}
              </div>
            </button>
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

// 채점 완료된 세션의 문제 하나를 크게 다시 열어보는 상세 화면(요청사항 #3). 문제 내용(큰 이미지),
// 학생 답안, 정답/채점 결과, 그 문제의 기존 채점 정보(O/X/★ 복습 이력)까지 한 화면에서 충분히
// 확인할 수 있게 하고, Prev/Next로 채점된 문제들을 이어서 훑어볼 수 있다.
function ReviewCheckGradedDetail({
  items, index, mistakeById, pendingId, onNavigate, onToggle, onBack,
}: {
  items: ReviewCheckItem[];
  index: number;
  mistakeById: Map<string, MistakeEntry>;
  pendingId: string | null;
  onNavigate: (index: number) => void;
  onToggle: (mistakeId: string, grade: 'correct' | 'incorrect') => void;
  onBack: () => void;
}) {
  const it = items[index];
  const mistake = mistakeById.get(it.mistakeId);

  return (
    <div className="rn-surface" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={onBack}>
          <AppIcon name="arrow" width={14} height={14} style={{ transform: 'rotate(180deg)' }} />
          목록
        </button>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--rn-muted)' }}>{index + 1} / {items.length}</span>
      </div>

      {mistake && <img src={mistake.imageUrl} alt={mistake.title} style={{ width: '100%', borderRadius: 12, marginBottom: 12, display: 'block' }} />}

      <div className="rn-reviewcheck-answer-block">
        <div className="label">문제카드 정답</div>
        <div className="value">{mistake?.analysis?.finalAnswer?.trim() || '저장된 정답 없음'}</div>
      </div>
      <div className="rn-reviewcheck-answer-block">
        <div className="label">학생 답</div>
        <div className="value">{it.submittedAnswer?.trim() || '(빈 답안)'}</div>
      </div>
      {it.gradedSource && (
        <div className="rn-reviewcheck-answer-block">
          <div className="label">채점 방식</div>
          <div className="value">{it.gradedSource === 'ai' ? 'AI 자동채점' : '선생님 직접채점'}</div>
          {it.gradedSource === 'ai' && it.aiReason && (
            <div className="rn-reviewcheck-ai-hint is-source" style={{ marginTop: 4 }}>{it.aiReason}</div>
          )}
        </div>
      )}
      {mistake && (
        <div className="rn-reviewcheck-answer-block">
          <div className="label">기존 채점 정보 (오답노트 복습 이력)</div>
          <div className="value" style={{ display: 'flex', gap: 10 }}>
            {(mistake.reviews || ['', '', '']).map((r, i) => (
              <span key={i} style={{ fontSize: 13 }}>{i + 1}차: {reviewStateLabel(r)}</span>
            ))}
          </div>
        </div>
      )}

      <div className="rn-reviewcheck-ox-row">
        <button
          type="button"
          className={`rn-reviewcheck-ox-btn is-correct ${it.grade === 'correct' ? 'is-active' : ''}`}
          disabled={pendingId === it.mistakeId}
          onClick={() => onToggle(it.mistakeId, 'correct')}
        >O 정답</button>
        <button
          type="button"
          className={`rn-reviewcheck-ox-btn is-incorrect ${it.grade === 'incorrect' ? 'is-active' : ''}`}
          disabled={pendingId === it.mistakeId}
          onClick={() => onToggle(it.mistakeId, 'incorrect')}
        >X 오답</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          type="button"
          className="rn-button rn-button-ghost"
          style={{ flex: 1 }}
          disabled={index === 0}
          onClick={() => onNavigate(index - 1)}
        >‹ 이전 문제</button>
        <button
          type="button"
          className="rn-button rn-button-ghost"
          style={{ flex: 1 }}
          disabled={index === items.length - 1}
          onClick={() => onNavigate(index + 1)}
        >다음 문제 ›</button>
      </div>
    </div>
  );
}
