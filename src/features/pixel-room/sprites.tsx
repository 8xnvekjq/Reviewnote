import { avatarSheets, furnitureArt } from './assets';
import type { AvatarDirection, AvatarLayers } from './assets';
import type { FurnitureType, RoomState } from './model';

const layers: { key: keyof AvatarLayers; height: number }[] = [
  { key: 'body', height: 160 }, { key: 'eyes', height: 128 },
  { key: 'bottoms', height: 448 }, { key: 'shoes', height: 320 },
  { key: 'tops', height: 928 }, { key: 'hair', height: 800 },
];
export function AvatarSprite({ direction, frame, walking, shirt }: { direction: AvatarDirection; frame: number; walking: boolean; shirt: RoomState['avatar']['shirt'] }) {
  const sheets = avatarSheets[walking ? 'Walk' : 'Idle'][direction];
  const row = { default: 0, sage: 1, blue: 2 }[shirt];
  return <svg viewBox="0 0 32 32" aria-hidden="true" overflow="hidden">{layers.map(layer => sheets[layer.key] ? <image key={layer.key} href={sheets[layer.key]} x={-frame * 32} y={layer.key === 'tops' ? -row * 32 : 0} width={128} height={layer.height} /> : null)}</svg>;
}
export function FurnitureSprite({ type }: { type: FurnitureType }) {
  const art = furnitureArt[type];
  return <svg viewBox={`${art.x} ${art.y} ${art.width} ${art.height}`} aria-hidden="true" style={{ aspectRatio: `${art.width} / ${art.height}` }} overflow="hidden"><image href={art.src} width={art.sheetWidth} height={art.sheetHeight} /></svg>;
}
