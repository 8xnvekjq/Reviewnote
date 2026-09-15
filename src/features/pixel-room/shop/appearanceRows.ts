import type { AppearanceLayerKey, PixelAvatarSlot } from './types';

// Atlas rows, not item IDs. This PII-free mapping is shared by shop previews and room avatars.
// ribbon_*/vest_black(top), shorts_*/pants_black(bottom), *_blonde/*_black(hair)는 docs/pixel-world-content.md의
// 실제 에셋 감사(29/14/25행)에서 확인된, 기존에 팔지 않던 실루엣/색상 행을 새로 카탈로그에 올린 것 —
// 새 PNG나 행 추가 없이 이미 있던 행만 더 쓴다.
//
// eyes/skin: 무료 기본 appearance(장착 아이템 아님) — 같은 atlas의 미사용 행(Eyes 4행, 눈동자색 /
// Character 5행, 피부색)을 그대로 쓴다. 두 슬롯 다 row 0이 곧 기존 전체 사용자의 현재 모습이라,
// 기본값(null -> row 0)을 바꾸지 않고도 안전하게 추가할 수 있었다.
export const AVATAR_ROW_BY_SLOT: Record<AppearanceLayerKey, Record<string, number>> = {
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
  eyes: { navy: 0, sky: 1, olive: 2, brown: 3 },
  skin: { tan: 0, sand: 1, wheat: 2, umber: 3, porcelain: 4 },
};
export const AVATAR_SLOTS = ['hair', 'top', 'bottom', 'shoes'] as const;
export const SLOT_LABELS: Record<PixelAvatarSlot, string> = { hair: '헤어', top: '상의', bottom: '하의', shoes: '신발', eyes: '눈' };

// 무료 기본 appearance 선택지 — 상점 카드가 아니라 스와치(색상 견본)로 보여준다.
export const SKIN_TONE_OPTIONS: { key: string; label: string }[] = [
  { key: 'tan', label: '기본' }, { key: 'sand', label: '살구빛' }, { key: 'wheat', label: '꿀빛' },
  { key: 'umber', label: '초콜릿빛' }, { key: 'porcelain', label: '아이보리' },
];
export const EYE_COLOR_OPTIONS: { key: string; label: string }[] = [
  { key: 'navy', label: '네이비' }, { key: 'sky', label: '하늘색' }, { key: 'olive', label: '올리브' }, { key: 'brown', label: '브라운' },
];
