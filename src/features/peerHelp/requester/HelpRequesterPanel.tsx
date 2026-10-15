import { useEffect, useState } from 'react';
import { supabase } from '../../../services/supabase';
import { cancelHelpRequest, requestHelp, type MyHelpRequest } from '../api';
import { HelpSolutionsViewer } from './HelpSolutionsViewer';
import { refreshHelpRequests, useMyHelpRequests } from './useMyHelpRequests';

// 오답 상세의 '🙋 서로 도와주기' 칸(나의 학습 기록 바로 아래). 오답 상세의 다른 칸과 같은 모양·테마 토큰을 쓴다.
export interface HelpRequesterPanelProps {
  mistakeId: string;
  imageUrl: string;
  currentUserId: string;
  onPointsChanged?: () => void;
}

function statusText(request: MyHelpRequest | undefined): string {
  if (!request || request.status === 'cancelled') return '친구들에게 익명으로 풀이를 부탁할 수 있어요.';
  if (request.status === 'closed') return '해결됨 👍';
  if (request.unseen_count > 0) return `🆕 풀이 ${request.unseen_count}개 도착`;
  return request.solution_count ? `도움 요청 중 · 풀이 ${request.solution_count}개` : '도움 요청 중 · 친구의 풀이를 기다리고 있어요';
}

export function HelpRequesterPanel({ mistakeId, imageUrl, currentUserId, onPointsChanged }: HelpRequesterPanelProps) {
  const { requests, error: loadError, loading } = useMyHelpRequests(currentUserId);
  const [override, setOverride] = useState<MyHelpRequest | null>(null);
  useEffect(() => {
    if (override && requests[mistakeId]?.status === override.status) setOverride(null);
  }, [requests, mistakeId, override]);
  const request = override ?? requests[mistakeId];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSolutions, setShowSolutions] = useState(false);
  const changeRequest = async (cancel: boolean) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (cancel && request) {
        await cancelHelpRequest(supabase, request.id);
        setOverride({ ...request, status: 'cancelled' });
      } else {
        const result = await requestHelp(supabase, mistakeId);
        setOverride({ ...result, mistake_id: mistakeId, created_at: new Date().toISOString(), unseen_count: 0 });
      }
      refreshHelpRequests();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const open = request?.status === 'open';
  const canRequest = !request || request.status === 'cancelled';
  return (
    <div className="space-y-2" data-testid="help-requester-panel">
      <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-wide px-1">🙋 서로 도와주기</h4>
      <section aria-label="서로 도와주기" className="rn-detail-section rn-help-panel">
        <p className={`rn-help-status${request?.unseen_count ? ' is-new' : ''}`}>{statusText(request)}</p>
        <div className="rn-help-actions">
          {!!request?.solution_count && (
            <button type="button" className="rn-button rn-button-primary rn-button-compact" onClick={() => setShowSolutions(true)}>풀이 보기 ({request.solution_count})</button>
          )}
          {open && <button type="button" disabled={busy} className="rn-button rn-button-ghost rn-button-compact" onClick={() => void changeRequest(true)}>요청 취소</button>}
          {canRequest && (
            <button type="button" disabled={busy || loading || !!loadError} className="rn-button rn-button-secondary rn-button-compact" onClick={() => void changeRequest(false)}>🙋 도움 요청</button>
          )}
        </div>
        {(error || loadError) && (
          <p role="alert" className="rn-help-error">
            {error || loadError}
            {loadError && <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={refreshHelpRequests}>다시 시도</button>}
          </p>
        )}
      </section>
      {showSolutions && request && <HelpSolutionsViewer requestId={request.id} imageUrl={imageUrl} onPointsChanged={onPointsChanged}
        onRequestClosed={() => setOverride({ ...request, status: 'closed' })}
        onClose={() => { setShowSolutions(false); setOverride(null); refreshHelpRequests(); }} />}
    </div>
  );
}
