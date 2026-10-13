// 텃밭 칸 그림(16px 칸에 맞춘 도트). 순수 모듈: 글자 격자 + 색표 → game/gardenArt.ts가 캔버스로 그린다.
// 색은 기존 토마토 그림(pixel-room/farm/TomatoSprite.tsx)과 같은 팔레트 — 흙(마름/젖음), 줄기·잎, 빨간/초록 토마토,
// 지지대. 익은 토마토 열매는 그 그림의 열매(진한 빨강 바탕 + 밝은 빨강 + 꼭지 + 노란 반짝임)를 칸 크기로 옮긴 것이다.
// 딸기는 같은 잎 색으로 낮게 퍼지는 포기, 흰 꽃(자람 뒤쪽), 씨가 박힌 빨간 열매.
import type { CropType, GardenStage } from '../../pixel-room/farm/gardenModel';

export const GARDEN_PALETTE: Readonly<Record<string, string>> = {
  g: '#387140', l: '#70a747', c: '#3d713e',          // 줄기·잎·꼭지(TomatoSprite)
  r: '#b73931', R: '#ee6646', h: '#e8b77d',          // 익은 토마토(TomatoSprite)
  f: '#638344', F: '#a0b95b',                        // 초록 토마토(TomatoSprite)
  s: '#b78c56',                                      // 지지대(TomatoSprite)
  m: '#8a5a36', e: '#e6d3a3',                        // 씨앗 두둑·씨
  b: '#a8283a', B: '#e8504f', d: '#ffe08a',          // 딸기
  w: '#fff4d9', y: '#ecbe40',                        // 딸기 꽃
  n: '#9aa3a8', N: '#5f6b73', q: '#83c7ce',          // 스프링클러·물
};
/** 흙(TomatoSprite의 SOIL_FILL/SOIL_LINE 마름·젖음). */
export const SOIL_COLORS = { dry: { fill: '#c2986a', line: '#99653c', edge: '#a77d50' }, wet: { fill: '#714830', line: '#543b2e', edge: '#5d3b28' } } as const;

/** 작물 그림 크기: 가로 16, 세로 20(위 4줄은 칸 위로 삐져나온다 — 다 자란 토마토는 칸보다 키가 크다). */
export const CROP_W = 16, CROP_H = 20;
const blank = () => Array.from({ length: CROP_H }, () => '.'.repeat(CROP_W).split(''));
function stamp(grid: string[][], rows: readonly string[], x: number, y: number) {
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => { if (ch !== '.' && grid[y + dy]?.[x + dx] !== undefined) grid[y + dy][x + dx] = ch; }));
  return grid;
}
const done = (grid: string[][]) => grid.map(row => row.join(''));

const MOUND = ['..mmmmmm..', '.mmmmmmmm.'];
const SEED = (dot: string) => done(stamp(stamp(blank(), MOUND, 3, 17), [`..${dot}..${dot}.`, `....${dot}...`], 4, 16));
const SPROUT = done(stamp(stamp(blank(), MOUND, 3, 18), [
  '.ll..ll.',
  'llll.lll',
  '.lgl.gl.',
  '...gg...',
  '...g....',
  '...g....',
], 4, 12));
const TOMATO_PLANT = [
  '......s...',
  '.ll...s...',
  'llll..s.ll',
  'lgll..slll',
  '.gg.g.sgl.',
  '....gg....',
  'll..g.s...',
  'lll.g.sll.',
  'lgl.gglsll',
  '.gg.g.sgl.',
  '....gg.s..',
  '.ll..g.s..',
  'lll.gg.sl.',
  '.l...g.s..',
  '.....g.s..',
  '.....g.s..',
];
/** 익은 토마토 열매(4줄×3칸): 꼭지, 밝은 빨강+반짝임, 진한 빨강 아래. */
const TOMATO_FRUIT = ['.c.', 'RRh', 'rRR', '.rr'];
const greenFruit = (rows: readonly string[]) => rows.map(row => row.replace(/R|h/g, 'F').replace(/r/g, 'f'));
function tomato(fruit: readonly string[] | null) {
  const grid = stamp(stamp(blank(), MOUND, 3, 18), TOMATO_PLANT, 3, 2);
  if (fruit) for (const [x, y] of [[2, 8], [10, 6], [6, 13]] as const) stamp(grid, fruit, x, y);
  return done(grid);
}
const BERRY_BUSH = [
  '...l..l.....',
  '.llll.lll...',
  'llgllllgll.l',
  'lglglllglllll',
  'lllggllgglgll',
  'llgg.gg.gg.gl',
  '.g...g...g..',
];
const FLOWER = ['.w.', 'wyw', '.w.'];
const BERRY = ['.c.', 'BdB', 'BBb', '.b.'];
function strawberry(extra: readonly string[] | null, at: readonly (readonly [number, number])[]) {
  const grid = stamp(stamp(blank(), MOUND, 3, 18), BERRY_BUSH, 2, 11);
  if (extra) for (const [x, y] of at) stamp(grid, extra, x, y);
  return done(grid);
}
const SPRINKLER = done(stamp(blank(), [
  '.q.......q.',
  '..q.....q..',
  '....nnn....',
  '...nNNNn...',
  'q...nNn...q',
  '....nNn....',
  '....NNN....',
  '...nNNNn...',
  '..nNNNNNn..',
  '..NNNNNNN..',
], 3, 9));

/** 작물 그림 하나(텍스처 이름 → 격자). late: 토마토는 초록 열매, 딸기는 꽃. */
export function cropGrid(type: CropType, stage: GardenStage, late = false): readonly string[] {
  if (stage === 'seed') return SEED(type === 'tomato' ? 'e' : 'd');
  if (stage === 'sprout') return SPROUT;
  if (type === 'tomato') return stage === 'ripe' ? tomato(TOMATO_FRUIT) : tomato(late ? greenFruit(TOMATO_FRUIT) : null);
  return stage === 'ripe' ? strawberry(BERRY, [[2, 14], [7, 15], [11, 13]]) : strawberry(late ? FLOWER : null, [[3, 10], [9, 11]]);
}
export const cropTextureKey = (type: CropType, stage: GardenStage, late = false) =>
  `garden:${type}:${stage}${late && stage === 'grown' ? ':late' : ''}`;
export const SPRINKLER_GRID: readonly string[] = SPRINKLER;
/** 수확할 때 가방으로 튀어 들어가는 열매(4줄×3칸). */
export const POP_GRID: Readonly<Record<CropType, readonly string[]>> = { tomato: TOMATO_FRUIT, strawberry: BERRY };
