import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';
import { AVATAR_ROW_BY_SLOT } from '../../src/features/pixel-room/shop/appearanceRows.ts';
import { FURNITURE, defaultState, placeFurniture, validateRoom, isCellFree } from '../../src/features/pixel-room/model.ts';
import type { FurnitureType } from '../../src/features/pixel-room/model.ts';
import { toPublicAvatarAppearance } from '../../src/utils/pixelShopAppearance.ts';

test('every avatar product maps to a real, bounded atlas row in its own slot', () => {
  const rowCounts = { top: 29, bottom: 14, shoes: 10, hair: 25, eyes: 4 };
  const ids = new Set<string>();
  for (const item of PIXEL_CATALOG) {
    assert.ok(!ids.has(item.itemId)); ids.add(item.itemId);
    assert.ok(item.price >= 20 && item.price <= 800);
    if (item.slot === 'furniture') { assert.ok(Object.hasOwn(FURNITURE, item.assetKey)); continue; }
    const row = AVATAR_ROW_BY_SLOT[item.slot][item.assetKey];
    assert.ok(Number.isInteger(row) && row > 0 && row < rowCounts[item.slot]);
  }
  assert.equal(ids.size, 39);
  assert.equal(PIXEL_CATALOG.filter(item => item.slot === 'hair').length, 12);
  assert.equal(PIXEL_CATALOG.filter(item => item.slot === 'top').length, 10);
  assert.equal(PIXEL_CATALOG.filter(item => item.slot === 'bottom').length, 4);
  assert.equal(PIXEL_CATALOG.filter(item => item.category === 'furniture').length, 12);
});

test('server equipment maps all four product slots independently into shared appearance', () => {
  const keys = new Map(PIXEL_CATALOG.map(item => [item.itemId, item.assetKey]));
  const appearance = toPublicAvatarAppearance({ top: 'top_vest', bottom: 'bottom_denim', shoes: 'shoes_low', hair: 'hair_long', eyes: null }, keys);
  assert.deepEqual(appearance, { top: 'vest', bottom: 'denim', shoes: 'low', hair: 'long', eyes: null });
  assert.deepEqual(Object.keys(appearance).sort(), ['bottom', 'eyes', 'hair', 'shoes', 'top']);
});

test('new furniture persists with real footprints and rejects out-of-room placements', () => {
  for (const type of ['roundtable', 'television', 'aquarium', 'globe', 'tallplant', 'floorlamp'] as FurnitureType[]) {
    const size = FURNITURE[type];
    const room = placeFurniture(defaultState(), type, { x: 10 - size.width, y: 8 - size.height });
    assert.ok(room);
    assert.deepEqual(validateRoom(JSON.parse(JSON.stringify(room))), room);
    assert.equal(isCellFree(room, { x: 9, y: 7 }), false);
    assert.equal(placeFurniture(defaultState(), type, { x: 11 - size.width, y: 8 - size.height }), null);
  }
});
