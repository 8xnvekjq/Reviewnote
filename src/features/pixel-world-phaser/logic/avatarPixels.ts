// 강아지 DOG.md와 같은 팔레트. 원본 몸/옷의 불투명 픽셀은 외곽선으로 덮지 않는다.
export const AVATAR_OUTLINE = [91, 57, 38] as const;
export const AVATAR_CHEEK = [234, 170, 148] as const;
type RGB = readonly number[];
export type FacePixel = { x: number; y: number; color: RGB };

// 눈 시트의 위치와 색을 읽으므로 피부색/눈동자색 및 원본 머리 흔들림을 그대로 따른다.
export function facePixels(eyes: Uint8ClampedArray, direction: 'Front' | 'Back' | 'Left' | 'Right'): FacePixel[] {
  if (direction === 'Back') return [];
  const anchors: { x: number; y: number; color: RGB }[] = [];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4;
    if (eyes[i + 3] && !anchors.some(p => p.x === x)) anchors.push({ x, y, color: Array.from(eyes.slice(i, i + 3)) });
  }
  const pixels: FacePixel[] = [];
  for (const anchor of anchors) {
    const x = anchor.x + (direction === 'Left' ? 1 : direction === 'Right' ? -2 : anchor.x > 15 ? -1 : 0);
    const y = anchor.y;
    pixels.push({ x, y, color: AVATAR_OUTLINE }, { x: x + 1, y, color: [255, 246, 225] },
      { x, y: y + 1, color: AVATAR_OUTLINE }, { x: x + 1, y: y + 1, color: anchor.color });
  }
  if (anchors.length) {
    const y = anchors[0].y;
    if (direction === 'Front') pixels.push({ x: 12, y: y + 2, color: AVATAR_CHEEK }, { x: 19, y: y + 2, color: AVATAR_CHEEK }, { x: 15, y: y + 3, color: AVATAR_OUTLINE });
    else pixels.push({ x: direction === 'Left' ? 15 : 16, y: y + 2, color: AVATAR_CHEEK }, { x: direction === 'Left' ? 12 : 19, y: y + 3, color: AVATAR_OUTLINE });
  }
  return pixels;
}

// 32×32 한 칸의 알파 스냅샷만 검사한다. 이웃 칸이나 새 외곽선에서 재확장하지 않는다.
export function outlineFrame(data: Uint8ClampedArray): void {
  const alpha = Uint8Array.from({ length: 1024 }, (_, p) => data[p * 4 + 3]);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const p = y * 32 + x;
    if (alpha[p]) continue;
    const adjacent = (x > 0 && alpha[p - 1]) || (x < 31 && alpha[p + 1]) || (y > 0 && alpha[p - 32]) || (y < 31 && alpha[p + 32]);
    if (adjacent) data.set([...AVATAR_OUTLINE, 255], p * 4);
  }
}

// 무료 기본 행의 색만 변경한다. 피부/장착 아이템은 별도 레이어이므로 그대로 유지한다.
export function recolorDefault(data: Uint8ClampedArray, layer: 'tops' | 'bottoms'): void {
  const palette = layer === 'tops'
    ? [[150, 13, 11], [184, 21, 18], [196, 20, 17]]
    : [[235, 109, 0], [252, 128, 3], [253, 133, 13]];
  const colors = layer === 'tops' ? [[202, 177, 139], [239, 220, 183], [255, 242, 213]] : [[32, 43, 68], [43, 61, 91], [53, 74, 108]];
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const shade = palette.findIndex(c => c.every((v, j) => v === data[i + j]));
    if (shade >= 0) data.set(colors[shade], i);
  }
}
