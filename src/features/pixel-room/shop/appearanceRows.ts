import type { PixelAvatarSlot } from './types';

// Atlas rows, not item IDs. This PII-free mapping is shared by shop previews and room avatars.
// ribbon_*/vest_black(top), shorts_*/pants_black(bottom), *_blonde/*_black(hair)는 docs/pixel-world-content.md의
// 실제 에셋 감사(29/14/25행)에서 확인된, 기존에 팔지 않던 실루엣/색상 행을 새로 카탈로그에 올린 것 —
// 새 PNG나 행 추가 없이 이미 있던 행만 더 쓴다.
export const AVATAR_ROW_BY_SLOT: Record<PixelAvatarSlot, Record<string, number>> = {
  top: {
    default: 0, sage: 1, blue: 2, necktie: 8, stripe: 11, vest: 17, sleeveless: 25,
    ribbon_red: 14, ribbon_blue: 15, ribbon_black: 16, vest_black: 19,
  },
  bottom: { denim: 8, shorts_blue: 2, shorts_black: 4, pants_black: 10 },
  shoes: { low: 7 },
  hair: {
    buns: 5, bob: 10, long: 15, swept: 20,
    buns_blonde: 7, buns_black: 8, bob_blonde: 12, bob_black: 13,
    long_blonde: 17, long_black: 18, swept_blonde: 22, swept_black: 23,
  },
  eyes: {},
};
export const AVATAR_SLOTS = ['hair', 'top', 'bottom', 'shoes'] as const;
export const SLOT_LABELS: Record<PixelAvatarSlot, string> = { hair: '헤어', top: '상의', bottom: '하의', shoes: '신발', eyes: '눈' };
