import { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { usePixelShop } from '../../src/features/pixel-room/usePixelShop';
import { GamePanels } from '../../src/features/pixel-world-phaser/ui/GamePanels';
import { useFishing } from '../../src/features/pixel-world-phaser/ui/useFishing';
import { createFishingAdapter } from '../../src/features/pixel-world-phaser/ui/fishingAdapter';
import { ReelJoystick } from '../../src/features/pixel-world-phaser/ui/ReelJoystick';
import { ReelBar } from '../../src/features/pixel-world-phaser/ui/ReelBar';
import { supabase } from '../../src/services/supabase';
import '../../src/features/pixel-world-phaser/gameShell.css';
function Harness() {
  const [balance, setBalance] = useState(1234);
  const [callbackCount, setCallbackCount] = useState(0);
  const shop = usePixelShop('rod-test', balance, value => { setBalance(value); setCallbackCount(count => count + 1); });
  const [panel, setPanel] = useState<'tackle' | 'shop' | 'wardrobe' | null>('tackle');
  const adapter = useMemo(() => createFishingAdapter(supabase), []);
  const handle = useRef({ cancelWalk() {} });
  const fishing = useFishing({ adapter, handle, scene: 'river', pet: null, freeze() {} });
  const pet = { active: null, ready: true, busy: false, error: false, reload() {}, activate: async () => true };
  return <div className="pwp-root" style={{ width: '100vw', height: '100vh', background: '#7bbaad' }}>
    <div style={{ padding: 12 }}><output data-testid="balance">{balance}</output><output data-testid="callback-count">{callbackCount}</output>
      <button onClick={() => setPanel('tackle')}>상점 열기</button><button onClick={() => setPanel('shop')}>광장 상점 열기</button><button onClick={() => setPanel('wardrobe')}>옷장 열기</button>
      <button onClick={() => void fishing.onShadowTap(0)}>낚시 시작</button><button onClick={() => fishing.reel()}>릴 감기</button><button onClick={fishing.cancel}>낚시 취소</button>
      <output data-testid="phase">{fishing.phase}</output><output>{fishing.message}</output>
    </div>
    {panel && <GamePanels key={panel} kind={panel} adapter={{ shop, pet }} onClose={() => setPanel(null)} />}
    {fishing.reelState && <><ReelBar game={fishing.reelState} /><ReelJoystick onAxis={fishing.setReelX} /></>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
