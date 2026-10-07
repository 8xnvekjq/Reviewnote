import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FURNITURE, defaultState, canPlace, removeFurniture } from '../../src/features/pixel-room/model.ts';
import type { FurnitureType, Placement } from '../../src/features/pixel-room/model.ts';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';
import { furnitureRows, moveFurniture, ownedFurniture, roomPoint, snapRoomPoint, furnitureAt } from '../../src/features/pixel-world-phaser/logic/roomEditing.ts';
import { savedFurniture } from '../../src/features/pixel-world-phaser/logic/savedFurniture.ts';
import { furnitureSprite, roomSolid, roomToWorld } from '../../src/features/pixel-world-phaser/logic/roomWorld.ts';

const types = Object.keys(FURNITURE) as FurnitureType[];
const owned = new Set(types);
const ownedIds = new Set(PIXEL_CATALOG.filter(item => item.category === 'furniture').map(item => item.itemId));
const actor = { x: 9, y: 7 };

test('모든 기존 가구의 배치 가능 여부는 기존 편집기와 같다', () => {
  const layout: Placement[] = [{ type: 'plant', x: 4, y: 3 }];
  for (const type of types) for (let y = -1; y <= 8; y++) for (let x = -1; x <= 10; x++) {
    assert.equal(!!moveFurniture(layout, type, { x, y }, owned, actor), canPlace({ ...defaultState(), furniture: layout }, type, { x, y }, actor));
  }
});
test('이동은 중복 없이 복사하고, 실패한 이동은 원래 배치를 보존한다', () => {
  const layout: Placement[] = [{ type: 'desk', x: 2, y: 2 }, { type: 'plant', x: 8, y: 3 }];
  const before = structuredClone(layout);
  const next = moveFurniture(layout, 'desk', { x: 3, y: 4 }, owned, actor)!;
  assert.equal(next.filter(item => item.type === 'desk').length, 1);
  assert.deepEqual(layout, before);
  assert.equal(moveFurniture(layout, 'desk', { x: 7, y: 3 }, owned, actor), null);
  assert.equal(moveFurniture(layout, 'chair', actor, owned, actor), null);
  assert.equal(moveFurniture(layout, 'chair', { x: 1, y: 1 }, new Set(), actor), null);
  assert.equal(moveFurniture(layout, 'chair', { x: 1.1, y: 1 }, owned, actor), null);
});
test('전체 구매 카탈로그는 동일한 itemId,x,y 형식으로 왕복한다', () => {
  for (const type of types) {
    const layout = [{ type, x: 0, y: 0 }];
    const rows = furnitureRows(layout, PIXEL_CATALOG, ownedIds);
    assert.deepEqual(Object.keys(rows[0]).sort(), ['itemId', 'x', 'y']);
    assert.deepEqual(savedFurniture(rows, PIXEL_CATALOG, ownedIds), layout);
  }
  assert.throws(() => furnitureRows([{ type: 'bed', x: 9, y: 7 }], PIXEL_CATALOG, ownedIds));
  assert.throws(() => furnitureRows([{ type: 'desk', x: 0, y: 0 }], PIXEL_CATALOG, new Set()));
});
test('보관함으로 돌려놓아도 구매 목록은 보존되고 다시 배치할 수 있다', () => {
  const layout = removeFurniture({ ...defaultState(), furniture: [{ type: 'chair', x: 0, y: 0 }] }, 'chair').furniture;
  assert.deepEqual(furnitureRows(layout, PIXEL_CATALOG, ownedIds), []);
  assert.equal(ownedFurniture(PIXEL_CATALOG, ownedIds).length, types.length);
  assert.ok(moveFurniture(layout, 'chair', { x: 2, y: 2 }, owned, actor));
});
test('월드 좌표는 기존 바닥 칸으로 스냅하고 키가 큰 그림도 선택한다', () => {
  assert.deepEqual(snapRoomPoint(roomPoint({ x: 16 + 3.9 * 16, y: 32 + 2.1 * 16 })), { x: 3, y: 2 });
  assert.deepEqual(snapRoomPoint(roomPoint({ x: 15, y: 31 })), { x: -1, y: -1 });
  const item: Placement = { type: 'tallplant', x: 3, y: 4 };
  const sprite = furnitureSprite(item);
  assert.equal(furnitureAt([item], { x: sprite.x + 8, y: sprite.bottom - sprite.height + 2 }), item);
});
test('완료된 배치는 이동 충돌에 즉시 반영할 수 있다', () => {
  const old: Placement[] = [{ type: 'desk', x: 3, y: 4 }];
  const next = moveFurniture(old, 'desk', { x: 3, y: 2 }, owned, actor)!;
  assert.ok(roomSolid(old)(roomToWorld({ x: 4, y: 4 })));
  assert.ok(!roomSolid(next)(roomToWorld({ x: 4, y: 4 })));
  assert.ok(roomSolid(next)(roomToWorld({ x: 4, y: 2 })));
});
