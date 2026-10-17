import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../services/supabase';
import { HELP_REWARD, listHelpRequests, myHelpGiven, type GivenHelp, type OpenHelpRequest } from '../api';
import { HelpLabel } from './HelpLabel';
import { HelpSolveScreen } from './HelpSolveScreen';
import { helpFeedbackText, helpRewardText } from './presentation';
import { MySolutionViewer } from './MySolutionViewer';
import { MyHelpRequestsSection } from '../requester/MyHelpRequestsSection';
import { useMyHelpRequests } from '../requester/useMyHelpRequests';

export interface HelpTabProps { userId: string; onPointsChanged?: () => void }

export function HelpTab({ userId, onPointsChanged }: HelpTabProps) {
  const [requests, setRequests] = useState<OpenHelpRequest[]>([]);
  // 내 질문에 새 풀이가 왔으면 '내가 도움 요청한 문제'를 맨 위에(로그인 알림에서 이리로 온다).
  const { requests: myRequests } = useMyHelpRequests(userId);
  const hasArrivals = Object.values(myRequests).some(request => request.unseen_count > 0);
  const [given, setGiven] = useState<GivenHelp[]>([]);
  const [selected, setSelected] = useState<OpenHelpRequest | null>(null);
  const [viewing, setViewing] = useState<GivenHelp | null>(null);
  const [replacing, setReplacing] = useState<GivenHelp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const lastRewards = useRef<number | null>(null);
  const pointsCallback = useRef(onPointsChanged);
  pointsCallback.current = onPointsChanged;
  useEffect(() => { lastRewards.current = null; setSelected(null); setViewing(null); setReplacing(null); setRequests([]); setGiven([]); }, [userId]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    Promise.all([listHelpRequests(supabase), myHelpGiven(supabase)]).then(([open, sent]) => {
      if (!active) return;
      setRequests(open); setGiven(sent);
      // 포인트나 지식의 조각 보상이 새로 생겼으면 잔액을 서버 값으로 다시 맞춘다.
      const rewards = sent.reduce((sum, row) => sum + row.reward + (row.shards ?? 0) * 1000, 0);
      if (lastRewards.current !== null && lastRewards.current !== rewards) pointsCallback.current?.();
      lastRewards.current = rewards;
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : '목록을 불러오지 못했어요.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, revision]);
  return <main className="mx-auto max-w-6xl space-y-6 p-4 pb-28 text-slate-100">
    <header className="flex items-center justify-between gap-3"><h1 className="text-xl font-bold">🙋 서로 도와주기</h1><button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)} className="rounded bg-slate-700 px-3 py-3 disabled:opacity-40">새로고침</button></header>
    <p className="text-sm text-slate-300">친구 문제를 풀어 주세요. 도움 됐어요 = 지식의 조각 +{HELP_REWARD.likeShards}개 + {HELP_REWARD.likePoints}P · 이해 못 했어요 = +{HELP_REWARD.unclear}P</p>
    {message && <p role="status" className="rounded bg-emerald-950 p-3 text-emerald-200">{message}</p>}
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    {loading ? <p role="status">문제를 불러오는 중…</p> : <>
      {hasArrivals && <MyHelpRequestsSection userId={userId} onPointsChanged={onPointsChanged} />}
      <section aria-label="도움이 필요한 문제" className="space-y-3"><h2 className="font-bold">도움이 필요한 문제</h2>
        {!requests.length && !error && <p className="text-slate-400">지금은 도움이 필요한 문제가 없어요. 잠시 후 다시 와 주세요!</p>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{requests.map(request => <button type="button" key={request.id} disabled={request.mine_submitted} onClick={() => { setMessage(''); setSelected(request); }} className="min-w-0 space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3 text-left disabled:opacity-60">
          <img src={request.image_url} alt="도움이 필요한 문제" loading="lazy" className="h-36 w-full rounded bg-white object-contain" />
          <HelpLabel label={request.requester} /><p className="break-words text-sm">{[request.chapter, request.grade].filter(Boolean).join(' · ') || '단원 정보 없음'}</p>
          <p className="text-sm text-indigo-300">풀이 {request.solution_count}개 {request.mine_submitted && <span className="ml-2 rounded bg-slate-700 px-2 py-1">내가 보냈어요</span>}</p>
        </button>)}</div>
      </section>
      {!hasArrivals && <MyHelpRequestsSection userId={userId} onPointsChanged={onPointsChanged} />}
      <section aria-label="내가 보낸 풀이" className="space-y-3"><h2 className="font-bold">내가 보낸 풀이</h2>
        {!given.length && !error && <p className="text-slate-400">아직 보낸 풀이가 없어요. 친구의 첫 도우미가 되어 주세요!</p>}
        <div className="grid gap-3 md:grid-cols-2">{given.map(row => <article key={row.id} className="flex min-w-0 gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
          {row.image_url && <img src={row.image_url} alt="보낸 풀이의 문제" loading="lazy" className="h-24 w-24 shrink-0 rounded bg-white object-contain" />}
          <div className="min-w-0 flex-1 space-y-1"><HelpLabel label={row.requester} /><p>{helpFeedbackText(row.feedback)}</p><p className="text-sm text-emerald-300">{helpRewardText(row.feedback, row.reward, row.shards)}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {row.storage_path && row.file_available !== false && <button type="button" onClick={() => { setMessage(''); setViewing(row); }} className="min-h-11 rounded-lg bg-slate-700 px-3 text-sm">내 풀이 보기</button>}
              {row.can_resubmit && <button type="button" onClick={() => { setMessage(''); setReplacing(row); }} className="min-h-11 rounded-lg bg-indigo-700 px-3 text-sm">다시 보내기</button>}
            </div>
          </div>
        </article>)}</div>
      </section>
    </>}
    {viewing && <MySolutionViewer key={viewing.id} row={viewing} onClose={() => setViewing(null)} onResubmit={() => { setReplacing(viewing); setViewing(null); }} />}
    {replacing && replacing.image_url && <HelpSolveScreen key={`${userId}:replace:${replacing.id}`} replaceSolutionId={replacing.id}
      request={{ id: replacing.request_id, image_url: replacing.image_url, requester: replacing.requester }} userId={userId}
      onClose={() => setReplacing(null)} onSent={() => { setReplacing(null); setMessage('풀이를 바꿨어요! 친구에게 새 풀이로 다시 알려 줄게요.'); setRevision(value => value + 1); }} />}
    {selected && <HelpSolveScreen key={`${userId}:${selected.id}`} request={selected} userId={userId} onClose={() => setSelected(null)} onSent={() => { setSelected(null); setMessage(`보냈어요! 친구가 ‘도움 됐어요’를 누르면 지식의 조각 +${HELP_REWARD.likeShards}개 + ${HELP_REWARD.likePoints}P`); setRevision(value => value + 1); }} />}
  </main>;
}
