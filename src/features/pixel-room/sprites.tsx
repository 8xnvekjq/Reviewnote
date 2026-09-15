import { AVATAR_ROW_BY_SLOT, avatarSheets, doormatArt, furnitureArt } from './assets';
import type { AvatarDirection, AvatarLayers, FurnitureArt } from './assets';
import type { FurnitureType } from './model';
import type { AppearanceLayerKey, PublicAvatarAppearance } from './shop/types';

// 'skin'은 구매/소유 대상이 아닌 무료 기본 appearance라 PixelAvatarSlot(상점 카탈로그 슬롯)에는
// 없지만, 렌더링 레이어로는 다른 슬롯과 완전히 동일하게 다룬다(행 선택 매커니즘 재사용).
const layers: { key: keyof AvatarLayers; height: number; slot: AppearanceLayerKey | null }[] = [
  { key: 'body', height: 160, slot: 'skin' }, { key: 'eyes', height: 128, slot: 'eyes' },
  { key: 'bottoms', height: 448, slot: 'bottom' }, { key: 'shoes', height: 320, slot: 'shoes' },
  { key: 'tops', height: 928, slot: 'top' }, { key: 'hair', height: 928, slot: 'hair' },
];
// Unset/unknown asset keys resolve to the original row 0; server equipment selects all other rows.
function rowForSlot(slot: AppearanceLayerKey | null, assetKey: string | null): number {
  if (!slot || !assetKey) return 0;
  return AVATAR_ROW_BY_SLOT[slot][assetKey] ?? 0;
}
function renderLayers(sheets: AvatarLayers, frame: number, appearance: PublicAvatarAppearance) {
  return layers.map(layer => {
    const src = sheets[layer.key];
    if (!src) return null;
    const row = rowForSlot(layer.slot, layer.slot ? appearance[layer.slot] : null);
    return <image key={layer.key} data-slot={layer.slot ?? 'body'} data-row={row} href={src} x={-frame * 32} y={-row * 32} width={128} height={layer.height} />;
  });
}
// A previous attempt at a cuter silhouette split this sprite into two independently CSS-scaled
// SVGs (head 70% / body 30% of the container height, body additionally stretched to 112% width).
// Because the two bands were separate DOM elements sized from independently rounded percentages
// of a non-integer container size, the vertical edges of the art (the collar/neck outline) did not
// land on the same on-screen pixel column across the seam — visible as a bent/dislocated neck,
// worse wherever the container happened to render smaller (the front yard's board scales the actor
// down further than the room's). Rendering the whole 32x32 frame as one SVG removes the seam
// structurally: there is no second, separately-scaled element left to misalign against.
export function AvatarSprite({ direction, frame, walking, appearance }: { direction: AvatarDirection; frame: number; walking: boolean; appearance: PublicAvatarAppearance }) {
  const sheets = avatarSheets[walking ? 'Walk' : 'Idle'][direction];
  return <div className="pr-avatar">
    <svg viewBox="0 0 32 32" aria-hidden="true" overflow="hidden">{renderLayers(sheets, frame, appearance)}</svg>
  </div>;
}
function ArtSprite({ art }: { art: FurnitureArt }) {
  return <svg viewBox={`${art.x} ${art.y} ${art.width} ${art.height}`} aria-hidden="true" style={{ aspectRatio: `${art.width} / ${art.height}` }} overflow="hidden"><image href={art.src} width={art.sheetWidth} height={art.sheetHeight} /></svg>;
}
export function FurnitureSprite({ type }: { type: FurnitureType }) {
  return <ArtSprite art={furnitureArt[type]} />;
}
// 출입구 카펫 — 가구 시스템(model.ts/ownership) 밖의 순수 바닥 장식. FurnitureSprite와 같은
// ArtSprite 렌더 방식을 그대로 재사용한다.
export function DoormatSprite() {
  return <ArtSprite art={doormatArt} />;
}
