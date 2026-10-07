// 학생 외형(서버 장착 정보) → 어떤 아틀라스 행/패션 벡터를 어떤 순서로 겹칠지. 기존 sprites.tsx의
// AvatarSprite와 같은 규칙(body→eyes→bottoms→shoes→tops→hair, 행 조회, 패션 벡터 우선)을 그대로
// 따르되 DOM 없이 계산만 한다 — Phaser 텍스처 합성(game/avatarTexture.ts)과 단위 테스트가 함께 쓴다.
import { AVATAR_ROW_BY_SLOT } from '../../pixel-room/shop/appearanceRows';
import { fashionFor } from '../../pixel-room/shop/fashion';
import type { AppearanceLayerKey, PublicAvatarAppearance } from '../../pixel-room/shop/types';

export type AvatarLayerKey = 'body' | 'eyes' | 'bottoms' | 'shoes' | 'tops' | 'hair';
export type AvatarPose = `${'Idle' | 'Walk'}_${'Front' | 'Back' | 'Left' | 'Right'}`;
/** 합성 시트의 행 순서. 한 행 = 한 포즈 × 4프레임(32×32). */
export const AVATAR_POSES: readonly AvatarPose[] = [
  'Idle_Front', 'Idle_Back', 'Idle_Left', 'Idle_Right', 'Walk_Front', 'Walk_Back', 'Walk_Left', 'Walk_Right',
];
export const AVATAR_FRAME = 32;
export const AVATAR_FRAMES_PER_POSE = 4;

/** sprites.tsx의 layers 배열과 같은 순서·같은 시트 높이(행 범위 밖 행은 원본처럼 빈 칸으로 남는다). */
export const AVATAR_LAYERS: readonly { key: AvatarLayerKey; height: number; slot: AppearanceLayerKey }[] = [
  { key: 'body', height: 160, slot: 'skin' }, { key: 'eyes', height: 128, slot: 'eyes' },
  { key: 'bottoms', height: 448, slot: 'bottom' }, { key: 'shoes', height: 320, slot: 'shoes' },
  { key: 'tops', height: 928, slot: 'top' }, { key: 'hair', height: 928, slot: 'hair' },
];

export type LayerPlan =
  | { layer: AvatarLayerKey; kind: 'sheet'; row: number }
  | { layer: AvatarLayerKey; kind: 'fashion'; fashion: 'blouse' | 'bootcut'; colors: readonly string[] };

export type AvatarStyle = 'cute' | 'legacy';

// 비교용 주소 플래그를 모든 합성 경로(광장·패널 포함)에서 함께 사용한다.
export function avatarStyle(): AvatarStyle {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('avatarStyle') === 'legacy' ? 'legacy' : 'cute';
}

// 판매하지 않는 행만 사용하고 합성할 때 전용 무료 팔레트로 바꾼다.
export const FREE_DEFAULT_ROWS = { tops: 0, bottoms: 3 } as const;

export function avatarLayerPlan(appearance: PublicAvatarAppearance, style: AvatarStyle = avatarStyle()): LayerPlan[] {
  return AVATAR_LAYERS.map(({ key, slot }) => {
    const assetKey = appearance[slot];
    const fashion = fashionFor(slot, assetKey);
    if (fashion) return { layer: key, kind: 'fashion', fashion: fashion.kind, colors: fashion.colors };
    const defaultRow = style === 'cute' && (key === 'tops' || key === 'bottoms') ? FREE_DEFAULT_ROWS[key] : 0;
    const row = assetKey ? AVATAR_ROW_BY_SLOT[slot][assetKey] ?? defaultRow : defaultRow;
    return { layer: key, kind: 'sheet', row };
  });
}

const KEY_ORDER: readonly AppearanceLayerKey[] = ['skin', 'eyes', 'top', 'bottom', 'shoes', 'hair'];
/** 같은 모습이면 같은 키 → 텍스처를 한 번만 합성해 재사용한다. 모르는 값은 기본(행 0)과 같은 키로 접는다. */
export function avatarTextureKey(appearance: PublicAvatarAppearance, style: AvatarStyle = avatarStyle()): string {
  return `avatar:${style}:` + KEY_ORDER.map(slot => {
    const value = appearance[slot];
    if (!value) return '-';
    if (fashionFor(slot, value)) return value;
    return Object.hasOwn(AVATAR_ROW_BY_SLOT[slot], value) && AVATAR_ROW_BY_SLOT[slot][value] !== 0 ? value : '-';
  }).join('|');
}

export function avatarFrameIndex(walking: boolean, facing: 'Front' | 'Back' | 'Left' | 'Right', frame: number): number {
  return AVATAR_POSES.indexOf(`${walking ? 'Walk' : 'Idle'}_${facing}`) * AVATAR_FRAMES_PER_POSE + (frame % AVATAR_FRAMES_PER_POSE);
}
