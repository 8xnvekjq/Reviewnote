// 시험대비 분석 "학생 본인 열람"은 로그인한 모든 학생에게 열려 있다. studentId는 항상
// currentUserId로 고정되고, 실제 데이터 접근은 mistakes RLS가 통제한다.
export function canViewOwnExamPrep(userId: string | undefined): boolean {
  return !!userId;
}
