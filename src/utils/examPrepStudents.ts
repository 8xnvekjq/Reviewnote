import type { MistakeEntry } from '../types';

export interface ExamPrepStudentOption {
  id: string;
  name: string;
  grade: string;
  count: number;
  latest: string | null;
}

const gradeCollator = new Intl.Collator('ko', { numeric: true });

function gradeOrder(grade: string): number {
  const match = /^(중|고)(\d+)$/.exec(grade.trim());
  if (match) return (match[1] === '중' ? 0 : 10) + Number(match[2]);
  return grade.trim() ? 20 : 30;
}

// profilesGradeMap은 get_profile_directory가 내려준 학생 디렉터리와 동일한 id 집합이다.
// 관리자 계정 제외 정책은 RPC에 그대로 두고, 여기서는 학년 유무/값으로 학생을 누락시키지 않는다.
export function buildExamPrepStudentOptions(
  mistakes: MistakeEntry[],
  profilesMap: Record<string, string>,
  profilesGradeMap: Record<string, string>,
): ExamPrepStudentOption[] {
  const studentIds = new Set(Object.keys(profilesGradeMap));
  const activity = new Map<string, { count: number; latest: string | null }>();

  for (const mistake of mistakes) {
    if (!mistake.userId || !studentIds.has(mistake.userId)) continue;
    const current = activity.get(mistake.userId) || { count: 0, latest: null };
    current.count += 1;
    if (!current.latest || mistake.date > current.latest) current.latest = mistake.date;
    activity.set(mistake.userId, current);
  }

  return Array.from(studentIds)
    .map(id => {
      const studentActivity = activity.get(id);
      return {
        id,
        name: profilesMap[id] || id.slice(0, 8),
        grade: profilesGradeMap[id] || '',
        count: studentActivity?.count || 0,
        latest: studentActivity?.latest || null,
      };
    })
    .sort((a, b) => {
      const orderDiff = gradeOrder(a.grade) - gradeOrder(b.grade);
      if (orderDiff !== 0) return orderDiff;
      const gradeDiff = gradeCollator.compare(a.grade, b.grade);
      return gradeDiff || gradeCollator.compare(a.name, b.name);
    });
}
