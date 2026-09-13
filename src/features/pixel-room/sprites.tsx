import { AVATAR_ROW_BY_SLOT, avatarSheets, furnitureArt } from './assets';
import type { AvatarDirection, AvatarLayers } from './assets';
import type { FurnitureType } from './model';
import type { PixelAvatarSlot, PublicAvatarAppearance } from './shop/types';

const layers: { key: keyof AvatarLayers; height: number; slot: PixelAvatarSlot | null }[] = [
  { key: 'body', height: 160, slot: null }, { key: 'eyes', height: 128, slot: 'eyes' },
  { key: 'bottoms', height: 448, slot: 'bottom' }, { key: 'shoes', height: 320, slot: 'shoes' },
  { key: 'tops', height: 928, slot: 'top' }, { key: 'hair', height: 800, slot: 'hair' },
];
// Unset/unknown asset keys resolve to the original row 0; server equipment selects all other rows.
function rowForSlot(slot: PixelAvatarSlot | null, assetKey: string | null): number {
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
// Every direction/frame in this pack draws its narrowest "neck" row at y=18 of the 32-unit
// frame (measured across body/hair/tops sheets — the shirt layer itself starts exactly there),
// so splitting the composited sprite there and rendering each band into its own disproportionate
// share of the on-screen height (see .pr-avatar-head/.pr-avatar-body) turns the pack's naturally
// ~56/44 head:body ratio into a rounder, shorter chibi silhouette without redrawing any art.
const HEAD_SPLIT = 18;
// Pure presentational: driven entirely by props, no notion of "current logged-in user". This is
// what lets the same component later render a friend/plaza avatar from someone else's
// PublicAvatarAppearance (fetched by the caller) with no changes here.
export function AvatarSprite({ direction, frame, walking, appearance }: { direction: AvatarDirection; frame: number; walking: boolean; appearance: PublicAvatarAppearance }) {
  const sheets = avatarSheets[walking ? 'Walk' : 'Idle'][direction];
  return <div className="pr-avatar">
    <svg className="pr-avatar-head" viewBox={`0 0 32 ${HEAD_SPLIT}`} preserveAspectRatio="none" aria-hidden="true" overflow="hidden">{renderLayers(sheets, frame, appearance)}</svg>
    <svg className="pr-avatar-body" viewBox={`0 ${HEAD_SPLIT} 32 ${32 - HEAD_SPLIT}`} preserveAspectRatio="none" aria-hidden="true" overflow="hidden">{renderLayers(sheets, frame, appearance)}</svg>
  </div>;
}
export function FurnitureSprite({ type }: { type: FurnitureType }) {
  const art = furnitureArt[type];
  return <svg viewBox={`${art.x} ${art.y} ${art.width} ${art.height}`} aria-hidden="true" style={{ aspectRatio: `${art.width} / ${art.height}` }} overflow="hidden"><image href={art.src} width={art.sheetWidth} height={art.sheetHeight} /></svg>;
}
