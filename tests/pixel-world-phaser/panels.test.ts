import assert from 'node:assert/strict';
import test from 'node:test';
import { panelFrozen, panelItems, pointsShort, itemState } from '../../src/features/pixel-world-phaser/logic/panels.ts';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';
const appearance = { top: null, bottom: null, shoes: null, hair: null, skin: null, eyes: null };
test('분류와 소유 필터는 벡터 패션을 포함한 모든 상품을 유지한다', () => {
  const owned = new Set(PIXEL_CATALOG.map(item => item.itemId));
  assert.equal(panelItems(PIXEL_CATALOG, 'all', owned).length, PIXEL_CATALOG.length);
  for (const slot of ['hair', 'top', 'bottom', 'shoes', 'pet', 'furniture']) {
    const expected = PIXEL_CATALOG.filter(item => item.slot === slot);
    assert.deepEqual(panelItems(PIXEL_CATALOG, slot, owned), expected);
    assert.equal(panelItems(PIXEL_CATALOG, slot, new Set()).length, 0);
  }
});
test('가격과 같은 잔액은 구매 가능하고 부족분만 표시한다', () => {
  assert.equal(pointsShort(100, 100), 0);
  assert.equal(pointsShort(100, 101), 0);
  assert.equal(pointsShort(100, 0), 100);
  assert.equal(pointsShort(100, 99), 1);
});
test('보유 및 장착 상태는 슬롯과 활성 펫을 확인한다', () => {
  for (const item of PIXEL_CATALOG) {
    assert.equal(itemState(item, new Set(), appearance, item.itemId), 'available');
    const owned = new Set([item.itemId]);
    assert.equal(itemState(item, owned, appearance, null), 'owned');
    if (item.category === 'avatar') assert.equal(itemState(item, owned, { ...appearance, [item.slot]: item.assetKey }, null), 'equipped');
    if (item.category === 'pet') assert.equal(itemState(item, owned, appearance, item.itemId), 'equipped');
  }
});
test('상점과 옷장 또는 대화가 열려 있으면 이동을 멈춘다', () => {
  assert.equal(panelFrozen(null, false), false);
  assert.equal(panelFrozen(null, true), true);
  assert.equal(panelFrozen('shop', false), true);
  assert.equal(panelFrozen('wardrobe', false), true);
  assert.equal(panelFrozen('shop', true), true);
});
