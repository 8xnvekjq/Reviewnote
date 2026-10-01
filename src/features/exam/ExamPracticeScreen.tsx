// 기출문제 풀이 — 시작(시험지 카드) → 전체화면 풀이(전체 문제 보기·OMR 검토 포함) → OMR 결과.
// 서버 함수는 props 의 client(ExamClient)로만 부른다(실서비스는 examClient.ts, 테스트는 ui/mockExamClient.ts).
import { useState } from 'react';
import type { ExamAttempt, ExamClient, ExamElective, ExamMode, ExamPaperSummary, ExamResult } from './contract';
import { ExamStartView } from './ui/ExamStartView';
import { ExamSolveView } from './ui/ExamSolveView';
import { OmrResultView } from './ui/OmrResultView';
import { ExamHistoryView } from './ui/ExamHistoryView';
import '../../styles/examPractice.css';

type Phase =
  | { kind: 'start'; paperId?: string }
  | { kind: 'history'; paper: ExamPaperSummary }
  | { kind: 'solve'; attempt: ExamAttempt }
  | { kind: 'result'; result: ExamResult; historyPaper?: ExamPaperSummary };

type FullscreenDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

/** 사용자 제스처(클릭) 안에서 동기적으로 불러야 한다. 지원 안 하면 조용히 넘어간다(고정 레이아웃이 화면을 덮음). */
function enterFullscreen() {
  try {
    const el = document.documentElement as FullscreenEl;
    const doc = document as FullscreenDoc;
    if (document.fullscreenElement || doc.webkitFullscreenElement) return;
    if (el.requestFullscreen) void el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    else void el.webkitRequestFullscreen?.();
  } catch { /* 무시 */ }
}

function leaveFullscreen() {
  try {
    const doc = document as FullscreenDoc;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else if (doc.webkitFullscreenElement) void doc.webkitExitFullscreen?.();
  } catch { /* 무시 */ }
}

export function ExamPracticeScreen({ client, currentUserId, onExit }: { client: ExamClient; currentUserId: string; onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'start' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startKey, setStartKey] = useState(0);

  const backToStart = () => {
    leaveFullscreen();
    setError(null);
    setPhase({ kind: 'start' });
    setStartKey(k => k + 1); // 이어 풀기·지난 결과 목록 새로 읽기
  };

  const start = async (paper: ExamPaperSummary, mode: ExamMode, elective: ExamElective | null) => {
    enterFullscreen();
    setBusy(true);
    setError(null);
    try {
      const attempt = await client.startAttempt(paper.id, mode, elective);
      setPhase({ kind: 'solve', attempt });
    } catch (e) {
      leaveFullscreen();
      setError(e instanceof Error ? e.message : '시험을 시작하지 못했어요. 잠시 뒤 다시 해 볼까요?');
    } finally {
      setBusy(false);
    }
  };

  const resume = (attempt: ExamAttempt) => {
    enterFullscreen();
    setPhase({ kind: 'solve', attempt });
  };

  const openResult = async (attemptId: string) => {
    setBusy(true);
    setError(null);
    try {
      setPhase({ kind: 'result', result: await client.getResult(attemptId), historyPaper: phase.kind === 'history' ? phase.paper : undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : '결과를 불러오지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  const continueHistory = async (paper: ExamPaperSummary, inProgress: boolean) => {
    if (!inProgress) {
      setError(null);
      setPhase({ kind: 'start', paperId: paper.id });
      setStartKey(k => k + 1);
      return;
    }
    enterFullscreen();
    setBusy(true);
    setError(null);
    try {
      const attempt = await client.getActiveAttempt(paper.id);
      if (attempt) setPhase({ kind: 'solve', attempt });
      else { leaveFullscreen(); setPhase({ kind: 'start', paperId: paper.id }); setStartKey(k => k + 1); }
    } catch (e) {
      leaveFullscreen();
      setError(e instanceof Error ? e.message : '풀던 시험을 불러오지 못했어요.');
    } finally { setBusy(false); }
  };

  return (
    <div className="exam-practice" data-testid="exam-practice">
      {phase.kind === 'start' && (
        <ExamStartView
          key={startKey}
          client={client}
          currentUserId={currentUserId}
          busy={busy}
          error={error}
          onStart={(paper, mode, elective) => { void start(paper, mode, elective); }}
          onResume={resume}
          onOpenResult={id => { void openResult(id); }}
          onOpenHistory={paper => { setError(null); setPhase({ kind: 'history', paper }); }}
          initialPaperId={phase.paperId}
          onExit={onExit}
        />
      )}
      {phase.kind === 'history' && (
        <ExamHistoryView client={client} paper={phase.paper} busy={busy} error={error}
          onBack={backToStart} onContinue={active => { void continueHistory(phase.paper, active); }}
          onOpenResult={id => { void openResult(id); }} />
      )}
      {phase.kind === 'solve' && (
        <ExamSolveView
          key={phase.attempt.id}
          client={client}
          attempt={phase.attempt}
          onExit={backToStart}
          onSubmitted={result => { leaveFullscreen(); setPhase({ kind: 'result', result }); }}
        />
      )}
      {phase.kind === 'result' && (
        <OmrResultView key={phase.result.attemptId} client={client} result={phase.result}
          backLabel={phase.historyPaper ? '← 풀이 기록' : undefined}
          onBack={() => { if (phase.historyPaper) { setError(null); setPhase({ kind: 'history', paper: phase.historyPaper }); } else backToStart(); }} />
      )}
    </div>
  );
}

export default ExamPracticeScreen;
