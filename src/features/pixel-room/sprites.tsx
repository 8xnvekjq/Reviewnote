import { avatarSheets, furnitureArt } from './assets';
import type { AvatarDirection, AvatarLayers } from './assets';
import type { FurnitureType, RoomState } from './model';

const layers: { key: keyof AvatarLayers; height: number }[] = [
  { key: 'body', height: 160 }, { key: 'eyes', height: 128 },
  { key: 'bottoms', height: 448 }, { key: 'shoes', height: 320 },
  { key: 'tops', height: 928 }, { key: 'hair', height: 800 },
];
function renderLayers(sheets: AvatarLayers, frame: number, row: number) {
  return layers.map(layer => sheets[layer.key] ? <image key={layer.key} href={sheets[layer.key]} x={-frame * 32} y={layer.key === 'tops' ? -row * 32 : 0} width={128} height={layer.height} /> : null);
}
// Every direction/frame in this pack draws its narrowest "neck" row at y=18 of the 32-unit
// frame (measured across body/hair/tops sheets — the shirt layer itself starts exactly there),
// so splitting the composited sprite there and rendering each band into its own disproportionate
// share of the on-screen height (see .pr-avatar-head/.pr-avatar-body) turns the pack's naturally
// ~56/44 head:body ratio into a rounder, shorter chibi silhouette without redrawing any art.
const HEAD_SPLIT = 18;
export function AvatarSprite({ direction, frame, walking, shirt }: { direction: AvatarDirection; frame: number; walking: boolean; shirt: RoomState['avatar']['shirt'] }) {
  const sheets = avatarSheets[walking ? 'Walk' : 'Idle'][direction];
  const row = { default: 0, sage: 1, blue: 2 }[shirt];
  return <div className="pr-avatar">
    <svg className="pr-avatar-head" viewBox={`0 0 32 ${HEAD_SPLIT}`} preserveAspectRatio="none" aria-hidden="true" overflow="hidden">{renderLayers(sheets, frame, row)}</svg>
    <svg className="pr-avatar-body" viewBox={`0 ${HEAD_SPLIT} 32 ${32 - HEAD_SPLIT}`} preserveAspectRatio="none" aria-hidden="true" overflow="hidden">{renderLayers(sheets, frame, row)}</svg>
  </div>;
}
export function FurnitureSprite({ type }: { type: FurnitureType }) {
  const art = furnitureArt[type];
  return <svg viewBox={`${art.x} ${art.y} ${art.width} ${art.height}`} aria-hidden="true" style={{ aspectRatio: `${art.width} / ${art.height}` }} overflow="hidden"><image href={art.src} width={art.sheetWidth} height={art.sheetHeight} /></svg>;
}
