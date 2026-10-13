// 가방 RPC(supabase/migrations/20261012120000_pixel_bag.sql). 무게·판매값 계산은 서버가 한다.
import { supabase } from '../services/supabase';
import { parseBag, parseHand, type Bag, type BagItemKind, type HandState } from '../features/pixel-world-phaser/logic/bag';

/** farmCapped: 딸기 일부가 오늘 농사 상한 때문에 팔리지 않고 가방에 남았다. */
export type SellBagResult = { ok: true; sold: number; value: number; awarded: number; farmCapped?: boolean; bag: Bag | null } | { ok: false; message: string; bag: Bag | null };

export async function fetchPixelBag(): Promise<Bag | null> {
  try { const { data, error } = await supabase.rpc('get_pixel_bag'); return error ? null : parseBag(data); }
  catch { return null; }
}
/** items가 null이면 물고기·곤충 전부 판다. */
export async function sellPixelBag(items: { kind: BagItemKind; ref: string; qty: number }[] | null): Promise<SellBagResult> {
  try {
    const { data, error } = await supabase.rpc('sell_pixel_bag', { p_items: items });
    if (error) throw error;
    const bag = parseBag(data?.bag);
    if (data?.ok === true) return { ok: true, sold: Number(data.sold) || 0, value: Number(data.value) || 0, awarded: Number(data.points?.awarded) || 0, farmCapped: data.farmCapped === true, bag };
    return { ok: false, message: data?.reason === 'nothing' ? '팔 물건이 없어요.' : data?.reason === 'farm_cap' ? '오늘 받을 수 있는 농사 포인트를 다 받았어요. 딸기는 내일 팔아 주세요!' : '팔지 못했어요. 다시 시도해 주세요.', bag };
  } catch { return { ok: false, message: '판매 결과를 확인하지 못했어요. 다시 확인해 주세요.', bag: null }; }
}

/** 손에 들기: null = 맨손, 'rod_basic' = 기본 낚싯대, 'rod_*' = 산 낚싯대, 'tool_net' = 잠자리채. */
export type EquipHandResult = ({ ok: true } & HandState) | { ok: false; message: string };
export async function equipPixelHand(itemId: string | null): Promise<EquipHandResult> {
  try {
    const { data, error } = await supabase.rpc('equip_pixel_hand', { p_item_id: itemId });
    if (error) throw error;
    if (data?.ok === true) return { ok: true, ...parseHand(data) };
    return { ok: false, message: data?.reason === 'not_owned' ? '아직 가지고 있지 않아요.' : '손에 들지 못했어요. 다시 시도해 주세요.' };
  } catch { return { ok: false, message: '손에 들지 못했어요. 다시 시도해 주세요.' }; }
}
