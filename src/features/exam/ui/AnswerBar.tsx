// 상단 답안 줄: 객관식 ①~⑤ 체크(하나만, 다시 누르면 해제) / 단답 백·십·일 휠 + 🤔 + (자유 모드) 채점해 보기.
import type { ExamQuestion } from '../contract';
import { DigitWheel } from './DigitWheel';
import { answerFromDigits, CHOICE_MARKS, digitsFromAnswer, displayAnswer, toggleChoice } from './examLogic';

export interface FreeCheck { answer: string; isCorrect: boolean; correctAnswer: string }

interface Props {
  question: ExamQuestion;
  answer: string | null;
  unsure: boolean;
  onAnswer: (next: string | null) => void;
  onUnsure: (next: boolean) => void;
  /** 자유 모드일 때만 */
  free?: {
    check: FreeCheck | null;
    checking: boolean;
    revealed: boolean;
    onCheck: () => void;
    onReveal: () => void;
  };
}

const PLACES = ['백의 자리', '십의 자리', '일의 자리'];

export function AnswerBar({ question, answer, unsure, onAnswer, onUnsure, free }: Props) {
  const digits = digitsFromAnswer(answer);
  const check = free?.check && free.check.answer === answer ? free.check : null;

  return (
    <div className="exam-answerbar" data-testid="exam-answerbar">
      <div className="exam-answerbar-inner">
        {question.isChoice ? (
          <div className="exam-choices" role="group" aria-label={`${question.number}번 답 고르기`}>
            {CHOICE_MARKS.map((mark, index) => {
              const selected = answer === String(index + 1);
              return (
                <button
                  key={mark}
                  type="button"
                  className={`exam-choice${selected ? ' is-selected' : ''}`}
                  aria-pressed={selected}
                  aria-label={`${index + 1}번`}
                  data-choice={index + 1}
                  onClick={() => onAnswer(toggleChoice(answer, index + 1))}
                >
                  {mark}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="exam-short" role="group" aria-label={`${question.number}번 답 (0~999)`}>
            <div className="exam-wheels">
              {digits.map((d, index) => (
                <DigitWheel
                  key={PLACES[index]}
                  label={PLACES[index]}
                  value={d}
                  dim={answer == null}
                  onChange={next => {
                    const nextDigits = [...digits];
                    nextDigits[index] = next;
                    onAnswer(answerFromDigits(nextDigits));
                  }}
                />
              ))}
            </div>
            <div className="exam-short-side">
              <output className="exam-short-value" data-testid="exam-short-value" aria-live="polite">
                {answer == null ? '미입력' : answer}
              </output>
              <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={() => onAnswer(null)} disabled={answer == null}>
                비우기
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          className={`exam-unsure${unsure ? ' is-on' : ''}`}
          aria-pressed={unsure}
          aria-label="애매해요 표시"
          title="애매해요 — 나중에 다시 볼게요"
          onClick={() => onUnsure(!unsure)}
        >
          <span aria-hidden="true">🤔</span>
          <small>애매</small>
        </button>

        {free && (
          <div className="exam-freecheck">
            <button
              type="button"
              className="rn-button rn-button-secondary rn-button-compact"
              disabled={answer == null || free.checking}
              onClick={free.onCheck}
            >
              {free.checking ? '채점 중…' : '채점해 보기'}
            </button>
            {check && (
              <span className={`exam-freecheck-mark ${check.isCorrect ? 'is-correct' : 'is-wrong'}`} data-testid="exam-freecheck" data-correct={check.isCorrect}>
                {check.isCorrect ? 'O 정답이에요!' : 'X 다시 볼까요?'}
                {!check.isCorrect && (
                  free.revealed
                    ? <em> 정답 {displayAnswer(check.correctAnswer, question.isChoice)}</em>
                    : <button type="button" className="exam-link" onClick={free.onReveal}>정답 보기</button>
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
