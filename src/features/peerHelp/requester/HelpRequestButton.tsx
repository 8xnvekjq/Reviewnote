import { useEffect, useState } from 'react';
import { supabase } from '../../../services/supabase';
import { cancelHelpRequest, requestHelp, type MyHelpRequest } from '../api';
import { HelpSolutionsViewer } from './HelpSolutionsViewer';
import { refreshHelpRequests, useMyHelpRequests } from './useMyHelpRequests';

// 오답 상세의 문제 사진 바로 아래, ✎ 풀이노트 옆 버튼 하나. 상태에 따라 글자가 바뀐다.
//   요청 전 → 🙋 도움 요청 / 요청 중(풀이 없음) → 🙋 요청 중(누르면 취소 확인)
//   풀이 있음 → 🆕(새 풀이) 또는 🙋/👍 풀이 보기 (N) → 친구 풀이 리플레이·피드백
export interface HelpRequestButtonProps {
  mistakeId: string;
  imageUrl: string;
  currentUserId: string;
  onPointsChanged?: () => void;
}

export function helpButtonLabel(request: MyHelpRequest | undefined): string {
  if (!request || request.status === 'cancelled' && !request.solution_count) return '🙋 도움 요청';
  if (request.solution_count > 0) return `${request.unseen_count ? '🆕' : request.status === 'closed' ? '👍' : '🙋'} 풀이 보기 (${request.solution_count})`;
  return '🙋 요청 중';
}

export function HelpRequestButton({ mistakeId, imageUrl, currentUserId, onPointsChanged }: HelpRequestButtonProps) {
  const { requests, loading, error: loadError } = useMyHelpRequests(currentUserId);
  const [override, setOverride] = useState<MyHelpRequest | null>(null);
  useEffect(() => {
    if (override && requests[mistakeId]?.status === override.status) setOverride(null);
  }, [requests, mistakeId, override]);
  const request = override ?? requests[mistakeId];
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);

  const onClick = async () => {
    if (busy) return;
    if (request?.solution_count) { setViewing(true); return; }
    setBusy(true);
    try {
      if (request?.status === 'open') {
        if (!window.confirm('도움 요청을 취소할까요?')) return;
        await cancelHelpRequest(supabase, request.id);
        setOverride({ ...request, status: 'cancelled' });
      } else {
        const result = await requestHelp(supabase, mistakeId);
        setOverride({ ...result, mistake_id: mistakeId, created_at: new Date().toISOString(), unseen_count: 0 });
      }
      refreshHelpRequests();
    } catch (reason) { window.alert((reason as Error).message); }
    finally { setBusy(false); }
  };

  const label = helpButtonLabel(request);
  return (
    <>
      <button type="button" data-testid="help-request-button" disabled={busy || loading || !!loadError}
        aria-label={label.replace(/^\S+\s/, '')} title={loadError || undefined}
        className={`rn-button ${request?.unseen_count ? 'rn-button-primary' : 'rn-button-secondary'}`} onClick={() => void onClick()}>
        {label}
      </button>
      {viewing && request && (
        <HelpSolutionsViewer requestId={request.id} imageUrl={imageUrl} onPointsChanged={onPointsChanged}
          onRequestClosed={() => setOverride({ ...request, status: 'closed' })}
          onClose={() => { setViewing(false); setOverride(null); refreshHelpRequests(); }} />
      )}
    </>
  );
}
