import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FishingPanels } from '../../src/features/pixel-world-phaser/ui/GamePanels';
import type { FishingAdapter, FishingState } from '../../src/features/pixel-world-phaser/ui/fishingAdapter';
import type { FishingPanelKind } from '../../src/features/pixel-world-phaser/logic/panels';
import { FISH_CATALOG } from '../../src/features/pixel-world-phaser/logic/fishCatalog';
import { FISH_TIER_REWARDS } from '../../src/features/pixel-world-phaser/logic/gamePoints';
import type { RewardsAdapter } from '../../src/features/pixel-world-phaser/logic/gamePoints';
import { WeeklyRewards } from '../../src/features/pixel-world-phaser/ui/WeeklyRewards';

// 공유 모의 어댑터가 아직 없는 작업 브랜치만을 위한 테스트 전용 대체.
const shared = import.meta.glob('../../src/features/pixel-world-phaser/ui/fishingAdapterMock.ts', { eager: true });
const factory = (Object.values(shared)[0] as { createMockFishingAdapter?: () => FishingAdapter } | undefined)?.createMockFishingAdapter;
const params = new URLSearchParams(location.search);
let failure = params.get('mode') === 'error';
let boardFailure = params.get('mode') === 'board-error';
const state: FishingState = {
  kstDate: '2026-10-08', phase: 'night', weather: 'rain', remaining: params.get('mode') === 'budget' ? 0 : 3,
  sparkleShadow: null, pigeonHint: 'moonfish',
  album: params.get('mode') === 'empty' ? [] : FISH_CATALOG.slice(0, 4).map((fish, index) => ({ speciesId: fish.id, count: index + 1, bestCm: fish.maxCm - .6, firstAt: '2026-10-08T01:00:00Z' })),
};
const board = { classSpecies: 9,
  champions: params.get('mode') === 'empty' ? [] : (['common', 'uncommon', 'rare', 'legendary', 'mythic'] as const).map((rarity, index) => {
    const fish = FISH_CATALOG.find(item => item.rarity === rarity)!;
    return { rarity, speciesId: fish.id, lengthCm: fish.minCm + (fish.maxCm - fish.minCm) * .62, score: 62, animal: index === 1 ? '🦍' : '🐢', teacher: index === 1, reward: FISH_TIER_REWARDS[rarity] };
  }),
  rows: params.get('mode') === 'empty' ? [] : FISH_CATALOG.slice(0, 10).map((fish, index) => ({ speciesId: fish.id, lengthCm: fish.maxCm - .2, animal: index === 1 ? '🦍' : ['🐶', '🐰', '🐢'][index % 3], teacher: index === 1, caughtAt: new Date(Date.now() - index * 3700000).toISOString() })) };
const mock: FishingAdapter = factory?.() ?? { state: async () => state, board: async () => board, start: async () => ({ ok: false, reason: 'error' }), finish: async () => ({ ok: false }) };
const adapter: FishingAdapter = { ...mock, state: async () => { if (failure) { failure = false; throw Error('테스트'); } return state; }, board: async () => { if (boardFailure) { boardFailure = false; throw Error('테스트'); } return board; } };
let pendingCalls = 0, ackCalls = 0;
const rewards: RewardsAdapter = {
  pending: async () => {
    document.querySelector('main')!.dataset.pendingCalls = String(++pendingCalls);
    if (params.get('mode') === 'rewards-error') throw Error('테스트');
    return params.get('mode') === 'rewards-empty' ? [] : [
      { id: 'fish', weekStart: '2026-10-05', kind: 'fish_tier', label: '별 5 물고기 챔피언', points: 150 },
      { id: 'crop', weekStart: '2026-10-05', kind: 'crop_rank', label: '수확 대회 2위', points: 70 },
    ];
  },
  ack: async ids => {
    const main = document.querySelector('main')!;
    main.dataset.ackCalls = String(++ackCalls); main.dataset.ackIds = ids.join(',');
    if (params.get('mode') === 'ack-error') throw Error('테스트');
    return true;
  },
};
function Harness() {
  const [panel, setPanel] = useState<FishingPanelKind | null>(null);
  const [entry, setEntry] = useState(false);
  const [ready, setReady] = useState(false);
  const [render, setRender] = useState(0);
  return <main style={{ height: '100dvh', background: '#729779', padding: 12, boxSizing: 'border-box', fontFamily: 'sans-serif' }}>
    <button onClick={() => setPanel('turtle')}>거북이</button><button onClick={() => setPanel('fishboard')}>게시판</button>
    <button style={{ position: 'absolute', bottom: 10 }} onClick={() => document.querySelector('.pwp-window')?.dispatchEvent(new Event('pwp-cancel'))}>B</button>
    <button onClick={() => { setEntry(true); setReady(false); }}>보상 입장</button>
    <button onClick={() => setReady(true)}>게임 준비</button>
    <button onClick={() => setEntry(false)}>나가기</button>
    <button onClick={() => setRender(render + 1)}>리렌더 {render}</button>
    {/* 보상 창만 StrictMode로 이중 마운트를 검사한다. 도감은 1회용 실패 모의가 첫 effect에서 소모되지 않게 뺀다. */}
    {entry && <StrictMode><WeeklyRewards ready={ready} rewards={rewards} /></StrictMode>}
    {panel && <FishingPanels key={panel} kind={panel} adapter={adapter} onClose={() => setPanel(null)} newSpeciesId="catfish_small" />}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
