import { useEffect, useMemo, useRef, useState } from 'react';
import type { PeerSolution } from '../contract';
import { ExamInkReplay } from '../ink/ExamInkReplay';
import { peerSolutionLabel, type PeerSolutionSession } from './peerSolution';

interface Props {
  session: PeerSolutionSession;
  attemptId: string;
  questionId: string;
  imageUrl: string;
  onShowing: (showing: boolean) => void;
}

export function PeerSolutionView({ session, attemptId, questionId, imageUrl, onShowing }: Props) {
  const [solution, setSolution] = useState<PeerSolution | null | undefined>();
  const [showing, setShowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const replayClient = useMemo(() => ({
    getInkReplay: () => session.replay(questionId, solution!.solutionKey),
  }), [session, questionId, solution]);
  const toggle = async () => {
    if (loading) return;
    if (showing) { setShowing(false); onShowing(false); return; }
    setFailed(false);
    setLoading(true);
    try {
      const value = solution ?? await session.get(questionId);
      if (!alive.current) return;
      setSolution(value);
      if (value) { setShowing(true); onShowing(true); }
    } catch { if (alive.current) setFailed(true); }
    finally { if (alive.current) setLoading(false); }
  };

  return <section className="exam-peer" aria-label="다른 학생의 풀이">
    <button type="button" className="rn-button rn-button-primary" data-testid="exam-peer-toggle"
      disabled={loading || solution === null} aria-pressed={showing} onClick={() => { void toggle(); }}>
      {loading ? '풀이를 불러오는 중…' : showing ? '내 풀이로 돌아가기' : '다른 학생의 풀이 보기'}
    </button>
    {solution === null && <p className="rn-caption" role="status">아직 이 문제를 맞힌 다른 풀이가 없어요</p>}
    {failed && <p className="rn-caption" role="status">풀이를 불러오지 못했어요. 다시 눌러 주세요.</p>}
    {showing && solution && <div data-testid="exam-peer-solution">
      <div className="exam-peer-head">
        <p className="exam-peer-label" data-testid="exam-peer-label">{peerSolutionLabel(solution.label)}</p>
        <p className="rn-caption">다른 풀이 · 읽기 전용</p>
      </div>
      <ExamInkReplay client={replayClient} attemptId={attemptId} questionId={questionId}
        imageUrl={imageUrl} strokes={solution.strokes} imageMaxWidth={480} persistDock={false} />
    </div>}
  </section>;
}
