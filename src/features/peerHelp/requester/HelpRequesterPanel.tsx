import { useEffect, useState } from 'react';
import { supabase } from '../../../services/supabase';
import { cancelHelpRequest, requestHelp, type MyHelpRequest } from '../api';
import { HelpSolutionsViewer } from './HelpSolutionsViewer';
import { refreshHelpRequests, useMyHelpRequests } from './useMyHelpRequests';

export interface HelpRequesterPanelProps {
  mistakeId: string;
  imageUrl: string;
  currentUserId: string;
  onPointsChanged?: () => void;
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
  return <section aria-label="서로 도와주기" className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
    <h3 className="font-bold text-slate-100">서로 도와주기</h3>
    {(error || loadError) && <p role="alert" className="text-sm text-rose-300">{error || loadError}</p>}
    {loadError && <button type="button" className="min-h-11 text-sm text-indigo-200" onClick={refreshHelpRequests}>다시 시도</button>}
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {request?.status === 'closed' ? <span className="text-emerald-300">해결됨 👍</span> : request?.status === 'open' ? <>
        <span className="text-indigo-200">도움 요청 중 · 풀이 {request.solution_count}개</span>
        <button type="button" disabled={busy} className="min-h-11 rounded-xl bg-slate-700 px-3" onClick={() => void changeRequest(true)}>요청 취소</button>
      </> : <button type="button" disabled={busy || loading || !!loadError} className="min-h-11 rounded-xl bg-indigo-600 px-4 text-white" onClick={() => void changeRequest(false)}>🙋 도움 요청</button>}
      {!!request?.solution_count && <button type="button" className="min-h-11 rounded-xl bg-slate-700 px-3" onClick={() => setShowSolutions(true)}>풀이 보기 ({request.solution_count})</button>}
    </div>
    <p className="text-xs leading-relaxed text-slate-400">친구에게는 동물 얼굴·칭호·학년만 보여요. 좋아요는 친구에게 30P, 이해 안 돼요는 10P, 피드백을 남기면 나에게 최대 5P! 친구 보상은 하루 3회, 같은 두 사람은 하루 1회, 요청자 보상은 하루 5회까지예요. 가입 3일 미만이거나 오답 5개 미만인 계정은 포인트를 받지 못해요.</p>
    {showSolutions && request && <HelpSolutionsViewer requestId={request.id} imageUrl={imageUrl} onPointsChanged={onPointsChanged}
      onRequestClosed={() => setOverride({ ...request, status: 'closed' })}
      onClose={() => { setShowSolutions(false); setOverride(null); refreshHelpRequests(); }} />}
  </section>;
}
