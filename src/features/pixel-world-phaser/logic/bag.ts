// 가방(순수 모듈): 무게에 따른 이동 속도와 서버 응답 파싱. 서버 계산은 supabase/migrations/20261012120000_pixel_bag.sql.
export type BagItemKind = 'fish' | 'bug';
export interface BagItem { kind: BagItemKind; ref: string; qty: number; unitWeight: number; unitPoints: number }
export interface BagCrop { id: string; sizeScore: number; unitWeight: number }
export interface Bag { capacity: number; weight: number; items: BagItem[]; crops: BagCrop[] }
export const EMPTY_BAG: Bag = { capacity: 20, weight: 0, items: [], crops: [] };
/** 이동 속도 최하(평소의 20%). */
export const MIN_BAG_SPEED = 0.2;

/** 가방 무게 → 이동 속도 배율. 용량까지는 그대로, 넘으면 점점 느려져 용량의 2배에서 20%, 그 뒤로는 20% 유지. */
export function bagSpeedFactor(weight: number, capacity: number): number {
  if (!(capacity > 0) || !(weight > capacity)) return 1;
  const over = weight / capacity - 1;
  return Math.max(MIN_BAG_SPEED, Math.round((1 - over * (1 - MIN_BAG_SPEED)) * 100) / 100);
}
export const bagValue = (bag: Bag) => bag.items.reduce((sum, item) => sum + item.qty * item.unitPoints, 0);

const num = (v: unknown) => typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function parseBag(raw: unknown): Bag | null {
  if (!isObj(raw)) return null;
  const capacity = num(raw.capacity), weight = num(raw.weight);
  if (!Number.isFinite(capacity) || !Number.isFinite(weight)) return null;
  const items = (Array.isArray(raw.items) ? raw.items : []).filter(isObj).flatMap(i => {
    const qty = num(i.qty), unitWeight = num(i.unitWeight), unitPoints = num(i.unitPoints);
    return (i.kind === 'fish' || i.kind === 'bug') && typeof i.ref === 'string' && Number.isInteger(qty) && qty > 0 && Number.isFinite(unitWeight) && Number.isFinite(unitPoints)
      ? [{ kind: i.kind, ref: i.ref, qty, unitWeight, unitPoints } as BagItem] : [];
  });
  const crops = (Array.isArray(raw.crops) ? raw.crops : []).filter(isObj).flatMap(c => {
    const sizeScore = num(c.sizeScore), unitWeight = num(c.unitWeight);
    return typeof c.id === 'string' && Number.isFinite(sizeScore) ? [{ id: c.id, sizeScore, unitWeight: Number.isFinite(unitWeight) ? unitWeight : 1.5 }] : [];
  });
  return { capacity, weight, items, crops };
}
