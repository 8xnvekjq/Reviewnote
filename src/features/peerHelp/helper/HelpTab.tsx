import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../services/supabase';
import { HELP_REWARD, listHelpRequests, myHelpGiven, type GivenHelp, type OpenHelpRequest } from '../api';
import { HelpLabel } from './HelpLabel';
import { HelpSolveScreen } from './HelpSolveScreen';
import { helpFeedbackText, helpRewardText } from './presentation';
import { MyHelpRequestsSection } from '../requester/MyHelpRequestsSection';

export interface HelpTabProps { userId: string; onPointsChanged?: () => void }

export function HelpTab({ userId, onPointsChanged }: HelpTabProps) {
  const [requests, setRequests] = useState<OpenHelpRequest[]>([]);
  const [given, setGiven] = useState<GivenHelp[]>([]);
  const [selected, setSelected] = useState<OpenHelpRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const lastRewards = useRef<number | null>(null);
  const pointsCallback = useRef(onPointsChanged);
  pointsCallback.current = onPointsChanged;
  useEffect(() => { lastRewards.current = null; setSelected(null); setRequests([]); setGiven([]); }, [userId]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    Promise.all([listHelpRequests(supabase), myHelpGiven(supabase)]).then(([open, sent]) => {
      if (!active) return;
      setRequests(open); setGiven(sent);
      const rewards = sent.reduce((sum, row) => sum + row.reward, 0);
      if (lastRewards.current !== null && lastRewards.current !== rewards) pointsCallback.current?.();
      lastRewards.current = rewards;
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : '목록을 불러오지 못했어요.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, revision]);
  return <main className="mx-auto max-w-6xl space-y-6 p-4 pb-28 text-slate-100">
    <header className="flex items-center justify-between gap-3"><h1 className="text-xl font-bold">🙋 서로 도와주기</h1><button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)} className="rounded bg-slate-700 px-3 py-3 disabled:opacity-40">새로고침</button></header>
    <p className="text-sm text-slate-300">친구 문제를 풀어 주세요. 좋아요 +{HELP_REWARD.like}P · 이해 안 돼요 +{HELP_REWARD.unclear}P · 피드백을 남긴 친구 +{HELP_REWARD.requester}P</p>
    <details className="text-xs text-slate-400"><summary className="cursor-pointer py-2">포인트 지급 기준</summary><p>도와준 학생은 하루 3회, 같은 친구와는 하루 1회까지 보상받아요. 요청자는 하루 5회까지 받아요. 가입 3일 미만이거나 오답이 5개 미만인 계정은 포인트를 받지 못해요. 좋아요를 받으면 요청이 마감돼요.</p></details>
    {message && <p role="status" className="rounded bg-emerald-950 p-3 text-emerald-200">{message}</p>}
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    {loading ? <p role="status">문제를 불러오는 중…</p> : <>
      <section aria-label="도움이 필요한 문제" className="space-y-3"><h2 className="font-bold">도움이 필요한 문제</h2>
        {!requests.length && !error && <p className="text-slate-400">지금은 도움이 필요한 문제가 없어요. 잠시 후 다시 와 주세요!</p>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{requests.map(request => <button type="button" key={request.id} disabled={request.mine_submitted} onClick={() => { setMessage(''); setSelected(request); }} className="min-w-0 space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3 text-left disabled:opacity-60">
          <img src={request.image_url} alt="도움이 필요한 문제" loading="lazy" className="h-36 w-full rounded bg-white object-contain" />
          <HelpLabel label={request.requester} /><p className="break-words text-sm">{[request.chapter, request.grade].filter(Boolean).join(' · ') || '단원 정보 없음'}</p>
          <p className="text-sm text-indigo-300">풀이 {request.solution_count}개 {request.mine_submitted && <span className="ml-2 rounded bg-slate-700 px-2 py-1">내가 보냈어요</span>}</p>
        </button>)}</div>
      </section>
      <MyHelpRequestsSection userId={userId} onPointsChanged={onPointsChanged} />
      <section aria-label="내가 보낸 풀이" className="space-y-3"><h2 className="font-bold">내가 보낸 풀이</h2>
        {!given.length && !error && <p className="text-slate-400">아직 보낸 풀이가 없어요. 친구의 첫 도우미가 되어 주세요!</p>}
        <div className="grid gap-3 md:grid-cols-2">{given.map(row => <article key={row.id} className="flex min-w-0 gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
          {row.image_url && <img src={row.image_url} alt="보낸 풀이의 문제" loading="lazy" className="h-24 w-24 shrink-0 rounded bg-white object-contain" />}
          <div className="min-w-0 space-y-1"><HelpLabel label={row.requester} /><p>{helpFeedbackText(row.feedback)}</p><p className="text-sm text-emerald-300">{helpRewardText(row.feedback, row.reward)}</p></div>
        </article>)}</div>
      </section>
    </>}
    {selected && <HelpSolveScreen key={`${userId}:${selected.id}`} request={selected} userId={userId} onClose={() => setSelected(null)} onSent={() => { setSelected(null); setMessage(`보냈어요! 친구가 보고 👍를 누르면 +${HELP_REWARD.like}P`); setRevision(value => value + 1); }} />}
  </main>;
}
