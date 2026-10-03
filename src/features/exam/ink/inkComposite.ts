// 문항 이미지 + 필기를 한 장의 PNG(data URL)로 합성한다 — 오답노트 '원래풀이' 스캐폴딩용.
// 화면과 같은 겹침 순서: 이미지 → 형광펜 레이어(불투명도·multiply) → 펜 레이어. 필기가 이미지 오른쪽·아래 여백에 있으면 범위를 넓힌다.
import type { InkStroke } from '../contract.ts';
import { compositeBounds, compositeScale, inkExtent } from './inkFit.ts';
import { HIGHLIGHTER_OPACITY, INK_REFERENCE_WIDTH } from './inkModel.ts';
import { drawStroke } from './inkRender.ts';

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // 문항 이미지는 보통 같은 출처(/exams/...)다. 다른 출처(스토리지 URL)면 CORS로 받아야 캔버스가 오염(taint)되지 않는다.
    if (new URL(url, window.location.href).origin !== window.location.origin) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => (img.naturalWidth ? resolve(img) : reject(new Error('문항 이미지를 읽지 못했어요.')));
    img.onerror = () => reject(new Error('문항 이미지를 불러오지 못했어요.'));
    img.src = url;
  });
}

/** 필기가 없으면 null. */
export async function composeInkImage(imageUrl: string, strokes: InkStroke[]): Promise<string | null> {
  if (strokes.length === 0) return null;
  const img = await loadImage(imageUrl);
  const aspect = img.naturalHeight / img.naturalWidth;
  const bounds = compositeBounds(aspect, inkExtent(strokes));
  const scale = compositeScale(img.naturalWidth, bounds); // 이미지 너비 1 = scale px
  const width = Math.ceil(bounds.width * scale);
  const height = Math.ceil(bounds.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지를 만들 수 없어요.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, scale, aspect * scale);
  // 필기 경로는 기준 공간(정규화 × INK_REFERENCE_WIDTH)에 있다.
  const toPixels = scale / INK_REFERENCE_WIDTH;
  const highlights = strokes.filter(stroke => stroke.tool === 'highlighter');
  if (highlights.length) {
    // 형광펜은 따로 한 장에 그린 뒤 레이어 전체에 불투명도를 준다(겹친 곳이 더 진해지지 않게 — 화면과 같다).
    const layer = document.createElement('canvas');
    layer.width = width; layer.height = height;
    const lctx = layer.getContext('2d');
    if (lctx) {
      lctx.setTransform(toPixels, 0, 0, toPixels, 0, 0);
      for (const stroke of highlights) drawStroke(lctx, stroke);
      ctx.save();
      ctx.globalAlpha = HIGHLIGHTER_OPACITY;
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(layer, 0, 0);
      ctx.restore();
    }
  }
  ctx.setTransform(toPixels, 0, 0, toPixels, 0, 0);
  for (const stroke of strokes) if (stroke.tool !== 'highlighter') drawStroke(ctx, stroke);
  return canvas.toDataURL('image/png');
}
