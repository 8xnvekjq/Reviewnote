// 로그인 없이 새 Pixel World(베타) 앞마당을 띄우는 하네스. 실제 GameShell을 가짜 외형/펫으로 부팅한다.
// 주소 파라미터: ?pet=pet_dog|pet_duck|pet_bear|pet_pigeon|none, ?top=blouse_rose&bottom=bootcut_blue&hair=long_black&shoes=low&skin=umber&eyes=sky
import { useEffect, useMemo, useState } from 'react';
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
import type { Placement } from '../../src/features/pixel-room/model';

import type { FishingAdapter } from '../../src/features/pixel-world-phaser/ui/fishingAdapter';
import { createMockFishingAdapter } from '../../src/features/pixel-world-phaser/ui/fishingAdapterMock';
import { parseClockOverride } from '../../src/features/pixel-world-phaser/logic/worldClock';
import { DEFAULT_HAND, type Bag } from '../../src/features/pixel-world-phaser/logic/bag';
import { createMockBugAdapter } from '../../src/features/pixel-world-phaser/ui/bugAdapter';

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
  // 낚시: ?fishing=1 이면 목(mock) 어댑터. 하네스는 관리자처럼 ?pwClock=21:30&pwWeather=rain 을 받는다.
  const clockOverride = useMemo(() => parseClockOverride(location.search) ?? undefined, []);
  const fishingAdapter = useMemo((): FishingAdapter | undefined => {
    if (!params.has('fishing')) return undefined;
    // seed 11: v4 모의 서버에서 처음 두 번이 어려운 물고기(15%)가 아니다(시계·날씨 무관). seed 7은 첫 캐스트가 늘 난이도 4 이상이라
    // 단순 탭 봇이 못 잡는다 — 어려운 물고기는 단위 테스트가 따로 검사한다.
    const adapter = createMockFishingAdapter({ seed: 11, isAdmin: params.has('admin'), override: clockOverride, classmates: [
      { speciesId: 'carp', lengthCm: 41.2, animal: '🐻', caughtAt: new Date(Date.now() - 3 * 3600000).toISOString() },
      { speciesId: 'pirami', lengthCm: 13.4, animal: '🐰', caughtAt: new Date(Date.now() - 20 * 60000).toISOString() },
    ] });
    if (params.has('weatherTest')) {
      const key = 'pwp-weather-test';
      const store = { get override() { return JSON.parse(localStorage.getItem(key) ?? 'null'); }, set override(value) { localStorage.setItem(key, JSON.stringify(value)); } };
      return createMockFishingAdapter({ isAdmin: params.has('admin'), worldStore: store, now: () => Date.parse('2026-10-01T03:00:00Z') });
    }
    if (params.get('fishingBudget') === '0') return { ...adapter, state: async () => ({ ...await adapter.state(), remaining: 0, sparkleShadow: null }) };
    return adapter;
  }, []);
  // 잠자리: ?bugs=1 이면 모의 어댑터(잠자리채 보유). ?bugSeed= 로 어떤 잠자리가 걸릴지 정한다.
  const bugAdapter = useMemo(() => params.has('bugs') ? createMockBugAdapter({ netOwned: true, seed: Number(params.get('bugSeed') ?? '42') }) : undefined, []);
  const [roomLayout, setRoomLayout] = useState<readonly Placement[]>(furniture);
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
  const [equippedRod, setEquippedRod] = useState<string | null>(null);
  const [look, setLook] = useState(appearance);
  const [active, setActive] = useState(pet);
  const [balance, setBalance] = useState(1234);
  const [shards, setShards] = useState(Number(params.get('shards') ?? '20.5'));
  // 지식의 조각 전용 아이템은 처음엔 갖고 있지 않다(조각 상점 칸을 시험한다).
  const [ownedIds, setOwnedIds] = useState(new Set(PIXEL_CATALOG.filter(item => item.shardPrice == null || params.get('roomEdit') === 'all').filter(item => item.category === 'avatar' || item.category === 'pet' || params.has('roomEdit') && item.category === 'furniture' && (params.get('roomEdit') === 'all' || ['desk', 'bed', 'plant', 'chair'].includes(item.assetKey))).map(item => item.itemId)));
  // 가방(?bag=무게kg 시험): 서버 없이 물고기·곤충 팔기와 토마토 출품을 시험한다.
  const [bag, setBag] = useState<Bag>(() => {
    const extra = Number(params.get('bag') ?? '0');
    const items: Bag['items'] = [{ kind: 'fish', ref: 'buri', qty: 3, unitWeight: 1, unitPoints: 1 }, { kind: 'bug', ref: 'dragonfly_red', qty: 1, unitWeight: 0.3, unitPoints: 2 }];
    if (extra > 0) items.push({ kind: 'fish', ref: 'pirami', qty: extra, unitWeight: 1, unitPoints: 1 });
    const crops: Bag['crops'] = [{ id: 'crop-1', sizeScore: 82, unitWeight: 1.5 }];
    const weight = items.reduce((n, i) => n + i.qty * i.unitWeight, 0) + crops.length * 1.5;
    // 손 칸(?hand=net|bare|rod, ?net=1이면 잠자리채 보유, 황금 낚싯대는 늘 보유).
    const hand = params.get('hand') === 'net' || params.get('hand') === 'bare' ? params.get('hand') as 'net' | 'bare' : 'rod';
    return { capacity: 20, weight: Math.round(weight * 100) / 100, items, crops, ...DEFAULT_HAND, hand, netOwned: params.has('net'), rods: ['rod_gold'] };
  });
  const reweigh = (next: Pick<Bag, 'capacity' | 'items' | 'crops'>): Bag => ({ ...bag, ...next, weight: Math.round((next.items.reduce((n, i) => n + i.qty * i.unitWeight, 0) + next.crops.length * 1.5) * 100) / 100 });
  const bagState: NonNullable<PanelAdapter['bag']> = { bag, busy: false, refresh: async () => {},
    sell: async items => {
      let sold = 0, value = 0;
      const left = bag.items.flatMap(item => { const want = items === null ? item.qty : Math.min(item.qty, items.filter(i => i.kind === item.kind && i.ref === item.ref).reduce((n, i) => n + i.qty, 0));
        sold += want; value += want * item.unitPoints; return item.qty - want > 0 ? [{ ...item, qty: item.qty - want }] : []; });
      const next = reweigh({ capacity: bag.capacity, items: left, crops: bag.crops });
      setBag(next); setBalance(v => v + value);
      return sold ? { ok: true as const, sold, value, awarded: value, bag: next } : { ok: false as const, message: '팔 물건이 없어요.', bag: next };
    },
    equip: async id => {
      if (id === 'tool_net' && !bag.netOwned) return { ok: false as const, message: '아직 가지고 있지 않아요.' };
      const next = { hand: id === null ? 'bare' as const : id === 'tool_net' ? 'net' as const : 'rod' as const,
        rod: id && id.startsWith('rod_') ? { id: id === 'rod_basic' ? null : id, tier: id === 'rod_gold' ? 4 : 0 } : bag.rod, netOwned: bag.netOwned, rods: bag.rods };
      setBag(current => ({ ...current, ...next }));
      return { ok: true as const, ...next };
    },
    submitCrop: async id => { setBag(current => reweigh({ capacity: current.capacity, items: current.items, crops: current.crops.filter(c => c.id !== id) })); setBalance(v => v + 43); return { ok: true, cropId: id, rewardPoints: 43, submittedAt: new Date().toISOString(), status: 'submitted' }; },
  };
  // 서버 없이 모든 패션과 친구를 장착하고 가구 구매를 시험한다.
  const adapter: PanelAdapter = {
    bag: bagState,
    shop: { equippedRod, equipRod: async id => { if (id && !ownedIds.has(id)) return false; setEquippedRod(id); return true; }, ready: true, loadError: false, mutating: false, catalog: [...PIXEL_CATALOG], equipped: look, ownedIds, balance, reload: () => {},
      equip: async (slot, id) => { const item = PIXEL_CATALOG.find(entry => entry.itemId === id); if (id && (!item || !ownedIds.has(id))) return false; setLook(value => ({ ...value, [slot]: item?.assetKey ?? null })); return true; },
      setBaseAppearance: async (skin, eyes) => { setLook(value => ({ ...value, skin, eyes })); return true; },
      purchase: async item => {
        if (ownedIds.has(item.itemId)) return { ok: false, reason: 'already_owned', message: '이미 보유하고 있어요.' };
        if (balance < item.price) return { ok: false, reason: 'insufficient_balance', message: '포인트가 부족해요.' };
        setOwnedIds(value => new Set([...value, item.itemId])); setBalance(value => value - item.price);
        if (item.category === 'avatar') setLook(value => ({ ...value, [item.slot]: item.assetKey }));
        return { ok: true, itemId: item.itemId, newBalance: balance - item.price };
      },
      shards,
      purchaseShardItem: async item => {
        if (ownedIds.has(item.itemId)) return { ok: false, reason: 'already_owned', message: '이미 보유하고 있어요.' };
        if (item.shardPrice == null || shards < item.shardPrice) return { ok: false, reason: 'insufficient_balance', message: '지식의 조각이 부족해요.' };
        setOwnedIds(value => new Set([...value, item.itemId])); setShards(value => Math.round((value - item.shardPrice!) * 100) / 100);
        if (item.category === 'avatar') setLook(value => ({ ...value, [item.slot]: item.assetKey }));
        return { ok: true, itemId: item.itemId, newBalance: balance };
      },
    },
    pet: { active, ready: true, busy: false, error: false, reload: () => {}, activate: async id => { setActive(id); return true; } },
  };
  useEffect(() => { document.documentElement.dataset.farmCalls = String(calls); }, [calls]);
  return open
    ? params.has('saved')
      ? <PixelWorldPhaser userId="scene-test-user" pointsBalance={balance} onPixelPurchase={setBalance} onPointsReward={reward => setBalance(value => value + reward)} onExit={() => setOpen(false)} />
      : <GameShell userId={params.get('user') ?? 'guest'} face={params.get('face') ?? undefined} isAdmin={params.has('admin')} fishingAdapter={fishingAdapter} bugAdapter={bugAdapter} clockOverride={clockOverride} appearance={look} pet={active} balance={balance} panels={adapter} farmAdapter={params.has('farm') ? farmAdapter : undefined} beds={params.has('farm') ? farmBeds : [...beds]} furniture={roomLayout} onSaveFurniture={async layout => { await new Promise(resolve => setTimeout(resolve, 100)); if (params.has('roomSaveError')) throw new Error('저장하지 못했어요. 다시 시도해 주세요.'); setRoomLayout(layout); }} scarecrowLine={() => pickScarecrowLine(null, Date.now())} onExit={() => setOpen(false)} />
    : <main style={{ padding: 24 }}><p data-testid="exited">게임에서 나왔어요.</p><button type="button" onClick={() => setOpen(true)}>다시 들어가기</button></main>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
