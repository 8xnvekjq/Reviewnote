import { useMemo, useState } from 'react';
import { supabase } from '../../../services/supabase';
import { cancelHelpRequest, type MyHelpRequest } from '../api';
import { HelpSolutionsViewer } from './HelpSolutionsViewer';
import { refreshHelpRequests, useMyHelpRequests } from './useMyHelpRequests';

// 서로 도와주기 탭의 '내가 도움 요청한 문제': 요청 상태·도착한 풀이를 한곳에서 보고, 풀이 보기(리플레이·👍/🤔)와 요청 취소.
function statusText(request: MyHelpRequest) {
  if (request.status === 'closed') return '해결됨 👍';
  if (request.status === 'cancelled') return '요청 취소함';
  if (!request.solution_count) return '도움 요청 중 · 아직 풀이가 없어요';
  return `도움 요청 중 · 풀이 ${request.solution_count}개${request.unseen_count ? ` (새 풀이 ${request.unseen_count}개)` : ''}`;
}

export function MyHelpRequestsSection({ userId, onPointsChanged }: { userId: string; onPointsChanged?: () => void }) {
  const { requests, error, loading } = useMyHelpRequests(userId);
  const rows = useMemo(() => Object.values(requests).sort((a, b) => b.created_at.localeCompare(a.created_at)), [requests]);
  const [viewing, setViewing] = useState<MyHelpRequest | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const cancel = async (request: MyHelpRequest) => {
    if (!window.confirm('이 문제의 도움 요청을 취소할까요? 이미 온 풀이는 계속 볼 수 있어요.')) return;
    setBusy(request.id); setActionError('');
    try { await cancelHelpRequest(supabase, request.id); refreshHelpRequests(); }
    catch (err) { setActionError(err instanceof Error ? err.message : '요청을 취소하지 못했어요.'); }
    finally { setBusy(null); }
  };

  return (
    <section aria-label="내가 도움 요청한 문제" className="space-y-3" data-testid="my-help-requests">
      <h2 className="font-bold">내가 도움 요청한 문제</h2>
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      {actionError && <p role="alert" className="text-rose-300">{actionError}</p>}
      {loading && !rows.length ? <p role="status" className="text-slate-400">불러오는 중…</p>
        : !rows.length && !error ? <p className="text-slate-400">아직 도움 요청한 문제가 없어요. 오답노트 문제에서 ‘🙋 도움 요청’을 눌러 보세요.</p>
          : (
            <div className="grid gap-3 md:grid-cols-2">
              {rows.map(request => (
                <article key={request.id} className="flex min-w-0 gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3" data-status={request.status}>
                  {request.image_url && <img src={request.image_url} alt="도움 요청한 문제" loading="lazy" className="h-24 w-24 shrink-0 rounded bg-white object-contain" />}
                  <div className="min-w-0 flex-1 space-y-2">
                    {request.title && <p className="line-clamp-2 break-words text-sm font-bold text-slate-100">{request.title}</p>}
                    <p className={`text-sm ${request.unseen_count ? 'text-amber-300' : 'text-slate-300'}`}>{statusText(request)}</p>
                    <div className="flex flex-wrap gap-2">
                      {request.solution_count > 0 && (
                        <button type="button" onClick={() => setViewing(request)} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white">
                          풀이 보기 ({request.solution_count})
                        </button>
                      )}
                      {request.status === 'open' && (
                        <button type="button" disabled={busy === request.id} onClick={() => void cancel(request)} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-200 disabled:opacity-50">
                          요청 취소
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
      {viewing && (
        <HelpSolutionsViewer key={viewing.id} requestId={viewing.id} imageUrl={viewing.image_url ?? ''}
          onClose={() => { setViewing(null); refreshHelpRequests(); }}
          onPointsChanged={onPointsChanged} onRequestClosed={() => refreshHelpRequests()} />
      )}
    </section>
  );
}
