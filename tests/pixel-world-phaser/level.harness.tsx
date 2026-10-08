import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameShell } from '../../src/features/pixel-world-phaser/GameShell';
import { usePixelShop } from '../../src/features/pixel-room/usePixelShop';
import { createMockFishingAdapter } from '../../src/features/pixel-world-phaser/ui/fishingAdapterMock';
import type { LevelFishingAdapter } from '../../src/features/pixel-world-phaser/ui/useLevel';
import { levelForXp } from '../../src/features/pixel-world-phaser/logic/levels';
function Harness() {
  const [balance, setBalance] = useState(200);
  const [count, setCount] = useState(0);
  const shop = usePixelShop('level-test', balance, value => { setBalance(value); setCount(v => v + 1); });
  const adapter = useMemo<LevelFishingAdapter>(() => {
    let xp = 1245;
    const mock = createMockFishingAdapter({ seed: 11 });
    const getLevel = async () => ({ xp, ...levelForXp(xp), maxLevel: 100 });
    return { ...mock, getLevel, state: async () => ({ ...await mock.state(), level: await getLevel() }),
      finish: async (id, landed) => {
        const result = await mock.finish(id, landed);
        if (result.ok && result.landed) { xp += 25; return { ...result, rarity: 'rare', xpGain: { gained: 25, xp, level: levelForXp(xp).level, leveledUp: true } }; }
        return result;
      },
    };
  }, []);
  return <><output style={{ position: 'fixed', zIndex: 2147483001, bottom: 0 }} data-testid="balance-callback">{balance}/{count}</output>
    <GameShell appearance={shop.equipped} pet={null} balance={balance} beds={[]} furniture={[]}
      panels={{ shop, pet: { active: null, ready: true, busy: false, error: false, reload() {}, activate: async () => true } }}
      fishingAdapter={adapter} scarecrowLine={() => '안녕!'} onExit={() => {}} />
  </>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
