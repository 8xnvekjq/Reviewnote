import type { PixelAvatarSlot } from './types';

// Atlas rows, not item IDs. This PII-free mapping is shared by shop previews and room avatars.
export const AVATAR_ROW_BY_SLOT: Record<PixelAvatarSlot, Record<string, number>> = {
  top: { default: 0, sage: 1, blue: 2, necktie: 8, stripe: 11, vest: 17, sleeveless: 25 },
  bottom: { denim: 8 },
  shoes: { low: 7 },
  hair: { buns: 5, bob: 10, long: 15, swept: 20 },
  eyes: {},
};
export const AVATAR_SLOTS = ['hair', 'top', 'bottom', 'shoes'] as const;
export const SLOT_LABELS: Record<PixelAvatarSlot, string> = { hair: '헤어', top: '상의', bottom: '하의', shoes: '신발', eyes: '눈' };
