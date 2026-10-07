// 로그인 없이 새 Pixel World(베타) 앞마당을 띄우는 하네스. 실제 GameShell을 가짜 외형/펫으로 부팅한다.
// 주소 파라미터: ?pet=pet_dog|pet_duck|pet_bear|pet_pigeon|none, ?top=blouse_rose&bottom=bootcut_blue&hair=long_black&shoes=low&skin=umber&eyes=sky
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameShell } from '../../src/features/pixel-world-phaser/GameShell';
import { isPetId } from '../../src/features/pixel-room/pet/petKinds';
import type { PublicAvatarAppearance } from '../../src/features/pixel-room/shop/types';
import { pickScarecrowLine } from '../../src/features/pixel-room/farm/scarecrowLines';

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
  return open
    ? <GameShell appearance={appearance} pet={pet} balance={1234} beds={[...beds]} scarecrowLine={() => pickScarecrowLine(null, Date.now())} onExit={() => setOpen(false)} />
    : <main style={{ padding: 24 }}><p data-testid="exited">게임에서 나왔어요.</p><button type="button" onClick={() => setOpen(true)}>다시 들어가기</button></main>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
