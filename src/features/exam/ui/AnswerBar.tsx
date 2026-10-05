// 상단 답안 줄: 객관식 ①~⑤ 체크(하나만, 다시 누르면 해제) / 단답 백·십·일 휠 + 🤔 + (자유 모드) 채점해 보기.
// v2: 채점해 본 문항은 답을 잠근다(①~⑤·휠·비우기 비활성, O/X 결과는 계속 보임). 🤔 는 계속 바꿀 수 있다.
import type { ExamQuestion } from '../contract';
import { ExamAnswer } from './ExamAnswer';
import { LaTeXRenderer } from '../../../components/LaTeXRenderer';
import { DigitWheel } from './DigitWheel';
import { answerFromDigits, CHOICE_MARKS, digitsFromAnswer, CHOICE10_MARKS, questionAnswerType, toggleChoice } from './examLogic';

export interface FreeCheck { isCorrect: boolean; correctAnswer: string }

interface Props {
  inert?: boolean;
  question: ExamQuestion;
  answer: string | null;
  unsure: boolean;
  onAnswer: (next: string | null) => void;
  onUnsure: (next: boolean) => void;
  /** 자유 모드일 때만 */
  free?: {
    /** 채점해 본 결과(있으면 이 문항은 잠김). */
    check: FreeCheck | null;
    checking: boolean;
    revealed: boolean;
    onCheck: () => void;
    onReveal: () => void;
    onPeer?: () => void;
  };
}

const PLACES = ['백의 자리', '십의 자리', '일의 자리'];

export function AnswerBar({ question, answer, unsure, onAnswer, onUnsure, free, inert }: Props) {
  const digits = digitsFromAnswer(answer);
  const check = free?.check ?? null;
  const locked = check != null;
  const answerType = questionAnswerType(question);
  const ten = answerType === 'choice10';
  // 구간별 함수식처럼 긴 선지는 칸을 좁히지 않고, 좁은 화면에서는 선지 줄을 옆으로 밀어 본다.
  const wide = ten && (question.choices ?? []).some(choice => choice.includes('\\begin{cases}') || choice.length > 24);

  return (
    <div inert={inert} className={`exam-answerbar${locked ? ' is-locked' : ''}`} data-testid="exam-answerbar" data-locked={locked || undefined}>
      <div className="exam-answerbar-inner">
        {answerType !== 'digits' ? (
          <div className={`exam-choices${ten ? ' exam-choices-ten' : ''}${wide ? ' is-wide' : ''}`} role="group" aria-label={`${question.number}번 답 고르기`}>
            {(ten ? CHOICE10_MARKS : question.answerType === 'choice4' ? CHOICE_MARKS.slice(0, 4) : CHOICE_MARKS).map((mark, index) => {
              const selected = answer === String(index + 1);
              return (
                <button
                  key={mark}
                  type="button"
                  className={`exam-choice${selected ? ' is-selected' : ''}`}
                  aria-pressed={selected}
                  disabled={locked}
                  aria-label={`${index + 1}번`}
                  data-choice={index + 1}
                  onClick={() => onAnswer(toggleChoice(answer, index + 1))}
                >
                  <span>{mark}</span>
                  {ten && <LaTeXRenderer inline text={`$${question.choices?.[index] ?? ''}$`} className="exam-choice-math" />}
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
                  disabled={locked}
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
              <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={() => onAnswer(null)} disabled={answer == null || locked}>
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
            {!locked && (
              <button
                type="button"
                className="rn-button rn-button-secondary rn-button-compact"
                disabled={answer == null || free.checking}
                onClick={free.onCheck}
              >
                {free.checking ? '채점 중…' : '채점해 보기'}
              </button>
            )}
            {check && (
              <span className={`exam-freecheck-mark ${check.isCorrect ? 'is-correct' : 'is-wrong'}`} data-testid="exam-freecheck" data-correct={check.isCorrect}>
                {check.isCorrect ? 'O 정답이에요!' : 'X 다시 볼까요?'}
                {!check.isCorrect && (
                  free.revealed
                    ? <em> 정답 <ExamAnswer question={question} answer={check.correctAnswer} /></em>
                    : <button type="button" className="exam-link" onClick={free.onReveal}>정답 보기</button>
                )}
              </span>
            )}
            {locked && <span className="exam-freecheck-lock rn-caption" data-testid="exam-lock-note">🔒 채점한 문항은 답을 바꿀 수 없어요</span>}
            {check && free.onPeer && <button type="button" className="exam-link" data-testid="exam-free-peer" aria-haspopup="dialog" onClick={free.onPeer}>풀이 보기</button>}
          </div>
        )}
      </div>
    </div>
  );
}
