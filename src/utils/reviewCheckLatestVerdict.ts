// 문제카드 "약함" 표시를 위한 순수 파생 로직 — reviewCheckClient.ts가 그대로 import해서 쓴다.
// supabase 클라이언트를 전혀 import하지 않는 순수 파일로 분리해서, Vite 없이도(node --test)
// 그대로 유닛 테스트할 수 있게 유지한다(tests/reviewCheck/reviewCheckGrading.test.ts와 동일한
// 이유의 동일한 분리 패턴).

export type LatestReviewCheckVerdict = 'correct' | 'incorrect';

export interface GradedItemForVerdict {
  mistakeId: string;
  grade: LatestReviewCheckVerdict;
}

// 세션 최신순으로 이미 정렬된 문항 배열을 받아, mistakeId별로 "가장 먼저(=가장 최근 세션에서)
// 나온 판정"만 남긴다. 같은 mistakeId가 더 오래된 세션에서 다시 나와도 이미 채워진 값을
// 덮어쓰지 않는다 — "최근 최종 판정이 이긴다"는 규칙을 그대로 구현한다.
export function reduceLatestVerdictByMistake(
  itemsInSessionRecencyOrder: GradedItemForVerdict[],
): Map<string, LatestReviewCheckVerdict> {
  const map = new Map<string, LatestReviewCheckVerdict>();
  for (const item of itemsInSessionRecencyOrder) {
    if (!map.has(item.mistakeId)) map.set(item.mistakeId, item.grade);
  }
  return map;
}
