// 전체 문제 보기: 1~30번 문항 이미지를 번호 순 격자로 작게 보여 주고, 누르면 그 문항으로 간다(번호판 대신).
// 이미지는 풀이 화면이 미리 받아 둔 것을 그대로 쓴다(lazy). 열려 있는 동안 스톱워치는 보던 문항에 계속 쌓인다.
import { useEffect, useRef } from 'react';
import type { ExamItemState, ExamQuestion } from '../contract';
import { padStatus } from './examLogic';

type ItemLike = Pick<ExamItemState, 'answer' | 'unsure' | 'checked'>;

interface Props {
  questions: ExamQuestion[];
  items: Record<string, ItemLike>;
  currentIndex: number;
  answeredCount: number;
  onPick: (index: number) => void;
  onClose: () => void;
  onOpenOmr: () => void;
}

export function QuestionOverview({ questions, items, currentIndex, answeredCount, onPick, onClose, onOpenOmr }: Props) {
  const currentRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center' });
    currentRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="exam-overlay exam-overlay-full" role="dialog" aria-modal="true" aria-label="전체 문제" data-testid="exam-overview">
      <div className="exam-overview">
        <div className="exam-sheet-head exam-overview-head">
          <h2>전체 문제</h2>
          <span className="rn-caption">응답 {answeredCount} / {questions.length}</span>
          <button type="button" className="rn-button rn-button-secondary rn-button-compact" onClick={onOpenOmr}>OMR 카드 보기</button>
          <button type="button" className="rn-button rn-button-ghost rn-button-compact exam-overview-close" onClick={onClose}>닫기</button>
        </div>
        <div className="exam-pad-legend rn-caption">
          <span><i className="is-answered" />답함</span>
          <span><i className="is-empty" />아직</span>
          <span><i className="is-unsure" />🤔 애매</span>
          <span><i className="is-checked" />채점함</span>
        </div>
        <ul className="exam-thumbs" aria-label="문항 목록">
          {questions.map((q, index) => {
            const item = items[q.id];
            const status = padStatus(item);
            const answered = item?.answer != null;
            const checked = item?.checked ?? null;
            const current = index === currentIndex;
            const label = [
              `${q.number}번`,
              answered ? '답함' : '아직 안 풂',
              item?.unsure ? '애매' : null,
              checked ? `채점함 ${checked.isCorrect ? '맞음' : '틀림'}` : null,
              current ? '지금 보는 문항' : null,
            ].filter(Boolean).join(', ');
            return (
              <li key={q.id}>
                <button
                  ref={current ? currentRef : undefined}
                  type="button"
                  className={`exam-thumb is-${status}${current ? ' is-current' : ''}`}
                  aria-label={label}
                  aria-current={current ? 'step' : undefined}
                  data-number={q.number}
                  data-status={status}
                  data-checked={checked ? String(checked.isCorrect) : undefined}
                  onClick={() => onPick(index)}
                >
                  <span className="exam-thumb-paper">
                    <img src={q.imageUrl} alt="" loading="lazy" decoding="async" draggable={false} />
                  </span>
                  <span className="exam-thumb-num">{q.number}</span>
                  <span className="exam-thumb-badges" aria-hidden="true">
                    {item?.unsure && <span className="is-unsure">🤔</span>}
                    {checked
                      ? <span className={checked.isCorrect ? 'is-correct' : 'is-wrong'}>{checked.isCorrect ? 'O' : 'X'}</span>
                      : answered && <span className="is-answered">답함</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
