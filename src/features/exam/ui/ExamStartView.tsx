// 시작 화면: 시험지 카드 → 모드(실전/자유) → 선택과목 → 시작. 진행 중 시도가 있으면 "이어 풀기", 아래엔 지난 OMR 결과.
import { useEffect, useState } from 'react';
import type { ExamAttempt, ExamClient, ExamElective, ExamMode, ExamPaperSummary, ExamResult } from '../contract';
import { ELECTIVE_SHORT, ELECTIVES, formatClock, remainingMs } from './examLogic';

type PastResult = Pick<ExamResult, 'attemptId' | 'paperTitle' | 'mode' | 'elective' | 'score' | 'estimatedGrade' | 'submittedAt'>;

interface Props {
  client: ExamClient;
  currentUserId: string;
  busy: boolean;
  error: string | null;
  onStart: (paper: ExamPaperSummary, mode: ExamMode, elective: ExamElective) => void;
  onResume: (attempt: ExamAttempt) => void;
  onOpenResult: (attemptId: string) => void;
  onExit: () => void;
}

const MODES: Array<{ value: ExamMode; title: string; desc: string }> = [
  { value: 'real', title: '실전 모드', desc: '100분 타이머, 제출하기 전엔 정답이 보이지 않아요.' },
  { value: 'free', title: '자유 모드', desc: '시간 제한 없이, 문항마다 채점해 볼 수 있어요.' },
];

function electiveKey(userId: string) { return `rn-exam-elective:${userId}`; }

function formatDate(iso: string) {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export function ExamStartView({ client, currentUserId, busy, error, onStart, onResume, onOpenResult, onExit }: Props) {
  const [papers, setPapers] = useState<ExamPaperSummary[] | null>(null);
  const [paperId, setPaperId] = useState<string | null>(null);
  const [active, setActive] = useState<ExamAttempt | null>(null);
  const [past, setPast] = useState<PastResult[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<ExamMode>('real');
  const [elective, setElective] = useState<ExamElective | null>(() => {
    try {
      const saved = localStorage.getItem(electiveKey(currentUserId));
      return ELECTIVES.includes(saved as ExamElective) ? saved as ExamElective : null;
    } catch { return null; }
  });

  useEffect(() => {
    let alive = true;
    client.listPapers()
      .then(list => {
        if (!alive) return;
        setPapers(list);
        setPaperId(prev => prev ?? list[0]?.id ?? null);
      })
      .catch(() => { if (alive) setLoadError('시험지를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'); });
    return () => { alive = false; };
  }, [client]);

  useEffect(() => {
    if (!paperId) return;
    let alive = true;
    void client.getActiveAttempt(paperId).then(a => { if (alive) setActive(a); }).catch(() => {});
    void client.listMyResults(paperId).then(r => { if (alive) setPast(r); }).catch(() => {});
    return () => { alive = false; };
  }, [client, paperId]);

  const paper = papers?.find(p => p.id === paperId) ?? null;
  const pickElective = (next: ExamElective) => {
    setElective(next);
    try { localStorage.setItem(electiveKey(currentUserId), next); } catch { /* 무시 */ }
  };
  const activeRemaining = active ? remainingMs(active.startedAt, active.timeLimitMinutes, Date.now()) : null;
  const activeAnswered = active ? active.items.filter(item => item.answer != null).length : 0;

  return (
    <div className="exam-start" data-testid="exam-start">
      <div className="exam-start-head">
        <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={onExit}>← 돌아가기</button>
      </div>
      <p className="rn-eyebrow">기출문제 풀이</p>
      <h1 className="rn-title">시험지 고르기</h1>

      {loadError && <p className="exam-error" role="alert">{loadError}</p>}
      {!papers && !loadError && <div className="rn-loading"><div className="rn-skeleton rn-loading-card" /></div>}

      {papers && papers.length === 0 && <div className="rn-empty">아직 풀 수 있는 시험지가 없어요.</div>}

      {papers && papers.length > 0 && (
        <div className="exam-paper-list" role="radiogroup" aria-label="시험지">
          {papers.map(p => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={p.id === paperId}
              className={`rn-surface exam-paper-card${p.id === paperId ? ' is-on' : ''}`}
              onClick={() => setPaperId(p.id)}
            >
              <strong>{p.title}</strong>
              <span className="rn-caption">{formatDate(p.examDate)} 시행 · {p.source}</span>
              <span className="exam-paper-tags"><span>{p.timeLimitMinutes}분</span><span>30문항</span><span>공통 + 선택</span></span>
            </button>
          ))}
        </div>
      )}

      {active && paper && (
        <section className="rn-surface exam-resume" aria-label="이어 풀기" data-testid="exam-resume">
          <div>
            <strong>풀던 시험이 있어요</strong>
            <p className="rn-caption">
              {active.mode === 'real' ? '실전 모드' : '자유 모드'} · {active.elective} · {activeAnswered}문항 답함
              {activeRemaining != null && ` · 남은 ${formatClock(activeRemaining)}`}
            </p>
          </div>
          <button type="button" className="rn-button rn-button-primary" disabled={busy} onClick={() => onResume(active)}>이어 풀기</button>
        </section>
      )}

      {paper && (
        <section className="exam-setup" aria-label="풀이 설정">
          <h2 className="exam-setup-title">어떻게 풀까요?</h2>
          <div className="exam-option-grid" role="radiogroup" aria-label="모드">
            {MODES.map(m => (
              <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} className={`exam-option${mode === m.value ? ' is-on' : ''}`} onClick={() => setMode(m.value)}>
                <strong>{m.title}</strong>
                <span>{m.value === 'real' ? m.desc.replace('100분', `${paper.timeLimitMinutes}분`) : m.desc}</span>
              </button>
            ))}
          </div>

          <h2 className="exam-setup-title">선택과목</h2>
          <div className="exam-option-grid exam-option-grid-3" role="radiogroup" aria-label="선택과목">
            {paper.electives.map(e => (
              <button key={e} type="button" role="radio" aria-checked={elective === e} className={`exam-option exam-option-small${elective === e ? ' is-on' : ''}`} onClick={() => pickElective(e)}>
                <strong>{ELECTIVE_SHORT[e]}</strong>
                <span>{e}</span>
              </button>
            ))}
          </div>

          {error && <p className="exam-error" role="alert">{error}</p>}
          <button
            type="button"
            className="rn-button rn-button-primary exam-start-button"
            disabled={!elective || busy}
            onClick={() => { if (elective) onStart(paper, mode, elective); }}
            data-testid="exam-start-button"
          >
            {busy ? '준비 중…' : elective ? `${mode === 'real' ? '실전' : '자유'} 모드로 시작하기` : '선택과목을 골라 주세요'}
          </button>
          <p className="rn-caption exam-start-hint">시작하면 화면이 꽉 차게 바뀌어요. 애플펜슬로 문제 위에 바로 풀 수 있어요.</p>
        </section>
      )}

      {past.length > 0 && (
        <section className="exam-past" aria-label="지난 OMR 결과">
          <h2 className="exam-setup-title">지난 OMR 결과</h2>
          <ul>
            {past.map(r => (
              <li key={r.attemptId}>
                <button type="button" className="exam-past-row" onClick={() => onOpenResult(r.attemptId)}>
                  <span><strong>{r.score}점</strong> · 추정 {r.estimatedGrade}등급</span>
                  <span className="rn-caption">{r.mode === 'real' ? '실전' : '자유'} · {ELECTIVE_SHORT[r.elective]} · {formatDate(r.submittedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
