import type { ExamPaperMetadata } from '../contract';

/** Display-only conversion; grading and stored scores remain on the original scale. */
export function scoreDisplay(score: number, paper: Pick<ExamPaperMetadata, 'kind' | 'maxScore' | 'practiceEra'>) {
  const maxScore = paper.maxScore ?? 100;
  const converted = !paper.practiceEra && (paper.kind === 'school' || paper.kind === 'worksheet')
    && Number.isFinite(maxScore) && maxScore > 0 && maxScore !== 100;
  return {
    score: converted ? Math.round(score / maxScore * 1000) / 10 : score,
    maxScore: converted ? 100 : maxScore,
    converted,
    rawLabel: converted ? `(원점수 ${score} / ${maxScore}점)` : null,
  };
}
