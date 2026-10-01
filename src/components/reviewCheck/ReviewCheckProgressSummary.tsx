import { useEffect, useMemo, useState } from 'react';
import type { MistakeEntry } from '../../types';
import {
  fetchReviewCheckItems,
  fetchStudentReviewCheckSessions,
  type ReviewCheckItem,
  type ReviewCheckSession,
} from '../../utils/reviewCheckClient';
import '../../styles/reviewCheckProgress.css';

interface Props {
  studentId: string;
  mistakes: MistakeEntry[];
  // 틀린 문제 썸네일을 누르면 App.tsx가 소유한 기존 오답카드(MistakeDetailModal)를 연다.
  onOpenMistake?: (mistakeId: string) => void;
}

const TREND_SIZE = 5;

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
}

// 점수는 graded(최종 확정) 세션만으로 계산한다. submitted(선생님 확인 중)는 correctCount가
// 아직 최종값이 아닐 수 있어 "횟수"에만 넣고, in_progress는 아직 기록이 아니라 완전히 뺀다.
// sessions는 fetchStudentReviewCheckSessions 그대로(최신순)를 받는다.
function summarizeReviewCheckProgress(sessions: ReviewCheckSession[]) {
  const records = sessions.filter(s => s.status !== 'in_progress');
  const graded = records.filter(s => s.status === 'graded');
  const pendingCount = records.length - graded.length;
  const totalQuestions = graded.reduce((sum, s) => sum + s.totalCount, 0);
  const totalCorrect = graded.reduce((sum, s) => sum + s.correctCount, 0);
  const averagePercent = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null;
  const delta = graded.length >= 2 ? graded[0].correctCount - graded[1].correctCount : null;
  // 오래된 -> 최근(왼 -> 오) 순서로 뒤집는다.
  const trend = graded.slice(0, TREND_SIZE).reverse();
  return { recordCount: records.length, pendingCount, averagePercent, delta, trend, latestGraded: graded[0] ?? null };
}

function deltaLabel(delta: number): string {
  if (delta === 0) return '지난번과 같아요';
  return `지난번보다 ${delta > 0 ? '+' : ''}${delta}문제`;
}

// 복습체크 시작 화면의 "나의 복습 흐름" — 누적 통계 한 줄 + 최근 5회 정답률 막대 + 최근 채점
// 회차의 문항별 O/X. 보조 정보라서 로딩/에러 중에는 자리를 차지하지 않고 조용히 숨는다.
export function ReviewCheckProgressSummary({ studentId, mistakes, onOpenMistake }: Props) {
  const [sessions, setSessions] = useState<ReviewCheckSession[] | null>(null);
  const [items, setItems] = useState<ReviewCheckItem[] | null>(null);
  const mistakeById = useMemo(() => new Map(mistakes.map(m => [m.id, m])), [mistakes]);
  const summary = useMemo(() => (sessions ? summarizeReviewCheckProgress(sessions) : null), [sessions]);
  const latestGradedId = summary?.latestGraded?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    fetchStudentReviewCheckSessions(studentId)
      .then(rows => { if (!cancelled) setSessions(rows); })
      .catch(() => { /* 보조 정보 — 실패하면 그냥 숨긴다 */ });
    return () => { cancelled = true; };
  }, [studentId]);

  useEffect(() => {
    if (!latestGradedId) return;
    let cancelled = false;
    fetchReviewCheckItems(latestGradedId)
      .then(rows => { if (!cancelled) setItems(rows); })
      .catch(() => { /* 문항 요약만 숨기고 나머지는 그대로 */ });
    return () => { cancelled = true; };
  }, [latestGradedId]);

  if (!summary || summary.recordCount === 0) return null;

  const { recordCount, pendingCount, averagePercent, delta, trend } = summary;

  return (
    <section className="rn-surface rn-reviewcheck-progress" aria-label="나의 복습 흐름">
      <h3 className="rn-section" style={{ fontSize: 14, fontWeight: 750, margin: '0 0 6px' }}>나의 복습 흐름</h3>
      <p className="rn-reviewcheck-progress-stats">
        <span>지금까지 복습체크 <b>{recordCount}회</b></span>
        {averagePercent !== null && <span> · 평균 정답률 <b>{averagePercent}%</b></span>}
        {delta !== null && (
          <span className={delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : undefined}> · {deltaLabel(delta)}</span>
        )}
      </p>
      {pendingCount > 0 && (
        <p className="rn-caption" style={{ margin: '2px 0 0', fontSize: 11.5 }}>
          선생님 확인 중 {pendingCount}회는 점수에서 빠져 있어요.
        </p>
      )}

      {trend.length > 0 && (
        <ol className="rn-reviewcheck-trend" aria-label={`최근 ${trend.length}회 정답률`}>
          {trend.map(s => {
            const ratio = s.totalCount > 0 ? s.correctCount / s.totalCount : 0;
            const date = formatDateLabel(s.createdAt);
            return (
              <li key={s.id} className="rn-reviewcheck-trend-col" aria-label={`${date} ${s.totalCount}문제 중 ${s.correctCount}문제 정답`}>
                <span className="rn-reviewcheck-trend-value" aria-hidden="true">{s.correctCount}/{s.totalCount}</span>
                <span className="rn-reviewcheck-trend-track" aria-hidden="true">
                  <span className="rn-reviewcheck-trend-bar" style={{ height: `${Math.max(ratio * 100, 4)}%` }} />
                </span>
                <span className="rn-reviewcheck-trend-date" aria-hidden="true">{date}</span>
              </li>
            );
          })}
        </ol>
      )}

      {items && items.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="rn-caption" style={{ fontSize: 11.5, marginBottom: 6 }}>
            최근 결과 문제별{onOpenMistake && items.some(it => it.grade === 'incorrect') ? ' · 틀린 문제를 누르면 오답카드가 열려요' : ''}
          </div>
          <ul className="rn-reviewcheck-item-strip">
            {items.map((it, i) => {
              const mistake = mistakeById.get(it.mistakeId);
              // 최종 판정은 반드시 item.grade(관리자 override 반영) — aiVerdict는 보지 않는다.
              const mark = it.grade === 'correct' ? 'O' : it.grade === 'incorrect' ? 'X' : '?';
              const stateClass = it.grade === 'correct' ? 'is-correct' : it.grade === 'incorrect' ? 'is-incorrect' : 'is-pending';
              const resultText = it.grade === 'correct' ? '정답' : it.grade === 'incorrect' ? '오답' : '확인 중';
              const label = `${i + 1}번 ${mistake?.title ? `${mistake.title} ` : ''}${resultText}`;
              const content = (
                <>
                  {mistake?.imageUrl
                    ? <img src={mistake.imageUrl} alt="" loading="lazy" />
                    : <span className="rn-reviewcheck-item-noimg">{i + 1}</span>}
                  <span className={`rn-reviewcheck-item-mark ${stateClass}`} aria-hidden="true">{mark}</span>
                </>
              );
              const canOpen = it.grade === 'incorrect' && !!mistake && !!onOpenMistake;
              return (
                <li key={it.id}>
                  {canOpen ? (
                    <button
                      type="button"
                      className="rn-reviewcheck-item-thumb is-button"
                      aria-label={`${label} — 오답카드 열기`}
                      onClick={() => onOpenMistake!(it.mistakeId)}
                    >{content}</button>
                  ) : (
                    <span className="rn-reviewcheck-item-thumb" role="img" aria-label={label}>{content}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
