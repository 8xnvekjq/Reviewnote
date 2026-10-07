// 학생 아바타를 캔버스 한 장(4프레임 × 8포즈, 32px 칸)으로 합성한다. 기존 AvatarSprite가 SVG로
// 겹치던 것과 같은 원본 PNG 행 + 패션 벡터 경로를 같은 순서로 그린다 — 그림은 바꾸지 않는다.
// 같은 외형은 키(avatarTextureKey)로 캐시해서 다시 합성하지 않는다.
import { avatarSheets } from '../../pixel-room/assets';
import { FASHION_PATHS } from '../../pixel-room/shop/fashionPaths';
import type { PublicAvatarAppearance } from '../../pixel-room/shop/types';
import { AVATAR_FRAME, AVATAR_FRAMES_PER_POSE, AVATAR_LAYERS, AVATAR_POSES, avatarLayerPlan, avatarTextureKey } from '../logic/avatarPlan';
import { loadImage } from './loadImage';

const cache = new Map<string, Promise<HTMLCanvasElement>>();

export function composeAvatar(appearance: PublicAvatarAppearance): { key: string; canvas: Promise<HTMLCanvasElement> } {
  const key = avatarTextureKey(appearance);
  let canvas = cache.get(key);
  if (!canvas) {
    canvas = draw(appearance);
    cache.set(key, canvas);
    canvas.catch(() => cache.delete(key));
  }
  return { key, canvas };
}

async function draw(appearance: PublicAvatarAppearance): Promise<HTMLCanvasElement> {
  const plan = avatarLayerPlan(appearance);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_FRAME * AVATAR_FRAMES_PER_POSE;
  canvas.height = AVATAR_FRAME * AVATAR_POSES.length;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없어요.');
  ctx.imageSmoothingEnabled = false;
  // 필요한 PNG만 미리 전부 불러온다(행 0만 쓰는 기본 레이어도 포즈마다 시트가 다르다).
  const sources = new Set<string>();
  for (const pose of AVATAR_POSES) {
    const [animation, direction] = pose.split('_') as ['Idle' | 'Walk', 'Front' | 'Back' | 'Left' | 'Right'];
    const sheets = avatarSheets[animation][direction];
    for (const step of plan) if (step.kind === 'sheet' && sheets[step.layer]) sources.add(sheets[step.layer]);
  }
  const images = new Map(await Promise.all([...sources].map(async src => [src, await loadImage(src)] as const)));
  AVATAR_POSES.forEach((pose, poseIndex) => {
    const [animation, direction] = pose.split('_') as ['Idle' | 'Walk', 'Front' | 'Back' | 'Left' | 'Right'];
    const sheets = avatarSheets[animation][direction];
    for (let frame = 0; frame < AVATAR_FRAMES_PER_POSE; frame++) {
      const ox = frame * AVATAR_FRAME, oy = poseIndex * AVATAR_FRAME;
      for (const step of plan) {
        const src = sheets[step.layer];
        if (!src) continue; // 뒷모습에는 눈 레이어가 없다(원본과 같음).
        if (step.kind === 'fashion') {
          const shades = FASHION_PATHS[pose][step.fashion][frame % 4];
          ctx.save(); ctx.translate(ox, oy);
          shades.forEach((d, shade) => { ctx.fillStyle = step.colors[shade]; ctx.fill(new Path2D(d)); });
          ctx.restore();
          continue;
        }
        const height = AVATAR_LAYERS.find(layer => layer.key === step.layer)?.height ?? 0;
        if ((step.row + 1) * AVATAR_FRAME > height) continue; // 원본도 시트 밖 행은 빈 칸.
        const image = images.get(src);
        if (image) ctx.drawImage(image, frame * AVATAR_FRAME, step.row * AVATAR_FRAME, AVATAR_FRAME, AVATAR_FRAME, ox, oy, AVATAR_FRAME, AVATAR_FRAME);
      }
    }
  });
  return canvas;
}
