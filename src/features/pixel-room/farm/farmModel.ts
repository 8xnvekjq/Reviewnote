export const FARM_BEDS = [{ x: 11, y: 4 }, { x: 11, y: 7 }] as const;
export function isFarmCell({ x, y }: { x: number; y: number }): boolean {
  return FARM_BEDS.some(bed => x >= bed.x && x < bed.x + 2 && y >= bed.y && y < bed.y + 2);
}
export interface FarmCrop { id: string; plantedAt: string; readyAt: string; careCount: number; lastWateredOn: string | null }
export interface FarmPlot { index: number; revision: number; crop: FarmCrop | null }
export interface FarmSnapshot { serverNow: string; today: string; harvestCount: number; plots: FarmPlot[] }
export type FarmAction = 'plant' | 'water' | 'harvest';
export type FarmStage = 'empty' | 'sprout' | 'leaf' | 'fruit' | 'ripe';
export function farmStage(crop: FarmCrop | null, now: number): FarmStage {
  if (!crop) return 'empty';
  const planted = Date.parse(crop.plantedAt), ready = Date.parse(crop.readyAt);
  if (now >= ready) return 'ripe';
  const progress = (now - planted) / (ready - planted);
  return progress < .25 ? 'sprout' : progress < .75 ? 'leaf' : 'fruit';
}
export function farmDay(now: number): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function growthLabel(crop: FarmCrop, now: number): string {
  const minutes = Math.max(0, Math.ceil((Date.parse(crop.readyAt) - now) / 60000));
  return minutes === 0 ? '빨갛게 익었어요!' : minutes < 60 ? `수확까지 약 ${minutes}분` : `수확까지 약 ${Math.ceil(minutes / 60)}시간`;
}
