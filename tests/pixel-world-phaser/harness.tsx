// 로그인 없이 새 Pixel World(베타) 앞마당을 띄우는 하네스. 실제 GameShell을 가짜 외형/펫으로 부팅한다.
// 주소 파라미터: ?pet=pet_dog|pet_duck|pet_bear|pet_pigeon|none, ?top=blouse_rose&bottom=bootcut_blue&hair=long_black&shoes=low&skin=umber&eyes=sky
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameShell } from '../../src/features/pixel-world-phaser/GameShell';
import PixelWorldPhaser from '../../src/features/pixel-world-phaser/PixelWorldPhaser';
import { isPetId } from '../../src/features/pixel-room/pet/petKinds';
import type { PublicAvatarAppearance } from '../../src/features/pixel-room/shop/types';
import { pickScarecrowLine } from '../../src/features/pixel-room/farm/scarecrowLines';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog';
import type { FarmAdapter } from '../../src/features/pixel-world-phaser/ui/FarmPanels';
import type { FarmSnapshot, HarvestedCrop } from '../../src/features/pixel-room/farm/farmModel';
import { farmStage, farmMoisture, computeSubmitReward } from '../../src/features/pixel-room/farm/farmModel';
import type { PanelAdapter } from '../../src/features/pixel-world-phaser/ui/GamePanels';

const params = new URLSearchParams(location.search);
const appearance: PublicAvatarAppearance = {
  top: params.get('top') ?? 'stripe', bottom: params.get('bottom') ?? 'denim', shoes: params.get('shoes') ?? 'low',
  hair: params.get('hair') ?? 'bob', eyes: params.get('eyes'), skin: params.get('skin'),
};
const petParam = params.get('pet') ?? 'pet_dog';
const pet = isPetId(petParam) ? petParam : null;
const beds = [{ stage: 'leaf', moisture: 'moist' }, { stage: 'empty', moisture: 'normal' }] as const;
const furniture = [{ type: 'desk', x: 3, y: 4 }, { type: 'bed', x: 0, y: 0 }, { type: 'plant', x: 8, y: 3 }] as const;

const farmNow = Date.parse('2026-10-08T03:00:00Z');
const fakeContest: FarmAdapter['contest'] = async () => ({ weekStart: '2026-10-05', top: [{ rank: 1, sizeScore: 82, submitterLabel: '토마토 친구' }], mine: { rank: null, sizeScore: null, participantCount: 1 } });
function Harness() {
  const [snapshot, setSnapshot] = useState<FarmSnapshot>({ serverNow: new Date(farmNow).toISOString(), today: '2026-10-08', harvestCount: 0, bestSize: null, lastHarvestSize: null,
    plots: [{ index: 0, revision: 1, crop: { id: 'ripe', plantedAt: '2026-10-01T00:00:00Z', readyAt: '2026-10-05T00:00:00Z', lastWateredOn: '2026-10-03', careCount: 3, reviewGained: 0 } }, { index: 1, revision: 1, crop: null }] });
  const [crops, setCrops] = useState<HarvestedCrop[]>([]);
  const [farmMessage, setFarmMessage] = useState('');
  const [farmError, setFarmError] = useState(false);
  const [calls, setCalls] = useState(0);
  const farmAdapter: FarmAdapter = {
    farm: { snapshot, now: farmNow, busy: false, error: farmError, message: farmMessage, clearMessage: () => setFarmMessage(''), refresh: async () => { setFarmError(false); }, act: async (index, action) => {
      setCalls(v => v + 1);
      await new Promise(resolve => setTimeout(resolve, 150));
      if (params.has('farmError')) { setFarmError(true); setFarmMessage('저장 결과를 확인하지 못했어요. 다시 확인해 주세요.'); return; }
      if (params.has('farmChanged')) { setFarmMessage('다른 곳에서 바뀐 밭을 불러왔어요.'); return; }
      setSnapshot(value => ({ ...value, harvestCount: value.harvestCount + (action === 'harvest' ? 1 : 0), lastHarvestSize: action === 'harvest' ? 82 : value.lastHarvestSize,
        plots: value.plots.map(plot => plot.index !== index ? plot : { ...plot, revision: plot.revision + 1, crop: action === 'harvest' ? null : action === 'plant' ? { id: 'new', plantedAt: new Date(farmNow).toISOString(), readyAt: new Date(farmNow + 4 * 86400000).toISOString(), careCount: 0, lastWateredOn: null, reviewGained: 0 } : plot.crop && { ...plot.crop, careCount: plot.crop.careCount + 1, lastWateredOn: '2026-10-08' } }) }));
      setFarmMessage(action === 'harvest' ? '수확 기록에 보관했어요! 이번 토마토는 큰 토마토예요 (82/100)' : action === 'water' ? '물을 줬어요. 오늘의 돌봄 +1' : '심었어요. 첫 물을 주세요!');
      if (action === 'harvest') setCrops(value => [...value, { id: 'harvest', cropType: 'tomato', sizeScore: 82, harvestedAt: new Date(farmNow).toISOString(), careCount: 3, status: 'stored', submittedAt: null, rewardPoints: null }]);
    } },
    inventory: { crops, busy: false, error: false, refresh: async () => {} }, contest: fakeContest,
    submit: async id => { const rewardPoints = computeSubmitReward(crops.find(c => c.id === id)!.sizeScore); setCrops(value => value.map(c => c.id === id ? { ...c, status: 'submitted', rewardPoints } : c)); setBalance(value => value + rewardPoints); return { ok: true, cropId: id, rewardPoints, submittedAt: new Date(farmNow).toISOString(), status: 'submitted' }; },
  };
  const farmBeds = snapshot.plots.map(p => ({ stage: farmStage(p.crop, farmNow), moisture: farmMoisture(p.crop, farmNow) }));
  const [open, setOpen] = useState(true);
  const [look, setLook] = useState(appearance);
  const [active, setActive] = useState(pet);
  const [balance, setBalance] = useState(1234);
  const [ownedIds, setOwnedIds] = useState(new Set(PIXEL_CATALOG.filter(item => item.category === 'avatar' || item.category === 'pet').map(item => item.itemId)));
  // 서버 없이 모든 패션과 친구를 장착하고 가구 구매를 시험한다.
  const adapter: PanelAdapter = {
    shop: { ready: true, loadError: false, mutating: false, catalog: [...PIXEL_CATALOG], equipped: look, ownedIds, balance, reload: () => {},
      equip: async (slot, id) => { const item = PIXEL_CATALOG.find(entry => entry.itemId === id); if (id && (!item || !ownedIds.has(id))) return false; setLook(value => ({ ...value, [slot]: item?.assetKey ?? null })); return true; },
      setBaseAppearance: async (skin, eyes) => { setLook(value => ({ ...value, skin, eyes })); return true; },
      purchase: async item => {
        if (ownedIds.has(item.itemId)) return { ok: false, reason: 'already_owned', message: '이미 보유하고 있어요.' };
        if (balance < item.price) return { ok: false, reason: 'insufficient_balance', message: '포인트가 부족해요.' };
        setOwnedIds(value => new Set([...value, item.itemId])); setBalance(value => value - item.price);
        if (item.category === 'avatar') setLook(value => ({ ...value, [item.slot]: item.assetKey }));
        return { ok: true, itemId: item.itemId, newBalance: balance - item.price };
      },
    },
    pet: { active, ready: true, busy: false, error: false, reload: () => {}, activate: async id => { setActive(id); return true; } },
  };
  useEffect(() => { document.documentElement.dataset.farmCalls = String(calls); }, [calls]);
  return open
    ? params.has('saved')
      ? <PixelWorldPhaser userId="scene-test-user" pointsBalance={1234} onExit={() => setOpen(false)} />
      : <GameShell appearance={look} pet={active} balance={balance} panels={adapter} farmAdapter={params.has('farm') ? farmAdapter : undefined} beds={params.has('farm') ? farmBeds : [...beds]} furniture={furniture} scarecrowLine={() => pickScarecrowLine(null, Date.now())} onExit={() => setOpen(false)} />
    : <main style={{ padding: 24 }}><p data-testid="exited">게임에서 나왔어요.</p><button type="button" onClick={() => setOpen(true)}>다시 들어가기</button></main>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
