import type { ExamResultItem } from '../contract';

export function singleRedoLabels(redo: ExamResultItem['singleRedo']) {
  const latest = redo?.latestSubmitted;
  const outcome = latest ? (latest.isCorrect ? '정답' : '오답') : '';
  const date = latest ? new Date(latest.submittedAt) : null;
  const dateLabel = date && Number.isFinite(date.getTime())
    ? date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return {
    button: redo?.inProgress ? '이어 풀기' : latest ? '한 번 더 다시 풀기' : '이 문제 다시 풀기',
    badge: latest ? `다시 풂 · ${outcome}${redo?.inProgress ? ' · 이어 풀기' : ''}` : redo?.inProgress ? '이어 풀기' : '',
    notice: [latest ? `다시 푼 풀이 있음 · ${outcome}${dateLabel ? ` · ${dateLabel}` : ''}` : '',
      redo?.inProgress ? '제출하지 않은 풀이가 있어요.' : ''].filter(Boolean).join(' · '),
  };
}
