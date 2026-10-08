// 기존 방과 같은 카탈로그/보유 목록으로 서버 배치를 읽는다. 저장이나 이관은 하지 않는다.
import { defaultState, validateRoom } from '../../pixel-room/model';
import type { FurnitureType, Placement, RoomState } from '../../pixel-room/model';
import type { PixelItem } from '../../pixel-room/shop/types';

type Row = { itemId: string; x: number; y: number };

/** 서버 행을 방 배치로 바꾼다. 한 줄이 규칙에 어긋나도(겹침·방 밖) 그 가구만 빼고 나머지는 보여 준다 —
 * 예전에는 한 줄 때문에 방 전체가 빈 방으로 보였고, 그 상태에서 저장하면 서버 배치가 통째로 지워졌다.
 * 서버가 주는 행 순서는 정해져 있지 않으므로 itemId 순으로 읽어 기기마다 같은 결과를 낸다. */
export function savedFurniture(rows: readonly Row[], catalog: readonly PixelItem[], ownedIds: ReadonlySet<string>): Placement[] {
  const types = new Map(catalog.filter(item => item.category === 'furniture' && ownedIds.has(item.itemId))
    .map(item => [item.itemId, item.assetKey as FurnitureType]));
  let room: RoomState = defaultState();
  for (const row of [...rows].sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0))) {
    const type = types.get(row.itemId);
    if (!type) continue;
    room = validateRoom({ ...room, furniture: [...room.furniture, { type, x: row.x, y: row.y }] }) ?? room;
  }
  return room.furniture;
}

/** 순서와 상관없이 같은 배치인지 — 저장 직전 "다른 기기에서 바뀌었는지" 확인에 쓴다. */
export function sameLayout(a: readonly Row[], b: readonly Row[]): boolean {
  const key = (rows: readonly Row[]) => rows.map(row => `${row.itemId}@${row.x},${row.y}`).sort().join('|');
  return a.length === b.length && key(a) === key(b);
}

/** 늦게 도착한 조회가 방금 저장한 배치를 덮지 않게 한다. 조회는 시작할 때 표를 받고, 그 사이에 저장이
 * 시작·끝났거나 저장 중이면 그 조회 결과는 버린다(저장 결과가 더 새것이다). */
export function createLayoutGate() {
  let epoch = 0;
  let writing = 0;
  return {
    startRead: () => epoch,
    canApply: (ticket: number) => writing === 0 && ticket === epoch,
    startWrite: () => { writing++; epoch++; },
    endWrite: () => { writing = Math.max(0, writing - 1); epoch++; },
  };
}
export type LayoutGate = ReturnType<typeof createLayoutGate>;
