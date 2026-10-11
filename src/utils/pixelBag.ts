// 가방 RPC(supabase/migrations/20261012120000_pixel_bag.sql). 무게·판매값 계산은 서버가 한다.
import { supabase } from '../services/supabase';
import { parseBag, type Bag, type BagItemKind } from '../features/pixel-world-phaser/logic/bag';

export type SellBagResult = { ok: true; sold: number; value: number; awarded: number; bag: Bag | null } | { ok: false; message: string; bag: Bag | null };

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
    if (data?.ok === true) return { ok: true, sold: Number(data.sold) || 0, value: Number(data.value) || 0, awarded: Number(data.points?.awarded) || 0, bag };
    return { ok: false, message: data?.reason === 'nothing' ? '팔 물건이 없어요.' : '팔지 못했어요. 다시 시도해 주세요.', bag };
  } catch { return { ok: false, message: '판매 결과를 확인하지 못했어요. 다시 확인해 주세요.', bag: null }; }
}
