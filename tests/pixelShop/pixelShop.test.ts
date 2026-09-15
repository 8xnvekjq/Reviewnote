import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPublicAvatarAppearance } from '../../src/utils/pixelShopAppearance.ts';

const ASSET_KEYS = new Map([
  ['top_sage', 'sage'],
  ['top_blue', 'blue'],
]);

test('장착된 슬롯의 item_id를 카탈로그 assetKey로 변환한다', () => {
  const appearance = toPublicAvatarAppearance(
    { top: 'top_sage', bottom: null, shoes: null, hair: null, eyes: null },
    ASSET_KEYS,
  );
  assert.deepEqual(appearance, { top: 'sage', bottom: null, shoes: null, hair: null, eyes: null, skin: null });
});

test('장착 정보가 없는 슬롯은 null(기본값)로 남는다', () => {
  const appearance = toPublicAvatarAppearance(
    { top: null },
    ASSET_KEYS,
  );
  assert.equal(appearance.top, null);
  assert.equal(appearance.bottom, null);
  assert.equal(appearance.shoes, null);
  assert.equal(appearance.hair, null);
  assert.equal(appearance.eyes, null);
  assert.equal(appearance.skin, null);
});

test('equipment row 자체가 없으면(null) 전부 null', () => {
  const appearance = toPublicAvatarAppearance(null, ASSET_KEYS);
  assert.deepEqual(appearance, { top: null, bottom: null, shoes: null, hair: null, eyes: null, skin: null });
});

test('카탈로그에 없는 item_id는 방어적으로 null 처리한다(고아 참조 방지)', () => {
  const appearance = toPublicAvatarAppearance(
    { top: 'top_removed_from_catalog' },
    ASSET_KEYS,
  );
  assert.equal(appearance.top, null);
});

test('무료 기본 appearance(피부색/눈동자색)는 카탈로그 없이 그대로 통과한다', () => {
  const appearance = toPublicAvatarAppearance(
    { top: null, bottom: null, shoes: null, hair: null, eyes: null },
    ASSET_KEYS,
    { skin_tone: 'porcelain', eye_color: 'sky' },
  );
  assert.equal(appearance.skin, 'porcelain');
  assert.equal(appearance.eyes, 'sky');
});

test('알 수 없는(지워진) 기본 appearance 키는 방어적으로 기본값(null)으로 남는다', () => {
  const appearance = toPublicAvatarAppearance(
    { top: null, bottom: null, shoes: null, hair: null, eyes: null },
    ASSET_KEYS,
    { skin_tone: 'no-longer-a-real-key', eye_color: 'also-fake' },
  );
  assert.equal(appearance.skin, null);
  assert.equal(appearance.eyes, null);
});

test('base가 아예 없어도(구버전 유저 row) 기본 appearance는 null로 안전하게 남는다', () => {
  const appearance = toPublicAvatarAppearance(
    { top: 'top_sage', bottom: null, shoes: null, hair: null, eyes: null },
    ASSET_KEYS,
  );
  assert.equal(appearance.skin, null);
  assert.equal(appearance.eyes, null);
});
