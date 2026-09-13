import type { MistakeEntry } from '../types';

// 복습체크 출제 후보 규칙 — 실제 강제(보안)는 DB의 start_review_check_session RPC가 한다(클라이언트가
// 후보를 조작할 수 없도록). 이 파일은 그 SQL 조건과 동일한 규칙을 순수 함수로 옮겨 테스트/문서화
// 용도로만 쓴다 — 화면에서 "몇 문제가 나올지" 미리 보여주는 용도로는 재사용 가능하지만, 실제 세션
// 생성은 항상 서버(RPC)에서 다시 계산한다.
export function isReviewCheckCandidate(
  mistake: MistakeEntry,
  params: { studentId: string; grade: string; rangeChapters: string[] },
): boolean {
  if (mistake.userId !== params.studentId) return false;
  if (mistake.isHidden) return false;
  if (mistake.grade !== params.grade) return false;
  if (!mistake.chapter || !params.rangeChapters.includes(mistake.chapter)) return false;
  if (mistake.reviewCheckMasteredAt) return false;
  // SQL 쪽(reviews->>0/1/2)과 동일하게 앞 3칸만 본다 — 배열 길이 자체를 요구하지 않는다.
  const reviews = mistake.reviews || [];
  if (reviews.length < 3) return false;
  return reviews.slice(0, 3).every(r => r === 'O');
}

export function filterReviewCheckCandidates(
  mistakes: MistakeEntry[],
  params: { studentId: string; grade: string; rangeChapters: string[] },
): MistakeEntry[] {
  return mistakes.filter(m => isReviewCheckCandidate(m, params));
}

// 후보에서 최대 maxCount개를 무작위로 뽑는다. 후보가 maxCount보다 적으면 있는 만큼만(억지로
// 채우지 않음) — 셔플은 Fisher-Yates.
export function pickRandomUpTo<T>(candidates: T[], maxCount: number): T[] {
  const pool = [...candidates];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, maxCount);
}
