import { useEffect, useState } from 'react';
import { fetchStudentReviewCheckSessions, type ReviewCheckSession } from '../../utils/reviewCheckClient';
import { AppIcon } from '../ui/AppIcon';

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
}

function rangeLabel(session: ReviewCheckSession): string {
  const range = session.startChapter === session.endChapter
    ? session.startChapter
    : `${session.startChapter} ~ ${session.endChapter}`;
  return [formatDateLabel(session.createdAt), session.grade, range].filter(Boolean).join(' · ');
}

// 복습체크 시작 화면 상단 — 최근 채점 결과 카드(누르면 그 기록 상세로) + "전체 기록 보기" 버튼.
// 결과가 없는 학생에게도 기록 화면으로 가는 버튼은 항상 남겨둔다. 기록 개수는 부가 정보라
// 못 불러와도 버튼은 그대로 동작한다.
export function ReviewCheckResultCard({
  studentId, recentGraded, onOpenRecent, onShowHistory,
}: {
  studentId: string;
  recentGraded: ReviewCheckSession | null;
  onOpenRecent: (session: ReviewCheckSession) => void;
  onShowHistory: () => void;
}) {
  const [recordCount, setRecordCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStudentReviewCheckSessions(studentId)
      .then(rows => { if (!cancelled) setRecordCount(rows.filter(s => s.status !== 'in_progress').length); })
      .catch(() => { if (!cancelled) setRecordCount(null); });
    return () => { cancelled = true; };
  }, [studentId]);

  const wrongCount = recentGraded ? Math.max(0, recentGraded.totalCount - recentGraded.correctCount) : 0;
  const allCorrect = !!recentGraded && recentGraded.totalCount > 0 && wrongCount === 0;

  return (
    <div className="rn-reviewcheck-result-block">
      {recentGraded && (
        <button
          type="button"
          className="rn-surface rn-reviewcheck-result-card"
          onClick={() => onOpenRecent(recentGraded)}
        >
          <span className="rn-reviewcheck-result-card-head">
            <span className="rn-section" style={{ fontSize: 14, fontWeight: 750 }}>복습체크 결과</span>
            <span className="rn-reviewcheck-result-card-more">
              자세히 보기
              <AppIcon name="arrow" width={12} height={12} />
            </span>
          </span>
          <span className="rn-reviewcheck-result-card-meta">{rangeLabel(recentGraded)}</span>
          <span className="rn-reviewcheck-result-card-score">{recentGraded.correctCount} / {recentGraded.totalCount}</span>
          {allCorrect ? (
            <span className="rn-reviewcheck-result-card-summary is-perfect">완벽해요! {recentGraded.totalCount}문제 모두 맞혔어요</span>
          ) : (
            <span className="rn-reviewcheck-result-card-summary">맞힌 문제 {recentGraded.correctCount}개 · 다시 볼 문제 {wrongCount}개</span>
          )}
        </button>
      )}
      <button type="button" className="rn-button rn-button-secondary rn-reviewcheck-history-button" onClick={onShowHistory}>
        {recordCount ? `전체 기록 보기 (${recordCount}회)` : '전체 기록 보기'}
        <AppIcon name="arrow" width={14} height={14} />
      </button>
    </div>
  );
}
