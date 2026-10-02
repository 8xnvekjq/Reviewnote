import { useEffect, useState } from 'react';
import type { ExamClient, ExamElective, ExamPaperHistoryAttempt, ExamPaperSummary } from '../contract';
import { buildHistoryRows, formatDuration, historyCellLabel, roundLabel } from './examLogic';

interface Props {
  client: ExamClient;
  paper: ExamPaperSummary;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onContinue: (inProgress: boolean) => void;
  onOpenResult: (attemptId: string) => void;
}

function historyDate(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ScoreTrend({ history, paper }: { history: ExamPaperHistoryAttempt[]; paper: ExamPaperSummary }) {
  const submitted = history.filter(a => a.status === 'submitted' && a.score != null);
  if (!submitted.length) return null;
  const maxRound = Math.max(...history.map(a => a.round));
  const points = submitted.map(a => ({
    x: maxRound === 1 ? 180 : 28 + (a.round - 1) / (maxRound - 1) * 304,
    y: 96 - a.score! / (paper.maxScore ?? 100) * 72,
    attempt: a,
  }));
  return (
    <figure className="rn-surface exam-history-trend" data-testid="exam-history-trend">
      <figcaption>점수 추이</figcaption>
      <svg viewBox="0 0 360 122" role="img" aria-label={`회차별 점수: ${submitted.map(a => `${roundLabel(a.round)} ${a.score}점`).join(', ')}`}>
        {[0, (paper.maxScore ?? 100) / 2, paper.maxScore ?? 100].map(score => <g key={score}>
          <line x1="28" x2="332" y1={96 - score / (paper.maxScore ?? 100) * 72} y2={96 - score / (paper.maxScore ?? 100) * 72} className="exam-trend-guide" />
          <text x="2" y={100 - score / (paper.maxScore ?? 100) * 72}>{score}</text>
        </g>)}
        <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} className="exam-trend-line" />
        {points.map(p => <g key={p.attempt.attemptId}>
          <circle cx={p.x} cy={p.y} r="3"><title>{roundLabel(p.attempt.round)} · {p.attempt.score}점{p.attempt.elective && ` · ${p.attempt.elective}`}</title></circle>
        </g>)}
        <text x={points[0].x} y="116" textAnchor="middle">{roundLabel(submitted[0].round)}</text>
        {submitted.length > 1 && <text x={points.at(-1)!.x} y="116" textAnchor="middle">{roundLabel(submitted.at(-1)!.round)}</text>}
      </svg>
      {paper.electives.length > 0 && <p className="rn-caption">선택과목이 다르면 점수와 등급도 달라질 수 있어요.</p>}
    </figure>
  );
}

export function ExamHistoryView({ client, paper, busy, error, onBack, onContinue, onOpenResult }: Props) {
  const [history, setHistory] = useState<ExamPaperHistoryAttempt[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [elective, setElective] = useState<ExamElective>(paper.inProgress?.elective ?? paper.electives[0] ?? '미적분');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoadError(null);
    setHistory(null);
    void client.listPaperHistory(paper.id).then(list => {
      if (!alive) return;
      const sorted = [...list].sort((a, b) => a.round - b.round);
      setHistory(sorted);
      if (sorted.length) setElective(sorted.at(-1)!.elective ?? '미적분');
    }).catch(e => {
      if (alive) setLoadError(e instanceof Error ? e.message : '기록을 불러오지 못했어요. 다시 해 볼까요?');
    });
    return () => { alive = false; };
  }, [client, paper.id, reload]);
  const active = history?.find(a => a.status === 'in_progress');
  const rows = buildHistoryRows(history ?? [], elective, paper.questionCount ?? 30);

  return (
    <div className="exam-history" data-testid="exam-history">
      <button type="button" className="rn-button rn-button-ghost rn-button-compact" disabled={busy} onClick={onBack}>← 시험지 목록</button>
      <p className="rn-eyebrow">내 풀이 기록</p>
      <h1 className="exam-result-title">{paper.title}</h1>
      {(error || loadError) && <p className="exam-error" role="alert">{error || loadError}</p>}
      {loadError && <button type="button" className="rn-button rn-button-secondary" onClick={() => setReload(n => n + 1)}>다시 불러오기</button>}
      {!history && !loadError && <p className="rn-caption" role="status">기록을 불러오는 중이에요…</p>}
      {history && <>
        <div className="exam-history-actions">
          <button type="button" className="rn-button rn-button-primary" disabled={busy} onClick={() => onContinue(Boolean(active))} data-testid="exam-history-continue">
            {busy ? '준비 중…' : active ? `${roundLabel(active.round)} 이어 풀기` : '새 회차 시작'}
          </button>
          <div>
            <button type="button" className="rn-button rn-button-secondary" disabled aria-describedby="exam-history-coming">계속 틀리는 문제만 다시 풀기</button>
            <p id="exam-history-coming" className="rn-caption">준비 중이에요. 조금만 기다려 주세요.</p>
          </div>
        </div>
        {!history.length && <p className="rn-empty">아직 풀이 기록이 없어요. 첫 회차를 시작해 볼까요?</p>}
        <ScoreTrend history={history} paper={paper} />
        {history.length > 0 && <>
          <section aria-label="회차 목록">
            <h2 className="exam-setup-title">회차별 기록</h2>
            <ul className="exam-history-list">
              {[...history].reverse().map(a => <li key={a.attemptId}>
                <button type="button" className="exam-past-row exam-history-attempt" disabled={busy}
                  onClick={() => a.status === 'submitted' ? onOpenResult(a.attemptId) : onContinue(true)}
                  data-testid="exam-history-attempt" data-round={a.round}>
                  <strong>{roundLabel(a.round)}{a.status === 'in_progress' ? ' 진행 중' : paper.practiceEra ? ` · ${a.score}/${paper.questionCount}문항` : ` · ${a.score}점${paper.kind === 'school' || paper.kind === 'worksheet' ? ` / ${paper.maxScore ?? 100}` : paper.kind === 'hanneung' ? a.estimatedGrade == null ? ' · 미합격' : ` · 예상 ${a.estimatedGrade}급` : ` · 추정 ${a.estimatedGrade ?? '—'}등급`}`}</strong>
                  <span className="rn-caption">{historyDate(a.startedAt)} · {a.mode === 'real' ? '실전' : '자유'}{a.elective && ` · ${a.elective}`} · 총 {formatDuration(a.totalTimeMs)}</span>
                </button>
              </li>)}
            </ul>
          </section>
          <section aria-label="문항별 회차 비교">
            <h2 className="exam-setup-title">문제마다 어떻게 달라졌을까요?</h2>
            {paper.electives.length > 0 && <label className="exam-history-filter">23~30번 비교 과목
              <select value={elective} onChange={e => setElective(e.target.value as ExamElective)} data-testid="exam-history-elective">
                {paper.electives.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>}
            <p className="rn-caption">O 맞음 · X 틀림 · 🤔 애매 · 미응답{paper.electives.length > 0 && ' · - 다른 선택과목'}<br />진행 중에는 정오가 보이지 않아요. 표를 옆으로 밀면 모든 회차를 볼 수 있어요.</p>
            <div className="exam-history-scroll" tabIndex={0} role="region" aria-label="회차 비교 표, 가로로 스크롤" data-testid="exam-history-scroll">
              <table className="exam-history-table" data-testid="exam-history-table">
                <caption>1~{paper.questionCount ?? 30}번 문항별 회차 기록{paper.electives.length > 0 && ` · 선택 ${elective}`}</caption>
                <thead><tr><th scope="col">문항</th>{history.map(a => <th key={a.attemptId} scope="col">{roundLabel(a.round)}{a.elective && <small>{a.elective}</small>}</th>)}<th scope="col">최근 시간 변화</th></tr></thead>
                <tbody>{rows.map(row => <tr key={row.number} data-number={row.number} data-persistent-wrong={row.persistentWrong || undefined}>
                  <th scope="row">{row.number}번{row.persistentWrong && <small className="exam-history-wrong">계속 틀리는 문제</small>}</th>
                  {row.cells.map((cell, index) => {
                    const submitted = history[index].status === 'submitted';
                    return <td key={cell.attemptId} className={cell.newlyCorrect ? 'is-newly-correct' : undefined} data-round={history[index].round}>
                      <span>{historyCellLabel(cell.item, submitted)}</span>
                      {cell.item && <small>{formatDuration(cell.item.timeSpentMs)}</small>}
                      {cell.newlyCorrect && <small>새로 맞힘</small>}
                    </td>;
                  })}
                  <td className="exam-history-time">{row.timeChange ?? '—'}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <p className="rn-caption">계속 틀리는 문제는 비교 가능한 모든 제출 회차에서 틀린 문제예요. 새로 맞힘과 시간 변화는 {paper.electives.length > 0 ? '같은 과목의 ' : ''}직전 제출 회차와 비교해요.</p>
          </section>
        </>}
      </>}
    </div>
  );
}
