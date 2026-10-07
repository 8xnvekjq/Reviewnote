import { defaultState, FURNITURE, placeFurniture, validateRoom } from '../../pixel-room/model';
import type { Cell, FurnitureType, Placement } from '../../pixel-room/model';
import type { PixelItem } from '../../pixel-room/shop/types';
import { ROOM_SIDE, ROOM_WALL } from './roomWorld';
import { TILE } from './world';

/** 구매 목록을 그대로 유지하고, 배치할 수 있는 가구만 찾는다. */
export function ownedFurniture(catalog: readonly PixelItem[], ownedIds: ReadonlySet<string>) {
  return catalog.filter(item => item.category === 'furniture' && ownedIds.has(item.itemId) && Object.hasOwn(FURNITURE, item.assetKey));
}

export const roomPoint = (world: Cell): Cell => ({ x: world.x / TILE - ROOM_SIDE, y: world.y / TILE - ROOM_WALL });
export const snapRoomPoint = (point: Cell): Cell => ({ x: Math.floor(point.x), y: Math.floor(point.y) });

/** 기존 편집기의 경계·겹침·캐릭터 칸 규칙을 함께 사용한다. */
export function moveFurniture(layout: readonly Placement[], type: FurnitureType, cell: Cell, owned: ReadonlySet<FurnitureType>, actor: Cell): Placement[] | null {
  if (!owned.has(type)) return null;
  return placeFurniture({ ...defaultState(), furniture: [...layout] }, type, cell, actor)?.furniture ?? null;
}

/** 기존 RPC와 같은 전체 배치 목록. 알 수 없는 가구를 조용히 빼고 저장하지 않는다. */
export function furnitureRows(layout: readonly Placement[], catalog: readonly PixelItem[], ownedIds: ReadonlySet<string>) {
  if (!validateRoom({ ...defaultState(), furniture: [...layout] })) throw new Error('가구 배치를 확인해 주세요.');
  const items = ownedFurniture(catalog, ownedIds);
  return layout.map(item => {
    const entry = items.find(entry => entry.assetKey === item.type);
    if (!entry) throw new Error('보유한 가구를 다시 확인해 주세요.');
    return { itemId: entry.itemId, x: item.x, y: item.y };
  });
}
