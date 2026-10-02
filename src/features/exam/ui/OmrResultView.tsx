// OMR 결과: 원점수·추정 등급·추정 표준점수·추정 백분위 + 맞은 개수·총 시간(+등급컷 표 접기) / 문항별 줄 / 오답노트 후보 고르기.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AdminExamApi, ExamClient, ExamResult, ExamResultItem, InkStroke } from '../contract';
import { ExamInkReplay } from '../ink/ExamInkReplay';
import { useExamInk } from './useExamInk';
import { ExamAnswer } from './ExamAnswer';
import { resultGradeLabel } from './hanneungLogic';
import { displayAnswer, ELECTIVE_SHORT, estimateStandardScore, formatClock, formatDuration, mistakeCandidates, praiseLine, roundLabel, usesWholePages } from './examLogic';

type Props = {
  result: ExamResult;
  onBack: () => void;
  backLabel?: string;
} & (
  | { client: ExamClient; review?: undefined }
  /** 관리자 읽기 전용 검토: 서버 필기만 읽고, 오답노트 담기·필기 저장은 하지 않는다. */
  | { client: Pick<AdminExamApi, 'getInk' | 'getInkReplay'>; review: { studentName: string } }
);

interface BodyProps {
  client: Pick<ExamClient, 'getInkReplay'> & Partial<Pick<ExamClient, 'addToMistakes'>>;
  result: ExamResult;
  onBack: () => void;
  backLabel?: string;
  ink: Map<string, InkStroke[]>;
  inkBar: ReactNode;
  studentName?: string;
}

export function OmrResultView(props: Props) {
  return props.review
    ? <ReviewResult client={props.client} result={props.result} onBack={props.onBack} backLabel={props.backLabel} studentName={props.review.studentName} />
    : <StudentResult client={props.client} result={props.result} onBack={props.onBack} backLabel={props.backLabel} />;
}

function StudentResult({ client, result, onBack, backLabel }: { client: ExamClient; result: ExamResult; onBack: () => void; backLabel?: string }) {
  const inkSync = useExamInk(client, result.attemptId, result.items.map(item => item.questionId));
  const inkBar = (
    <p className="rn-caption" role="status">
      {inkSync.status === 'loading' ? '필기를 불러오는 중…' : inkSync.status === 'saved' ? '서버에 저장된 필기도 문항별로 볼 수 있어요.'
        : inkSync.status === 'pending' || inkSync.status === 'saving' ? '이 기기의 필기를 서버에 옮기는 중…'
        : '필기 동기화를 완료하지 못했어요.'}
      {(inkSync.status === 'failed' || inkSync.status === 'conflict') && <button type="button" className="rn-button rn-button-compact" onClick={() => {
        if (inkSync.status === 'conflict') {
          if (window.confirm('이 기기의 미저장 필기 대신 서버에 저장된 필기를 사용할까요?')) void inkSync.load(true);
        } else void inkSync.load().then(() => inkSync.flush());
      }}>{inkSync.status === 'conflict' ? '서버 필기 사용' : '다시 시도'}</button>}
    </p>
  );
  return <OmrResultBody client={client} result={result} onBack={onBack} backLabel={backLabel} ink={inkSync.strokes} inkBar={inkBar} />;
}

function ReviewResult({ client, result, onBack, backLabel, studentName }: {
  client: Pick<AdminExamApi, 'getInk' | 'getInkReplay'>; result: ExamResult; onBack: () => void; backLabel?: string; studentName: string;
}) {
  const [ink, setInk] = useState<Map<string, InkStroke[]> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    client.getInk(result.attemptId)
      .then(docs => { if (alive) setInk(new Map(docs.map(doc => [doc.questionId, doc.strokes]))); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [client, result.attemptId]);
  const inkBar = <p className="rn-caption" role="status">
    {failed ? '학생 필기를 불러오지 못했어요. 닫았다가 다시 열어 주세요.' : ink ? '문항을 누르면 학생 필기와 필기 순서를 크게 볼 수 있어요.' : '학생 필기를 불러오는 중…'}
  </p>;
  return <OmrResultBody client={client} result={result} onBack={onBack} backLabel={backLabel} ink={ink ?? new Map()} inkBar={inkBar} studentName={studentName} />;
}

function OmrResultBody({ client, result: initial, onBack, backLabel, ink, inkBar, studentName }: BodyProps) {
  const [result, setResult] = useState(initial);
  const reviewing = studentName != null;
  const wholePages = usesWholePages(initial.items);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [adding, setAdding] = useState(false);
  const [addMessage, setAddMessage] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ExamResultItem | null>(null);
  const [pageZoom, setPageZoom] = useState(false);

  const candidates = useMemo(() => mistakeCandidates(result.items), [result.items]);
  const pendingCandidates = candidates.filter(item => !item.addedMistakeId);
  const cuts = result.gradeCut;
  const school = result.kind === 'school' || result.kind === 'hanneung';
  // 서버가 v2 이전 결과를 주면 top 값이 없을 수 있다 — 그땐 1등급컷 값으로 본다.
  const estimate = useMemo(() => school ? { standard: null, percentile: null } : estimateStandardScore(result.score, {
    ...cuts,
    topStandard: cuts.topStandard ?? null,
    topPercentile: cuts.topPercentile ?? null,
  }), [result.score, cuts, school]);

  const togglePick = (questionId: string) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId); else next.add(questionId);
      return next;
    });
  };

  const addSelected = async () => {
    const ids = [...picked];
    if (ids.length === 0 || !client.addToMistakes) return;
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
      {!reviewing && <div className="exam-result-head">
        <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={onBack}>{backLabel ?? '← 시험지 목록'}</button>
      </div>}
      {inkBar}

      <section className="rn-surface exam-score-card" aria-label="OMR 결과 요약">
        <p className="rn-eyebrow">{reviewing ? `${studentName} 학생 · OMR 결과 · 읽기 전용` : 'OMR 결과'}</p>
        <h2 className="exam-result-title">{result.paperTitle}{roundLabel(result.round) && ` · ${roundLabel(result.round)}`}</h2>
        <p className="rn-caption">{result.mode === 'real' ? '실전 모드' : '자유 모드'}{result.elective && ` · ${result.elective}`}</p>
        <div className="exam-score-grid">
          <div className="exam-score-main">
            <span className="exam-score-label">원점수</span>
            <strong data-testid="exam-score">{result.score}</strong><span>/ {result.maxScore ?? 100}</span>
          </div>
          <dl className="exam-score-stats">
            <div><dt>맞은 개수</dt><dd data-testid="exam-correct-count">{result.correctCount} / {result.totalCount}</dd></div>
            <div><dt>정답률</dt><dd>{result.totalCount ? Math.round(result.correctCount / result.totalCount * 100) : 0}%</dd></div>
            <div><dt>총 시간</dt><dd>{formatDuration(result.totalTimeMs)}</dd></div>
          </dl>
        </div>
        {result.kind === 'hanneung' && <div className="exam-grade-note">
          <strong data-testid="exam-hanneung-grade">{resultGradeLabel(result, result.estimatedGrade)}</strong>
          <p className="rn-caption">80점·70점·60점 이상이면 {result.hanneungLevel === 'basic' ? '4급·5급·6급' : '1급·2급·3급'} 기준이에요. 연습 결과이며 공식 인증은 아니에요.</p>
        </div>}
        {!school && <>
        <dl className="exam-score-tiles" data-testid="exam-score-tiles">
          <div className="exam-score-tile is-grade">
            <dt>추정 등급</dt>
            <dd data-testid="exam-grade">{result.estimatedGrade}<small>등급</small></dd>
          </div>
          <div className="exam-score-tile">
            <dt>추정 표준점수</dt>
            <dd data-testid="exam-standard">{estimate.standard ?? '—'}</dd>
          </div>
          <div className="exam-score-tile">
            <dt>추정 백분위</dt>
            <dd data-testid="exam-percentile">{estimate.percentile ?? '—'}</dd>
          </div>
        </dl>
        <p className="rn-caption exam-grade-note">
          등급·표준점수·백분위는 종로학원 확정 등급컷을 기준으로 어림한 추정값이에요. 참고로만 봐 주세요.
          <br /><span className="exam-source">출처: {cuts.source}</span>
        </p>
        <details className="exam-cuts">
          <summary>등급컷 표 보기 ({result.elective ? ELECTIVE_SHORT[result.elective] : ''})</summary>
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
        </>}
      </section>

      {!reviewing && <section className="rn-surface exam-candidates" aria-label="오답노트 후보" data-testid="exam-candidates">
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
      </section>}

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
                    <span>{reviewing ? '학생 답' : '내 답'} <b><ExamAnswer question={item} answer={item.answer} /></b></span>
                    <span>정답 <b><ExamAnswer question={item} answer={item.correctAnswer} /></b></span>
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
              <span className="rn-caption">{reviewing ? '학생 답' : '내 답'} <ExamAnswer question={viewing} answer={viewing.answer} /> · 정답 <ExamAnswer question={viewing} answer={viewing.correctAnswer} /> · {formatClock(viewing.timeSpentMs)}</span>
              <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={() => setViewing(null)}>닫기</button>
            </div>
            {viewing.nationalChoiceRates && (
              <p className="rn-caption">전국 선택 비율: {viewing.nationalChoiceRates.map((rate, i) => `${displayAnswer(String(i + 1), true)} ${rate}%`).join(' · ')}</p>
            )}
            <div className="exam-viewer-paper">
              {wholePages && <button type="button" className="rn-button rn-button-compact" aria-pressed={pageZoom} onClick={() => setPageZoom(prev => !prev)}>{pageZoom ? '화면에 맞추기' : '원본 확대'}</button>}
              <div className={wholePages ? 'exam-original-scroll' : undefined}>
              <div style={wholePages && pageZoom ? { minWidth: 1100 } : undefined}>
              <ExamInkReplay
                key={viewing.questionId}
                client={client}
                attemptId={result.attemptId}
                questionId={wholePages ? result.items.find(item => item.imageUrl === viewing.imageUrl)!.questionId : viewing.questionId}
                imageUrl={viewing.imageUrl}
                strokes={ink.get(wholePages ? result.items.find(item => item.imageUrl === viewing.imageUrl)!.questionId : viewing.questionId) ?? []}
                imageMaxWidth={wholePages ? (pageZoom ? 1100 : 980) : 480}
              />
              </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
