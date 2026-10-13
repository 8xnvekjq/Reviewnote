import { useEffect, useRef } from 'react';
import { furnitureArt } from '../../pixel-room/assets';
import type { FurnitureType } from '../../pixel-room/model';
import { isPetId } from '../../pixel-room/pet/petKinds';
import type { PublicAvatarAppearance } from '../../pixel-room/shop/types';
import { composeAvatar } from '../game/avatarTexture';
import { loadImage } from '../game/loadImage';
import { loadPetSheet } from '../game/sceneAssets';
import { PET_SHEETS } from '../logic/petSheets';
import netIcon from '../assets/bugs/net-icon.png';
import { GARDEN_PALETTE, SPRINKLER_GRID } from '../logic/gardenSprites';

type Art = { appearance: PublicAvatarAppearance } | { pet: string } | { furniture: FurnitureType | 'tool_net' | 'tool_sprinkler' };

/** Crop at native resolution before CSS scaling, so the atlas cannot bleed into the preview. */
export function PanelArt(props: Art) {
  const ref = useRef<HTMLCanvasElement>(null);
  const appearance = 'appearance' in props ? props.appearance : null;
  const pet = 'pet' in props ? props.pet : null;
  const furniture = 'furniture' in props ? props.furniture : null;
  useEffect(() => {
    let cancelled = false;
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d');
    async function draw() {
      let source: CanvasImageSource;
      let x = 0, y = 0, width = 32, height = 32;
      if (appearance) source = await composeAvatar(appearance).canvas;
      else if (pet && isPetId(pet)) {
        const sheet = PET_SHEETS[pet];
        source = await loadPetSheet(pet);
        width = height = sheet.cell;
        x = sheet.idle.frames[0] * sheet.cell;
        y = sheet.idle.row * sheet.cell;
      } else if (furniture === 'tool_net') {
        source = await loadImage(netIcon);
        width = height = 16;
      } else if (furniture === 'tool_sprinkler') {
        // 텃밭에 놓이는 스프링클러 그림 그대로(16×20 격자의 아래쪽 16줄).
        const art = document.createElement('canvas'); art.width = 16; art.height = 20;
        const paint = art.getContext('2d')!;
        SPRINKLER_GRID.forEach((row, py) => [...row].forEach((ch, px) => { if (GARDEN_PALETTE[ch]) { paint.fillStyle = GARDEN_PALETTE[ch]; paint.fillRect(px, py, 1, 1); } }));
        source = art; y = 4; width = height = 16;
      } else if (furniture) {
        const art = furnitureArt[furniture];
        source = await loadImage(art.src);
        ({ x, y, width, height } = art);
      } else return;
      if (cancelled || !ctx) return;
      canvas.width = width; canvas.height = height;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(source, x, y, width, height, 0, 0, width, height);
      canvas.dataset.ready = 'true';
    }
    canvas.dataset.ready = 'false';
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    void draw().catch(() => { if (!cancelled) canvas.dataset.ready = 'error'; });
    return () => { cancelled = true; };
  }, [appearance, pet, furniture]);
  return <canvas ref={ref} className="pwp-art-canvas" width={32} height={32} aria-hidden="true" />;
}
