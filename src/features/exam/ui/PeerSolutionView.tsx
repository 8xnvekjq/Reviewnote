import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PeerSolution } from '../contract';
import { ExamInkReplay } from '../ink/ExamInkReplay';
import { peerSolutionLabel, type PeerSolutionSession } from './peerSolution';

interface Props {
  session: PeerSolutionSession | null;
  /** 내가 틀린 문항(제출 완료, 한능검 아님)일 때만 다른 학생 풀이를 쓸 수 있다. */
  eligible: boolean;
  attemptId: string;
  questionId: string;
  imageUrl: string;
  /** 내 풀이(덧쓰기). peerButton은 그 툴바의 '원래 풀이로' 바로 오른쪽에 넣는 작은 버튼. */
  children: (peerButton: ReactNode) => ReactNode;
}

/**
 * 크게 보기 안에서 "내 풀이 ↔ 다른 학생 풀이"를 바꾼다. 큰 버튼 대신 툴바의 작은 버튼으로 —
 * 내 풀이 툴바에는 '다른 학생 풀이', 다른 풀이 머리 줄에는 '내 풀이로'가 같은 자리에 온다.
 * 내 풀이는 숨겨만 두어(언마운트하지 않음) 덧쓰기·실행 취소 상태를 그대로 지킨다.
 */
export function PeerSolutionSwitch({ session, eligible, attemptId, questionId, imageUrl, children }: Props) {
  const [solution, setSolution] = useState<PeerSolution | null | undefined>();
  const [showing, setShowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const replayClient = useMemo(() => ({
    getInkReplay: () => session!.replay(questionId, solution!.solutionKey),
  }), [session, questionId, solution]);
  if (!session || !eligible) return <>{children(null)}</>;

  const toggle = async () => {
    if (loading) return;
    if (showing) { setShowing(false); return; }
    setFailed(false);
    setLoading(true);
    try {
      const value = solution ?? await session.get(questionId);
      if (!alive.current) return;
      setSolution(value);
      if (value) setShowing(true);
    } catch { if (alive.current) setFailed(true); }
    finally { if (alive.current) setLoading(false); }
  };

  const none = solution === null;
  const peerButton = <button type="button" className="exam-tool exam-tool-text exam-peer-toggle" data-testid="exam-peer-toggle"
    disabled={loading || none} aria-pressed={false} title={none ? '아직 이 문제를 맞힌 다른 풀이가 없어요' : '같은 문제를 맞힌 다른 학생의 풀이(익명)'}
    onClick={() => { void toggle(); }}>
    {loading ? '불러오는 중…' : none ? '다른 풀이 없음' : failed ? '다시 시도' : '다른 학생 풀이'}
  </button>;

  return <>
    {none && <p className="exam-peer-note" role="status">아직 이 문제를 맞힌 다른 풀이가 없어요</p>}
    {failed && <p className="exam-peer-note" role="status">풀이를 불러오지 못했어요. 다시 눌러 주세요.</p>}
    {showing && solution && <section className="exam-peer" aria-label="다른 학생의 풀이" data-testid="exam-peer-solution">
      <div className="exam-peer-head">
        <p className="exam-peer-label" data-testid="exam-peer-label">{peerSolutionLabel(solution.label)}</p>
        <span className="exam-peer-caption">다른 풀이 · 읽기 전용</span>
        <button type="button" className="exam-tool exam-tool-text exam-peer-toggle" data-testid="exam-peer-toggle"
          aria-pressed onClick={() => { void toggle(); }}>내 풀이로</button>
      </div>
      {/* 내 풀이처럼 열자마자 필기 순서를 재생한다. */}
      <ExamInkReplay client={replayClient} attemptId={attemptId} questionId={questionId}
        imageUrl={imageUrl} strokes={solution.strokes} imageMaxWidth={480} persistDock={false} autoOpen />
    </section>}
    {/* 다른 풀이를 보는 동안 내 풀이 툴바의 버튼은 빼 둔다(같은 자리의 '내 풀이로'와 겹치지 않게). */}
    <div hidden={showing}>{children(showing ? null : peerButton)}</div>
  </>;
}
