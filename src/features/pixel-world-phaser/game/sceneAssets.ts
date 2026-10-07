// 장면에 넣을 이미지 준비: 기존 아틀라스 PNG, 펫 시트, 그리고 기존 React SVG 그림(허수아비/토마토 밭)을
// 같은 모양 그대로 래스터화한 것. 그림 자체는 하나도 새로 그리지 않는다.
import { createElement } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import town from '../../pixel-room/plaza/assets/tiny-town.png';
import interior from '../../pixel-room/assets/interior/source-17655392.png';
import dogSheet from '../../pixel-room/pet/assets/dog.png';
import bearSheet from '../../pixel-room/pet/assets/bear.png';
import pigeonSheet from '../../pixel-room/pet/assets/pigeon.png';
import duckSheet from '../../pixel-room/pet/assets/duck.png';
import { ScarecrowSprite } from '../../pixel-room/farm/Scarecrow';
import { TomatoSprite } from '../../pixel-room/farm/TomatoSprite';
import type { FarmMoisture, FarmStage } from '../../pixel-room/farm/farmModel';
import type { PetId } from '../../pixel-room/pet/petKinds';
import { DUCK_BOUNDS } from '../logic/petSheets';
import { loadImage, svgToImage } from './loadImage';

export const loadTown = () => loadImage(town);
export const loadInterior = () => loadImage(interior);

const PET_SOURCES: Record<PetId, string> = { pet_dog: dogSheet, pet_bear: bearSheet, pet_pigeon: pigeonSheet, pet_duck: duckSheet };
export async function loadPetSheet(pet: PetId): Promise<HTMLImageElement | HTMLCanvasElement> {
  const image = await loadImage(PET_SOURCES[pet]);
  return pet === 'pet_duck' ? duckSheetCanvas(image) : image;
}
/** 오리 원본(1254px)을 Duck.tsx와 같은 계산(알파 경계 + 2px 여백, 1/10 축소, 발끝 y=30)으로 32px 칸 4×4 시트로. */
function duckSheetCanvas(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  DUCK_BOUNDS.forEach(([left, top, endX, endY], index) => {
    const sw = endX - left + 4, sh = endY - top + 4;
    const width = sw / 10, height = sh / 10;
    const ox = (index % 4) * 32, oy = Math.floor(index / 4) * 32;
    ctx.drawImage(image, left - 2, top - 2, sw, sh, ox + (32 - width) / 2, oy + 30 - height, width, height);
  });
  return canvas;
}

/** React 컴포넌트가 그리는 <svg>를 한 번 렌더해서 꺼낸 뒤 이미지로 만든다(원본 컴포넌트를 그대로 재사용). */
function renderSvg(element: ReactElement, width: number, height: number): Promise<HTMLImageElement> {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(element));
  const svg = host.querySelector('svg');
  const image = svg ? svgToImage(svg, width, height) : Promise.reject(new Error('그림을 만들지 못했어요.'));
  root.unmount();
  return image;
}
export const loadScarecrow = () => renderSvg(createElement(ScarecrowSprite), 24, 30);
export type BedLook = { stage: FarmStage; moisture: FarmMoisture };
export const loadBed = (look: BedLook) => renderSvg(createElement(TomatoSprite, look), 32, 32);
