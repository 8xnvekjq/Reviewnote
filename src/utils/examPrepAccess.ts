// 시험대비 분석 "학생 본인 열람" — 로그인한 모든 학생에게 열려 있다. 특정 학년/이름/user_id를
// 하드코딩한 allowlist는 두지 않는다: 로그인 여부만 확인하고, studentId는 항상 호출자 자신의
// currentUserId로 고정해서 넘긴다(다른 학생을 선택하는 UI 자체가 없음). 실제 데이터 접근 통제는
// mistakes 테이블의 기존 RLS(본인 소유 행만 SELECT)가 담당하므로, 이 함수는 순수하게 "이 화면을
// 보여줄지" UI 게이트일 뿐이다.
export function canViewOwnExamPrep(userId: string | undefined): boolean {
  return !!userId;
}
