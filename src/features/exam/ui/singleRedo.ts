// 관리자 본인 원래 응시 결과에서 문항별 '다시 풀기' 상태를 보여 줄 문구.
// 서버는 관리자 본인의 일반 응시 결과에만 singleRedo를 붙인다(학생 응답에는 없다).
import type { ExamResultItem } from '../contract';

export type SingleRedoSummary = ExamResultItem['singleRedo'];

export function formatRedoDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function singleRedoLabels(redo: SingleRedoSummary) {
  const latest = redo?.latestSubmitted ?? null;
  const inProgress = redo?.inProgress === true;
  const outcome = latest ? (latest.isCorrect ? '정답' : '오답') : '';
  const date = latest ? formatRedoDate(latest.submittedAt) : '';
  return {
    /** 확대 화면 상단 바 버튼. */
    button: inProgress ? '이어 풀기' : latest ? '한 번 더 다시 풀기' : '이 문제 다시 풀기',
    /** 문항 목록 칸의 작은 표시. 다시 푼 적도, 푸는 중도 아니면 빈 문자열. */
    badge: latest ? `다시 풂 · ${outcome}` : inProgress ? '다시 푸는 중' : '',
    /** 표시 색: 최근 다시 풀기의 정답/오답, 진행 중만 있으면 pending. */
    tone: latest ? (latest.isCorrect ? 'correct' : 'wrong') : inProgress ? 'pending' : null,
    /** 확대 화면 안내. */
    notice: [latest ? `다시 푼 풀이 있음 · ${outcome}${date ? ` · ${date}` : ''}` : '',
      inProgress ? '제출하지 않은 다시 풀기가 있어요' : ''].filter(Boolean).join(' · '),
  } as const;
}
