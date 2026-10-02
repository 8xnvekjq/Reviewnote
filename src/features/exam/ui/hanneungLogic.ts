import type { ExamPaperMetadata } from '../contract.ts';

export function hanneungGrade(score: number, level: ExamPaperMetadata['hanneungLevel']): number | null {
  if (!level || score < 60) return null;
  return (level === 'basic' ? 3 : 0) + (score >= 80 ? 1 : score >= 70 ? 2 : 3);
}

export function resultGradeLabel(paper: ExamPaperMetadata, grade: number | null): string {
  if (paper.practiceEra || paper.kind === 'school') return '';
  if (paper.kind === 'hanneung') return grade == null ? '미합격' : `예상 ${grade}급`;
  return grade == null ? '' : `추정 ${grade}등급`;
}
