import { useEffect, useState } from 'react';
import type { MistakeEntry } from '../../types';
import '../../styles/reviewCheckSubmitResult.css';
import { fetchReviewCheckItems, type ReviewCheckItem, type ReviewCheckSession } from '../../utils/reviewCheckClient';

interface Props {
  session: ReviewCheckSession;
  mistakeById: Map<string, MistakeEntry>;
  // true = 방금 제출한 직후(하단 버튼 노출), false = 앱을 다시 열었는데 아직 선생님 확인이 남은 상태.
  justSubmitted: boolean;
  onOpenItem: (index: number) => void;
  onDone: () => void;
}

// 틀린 문제 수에 맞춘 한 줄 격려 — 전부 채점이 끝났을 때만 쓴다(일부만 채점됐을 땐 아직 최종이 아님).
function encouragementFor(wrong: number, total: number): string {
  if (wrong === 0) return '전부 맞혔어요! 복습한 보람이 있네요 🎉';
  if (wrong === 1) return '딱 한 문제만 다시 보면 돼요. 거의 다 왔어요!';
  if (wrong < total) return `틀린 ${wrong}문제만 다시 복습하면 금방 잡을 수 있어요.`;
  return '괜찮아요, 다시 복습하면서 하나씩 잡아봐요.';
}

// 학생용 "제출 직후 결과" — 점수/격려 + 문항별 O/X 목록. 최종 판정은 반드시 item.grade만 본다
// (admin override가 반영되는 유일한 필드). grade가 null인 문항은 manual_review로 선생님 확인을
// 기다리는 정상 상태라 에러가 아니라 차분한 "확인 중"으로만 보여준다.
export function ReviewCheckSubmitResult({ session, mistakeById, justSubmitted, onOpenItem, onDone }: Props) {
  const [items, setItems] = useState<ReviewCheckItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchReviewCheckItems(session.id)
      .then(rows => { if (!cancelled) setItems(rows); })
      .catch((err: any) => { if (!cancelled) setError(err?.message || '결과를 불러오지 못했어요.'); });
    return () => { cancelled = true; };
  }, [session.id, reloadKey]);

  if (error) {
    return (
      <div className="rn-empty">
        <span>{error}</span>
        <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={() => setReloadKey(k => k + 1)} style={{ marginTop: 8 }}>다시 시도</button>
      </div>
    );
  }
  if (!items) {
    return <div className="rn-empty"><span>결과 불러오는 중...</span></div>;
  }

  const total = items.length;
  const gradedCount = items.filter(it => it.grade !== null).length;
  const correctCount = items.filter(it => it.grade === 'correct').length;
  const pendingCount = total - gradedCount;
  const allGraded = total > 0 && pendingCount === 0;

  return (
    <div>
      <div className="rn-surface rn-rcresult-summary">
        <h3 className="rn-section rn-rcresult-title">{allGraded ? '이번 복습체크 결과' : '복습체크 제출 완료'}</h3>
        {allGraded ? (
          <>
            <div className="rn-rcresult-score">
              {correctCount} <span>/ {total}</span>
            </div>
            <div className="rn-rcresult-score-caption">문제 정답</div>
            <p className="rn-rcresult-cheer">{encouragementFor(total - correctCount, total)}</p>
          </>
        ) : (
          <>
            <div className="rn-rcresult-progress">
              <span className="done">AI 채점 완료 {gradedCount}문제</span>
              <span className="dot">·</span>
              <span className="pending">선생님 확인 중 {pendingCount}문제</span>
            </div>
            <p className="rn-caption" style={{ margin: '6px 0 0' }}>선생님이 확인하면 나머지 결과도 여기서 볼 수 있어요.</p>
          </>
        )}
      </div>

      <div className="rn-rcresult-list">
        {items.map((it, i) => {
          const mistake = mistakeById.get(it.mistakeId);
          const badge = it.grade === 'correct'
            ? { cls: 'is-correct', text: 'O' }
            : it.grade === 'incorrect'
              ? { cls: 'is-incorrect', text: 'X' }
              : { cls: 'is-pending', text: '확인 중' };
          return (
            <button
              type="button"
              key={it.id}
              className="rn-rcresult-row"
              onClick={() => onOpenItem(i)}
              aria-label={`${i + 1}번 문제 자세히 보기`}
            >
              <span className="rn-rcresult-thumb">
                {mistake?.imageUrl && <img src={mistake.imageUrl} alt="" />}
              </span>
              <span className="rn-rcresult-info">
                <span className="name">{i + 1}. {mistake?.title || '문제'}</span>
                <span className="line"><em>내 답</em>{it.submittedAnswer?.trim() || '(빈 답안)'}</span>
                <span className="line"><em>정답</em>{mistake?.analysis?.finalAnswer?.trim() || '저장된 정답 없음'}</span>
              </span>
              <span className={`rn-rcresult-badge ${badge.cls}`}>{badge.text}</span>
            </button>
          );
        })}
      </div>

      {justSubmitted && (
        <button type="button" className="rn-button rn-button-primary rn-rcresult-done" onClick={onDone}>
          {allGraded ? '새 복습체크 시작' : '확인'}
        </button>
      )}
    </div>
  );
}
