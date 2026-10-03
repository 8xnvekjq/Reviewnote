// 학습지별 참고 자료(예: 삼각비 표). 풀이 화면 문항 정보 줄에 새 탭 링크로만 붙인다 — DB 변경 없이 시험지 id로 고른다.
export interface WorksheetReference { label: string; href: string }

const REFERENCES: Record<string, WorksheetReference[]> = {
  '2026-g3m-trig-creative': [{ label: '삼각비 표', href: '/exams/2026-g3m-trig-creative/trig-table.png' }],
};

export function worksheetReferences(paperId: string): WorksheetReference[] {
  return REFERENCES[paperId] ?? [];
}
