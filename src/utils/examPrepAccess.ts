// 시험대비 분석 "학생 본인 열람"은 로그인한 모든 학생에게 열려 있다. studentId는 항상
// currentUserId로 고정되고, 실제 데이터 접근은 mistakes RLS가 통제한다. test 계정 상수는
// 관리자 학생 선택기에서 운영 학생 목록과 분리하는 데만 사용한다.
export const EXAM_PREP_TEST_USER_ID = '945dd787-7606-4244-9056-43ab32c21d93';
export function canViewOwnExamPrep(userId: string | undefined): boolean {
  return !!userId;
}
