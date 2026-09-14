import { supabase } from '../services/supabase';
import type { PixelItem, PixelAvatarSlot, PublicAvatarAppearance, PurchasePixelItemResult } from '../features/pixel-room/shop/types';
import { toPublicAvatarAppearance, EMPTY_APPEARANCE, type EquipmentRow } from './pixelShopAppearance';

export { toPublicAvatarAppearance } from './pixelShopAppearance';

// Pixel World Phase 1 — Economy/Ownership client wrapper (Worker A's public API surface for
// Worker B/Worker C). All state mutation happens through SECURITY DEFINER RPCs
// (purchase_pixel_item / equip_pixel_item) on tables whose RLS only allows SELECT for
// `authenticated` — there is no direct insert/update/delete path from the client, by design
// (see the pixel_world_phase1_ownership migration). These functions are thin, typed I/O
// wrappers only; they do not compute prices, ownership, or equip eligibility themselves —
// the server is the only place those decisions are made.

interface PixelItemCatalogRow {
  item_id: string;
  category: 'avatar' | 'furniture';
  slot: PixelAvatarSlot | 'furniture';
  price: number;
  asset_key: string;
  display_name: string;
  tier: 1 | 2 | 3;
  stackable: boolean;
}

function mapCatalogRow(row: PixelItemCatalogRow): PixelItem {
  return {
    itemId: row.item_id,
    category: row.category,
    slot: row.slot,
    price: row.price,
    assetKey: row.asset_key,
    displayName: row.display_name,
    tier: row.tier,
    stackable: false,
  };
}

/** Full v1 catalog, straight from the server (authoritative — never trust a client copy for price). */
export async function fetchPixelCatalog(): Promise<PixelItem[]> {
  const { data, error } = await supabase
    .from('pixel_item_catalog')
    .select('item_id, category, slot, price, asset_key, display_name, tier, stackable');
  if (error) throw error;
  return (data || []).map(mapCatalogRow);
}

/** itemIds this user owns (avatar + furniture together — callers filter by category/slot as needed). */
export async function fetchOwnedPixelItemIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('pixel_item_ownership')
    .select('item_id')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map((row: { item_id: string }) => row.item_id);
}

/** This user's equipped avatar appearance, shaped for the shared PublicAvatarAppearance contract
 * (assetKey values, no PII — safe to eventually show other students). No row yet -> all-null (defaults). */
export async function fetchEquippedAppearance(userId: string): Promise<PublicAvatarAppearance> {
  const [{ data: equipRow, error: equipError }, catalog] = await Promise.all([
    supabase
      .from('pixel_avatar_equipment')
      .select('top, bottom, shoes, hair, eyes')
      .eq('user_id', userId)
      .maybeSingle(),
    fetchPixelCatalog(),
  ]);
  if (equipError) throw equipError;
  if (!equipRow) return EMPTY_APPEARANCE;

  const assetKeyByItemId = new Map(catalog.map(item => [item.itemId, item.assetKey]));
  return toPublicAvatarAppearance(equipRow as Partial<EquipmentRow>, assetKeyByItemId);
}

/** Spend points to own an item. Server looks up price/existence itself — no price is ever sent
 * from here. Safe to call again after a failed/uncertain network response: the RPC is
 * idempotent per item (double purchase -> ok:false, reason:'already_owned', never double-charges). */
export async function purchasePixelItem(itemId: string): Promise<PurchasePixelItemResult> {
  const { data, error } = await supabase.rpc('purchase_pixel_item', { p_item_id: itemId });
  if (error) {
    return { ok: false, reason: 'unknown', message: error.message || '구매 중 오류가 발생했어요.' };
  }
  return data as PurchasePixelItemResult;
}

export type EquipPixelItemResult =
  | { ok: true; slot: PixelAvatarSlot; itemId: string | null }
  | { ok: false; reason: 'invalid_slot' | 'not_found' | 'not_owned' | 'unknown'; message: string };

/** Equip (or, with itemId null, unequip) an owned avatar item into one slot. Server verifies
 * ownership itself; this never assumes what the caller already checked client-side. */
export async function equipPixelItem(slot: PixelAvatarSlot, itemId: string | null): Promise<EquipPixelItemResult> {
  const { data, error } = await supabase.rpc('equip_pixel_item', { p_slot: slot, p_item_id: itemId });
  if (error) {
    return { ok: false, reason: 'unknown', message: error.message || '장착 중 오류가 발생했어요.' };
  }
  return data as EquipPixelItemResult;
}

export interface FurniturePlacementRow { itemId: string; x: number; y: number }

/** This user's server-stored furniture layout — the authoritative source for "다른 기기에서도
 * 같은 배치" (previously localStorage-only, per-device). RLS already scopes rows to the caller
 * (or an admin), but we still filter by userId explicitly for the same clarity as the other
 * fetch* helpers here. */
export async function fetchPixelFurniturePlacement(userId: string): Promise<FurniturePlacementRow[]> {
  const { data, error } = await supabase
    .from('pixel_furniture_placement')
    .select('item_id, x, y')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map((row: { item_id: string; x: number; y: number }) => ({ itemId: row.item_id, x: row.x, y: row.y }));
}

export type SavePixelRoomLayoutResult =
  | { ok: true; count: number }
  | { ok: false; reason: 'invalid_payload' | 'duplicate_item' | 'out_of_bounds' | 'not_found' | 'not_owned' | 'unknown'; message: string };

/** Replaces the caller's ENTIRE furniture layout in one atomic call — mirrors how the client's
 * RoomState.furniture is itself a full array, so place/move/remove all go through this same
 * function (remove = call again without that item). Server re-validates ownership, item
 * category, bounds and duplicates itself; nothing here is trusted price/ownership input. */
export async function savePixelRoomLayout(placements: FurniturePlacementRow[]): Promise<SavePixelRoomLayoutResult> {
  const { data, error } = await supabase.rpc('save_pixel_room_layout', {
    p_placements: placements.map(p => ({ itemId: p.itemId, x: p.x, y: p.y })),
  });
  if (error) {
    return { ok: false, reason: 'unknown', message: error.message || '가구 배치를 저장하지 못했어요.' };
  }
  return data as SavePixelRoomLayoutResult;
}
