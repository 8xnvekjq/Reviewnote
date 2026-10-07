// 기존 방과 같은 카탈로그/보유 목록으로 서버 배치를 읽는다. 저장이나 이관은 하지 않는다.
import { defaultState, validateRoom } from '../../pixel-room/model';
import type { FurnitureType, Placement } from '../../pixel-room/model';
import type { PixelItem } from '../../pixel-room/shop/types';

export function savedFurniture(rows: readonly { itemId: string; x: number; y: number }[],
  catalog: readonly PixelItem[], ownedIds: ReadonlySet<string>): Placement[] {
  const types = new Map(catalog.filter(item => item.category === 'furniture' && ownedIds.has(item.itemId))
    .map(item => [item.itemId, item.assetKey as FurnitureType]));
  const furniture = rows.flatMap(row => {
    const type = types.get(row.itemId);
    return type ? [{ type, x: row.x, y: row.y }] : [];
  });
  return validateRoom({ ...defaultState(), furniture })?.furniture ?? [];
}
