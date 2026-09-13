import type { PixelAvatarSlot, PublicAvatarAppearance } from '../features/pixel-room/shop/types';

// Pure mapping logic split out of pixelShop.ts (which imports the live Supabase client and so
// can't be exercised directly by `node --test` without a real env) — mirrors this codebase's
// existing reviewCheck.ts (pure) / reviewCheckClient.ts (thin Supabase wrapper) split.

export type EquipmentRow = Record<PixelAvatarSlot, string | null>;

export const EMPTY_APPEARANCE: PublicAvatarAppearance = { top: null, bottom: null, shoes: null, hair: null, eyes: null };

/** Equipped item_ids (per slot) + a catalog itemId->assetKey lookup -> the public, PII-free
 * PublicAvatarAppearance shape (assetKey values, not itemId, per the shared contract). An
 * item_id with no catalog match (e.g. delisted) is treated as unequipped, defensively. */
export function toPublicAvatarAppearance(
  equipped: Partial<EquipmentRow> | null,
  assetKeyByItemId: ReadonlyMap<string, string>,
): PublicAvatarAppearance {
  if (!equipped) return { ...EMPTY_APPEARANCE };
  const resolve = (itemId: string | null | undefined): string | null => {
    if (!itemId) return null;
    return assetKeyByItemId.get(itemId) ?? null;
  };
  return {
    top: resolve(equipped.top),
    bottom: resolve(equipped.bottom),
    shoes: resolve(equipped.shoes),
    hair: resolve(equipped.hair),
    eyes: resolve(equipped.eyes),
  };
}
