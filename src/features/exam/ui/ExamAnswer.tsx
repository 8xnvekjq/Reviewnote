import type { ExamQuestion } from '../contract';
import { LaTeXRenderer } from '../../../components/LaTeXRenderer';
import { CHOICE10_MARKS, displayAnswer } from './examLogic';

/** OMR 검토·결과·채점에서 같은 선지 내용을 보여 준다. */
export function ExamAnswer({ question, answer }: {
  question: Pick<ExamQuestion, 'answerType' | 'choices' | 'isChoice'>;
  answer: string | null;
}) {
  if (question.answerType !== 'choice10' || answer == null) return <>{displayAnswer(answer, question.isChoice)}</>;
  const index = Number(answer) - 1;
  return <span className="exam-answer-math">
    <span>{CHOICE10_MARKS[index] ?? answer}</span>
    <LaTeXRenderer inline text={`$${question.choices?.[index] ?? ''}$`} />
  </span>;
}
