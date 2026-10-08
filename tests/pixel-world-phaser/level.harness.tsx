import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameShell } from '../../src/features/pixel-world-phaser/GameShell';
import { usePixelShop } from '../../src/features/pixel-room/usePixelShop';
import { createMockFishingAdapter } from '../../src/features/pixel-world-phaser/ui/fishingAdapterMock';
import type { LevelFishingAdapter } from '../../src/features/pixel-world-phaser/ui/useLevel';
import { levelForXp } from '../../src/features/pixel-world-phaser/logic/levels';
import { useFarm } from '../../src/features/pixel-room/farm/useFarm';
import { supabase } from '../../src/services/supabase';
import type { FarmAdapter } from '../../src/features/pixel-world-phaser/ui/FarmPanels';
import { farmStage, farmMoisture } from '../../src/features/pixel-room/farm/farmModel';
const harvestFixture = new URLSearchParams(location.search).has('harvest');
function Harness() {
  const [balance, setBalance] = useState(200);
  const [count, setCount] = useState(0);
  const shop = usePixelShop('level-test', balance, value => { setBalance(value); setCount(v => v + 1); });
  const adapter = useMemo<LevelFishingAdapter>(() => {
    let xp = 1245;
    let clockOffset = 0;
    const mock = createMockFishingAdapter({ seed: 11, baitCharges: 273, now: () => Date.now() + clockOffset });
    const getLevel = async () => harvestFixture ? (await supabase.rpc('get_pixel_level')).data : ({ xp, ...levelForXp(xp), maxLevel: 100 });
    return { ...mock, getLevel, state: async () => ({ ...await mock.state(), level: await getLevel() }),
      start: async index => { const cast = await mock.start(index); return cast.ok ? { ...cast, difficulty: 1 } : cast; },
      finish: async (id, landed) => {
        // UI 확인용 쉬운 릴이 서버 모의 캐스트의 최소 시간을 채우게 한다.
        if (landed) clockOffset += 20000;
        const result = await mock.finish(id, landed);
        if (result.ok && result.landed) { xp += 25; return { ...result, rarity: 'rare', xpGain: { gained: 25, xp, level: levelForXp(xp).level, leveledUp: true } }; }
        return result;
      },
    };
  }, []);
  const farm = useFarm();
  const farmAdapter: FarmAdapter = { farm, inventory: { crops: [], busy: false, error: false, refresh: async () => {} },
    contest: async () => ({ weekStart: '2026-10-05', top: [], mine: { rank: null, sizeScore: null, participantCount: 0 } }),
    submit: async () => ({ ok: false, reason: 'error', message: '출품할 수 없어요.' }) };
  const beds = farm.snapshot?.plots.map(plot => ({ stage: farmStage(plot.crop, farm.now), moisture: farmMoisture(plot.crop, farm.now) })) ?? [];
  return <><output style={{ position: 'fixed', zIndex: 2147483001, bottom: 0 }} data-testid="balance-callback" data-bait-catalog={shop.catalog.some(item => item.itemId === 'bait_worm' && item.category === 'bait' && item.assetKey === 'worm')}>{balance}/{count}</output>
    <GameShell appearance={shop.equipped} pet={null} balance={balance} beds={harvestFixture ? beds : []} furniture={[]}
      farmAdapter={harvestFixture ? farmAdapter : undefined}
      panels={{ shop, pet: { active: null, ready: true, busy: false, error: false, reload() {}, activate: async () => true } }}
      fishingAdapter={adapter} scarecrowLine={() => '안녕!'} onExit={() => {}} />
  </>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
