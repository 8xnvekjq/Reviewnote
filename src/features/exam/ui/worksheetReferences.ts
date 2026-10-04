// 학습지별 참고 자료(예: 삼각비 표). 풀이 화면 문항 정보 줄의 버튼으로 앱 안 이미지 보기 창(ExamImageViewer)에 띄운다 — DB 변경 없이 시험지 id로 고른다.
export interface WorksheetReference { label: string; href: string }

const REFERENCES: Record<string, WorksheetReference[]> = {
  '2026-g3m-trig-creative': [{ label: '삼각비 표', href: '/exams/2026-g3m-trig-creative/trig-table.png' }],
};

export function worksheetReferences(paperId: string): WorksheetReference[] {
  return REFERENCES[paperId] ?? [];
}
