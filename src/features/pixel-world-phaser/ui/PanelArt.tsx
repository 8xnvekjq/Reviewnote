import { useEffect, useRef } from 'react';
import { furnitureArt } from '../../pixel-room/assets';
import type { FurnitureType } from '../../pixel-room/model';
import { isPetId } from '../../pixel-room/pet/petKinds';
import type { PublicAvatarAppearance } from '../../pixel-room/shop/types';
import { composeAvatar } from '../game/avatarTexture';
import { loadImage } from '../game/loadImage';
import { loadPetSheet } from '../game/sceneAssets';
import { PET_SHEETS } from '../logic/petSheets';

type Art = { appearance: PublicAvatarAppearance } | { pet: string } | { furniture: FurnitureType };

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
