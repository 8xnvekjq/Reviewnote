// OMR 결과: 점수·맞은 개수·총 시간·추정 등급(+등급컷 표 접기) / 문항별 줄 / 오답노트 후보 고르기.
import { useEffect, useMemo, useState } from 'react';
import type { ExamClient, ExamResult, ExamResultItem, InkStroke } from '../contract';
import { ExamInkCanvas } from '../ink/ExamInkCanvas';
import { loadInk } from './inkStore';
import { displayAnswer, ELECTIVE_SHORT, formatClock, formatDuration, mistakeCandidates, praiseLine } from './examLogic';

interface Props {
  client: ExamClient;
  result: ExamResult;
  onBack: () => void;
}

export function OmrResultView({ client, result: initial, onBack }: Props) {
  const [result, setResult] = useState(initial);
  const [ink, setInk] = useState<Map<string, InkStroke[]>>(() => new Map());
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [adding, setAdding] = useState(false);
  const [addMessage, setAddMessage] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ExamResultItem | null>(null);

  useEffect(() => {
    let alive = true;
    void loadInk(initial.attemptId).then(map => { if (alive) setInk(map); });
    return () => { alive = false; };
  }, [initial.attemptId]);

  const candidates = useMemo(() => mistakeCandidates(result.items), [result.items]);
  const pendingCandidates = candidates.filter(item => !item.addedMistakeId);
  const cuts = result.gradeCut;

  const togglePick = (questionId: string) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId); else next.add(questionId);
      return next;
    });
  };

  const addSelected = async () => {
    const ids = [...picked];
    if (ids.length === 0) return;
    setAdding(true);
    setAddMessage(null);
    try {
      const added = await client.addToMistakes(result.attemptId, ids);
      const byId = new Map(added.map(row => [row.questionId, row.mistakeId]));
      setResult(prev => ({
        ...prev,
        items: prev.items.map(item => (byId.has(item.questionId) ? { ...item, addedMistakeId: byId.get(item.questionId)! } : item)),
      }));
      setPicked(new Set());
      setAddMessage(added.length > 0 ? `${added.length}문제를 오답노트에 담았어요.` : '이미 오답노트에 있는 문제였어요.');
    } catch (error) {
      setAddMessage(error instanceof Error ? error.message : '오답노트에 추가하지 못했어요. 잠시 뒤 다시 해 볼까요?');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="exam-result" data-testid="exam-result">
      <div className="exam-result-head">
        <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={onBack}>← 시험지 목록</button>
      </div>

      <section className="rn-surface exam-score-card" aria-label="OMR 결과 요약">
        <p className="rn-eyebrow">OMR 결과</p>
        <h2 className="exam-result-title">{result.paperTitle}</h2>
        <p className="rn-caption">{result.mode === 'real' ? '실전 모드' : '자유 모드'} · {result.elective}</p>
        <div className="exam-score-grid">
          <div className="exam-score-main">
            <strong data-testid="exam-score">{result.score}</strong><span>/ 100</span>
          </div>
          <dl className="exam-score-stats">
            <div><dt>맞은 개수</dt><dd data-testid="exam-correct-count">{result.correctCount} / {result.totalCount}</dd></div>
            <div><dt>총 시간</dt><dd>{formatDuration(result.totalTimeMs)}</dd></div>
            <div><dt>추정 등급</dt><dd data-testid="exam-grade">{result.estimatedGrade}등급</dd></div>
          </dl>
        </div>
        <p className="rn-caption exam-grade-note">
          등급은 종로학원 확정 등급컷 기준이에요. 원점수 컷은 추정치라 참고만 해 주세요.
          <br /><span className="exam-source">출처: {cuts.source}</span>
        </p>
        <details className="exam-cuts">
          <summary>등급컷 표 보기 ({ELECTIVE_SHORT[result.elective]})</summary>
          <table>
            <thead><tr><th>등급</th><th>원점수(추정)</th><th>표준점수</th><th>백분위</th></tr></thead>
            <tbody>
              {cuts.rawByGrade.map((raw, i) => (
                <tr key={i} className={result.estimatedGrade === i + 1 ? 'is-mine' : undefined}>
                  <td>{i + 1}</td><td>{raw}</td><td>{cuts.standardByGrade[i] ?? '—'}</td><td>{cuts.percentileByGrade[i] ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <section className="rn-surface exam-candidates" aria-label="오답노트 후보" data-testid="exam-candidates">
        <h3>오답노트 후보</h3>
        {candidates.length === 0 ? (
          <p className="rn-caption">틀린 문제도 애매한 문제도 없어요. 정말 잘했어요! 🎉</p>
        ) : (
          <>
            <p className="rn-caption">틀린 문제와 🤔 표시한 문제예요. 다시 보고 싶은 것만 골라 담아요.</p>
            <ul className="exam-candidate-list">
              {candidates.map(item => {
                const added = Boolean(item.addedMistakeId);
                return (
                  <li key={item.questionId}>
                    <label className={`exam-candidate${added ? ' is-added' : ''}`} data-number={item.number}>
                      <input
                        type="checkbox"
                        checked={added || picked.has(item.questionId)}
                        disabled={added || adding}
                        onChange={() => togglePick(item.questionId)}
                      />
                      <span className="exam-candidate-num">{item.number}번</span>
                      <span className="exam-candidate-why">
                        {!item.isCorrect && <span className="is-wrong">틀림</span>}
                        {item.unsure && <span className="is-unsure">🤔 애매</span>}
                      </span>
                      {added && <span className="exam-candidate-added">추가됨</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="rn-button rn-button-primary exam-sheet-wide"
              disabled={picked.size === 0 || adding || pendingCandidates.length === 0}
              onClick={() => { void addSelected(); }}
              data-testid="exam-add-mistakes"
            >
              {adding ? '담는 중…' : picked.size > 0 ? `오답노트에 추가 (${picked.size})` : '오답노트에 추가'}
            </button>
            {addMessage && <p className="rn-caption exam-add-message" role="status">{addMessage}</p>}
          </>
        )}
      </section>

      <section className="exam-items" aria-label="문항별 결과">
        <h3>문항별 결과</h3>
        <ul className="exam-item-list">
          {result.items.map(item => {
            const praise = praiseLine(item);
            return (
              <li key={item.questionId}>
                <button
                  type="button"
                  className={`exam-item-row ${item.isCorrect ? 'is-correct' : 'is-wrong'}`}
                  data-number={item.number}
                  data-correct={item.isCorrect}
                  onClick={() => setViewing(item)}
                >
                  <span className="exam-item-num">{item.number}</span>
                  <span className="exam-item-ox" aria-label={item.isCorrect ? '맞음' : '틀림'}>{item.isCorrect ? 'O' : 'X'}</span>
                  <span className="exam-item-answers">
                    <span>내 답 <b>{displayAnswer(item.answer, item.isChoice)}</b></span>
                    <span>정답 <b>{displayAnswer(item.correctAnswer, item.isChoice)}</b></span>
                  </span>
                  <span className="exam-item-unsure" aria-label={item.unsure ? '애매 표시' : undefined}>{item.unsure ? '🤔' : ''}</span>
                  <span className="exam-item-time">{formatClock(item.timeSpentMs)}</span>
                  {item.nationalWrongRate != null && (
                    <span className={`exam-item-rate${praise ? ' is-praise' : ''}`}>
                      {praise ?? `전국 오답률 ${item.nationalWrongRate}%`}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {viewing && (
        <div className="exam-overlay exam-overlay-full exam-viewer-overlay" role="dialog" aria-modal="true" aria-label={`${viewing.number}번 크게 보기`} onClick={() => setViewing(null)}>
          <div className="exam-viewer" onClick={e => e.stopPropagation()} data-testid="exam-viewer">
            <div className="exam-sheet-head">
              <h2>{viewing.number}번 <span className={viewing.isCorrect ? 'is-correct' : 'is-wrong'}>{viewing.isCorrect ? 'O' : 'X'}</span></h2>
              <span className="rn-caption">내 답 {displayAnswer(viewing.answer, viewing.isChoice)} · 정답 {displayAnswer(viewing.correctAnswer, viewing.isChoice)} · {formatClock(viewing.timeSpentMs)}</span>
              <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={() => setViewing(null)}>닫기</button>
            </div>
            {viewing.nationalChoiceRates && (
              <p className="rn-caption">전국 선택 비율: {viewing.nationalChoiceRates.map((rate, i) => `${displayAnswer(String(i + 1), true)} ${rate}%`).join(' · ')}</p>
            )}
            <div className="exam-viewer-paper">
              <ExamInkCanvas
                imageUrl={viewing.imageUrl}
                strokes={ink.get(viewing.questionId) ?? []}
                onChange={() => {}}
                tool="pen"
                color="#1f2937"
                size={4}
                readOnly
                imageMaxWidth={480}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
