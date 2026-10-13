// 텃밭 텍스처(흙 두 가지·작물 단계별·스프링클러·수확 열매·울타리 문 표시)를 한 번만 만든다. 그림 격자는 logic/gardenSprites.ts.
import type Phaser from 'phaser';
import { CROP_H, CROP_W, GARDEN_PALETTE, POP_GRID, SOIL_COLORS, SPRINKLER_GRID, cropGrid, cropTextureKey } from '../logic/gardenSprites';
import type { CropType, GardenStage } from '../../pixel-room/farm/gardenModel';

function paint(grid: readonly string[], width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  grid.forEach((row, y) => [...row].forEach((ch, x) => {
    const color = GARDEN_PALETTE[ch];
    if (color) { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }
  }));
  return canvas;
}
/** 간 흙 한 칸: 가장자리 한 줄 진하게, 고랑 세 줄. */
function soil(kind: 'dry' | 'wet'): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 16; canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  const colors = SOIL_COLORS[kind];
  ctx.fillStyle = colors.edge; ctx.fillRect(1, 1, 14, 14);
  ctx.fillStyle = colors.fill; ctx.fillRect(2, 2, 12, 12);
  ctx.fillStyle = colors.line;
  for (const y of [4, 8, 12]) ctx.fillRect(3, y, 10, 1);
  if (kind === 'wet') { ctx.fillStyle = '#83c7ce'; ctx.fillRect(4, 6, 1, 1); ctx.fillRect(11, 10, 1, 1); }
  return canvas;
}

/** 울타리 한 칸: 가운데 기둥 + 이어지는 방향(북·동·남·서)으로 가로대 두 줄/세로대. 마을 아틀라스 울타리와 같은 나무색. */
export const fenceKey = (arms: { n: boolean; e: boolean; s: boolean; w: boolean }) =>
  `garden:fence:${arms.n ? 'n' : ''}${arms.e ? 'e' : ''}${arms.s ? 's' : ''}${arms.w ? 'w' : ''}`;
function fence(arms: { n: boolean; e: boolean; s: boolean; w: boolean }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 16; canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  const box = (x: number, y: number, w: number, h: number, light = false) => {
    ctx.fillStyle = '#4a2f22'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#d4914f'; ctx.fillRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
    if (light) { ctx.fillStyle = '#eeb070'; ctx.fillRect(x + 1, y + 1, Math.max(0, w - 2), 1); }
  };
  for (const y of [4, 9]) {
    if (arms.w) box(0, y, 9, 4, true);
    if (arms.e) box(7, y, 9, 4, true);
  }
  if (arms.n) box(6, 0, 4, 9);
  if (arms.s) box(6, 7, 4, 9);
  box(5, 1, 6, 13, true);
  ctx.fillStyle = '#b86f40'; ctx.fillRect(6, 12, 4, 1);
  return canvas;
}

const STAGES: readonly GardenStage[] = ['seed', 'sprout', 'grown', 'ripe'];
export function ensureGardenTextures(textures: Phaser.Textures.TextureManager) {
  if (textures.exists('garden:soil:dry')) return;
  textures.addCanvas('garden:soil:dry', soil('dry'));
  textures.addCanvas('garden:soil:wet', soil('wet'));
  for (const type of ['tomato', 'strawberry'] as CropType[]) {
    for (const stage of STAGES) textures.addCanvas(cropTextureKey(type, stage), paint(cropGrid(type, stage), CROP_W, CROP_H));
    textures.addCanvas(cropTextureKey(type, 'grown', true), paint(cropGrid(type, 'grown', true), CROP_W, CROP_H));
    textures.addCanvas(`garden:pop:${type}`, paint(POP_GRID[type], 3, 4));
  }
  textures.addCanvas('garden:sprinkler', paint(SPRINKLER_GRID, CROP_W, CROP_H));
  for (let bits = 0; bits < 16; bits++) {
    const arms = { n: !!(bits & 1), e: !!(bits & 2), s: !!(bits & 4), w: !!(bits & 8) };
    textures.addCanvas(fenceKey(arms), fence(arms));
  }
}
