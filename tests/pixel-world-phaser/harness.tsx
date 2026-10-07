// 로그인 없이 새 Pixel World(베타) 앞마당을 띄우는 하네스. 실제 GameShell을 가짜 외형/펫으로 부팅한다.
// 주소 파라미터: ?pet=pet_dog|pet_duck|pet_bear|pet_pigeon|none, ?top=blouse_rose&bottom=bootcut_blue&hair=long_black&shoes=low&skin=umber&eyes=sky
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameShell } from '../../src/features/pixel-world-phaser/GameShell';
import { isPetId } from '../../src/features/pixel-room/pet/petKinds';
import type { PublicAvatarAppearance } from '../../src/features/pixel-room/shop/types';
import { pickScarecrowLine } from '../../src/features/pixel-room/farm/scarecrowLines';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog';
import type { PanelAdapter } from '../../src/features/pixel-world-phaser/ui/GamePanels';

const params = new URLSearchParams(location.search);
const appearance: PublicAvatarAppearance = {
  top: params.get('top') ?? 'stripe', bottom: params.get('bottom') ?? 'denim', shoes: params.get('shoes') ?? 'low',
  hair: params.get('hair') ?? 'bob', eyes: params.get('eyes'), skin: params.get('skin'),
};
const petParam = params.get('pet') ?? 'pet_dog';
const pet = isPetId(petParam) ? petParam : null;
const beds = [{ stage: 'leaf', moisture: 'moist' }, { stage: 'empty', moisture: 'normal' }] as const;

function Harness() {
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
  return open
    ? <GameShell appearance={look} pet={active} balance={balance} beds={[...beds]} panels={adapter} scarecrowLine={() => pickScarecrowLine(null, Date.now())} onExit={() => setOpen(false)} />
    : <main style={{ padding: 24 }}><p data-testid="exited">게임에서 나왔어요.</p><button type="button" onClick={() => setOpen(true)}>다시 들어가기</button></main>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
