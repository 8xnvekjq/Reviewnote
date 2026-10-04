// 학습지별 참고 자료(예: 삼각비 표). 풀이 화면 문항 정보 줄의 버튼으로 앱 안 이미지 보기 창(ExamImageViewer)에 띄운다 — DB 변경 없이 시험지 id로 고른다.
export interface WorksheetReference { label: string; href: string }

const trigTable = (paperId: string): WorksheetReference[] => [{ label: '삼각비 표', href: `/exams/${paperId}/trig-table.png` }];

const REFERENCES: Record<string, WorksheetReference[]> = {
  '2026-g3m-trig-creative': trigTable('2026-g3m-trig-creative'),
  '2026-g3m-trig-creative-1': trigTable('2026-g3m-trig-creative-1'),
  '2026-g3m-trig-creative-2': trigTable('2026-g3m-trig-creative-2'),
};

export function worksheetReferences(paperId: string): WorksheetReference[] {
  return REFERENCES[paperId] ?? [];
}
