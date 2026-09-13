import { useEffect, useState } from 'react';
import { fetchTeacherComment, saveTeacherComment, type ExamPrepTeacherComment } from '../../utils/examPrepTeacherComment';
import { daysSince } from '../../utils/examPrepCommentFormat';

interface Props {
  studentId: string;
}

// 관리자용 편집 카드. report(분석 결과)와 완전히 분리된 상태 — "분석하기"를 다시 눌러도
// report만 재계산될 뿐 이 코멘트는 studentId가 바뀌지 않는 한 다시 불러오지 않으므로 사라지지
// 않는다. 저장은 upsert라 시험범위와 무관하게 학생당 하나만 유지된다.
export function TeacherCommentEditor({ studentId }: Props) {
  const [comment, setComment] = useState<ExamPrepTeacherComment | null>(null);
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);
  // 불러오기 실패를 "코멘트 없음"과 절대 같은 상태로 섞지 않는다 — 섞으면 기존 코멘트를 못 불러온
  // 채로 빈 textarea가 편집 가능해져서, 저장을 누르면 실제로 있던 코멘트를 빈 내용으로 덮어쓸
  // 위험이 있다(Codex 리뷰에서 지적됨). 불러오기가 실패하면 다시 불러오기 전까지 저장 자체를 막는다.
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const load = () => {
    let cancelled = false;
    setLoaded(false);
    setLoadError(false);
    setStatus('idle');
    fetchTeacherComment(studentId).then(result => {
      if (cancelled) return;
      if (!result.ok) { setLoadError(true); setLoaded(true); return; }
      setComment(result.comment);
      setDraft(result.comment?.content || '');
      setLoaded(true);
    });
    return () => { cancelled = true; };
  };

  useEffect(load, [studentId]);

  const handleSave = async () => {
    if (saving || loadError) return; // 중복 제출 방지 + 원본을 못 불러온 상태에서는 저장 금지
    setSaving(true);
    setStatus('idle');
    const result = await saveTeacherComment(studentId, draft);
    if (result.ok) { setComment(result.comment); setStatus('saved'); }
    else setStatus('error');
    setSaving(false);
  };

  return (
    <div className="rn-surface rn-examprep-comment-card" style={{ padding: 16, marginBottom: 14 }}>
      <div className="rn-examprep-comment-head">
        <h3 className="rn-section" style={{ fontSize: 14, fontWeight: 750 }}>선생님 코멘트</h3>
        {comment && !loadError && <span className="rn-examprep-comment-badge">D+{daysSince(comment.updatedAt)}</span>}
      </div>
      {loadError ? (
        <div className="rn-examprep-comment-status error" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>기존 코멘트를 불러오지 못했어요. 내용을 확인하지 못한 채로 저장하면 기존 코멘트가 사라질 수 있어 저장을 막았어요.</span>
          <button type="button" className="rn-button rn-button-secondary rn-button-compact" onClick={load}>다시 불러오기</button>
        </div>
      ) : (
        <>
          <p className="rn-caption" style={{ marginBottom: 8 }}>이 학생에게만 보이는 코멘트예요. 시험범위를 바꿔도 하나만 유지돼요.</p>
          <textarea
            className="rn-examprep-comment-textarea"
            rows={4}
            value={draft}
            disabled={!loaded || saving}
            onChange={e => { setDraft(e.target.value); setStatus('idle'); }}
            placeholder="예: 원의 방정식은 조건을 식으로 바꾸는 연습을 조금 더 해보자. 중심과 반지름을 먼저 적고 시작해보자."
          />
          <div className="rn-examprep-comment-actions">
            <button type="button" className="rn-button rn-button-primary rn-button-compact" onClick={handleSave} disabled={!loaded || saving}>
              {saving ? '저장 중…' : '저장'}
            </button>
            {status === 'saved' && <span className="rn-examprep-comment-status ok">저장됐어요.</span>}
            {status === 'error' && <span className="rn-examprep-comment-status error">저장하지 못했어요. 다시 시도해 주세요.</span>}
          </div>
        </>
      )}
    </div>
  );
}
