// 순수 포맷 함수만 모아둔 파일 — supabase 클라이언트를 import하지 않는다(examPrepTeacherComment.ts
// 쪽에 두면 그 파일의 최상단 supabase import 때문에 이 함수 하나만 쓰려 해도 전체 모듈이 평가돼
// Vite 환경변수(import.meta.env)가 없는 곳(Node 유닛테스트 등)에서 죽는다 — I/O와 순수 계산을
// 분리해 두면 이런 함수는 어디서든 안전하게 재사용/테스트할 수 있다).

// "D+13" 형식 — updated_at 기준 날짜가 바뀐 횟수. 시각이 아니라 달력 날짜 차이로 세어(로컬
// 브라우저 자정 기준) 사용자가 보는 "오늘"과 어긋나지 않게 한다.
export function daysSince(updatedAtIso: string): number {
  const updated = new Date(updatedAtIso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffMs = startOfDay(now) - startOfDay(updated);
  return Math.max(0, Math.round(diffMs / 86400000));
}
