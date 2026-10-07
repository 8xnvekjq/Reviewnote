// 강아지 DOG.md와 같은 팔레트. 원본 몸/옷의 불투명 픽셀은 외곽선으로 덮지 않는다.
export const AVATAR_OUTLINE = [91, 57, 38] as const;
export const AVATAR_CHEEK = [234, 170, 148] as const;
type RGB = readonly number[];
export type FacePixel = { x: number; y: number; color: RGB };

// 눈 시트의 위치와 색을 읽으므로 피부색/눈동자색 및 원본 머리 흔들림을 그대로 따른다.
// 몸 시트에는 2칸짜리 눈(흰자+검은 눈동자)이 그려져 있다. 점 눈은 눈동자 칸(눈 시트 칸)에 그대로 찍고,
// 몸 칸(body)을 주면 바로 옆 흰자를 그 아래 피부색으로 덮는다 — 예전에는 오른쪽 눈만 한 칸 안쪽으로 옮겨서
// "점 눈 + 원래 눈동자 + 흰자" 3칸짜리 눈이 되어 짝짝이로 보였다.
export function facePixels(eyes: Uint8ClampedArray, direction: 'Front' | 'Back' | 'Left' | 'Right', body?: Uint8ClampedArray): FacePixel[] {
  if (direction === 'Back') return [];
  const anchors: { x: number; y: number; color: RGB }[] = [];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4;
    if (eyes[i + 3] && !anchors.some(p => p.x === x)) anchors.push({ x, y, color: Array.from(eyes.slice(i, i + 3)) });
  }
  const pixels: FacePixel[] = [];
  const at = (x: number, y: number) => body && x >= 0 && x < 32 && y >= 0 && y < 32 && body[(y * 32 + x) * 4 + 3] ? Array.from(body.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 3)) : null;
  for (const anchor of anchors) {
    const { x, y } = anchor;
    const skin = at(x, y + 2);
    if (skin) for (const side of [x - 1, x + 1]) for (const row of [y, y + 1]) {
      const c = at(side, row);
      if (c && c.every(v => v > 220)) pixels.push({ x: side, y: row, color: skin });
    }
    // 강아지처럼 동글한 점 눈: 눈 색을 아주 어둡게 해서 색감만 남긴다(1×2).
    const bead = anchor.color.map(v => Math.round(v * 0.35 + AVATAR_OUTLINE[0] * 0.15));
    pixels.push({ x, y, color: bead }, { x, y: y + 1, color: bead });
  }
  if (anchors.length) {
    const y = anchors[0].y;
    if (direction === 'Front') pixels.push({ x: 12, y: y + 2, color: AVATAR_CHEEK }, { x: 19, y: y + 2, color: AVATAR_CHEEK }, { x: 15, y: y + 3, color: AVATAR_OUTLINE });
    else {
      // 옆모습: 볼은 눈 두 칸 뒤, 입은 눈 한 칸 앞(왼쪽/오른쪽이 서로 거울처럼).
      const ahead = direction === 'Left' ? -1 : 1;
      pixels.push({ x: anchors[0].x - ahead * 2, y: y + 2, color: AVATAR_CHEEK }, { x: anchors[0].x + ahead, y: y + 3, color: AVATAR_OUTLINE });
    }
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
