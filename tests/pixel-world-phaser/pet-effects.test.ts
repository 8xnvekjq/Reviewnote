import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { petEffectText } from '../../src/features/pixel-room/shop/petEffects.ts';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';

test('모든 펫에 효과 설명이 있고, 숫자는 서버 낚시 규칙과 같다', () => {
  for (const pet of PIXEL_CATALOG.filter(item => item.category === 'pet')) assert.ok(petEffectText(pet.itemId), pet.itemId);
  const sql = readFileSync(new URL('../../supabase/migrations/supabase_pixel_level_bait.sql', import.meta.url), 'utf8');
  assert.match(sql, /v_pet = 'pet_bear' then v_len := least\(v_len \* 1\.08/);
  assert.match(petEffectText('pet_bear'), /\+8%/);
  assert.match(sql, /v_pet = 'pet_dog' and v_fish\.rarity in \('rare','legendary'\) then 'sparkle'/);
  assert.match(sql, /if v_pet = 'pet_pigeon' then/);
});
