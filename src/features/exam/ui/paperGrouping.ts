import type { ExamPaperMetadata } from '../contract.ts';

/** 수능·모평은 고3, 학력평가는 시험지 학년 탭에 배치한다. */
export function paperGrade(paper: ExamPaperMetadata) {
  if (paper.kind === 'hanneung') return 'hanneung';
  return (paper.kind ?? 'csat') === 'csat' ? 3 : paper.grade;
}

export const PAPER_SECTIONS = ['era', 'csat', 'mock', 'school', 'worksheet', 'hanneung'] as const;
export const SECTION_LABEL: Record<typeof PAPER_SECTIONS[number], string> = {
  era: '시대별 모아 풀기', csat: '수능·모평', mock: '학력평가', school: '내신', worksheet: '학교 프린트', hanneung: '한능검',
};
