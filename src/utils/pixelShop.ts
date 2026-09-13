// TODO(integration): This file is a placeholder written by Worker C (Shop/Furniture UX) so the
// Pixel World shop UI compiles and runs standalone in an isolated worktree. Worker A owns the
// real implementation (Supabase RPCs/tables for the pixel item economy) and this whole file will
// be replaced by Worker A's actual module during integration — do not build on these bodies.
// Function names/signatures match the shared contract in src/features/pixel-room/shop/types.ts.
import type { PixelAvatarSlot, PixelItem, PublicAvatarAppearance, PurchasePixelItemResult } from '../features/pixel-room/shop/types';

export async function fetchPixelCatalog(): Promise<PixelItem[]> {
  throw new Error('not implemented — Worker A integration pending');
}

export async function fetchOwnedPixelItemIds(_userId: string): Promise<string[]> {
  throw new Error('not implemented — Worker A integration pending');
}

export async function fetchEquippedAppearance(_userId: string): Promise<PublicAvatarAppearance> {
  throw new Error('not implemented — Worker A integration pending');
}

export async function purchasePixelItem(_itemId: string): Promise<PurchasePixelItemResult> {
  throw new Error('not implemented — Worker A integration pending');
}

export async function equipPixelItem(_slot: PixelAvatarSlot, _itemId: string | null): Promise<{ ok: boolean }> {
  throw new Error('not implemented — Worker A integration pending');
}
