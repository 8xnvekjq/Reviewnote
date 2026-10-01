// 제출 전 OMR 검토 카드. 전체 문제 보기(QuestionOverview)와 같은 규칙(padStatus)으로 "응답/미응답/🤔" 상태를 보여 준다.
import type { ExamItemState, ExamQuestion } from '../contract';
import { CHOICE_MARKS, padStatus } from './examLogic';

type ItemLike = Pick<ExamItemState, 'answer' | 'unsure'>;

/** 실제 OMR 카드처럼: 번호 | ①~⑤ 마킹(객관식) 또는 숫자 칸(단답). 줄을 누르면 그 문항으로. */
export function OmrCard({ questions, items, onPick }: {
  questions: ExamQuestion[];
  items: Record<string, ItemLike>;
  onPick: (index: number) => void;
}) {
  const half = Math.ceil(questions.length / 2);
  const columns = [questions.slice(0, half), questions.slice(half)];
  return (
    <div className="exam-omr" data-testid="exam-omr">
      {columns.map((column, ci) => (
        <div className="exam-omr-col" key={ci}>
          {column.map(q => {
            const index = questions.indexOf(q);
            const item = items[q.id];
            const status = padStatus(item);
            const empty = item?.answer == null;
            return (
              <button
                key={q.id}
                type="button"
                className={`exam-omr-row${empty ? ' is-empty' : ''}${item?.unsure ? ' is-unsure' : ''}`}
                data-number={q.number}
                data-status={status}
                aria-label={`${q.number}번 ${empty ? '빈 문항' : `답 ${item?.answer}`}${item?.unsure ? ', 애매' : ''} — 눌러서 이동`}
                onClick={() => onPick(index)}
              >
                <span className="exam-omr-num">{q.number}</span>
                {q.isChoice ? (
                  <span className="exam-omr-bubbles" aria-hidden="true">
                    {CHOICE_MARKS.map((mark, i) => (
                      <span key={mark} className={item?.answer === String(i + 1) ? 'is-marked' : undefined}>{i + 1}</span>
                    ))}
                  </span>
                ) : (
                  <span className="exam-omr-digits" aria-hidden="true">
                    {(item?.answer ?? '').padStart(3, ' ').split('').map((ch, i) => <span key={i}>{ch.trim()}</span>)}
                  </span>
                )}
                <span className="exam-omr-flag" aria-hidden="true">{item?.unsure ? '🤔' : empty ? '빈칸' : ''}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
