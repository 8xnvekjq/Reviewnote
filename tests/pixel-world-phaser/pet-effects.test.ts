import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { petEffectText } from '../../src/features/pixel-room/shop/petEffects.ts';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';
import { createReelGame, stepReelGame, DUCK_ZONE_BONUS, PIGEON_RESCUE_S } from '../../src/features/pixel-world-phaser/logic/reelGame.ts';
import { PIGEON_RESCUES_PER_DAY } from '../../src/features/pixel-world-phaser/ui/useFishing.ts';

test('모든 펫에 효과 설명이 있고, 숫자는 실제 규칙과 같다', () => {
  for (const pet of PIXEL_CATALOG.filter(item => item.category === 'pet')) assert.ok(petEffectText(pet.itemId), pet.itemId);
  const bait = readFileSync(new URL('../../supabase/migrations/supabase_pixel_level_bait.sql', import.meta.url), 'utf8');
  assert.match(bait, /v_pet = 'pet_bear' then v_len := least\(v_len \* 1\.08/);
  assert.match(petEffectText('pet_bear'), /\+8%/);
  const v2 = readFileSync(new URL('../../supabase/migrations/20261011150000_pixel_pet_effects_v2.sql', import.meta.url), 'utf8');
  assert.match(v2, /if k\.pet = 'pet_dog' then v_xp := round\(v_xp \* 1\.1\)/);
  assert.match(petEffectText('pet_dog'), /경험치 \+10%/);
  assert.doesNotMatch(v2, /fish_hint_text|sparkle:/, '예전 강아지·비둘기 효과는 없앴다');
  assert.equal(DUCK_ZONE_BONUS, 1.1); assert.match(petEffectText('pet_duck'), /\+10%/);
  assert.equal(PIGEON_RESCUE_S, 1); assert.match(petEffectText('pet_pigeon'), new RegExp('1초.*하루 ' + PIGEON_RESCUES_PER_DAY + '번'));
});

test('오리는 릴 원이 정확히 10% 크다', () => {
  for (const d of [1, 2.5, 5]) assert.ok(Math.abs(createReelGame(d, true).zoneSize / createReelGame(d, false).zoneSize - 1.1) < 1e-9);
});

test('비둘기: 진행이 바닥나도 1초 버티고, 남은 횟수만큼만, 다 쓰면 놓친다', () => {
  // 아무 입력 없이 두면 물고기가 원 밖으로 나가 진행이 줄어든다.
  const run = (rescues: number) => { let g = createReelGame(3, false, false, 7, 1, undefined, false, rescues); for (let i = 0; i < 1200 && g.status === 'playing'; i++) g = stepReelGame(g, 50); return g; };
  const none = run(0), one = run(1), two = run(2);
  assert.equal(none.status, 'escaped'); assert.equal(none.rescuesUsed, 0);
  assert.equal(one.status, 'escaped'); assert.equal(one.rescuesUsed, 1);
  assert.ok(one.elapsed >= none.elapsed + PIGEON_RESCUE_S - .02, 'held on for about a second');
  assert.equal(two.rescuesUsed, 2); assert.ok(two.elapsed >= one.elapsed + PIGEON_RESCUE_S - .02);
});
