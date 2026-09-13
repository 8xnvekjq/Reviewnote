// Server-truth "what does this student have equipped" — Phase 1 moves this out of the
// client-only RoomState (localStorage) and into Worker A's economy RPCs. This module is the
// one seam PixelRoom.tsx depends on for that, so swapping the stub for the real call is a
// one-line change here rather than a PixelRoom.tsx edit.
import type { PublicAvatarAppearance } from './shop/types';

export const DEFAULT_AVATAR_APPEARANCE: PublicAvatarAppearance = {
  top: null, bottom: null, shoes: null, hair: null, eyes: null,
};

// TODO(integration): replace this stub with the real `fetchEquippedAppearance` from
// src/utils/pixelShop.ts once Worker A's economy work (equipPixelItem / fetchEquippedAppearance
// RPCs) is merged. That file didn't exist yet in this worktree (parallel work), so this
// placeholder keeps PixelRoom.tsx honest against the PublicAvatarAppearance contract without
// blocking on it. Until swapped, every student resolves to "nothing equipped" (all null), which
// renders identically to today's default avatar (row 0 on every layer) — a safe, non-breaking
// fallback, not a guess at real data.
export async function fetchEquippedAppearance(userId: string): Promise<PublicAvatarAppearance> {
  void userId;
  return { ...DEFAULT_AVATAR_APPEARANCE };
}
