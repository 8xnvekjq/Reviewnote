import type { PixelAvatarSlot, PublicAvatarAppearance } from '../features/pixel-room/shop/types';
import { AVATAR_ROW_BY_SLOT } from '../features/pixel-room/shop/appearanceRows.ts';

// Pure mapping logic split out of pixelShop.ts (which imports the live Supabase client and so
// can't be exercised directly by `node --test` without a real env) — mirrors this codebase's
// existing reviewCheck.ts (pure) / reviewCheckClient.ts (thin Supabase wrapper) split.

export type EquipmentRow = Record<PixelAvatarSlot, string | null>;
// 무료 기본 appearance — 카탈로그/소유 개념이 없으므로 item_id가 아니라 이미 assetKey 형태의
// 값을 그대로 담는다(pixel_avatar_equipment.skin_tone/eye_color 컬럼과 1:1).
export interface BaseAppearanceRow { skin_tone: string | null; eye_color: string | null }

export const EMPTY_APPEARANCE: PublicAvatarAppearance = { top: null, bottom: null, shoes: null, hair: null, eyes: null, skin: null };

/** DB에 저장된 값이 이미 삭제/오타 등으로 유효하지 않으면(예: appearanceRows.ts에서 지운 색상
 * 키) 방어적으로 기본값(null -> row 0)으로 취급한다 — 잘못된 assetKey가 그대로 렌더러에 들어가
 * "알 수 없는 색"이 되는 대신, 항상 알려진 모습으로 표시된다. */
function resolveFreeKey(slot: 'eyes' | 'skin', key: string | null | undefined): string | null {
  if (!key) return null;
  return key in AVATAR_ROW_BY_SLOT[slot] ? key : null;
}

/** Equipped item_ids (per slot) + a catalog itemId->assetKey lookup, plus the free base-appearance
 * row -> the public, PII-free PublicAvatarAppearance shape (assetKey values, not itemId, per the
 * shared contract). An item_id with no catalog match (e.g. delisted) is treated as unequipped,
 * defensively. */
export function toPublicAvatarAppearance(
  equipped: Partial<EquipmentRow> | null,
  assetKeyByItemId: ReadonlyMap<string, string>,
  base?: Partial<BaseAppearanceRow> | null,
): PublicAvatarAppearance {
  if (!equipped) return { ...EMPTY_APPEARANCE, eyes: resolveFreeKey('eyes', base?.eye_color), skin: resolveFreeKey('skin', base?.skin_tone) };
  const resolve = (itemId: string | null | undefined): string | null => {
    if (!itemId) return null;
    return assetKeyByItemId.get(itemId) ?? null;
  };
  return {
    top: resolve(equipped.top),
    bottom: resolve(equipped.bottom),
    shoes: resolve(equipped.shoes),
    hair: resolve(equipped.hair),
    eyes: resolveFreeKey('eyes', base?.eye_color),
    skin: resolveFreeKey('skin', base?.skin_tone),
  };
}
