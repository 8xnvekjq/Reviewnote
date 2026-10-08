import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FishingPanels } from '../../src/features/pixel-world-phaser/ui/GamePanels';
import type { FishingAdapter, FishingState } from '../../src/features/pixel-world-phaser/ui/fishingAdapter';
import type { FishingPanelKind } from '../../src/features/pixel-world-phaser/logic/panels';
import { FISH_CATALOG } from '../../src/features/pixel-world-phaser/logic/fishCatalog';

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
const board = { classSpecies: 9, rows: params.get('mode') === 'empty' ? [] : FISH_CATALOG.slice(0, 10).map((fish, index) => ({ speciesId: fish.id, lengthCm: fish.maxCm - .2, animal: ['🐶', '🐰', '🐢'][index % 3], caughtAt: new Date(Date.now() - index * 3700000).toISOString() })) };
const mock: FishingAdapter = factory?.() ?? { state: async () => state, board: async () => board, start: async () => ({ ok: false, reason: 'error' }), finish: async () => ({ ok: false }) };
const adapter: FishingAdapter = { ...mock, state: async () => { if (failure) { failure = false; throw Error('테스트'); } return state; }, board: async () => { if (boardFailure) { boardFailure = false; throw Error('테스트'); } return board; } };
function Harness() {
  const [panel, setPanel] = useState<FishingPanelKind | null>(null);
  return <main style={{ height: '100dvh', background: '#729779', padding: 12, boxSizing: 'border-box', fontFamily: 'sans-serif' }}>
    <button onClick={() => setPanel('turtle')}>거북이</button><button onClick={() => setPanel('fishboard')}>게시판</button>
    <button style={{ position: 'absolute', bottom: 10 }} onClick={() => document.querySelector('.pwp-window')?.dispatchEvent(new Event('pwp-cancel'))}>B</button>
    {panel && <FishingPanels key={panel} kind={panel} adapter={adapter} onClose={() => setPanel(null)} newSpeciesId="catfish_small" />}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
