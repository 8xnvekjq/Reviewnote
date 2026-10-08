import type { ReactNode } from 'react';
import type { ExamPaperMetadata } from '../contract';
import { scoreDisplay } from './scoreDisplay';

/** Keep each legacy display verbatim unless this paper needs conversion. */
export function ConvertedScore({ score, paper, children }: {
  score: number; paper: ExamPaperMetadata; children: ReactNode;
}) {
  const display = scoreDisplay(score, paper);
  return display.converted ? <>{display.score}점 <small className="exam-score-raw">{display.rawLabel}</small></> : children;
}
