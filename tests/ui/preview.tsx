// Local component integration fixture. Not imported by the production app/build.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/styles/design-system.css';
import { AppShell } from '../../src/app/AppShell';
import { Screen } from '../../src/app/ScreenRouter';
import { Header } from '../../src/components/Header';
import { BottomNavigation } from '../../src/components/BottomNavigation';
import { MistakeList } from '../../src/components/MistakeList';
import { MistakeDetailModal } from '../../src/components/MistakeDetailModal';
import { GachaStore } from '../../src/components/GachaStore';
import { CustomNoticeModal } from '../../src/components/CustomNoticeModal';
import { LazyScreenBoundary } from '../../src/app/LazyScreenBoundary';
import type { ActiveTab, MistakeEntry } from '../../src/types';

// Intercept external HTTP requests in this fixture, including storage.
// Automated runners also block realtime. No credentials or student account are used.
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (url.origin === location.origin || url.protocol === 'data:') return nativeFetch(input, init);
  const profile = { last_free_draw_date: null, last_free_weekly_draw_date: '0', has_seen_synthesis_notice: true };
  return new Response(JSON.stringify(url.pathname.endsWith('/profiles') ? profile : []), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const Never = React.lazy(() => new Promise<never>(() => {}));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="360"><rect width="700" height="360" fill="#faf9f5"/><text x="40" y="65" font-size="22" fill="#293145" font-family="sans-serif">이차방정식의 두 근과 계수의 관계</text><text x="40" y="130" font-size="22" fill="#293145">x² − 5x + 6 = 0</text><text x="40" y="184" font-size="18" fill="#536079" font-family="sans-serif">두 근을 α, β라 할 때, α² + β²의 값을 구하시오.</text><path d="M420 265h200M520 195v120M450 240q70 110 140-20" stroke="#7a88a8" fill="none" stroke-width="2"/></svg>`;
const base: MistakeEntry = { id: 'ui-sample-1', userId: 'ui-student', title: '두 근의 관계로 식의 값을 구해볼까?', imageUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, date: '2026-09-09T09:00:00Z', grade: '공통수학1', chapter: '이차방정식', reviews: ['', '', ''], userActionPlan: '식을 전개하기 전에 근과 계수의 관계를 먼저 확인하기', analysis: { solvingProcess: '### 1단계: 조건 확인\n두 근의 합과 곱을 이용해 식을 변형합니다.\n### 2단계: 계산\n$(α+β)^2-2αβ$를 계산합니다.', finalAnswer: '13', solutionChecklist: { items: [ { id: 'fixed-1', text: '주어진 조건과 구해야 할 것을 구분했나요?', source: 'fixed', status: 'unanswered' }, { id: 'fixed-2', text: '근과 계수의 관계를 떠올렸나요?', source: 'fixed', status: 'unanswered' }, { id: 'ai-0', text: '긴 문장과 수식이 함께 있어도 조건을 빠뜨리지 않고 식으로 바꾸어 확인했나요?', source: 'ai', status: 'unanswered' } ] } } };
export function Preview() {
  const params = new URLSearchParams(location.search);
  const [tab, setTab] = useState<ActiveTab>((params.get('tab') as ActiveTab) || 'notes');
  const [entries, setEntries] = useState<MistakeEntry[]>(params.has('empty') ? [] : [base, { ...base, id: 'ui-sample-2', title: '아주 긴 문제 제목: 이차방정식과 함수의 그래프를 연결하고 여러 조건을 함께 확인하는 연습', reviews: ['O', 'X', 'star'] }, { ...base, id: 'ui-sample-3', chapter: '여러 가지 방정식', reviews: ['O', 'O', 'O'] }]);
  const [selectedId, setSelectedId] = useState<string | null>(params.has('detail') ? base.id : null);
  const [notice, setNotice] = useState(false);
  const selected = entries.find(e => e.id === selectedId);
  const update = (entry: MistakeEntry) => setEntries(items => items.map(e => e.id === entry.id ? entry : e));
  return <div className="rn-app flex flex-col bg-app-main text-slate-100">
    <AppShell header={<Header currentUser="테스트 학생" nickname="수학을조금씩더알아가는긴닉네임" myScore={128} streakDays={7} equippedTitle="수학의 연금술사" weeklyMedals={{ gold: 3, silver: 2, bronze: 1 }} onLogout={() => setNotice(true)} onOpenStore={() => setTab('store')} />}
      bottomNav={<BottomNavigation activeTab={tab} setActiveTab={setTab} onlineUsers={[]} dailyReviewCount={2} onStartReviewSession={() => setSelectedId(entries[0]?.id || null)} onOpenSlideList={() => setNotice(true)} />}>
      {params.has('loading') ? <LazyScreenBoundary><Never /></LazyScreenBoundary> : <>
        <Screen when={tab === 'notes' || tab === 'completed'}><MistakeList mistakes={entries} onSelectEntry={e => setSelectedId(e.id)} onDeleteMistake={(id, event) => { event.stopPropagation(); setEntries(es => es.filter(e => e.id !== id)); }} onAddClick={() => setNotice(true)} currentUserId="ui-student" onToggleHidden={(id, hidden) => setEntries(es => es.map(e => e.id === id ? { ...e, isHidden: hidden } : e))} viewMode={tab === 'completed' ? 'list' : 'card'} /></Screen>
        <Screen when={tab === 'store'}><GachaStore userId="ui-student" userPoints={128} equippedItems={{}} onDeductPoints={() => {}} onEquipItem={() => {}} /></Screen>
        <Screen when={!['notes', 'completed', 'store'].includes(tab)}><div className="rn-empty"><h2 className="rn-title">{tab}</h2><p className="rn-caption">보조 메뉴의 이동 확인용 화면</p></div></Screen>
      </>}
    </AppShell>
    {selected && <MistakeDetailModal selectedEntry={selected} allEntries={entries} isAnalyzing={false} currentUserId="ui-student" onClose={() => setSelectedId(null)} onDeleteMistake={() => {}} onStartAnalysis={() => {}} onUpdateReviews={(id, reviews) => update({ ...entries.find(e => e.id === id)!, reviews })} onUpdateCheckpointStatus={() => {}} onSetChecklistItemStatus={(id, itemId, status) => { const e = entries.find(e => e.id === id)!; update({ ...e, analysis: { ...e.analysis!, solutionChecklist: { items: e.analysis!.solutionChecklist!.items.map(item => item.id === itemId ? { ...item, status } : item) } } }); }} onDeleteAnswerImage={() => {}} onUpdateEntry={update} />}
    <CustomNoticeModal notice={{ isOpen: notice, title: 'UI 검증 화면', message: '샘플 데이터로 동작을 확인하고 있어요. 실제 데이터는 저장하지 않습니다.' }} onClose={() => setNotice(false)} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
