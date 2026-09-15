import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';
import { AVATAR_ROW_BY_SLOT, EYE_COLOR_OPTIONS, SKIN_TONE_OPTIONS } from '../../src/features/pixel-room/shop/appearanceRows.ts';
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
    if (item.slot === 'pet') { continue; } // pets render via their own sprite system, not AVATAR_ROW_BY_SLOT
    const row = AVATAR_ROW_BY_SLOT[item.slot][item.assetKey];
    assert.ok(Number.isInteger(row) && row > 0 && row < rowCounts[item.slot]);
  }
  assert.equal(ids.size, 40);
  assert.equal(PIXEL_CATALOG.filter(item => item.slot === 'hair').length, 12);
  assert.equal(PIXEL_CATALOG.filter(item => item.slot === 'top').length, 10);
  assert.equal(PIXEL_CATALOG.filter(item => item.slot === 'bottom').length, 4);
  assert.equal(PIXEL_CATALOG.filter(item => item.category === 'furniture').length, 12);
  assert.equal(PIXEL_CATALOG.filter(item => item.category === 'pet').length, 1);
});

test('server equipment maps all four product slots independently into shared appearance', () => {
  const keys = new Map(PIXEL_CATALOG.map(item => [item.itemId, item.assetKey]));
  const appearance = toPublicAvatarAppearance({ top: 'top_vest', bottom: 'bottom_denim', shoes: 'shoes_low', hair: 'hair_long', eyes: null }, keys);
  assert.deepEqual(appearance, { top: 'vest', bottom: 'denim', shoes: 'low', hair: 'long', eyes: null, skin: null });
  assert.deepEqual(Object.keys(appearance).sort(), ['bottom', 'eyes', 'hair', 'shoes', 'skin', 'top']);
});

test('무료 기본 appearance(피부색/눈동자색)는 카탈로그와 완전히 분리되고, 모든 행이 실제 atlas 범위 안에 있다', () => {
  // 카탈로그 아이템과 달리 row 0도 정당한 선택지다(스와치 중 하나 — "기본"). 카탈로그에는 이
  // 슬롯들로 아무 상품도 없어야 한다(가격/희귀도 없음 요구사항과 일치).
  assert.equal(PIXEL_CATALOG.some(item => item.slot === 'skin' || item.slot === 'eyes'), false);
  assert.equal(SKIN_TONE_OPTIONS.length, 5);
  for (const { key } of SKIN_TONE_OPTIONS) {
    const row = AVATAR_ROW_BY_SLOT.skin[key];
    assert.ok(Number.isInteger(row) && row >= 0 && row < 5, `skin ${key}: row ${row}`);
  }
  assert.equal(EYE_COLOR_OPTIONS.length, 4);
  for (const { key } of EYE_COLOR_OPTIONS) {
    const row = AVATAR_ROW_BY_SLOT.eyes[key];
    assert.ok(Number.isInteger(row) && row >= 0 && row < 4, `eyes ${key}: row ${row}`);
  }
  // 기본값(row 0)은 기존 전체 사용자가 이미 보고 있는 모습과 정확히 같아야 한다 — 새 appearance
  // 필드가 null인(마이그레이션 직후) 기존 유저의 외형이 조금도 안 바뀌게 하는 핵심 불변식.
  assert.equal(AVATAR_ROW_BY_SLOT.skin.tan, 0);
  assert.equal(AVATAR_ROW_BY_SLOT.eyes.navy, 0);
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
