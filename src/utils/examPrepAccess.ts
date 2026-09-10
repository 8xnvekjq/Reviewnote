// 시험대비 분석 "학생 본인 열람" 1차 대상 목록 — 관리자 전체 열람과 별개로, 학생 본인 계정에서
// 자기 리포트를 볼 수 있는 대상을 우선 제한한다. 새 DB 컬럼/스키마 없이 프론트엔드 allowlist로
// 관리(소규모 초기 오픈용) — 대상을 늘릴 때는 이 배열에 user_id만 추가하면 된다.
export const EXAM_PREP_SELF_ACCESS_IDS: ReadonlySet<string> = new Set([
  '7f91f87f-17a0-4d6f-8715-263663d00dc0', // 안은채
  '7958d4e7-1567-4711-a4dd-7f0ba88f077e', // 김태형
  '6dddcb5d-fb7b-4e41-b69e-6cc6770d280f', // 박예진
  '9705e0ac-d552-403e-98e2-604d4f46a992', // 이하영 (닉네임: 허둥지둥지냉면)
  '1766ac87-593d-40c3-9cf7-4530a876826f', // 이민정
  '96d5792b-646a-4944-9ff7-7a74738561c5', // 최성혁
  '945dd787-7606-4244-9056-43ab32c21d93', // test 계정
]);

export function canViewOwnExamPrep(userId: string | undefined): boolean {
  return !!userId && EXAM_PREP_SELF_ACCESS_IDS.has(userId);
}
