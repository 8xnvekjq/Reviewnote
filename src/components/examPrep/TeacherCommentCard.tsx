import { useEffect, useState } from 'react';
import { fetchTeacherComment, type ExamPrepTeacherComment } from '../../utils/examPrepTeacherComment';
import { daysSince } from '../../utils/examPrepCommentFormat';

interface Props {
  studentId: string;
}

// 학생용 읽기 전용 카드. 시험범위를 무엇으로 바꿔 분석하든 항상 같은(가장 최근) 코멘트를
// 보여준다 — report 상태와 완전히 무관하게 studentId만으로 독립적으로 불러온다. 코멘트가
// 없어도 영역 자체는 항상 렌더링한다(빈 상태 문구만 다르게). 불러오기 실패는 "코멘트 없음"과
// 다른 문구로 명확히 구분한다 — 같은 문구를 쓰면 일시적인 네트워크 오류를 "선생님이 아직
// 코멘트를 안 남겼다"로 오해할 수 있다.
export function TeacherCommentCard({ studentId }: Props) {
  const [comment, setComment] = useState<ExamPrepTeacherComment | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setLoadError(false);
    fetchTeacherComment(studentId).then(result => {
      if (cancelled) return;
      if (!result.ok) { setLoadError(true); setLoaded(true); return; }
      setComment(result.comment);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [studentId]);

  const hasContent = !!comment?.content?.trim();

  return (
    <div className="rn-surface rn-examprep-comment-card" style={{ padding: 16, marginBottom: 14 }}>
      <div className="rn-examprep-comment-head">
        <h3 className="rn-section" style={{ fontSize: 14, fontWeight: 750 }}>선생님 코멘트</h3>
        {hasContent && comment && !loadError && <span className="rn-examprep-comment-badge">D+{daysSince(comment.updatedAt)}</span>}
      </div>
      {!loaded ? (
        <p className="rn-caption">불러오는 중…</p>
      ) : loadError ? (
        <p className="rn-caption">코멘트를 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>
      ) : hasContent && comment ? (
        <p className="rn-examprep-comment-text">{comment.content}</p>
      ) : (
        <p className="rn-caption">아직 선생님 코멘트가 없어요.</p>
      )}
    </div>
  );
}
