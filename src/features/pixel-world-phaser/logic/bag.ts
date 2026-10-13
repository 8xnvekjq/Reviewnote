// 가방(순수 모듈): 무게에 따른 이동 속도와 서버 응답 파싱. 서버 계산은 supabase/migrations/20261012120000_pixel_bag.sql.
/** crop: 텃밭 딸기 열매(ref 'strawberry') — 판매값은 하루 농사 상한 안에서만(서버 sell_pixel_bag). */
export type BagItemKind = 'fish' | 'bug' | 'crop';
export interface BagItem { kind: BagItemKind; ref: string; qty: number; unitWeight: number; unitPoints: number }
export interface BagCrop { id: string; sizeScore: number; unitWeight: number }
/** 손 칸(supabase/migrations/20261012150000_pixel_hand_slot.sql): 낚싯대(rod: 고른 낚싯대, id null = 기본 낚싯대)·잠자리채·맨손 중 하나. */
export type Hand = 'rod' | 'net' | 'bare';
export interface HandState { hand: Hand; rod: { id: string | null; tier: number }; netOwned: boolean; rods: string[] }
export const DEFAULT_HAND: HandState = { hand: 'rod', rod: { id: null, tier: 0 }, netOwned: false, rods: [] };
export interface Bag extends HandState { capacity: number; weight: number; items: BagItem[]; crops: BagCrop[] }
export const EMPTY_BAG: Bag = { capacity: 20, weight: 0, items: [], crops: [], ...DEFAULT_HAND };
/** 맨손 낚시 벌칙(서버와 같은 값, 안내용): 난이도 +0.5, 속도 ×0.8. */
export const BARE_HAND = { difficultyUp: 0.5, speed: 0.8 };
/** 손에 든 것의 짧은 이름. */
export const handLabel = (hand: Hand, rodName: string) => hand === 'net' ? '잠자리채' : hand === 'bare' ? '맨손' : rodName;
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
    return (i.kind === 'fish' || i.kind === 'bug' || i.kind === 'crop') && typeof i.ref === 'string' && Number.isInteger(qty) && qty > 0 && Number.isFinite(unitWeight) && Number.isFinite(unitPoints)
      ? [{ kind: i.kind, ref: i.ref, qty, unitWeight, unitPoints } as BagItem] : [];
  });
  const crops = (Array.isArray(raw.crops) ? raw.crops : []).filter(isObj).flatMap(c => {
    const sizeScore = num(c.sizeScore), unitWeight = num(c.unitWeight);
    return typeof c.id === 'string' && Number.isFinite(sizeScore) ? [{ id: c.id, sizeScore, unitWeight: Number.isFinite(unitWeight) ? unitWeight : 1.5 }] : [];
  });
  return { capacity, weight, items, crops, ...parseHand(raw) };
}
/** 손 칸 응답(가방·장착 결과 공통). 없거나 이상한 값은 기본(기본 낚싯대를 든 상태)으로 본다. */
export function parseHand(raw: unknown): HandState {
  if (!isObj(raw)) return DEFAULT_HAND;
  const hand: Hand = raw.hand === 'net' || raw.hand === 'bare' ? raw.hand : 'rod';
  const rod = isObj(raw.rod) && (typeof raw.rod.id === 'string' || raw.rod.id === null) && Number.isInteger(num(raw.rod.tier))
    ? { id: raw.rod.id as string | null, tier: num(raw.rod.tier) } : DEFAULT_HAND.rod;
  const rods = Array.isArray(raw.rods) ? raw.rods.filter((id): id is string => typeof id === 'string') : [];
  return { hand, rod, netOwned: raw.netOwned === true, rods };
}
