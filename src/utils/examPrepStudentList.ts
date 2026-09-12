import type { MistakeEntry } from '../types';

// 관리자 시험대비 분석 학생 선택기가 보여줄 목록을 계산하는 순수 함수 — 렌더링(JSX/AppIcon)과
// 분리해 두면 node --test로 그대로 검증할 수 있다. 정책: 학년으로 거르지 않고(고3/중3 등 실제
// 학생도 전부 포함), excludedStudentIds(예: QA용 test 계정)만 제외한다. school_grade가 없는
// 학생도 누락하지 않고 목록 맨 뒤에 "학년 미상"으로 표시한다.
export const NO_GRADE_LABEL = '학년 미상';

export interface ExamPrepStudentListItem {
  id: string;
  name: string;
  grade: string; // 비어 있으면 화면에서 NO_GRADE_LABEL로 표시
  count: number;
  latest: string | null;
}

export function buildExamPrepStudentList(
  mistakes: MistakeEntry[],
  profilesMap: Record<string, string>,
  profilesGradeMap: Record<string, string>,
  excludedStudentIds?: Set<string>,
): ExamPrepStudentListItem[] {
  return Object.keys(profilesGradeMap)
    .filter(id => !excludedStudentIds?.has(id))
    .map(id => {
      const own = mistakes.filter(m => m.userId === id);
      const latest = own.reduce<string | null>((acc, m) => (!acc || m.date > acc ? m.date : acc), null);
      return { id, name: profilesMap[id] || id.slice(0, 8), grade: profilesGradeMap[id] || '', count: own.length, latest };
    })
    .sort((a, b) => {
      if (!a.grade && !b.grade) return a.name.localeCompare(b.name, 'ko');
      if (!a.grade) return 1;
      if (!b.grade) return -1;
      return a.grade === b.grade ? a.name.localeCompare(b.name, 'ko') : a.grade.localeCompare(b.grade, 'ko');
    });
}
