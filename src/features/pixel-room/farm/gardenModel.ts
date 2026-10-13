// 텃밭: 울타리 안 칸마다 괭이로 갈고, 씨앗(토마토/딸기)을 심고, 물을 주고, 익으면 딴다. 순수 모듈.
// 서버 규칙은 supabase/migrations/20261020100200_pixel_garden_actions.sql(값을 같게 유지). 최종 판정은 늘 서버가 한다 —
// 여기 함수는 도구 막대·A 버튼 글자·그림을 고르는 데만 쓴다.
import { farmDay } from './farmModel';
import type { FarmCrop, FarmPlot, FarmSnapshot } from './farmModel';

/** 칸 번호 = y*8+x(가로 최대 8칸). 밭을 넓혀도 이미 있는 칸의 번호는 그대로다. */
export const GARDEN_STRIDE = 8;
/** 텃밭 크기(칸). 나중에 '지식의 조각으로 밭 넓히기'는 이 값과 서버 pixel_private.garden_dims만 바꾼다. */
export const GARDEN_SIZE = { cols: 6, rows: 4 } as const;
/** 울타리 왼쪽 위 칸(마당 칸 좌표, yard/yardModel.ts). 밭은 울타리 한 칸 안쪽이다. */
export const GARDEN_FENCE = { x: 8, y: 10 } as const;

type Cell = { x: number; y: number };
export const gardenIndex = (x: number, y: number) => y * GARDEN_STRIDE + x;
export const gardenXY = (index: number): Cell => ({ x: index % GARDEN_STRIDE, y: Math.floor(index / GARDEN_STRIDE) });
export const isGardenIndex = (index: number) => Number.isInteger(index) && index >= 0 && index < GARDEN_STRIDE * GARDEN_STRIDE
  && gardenXY(index).x < GARDEN_SIZE.cols && gardenXY(index).y < GARDEN_SIZE.rows;
export const GARDEN_INDEXES: readonly number[] = Array.from({ length: GARDEN_SIZE.rows }, (_, y) =>
  Array.from({ length: GARDEN_SIZE.cols }, (_, x) => gardenIndex(x, y))).flat();

/** 마당 칸 → 텃밭 칸 번호(울타리 안이 아니면 null). */
export function gardenIndexAt(cell: Cell): number | null {
  const x = cell.x - GARDEN_FENCE.x - 1, y = cell.y - GARDEN_FENCE.y - 1;
  return x >= 0 && y >= 0 && x < GARDEN_SIZE.cols && y < GARDEN_SIZE.rows ? gardenIndex(x, y) : null;
}
/** 텃밭 칸 번호 → 마당 칸. */
export const gardenYardCell = (index: number): Cell => {
  const { x, y } = gardenXY(index);
  return { x: GARDEN_FENCE.x + 1 + x, y: GARDEN_FENCE.y + 1 + y };
};
/** 울타리까지 포함한 텃밭 자리(마당 칸). */
export const inGardenFootprint = (cell: Cell) => cell.x >= GARDEN_FENCE.x && cell.y >= GARDEN_FENCE.y
  && cell.x <= GARDEN_FENCE.x + GARDEN_SIZE.cols + 1 && cell.y <= GARDEN_FENCE.y + GARDEN_SIZE.rows + 1;
/** 드나드는 문: 울타리 윗줄 가운데 두 칸(위쪽 흙길에서 바로 들어온다). */
export const GARDEN_GATE: readonly Cell[] = [0, 1].map(i => ({ x: GARDEN_FENCE.x + Math.floor(GARDEN_SIZE.cols / 2) + i, y: GARDEN_FENCE.y }));
export const isGardenGate = (cell: Cell) => GARDEN_GATE.some(g => g.x === cell.x && g.y === cell.y);
/** 울타리 칸(문 제외) — 막힌 칸. */
export const isGardenFence = (cell: Cell) => inGardenFootprint(cell) && gardenIndexAt(cell) === null && !isGardenGate(cell);

// ── 작물 ──────────────────────────────────────────────────────────────────────
export type CropType = 'tomato' | 'strawberry';
export const CROP_RULES: Readonly<Record<CropType, { name: string; growHours: number; regrowHours: number | null; maxHarvests: number; xp: number }>> = {
  tomato: { name: '토마토', growHours: 96, regrowHours: null, maxHarvests: 1, xp: 40 },
  // 토마토의 2/3 시간에 익고, 따면 '자람'으로 돌아가 절반 시간 뒤 다시 익는다. 세 번 따면 마른 흙.
  strawberry: { name: '딸기', growHours: 64, regrowHours: 32, maxHarvests: 3, xp: 10 },
};
/** 딸기 한 알 판매값(광장 상점). 한 번 딸 때 1알, 그동안 물을 한 번이라도 받았으면 2알. */
export const STRAWBERRY_POINTS = 2;
/** KST 하루 농사 상한 — 예전 밭 두 개의 하루 최대치(토마토 2개: 40 XP×2, 출품 최대 50P×2). 서버 pixel_private.farm_caps. */
export const FARM_DAILY_CAP = { xp: 80, points: 100 } as const;
export const SPRINKLER_ITEM_ID = 'tool_sprinkler';
export const cropTypeOf = (crop: Pick<FarmCrop, 'type'>): CropType => crop.type === 'strawberry' ? 'strawberry' : 'tomato';

/** 씨앗 → 새싹 → 자람 → 열매. 딸기를 한 번 딴 뒤에는 다시 익을 때까지 '자람'. */
export type GardenStage = 'seed' | 'sprout' | 'grown' | 'ripe';
export const STAGE_NAMES: Readonly<Record<GardenStage, string>> = { seed: '씨앗', sprout: '새싹', grown: '자람', ripe: '열매' };
export function gardenStage(crop: Pick<FarmCrop, 'plantedAt' | 'readyAt' | 'harvests'>, now: number): GardenStage {
  const planted = Date.parse(crop.plantedAt), ready = Date.parse(crop.readyAt);
  if (now >= ready) return 'ripe';
  if ((crop.harvests ?? 0) > 0) return 'grown';
  const progress = (now - planted) / Math.max(1, ready - planted);
  return progress < .2 ? 'seed' : progress < .5 ? 'sprout' : 'grown';
}
/** '자람' 뒤쪽 절반이면 토마토는 초록 열매가 달린 모습으로 그린다(단계는 그대로 '자람'). */
export const lateGrowth = (crop: Pick<FarmCrop, 'plantedAt' | 'readyAt'>, now: number) =>
  (now - Date.parse(crop.plantedAt)) / Math.max(1, Date.parse(crop.readyAt) - Date.parse(crop.plantedAt)) >= .75;

// ── 칸 상태 ───────────────────────────────────────────────────────────────────
export type Soil = 'grass' | 'tilled';
export const soilOf = (plot: Pick<FarmPlot, 'soil' | 'crop'>): Soil => plot.crop || plot.soil === 'tilled' ? 'tilled' : 'grass';
/** 오늘(KST) 비가 오나 — 서버가 준 날의 값만 믿는다(자정이 지나면 다음 새로고침까지 비 아님). */
export const rainingToday = (snapshot: Pick<FarmSnapshot, 'rainToday' | 'today'> | null, now: number) =>
  !!snapshot?.rainToday && snapshot.today === farmDay(now);
/** 젖은 흙: 오늘 물을 줬거나(직접·비·스프링클러 — 서버가 wateredOn에 적는다), 지금 비가 온다. 다음 날이면 다시 마른다. */
export function cellWet(plot: Pick<FarmPlot, 'soil' | 'crop' | 'wateredOn'>, snapshot: Pick<FarmSnapshot, 'rainToday' | 'today'> | null, now: number): boolean {
  if (soilOf(plot) !== 'tilled') return false;
  const today = farmDay(now);
  return plot.wateredOn === today || plot.crop?.lastWateredOn === today || rainingToday(snapshot, now);
}
export const sprinklerPlaced = (snapshot: Pick<FarmSnapshot, 'plots'> | null): number | null =>
  snapshot?.plots.find(plot => plot.sprinkler)?.index ?? null;
/** 스프링클러가 물을 주는 둘레 8칸. */
export function sprinklerCovers(sprinkler: number, index: number): boolean {
  const a = gardenXY(sprinkler), b = gardenXY(index);
  return sprinkler !== index && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
}

// ── 도구 → 할 일 ───────────────────────────────────────────────────────────────
export type GardenTool = 'hoe' | 'tomato' | 'strawberry' | 'water' | 'sprinkler';
export type GardenAction = 'till' | 'plant_tomato' | 'plant_strawberry' | 'water' | 'harvest' | 'place_sprinkler' | 'remove_sprinkler';
export const TOOL_NAMES: Readonly<Record<GardenTool, string>> = { hoe: '괭이', tomato: '토마토 씨앗', strawberry: '딸기 씨앗', water: '물뿌리개', sprinkler: '스프링클러' };
export interface GardenChoice { action: GardenAction | null; verb: string; reason?: string }
/** 고른 도구로 이 칸에 할 일. 익은 작물은 어떤 도구로든 딴다. action이 null이면 reason을 안내한다. */
export function gardenAction(plot: FarmPlot | undefined, tool: GardenTool, ctx: { now: number; sprinklerOwned?: boolean; sprinklerAt?: number | null }): GardenChoice {
  if (!plot) return { action: null, verb: '확인 중', reason: '밭을 확인하고 있어요…' };
  const crop = plot.crop, today = farmDay(ctx.now);
  if (crop && gardenStage(crop, ctx.now) === 'ripe') return { action: 'harvest', verb: `${CROP_RULES[cropTypeOf(crop)].name} 따기` };
  if (tool === 'sprinkler') {
    if (!ctx.sprinklerOwned) return { action: null, verb: '스프링클러', reason: '스프링클러는 광장 상점 도구 칸에서 살 수 있어요.' };
    if (plot.sprinkler) return { action: 'remove_sprinkler', verb: '스프링클러 거두기' };
    if (crop) return { action: null, verb: '스프링클러', reason: '작물이 없는 칸에 놓아 주세요.' };
    if (ctx.sprinklerAt != null) return { action: null, verb: '스프링클러', reason: '스프링클러는 하나예요. 놓인 것을 먼저 거둬 주세요.' };
    return { action: 'place_sprinkler', verb: '스프링클러 놓기' };
  }
  if (plot.sprinkler) return { action: null, verb: TOOL_NAMES[tool], reason: '스프링클러가 있는 칸이에요.' };
  const soil = soilOf(plot);
  if (tool === 'hoe') {
    if (crop) return { action: null, verb: '갈기', reason: `${CROP_RULES[cropTypeOf(crop)].name}가 자라고 있어요.` };
    return soil === 'tilled' ? { action: null, verb: '갈기', reason: '이미 간 흙이에요. 씨앗을 심어 보세요.' } : { action: 'till', verb: '갈기' };
  }
  if (tool === 'tomato' || tool === 'strawberry') {
    if (crop) return { action: null, verb: '심기', reason: '이미 작물이 자라고 있어요.' };
    if (soil !== 'tilled') return { action: null, verb: '심기', reason: '괭이로 먼저 흙을 갈아 주세요.' };
    return { action: tool === 'tomato' ? 'plant_tomato' : 'plant_strawberry', verb: `${CROP_RULES[tool].name} 심기` };
  }
  // 물뿌리개
  if (soil !== 'tilled') return { action: null, verb: '물 주기', reason: '괭이로 먼저 흙을 갈아 주세요.' };
  if (crop ? crop.lastWateredOn === today : plot.wateredOn === today) return { action: null, verb: '물 주기', reason: '오늘은 이미 촉촉해요.' };
  return { action: 'water', verb: '물 주기' };
}

/** 서버 결과 → 짧은 안내. */
export function gardenResultMessage(action: GardenAction, result: string | undefined, harvest?: { cropType?: string; sizeScore?: number; bonusApplied?: boolean; berries?: number; harvests?: number; maxHarvests?: number }): string {
  if (result === 'ok') {
    if (action === 'harvest' && harvest?.cropType === 'strawberry') {
      const left = (harvest.maxHarvests ?? 3) - (harvest.harvests ?? 0);
      return `딸기 ${harvest.berries ?? 1}알을 가방에 넣었어요!${left > 0 ? ` 앞으로 ${left}번 더 열려요.` : ' 이 포기는 다 땄어요.'}`;
    }
    if (action === 'harvest') return harvest?.sizeScore != null
      ? `토마토를 땄어요! ${harvest.sizeScore}/100${harvest.bonusApplied ? ' · 꾸준한 복습 보너스!' : ''} — 가방에 넣었어요.` : '토마토를 땄어요!';
    return ({ till: '흙을 갈았어요.', plant_tomato: '토마토를 심었어요. 물을 주세요!', plant_strawberry: '딸기를 심었어요. 물을 주세요!',
      water: '물을 줬어요. 오늘의 돌봄 +1', place_sprinkler: '스프링클러를 놓았어요. 매일 둘레 8칸에 물을 줘요.', remove_sprinkler: '스프링클러를 거뒀어요.' } as const)[action];
  }
  return ({
    changed: '다른 곳에서 바뀐 밭을 불러왔어요.', already_watered: '오늘은 이미 촉촉해요.', ready: '다 익었어요. 따 주세요!',
    growing: '아직 자라고 있어요. 조금만 기다려 주세요.', untilled: '괭이로 먼저 흙을 갈아 주세요.', occupied: '이미 작물이 있는 칸이에요.',
    already: '이미 그렇게 되어 있어요.', blocked: '스프링클러가 있는 칸이에요.', no_sprinkler: '스프링클러는 광장 상점에서 살 수 있어요.',
    sprinkler_elsewhere: '스프링클러는 하나예요. 놓인 것을 먼저 거둬 주세요.',
  } as Record<string, string>)[result ?? ''] ?? '밭을 다시 확인해 주세요.';
}

// ── 그림용 요약(Phaser 장면에 넘긴다) ───────────────────────────────────────────
export interface GardenCellLook { index: number; soil: Soil; wet: boolean; sprinkler: boolean; crop: { type: CropType; stage: GardenStage; late: boolean } | null }
export interface GardenLook { cells: GardenCellLook[]; rain: boolean }
export function gardenLook(snapshot: FarmSnapshot | null, now: number): GardenLook {
  const plots = new Map(snapshot?.plots.map(plot => [plot.index, plot]) ?? []);
  return {
    rain: rainingToday(snapshot, now),
    cells: GARDEN_INDEXES.map(index => {
      const plot = plots.get(index) ?? { index, revision: 0, crop: null };
      const crop = plot.crop;
      return { index, soil: soilOf(plot), wet: cellWet(plot, snapshot, now), sprinkler: !!plot.sprinkler,
        crop: crop ? { type: cropTypeOf(crop), stage: gardenStage(crop, now), late: lateGrowth(crop, now) } : null };
    }),
  };
}
/** 모습이 실제로 바뀔 때만 다시 그리도록 접은 열쇠. */
export const gardenLookKey = (look: GardenLook) => (look.rain ? 'R' : '') + look.cells.map(c =>
  `${c.soil[0]}${c.wet ? 'w' : ''}${c.sprinkler ? 's' : ''}${c.crop ? c.crop.type[0] + c.crop.stage[0] + (c.crop.late ? 'l' : '') : ''}`).join(',');
