import test from 'node:test';
import assert from 'node:assert/strict';
import { levelForXp, MAX_LEVEL, fishingPerkText, fishXpDisplay, harvestXpDisplay } from '../../src/features/pixel-world-phaser/logic/levels.ts';

test('레벨 경계는 지수형 곡선(50부터 12%씩, 정수 내림)의 누적 합과 일치한다', () => {
  let threshold = 0, need = 50;
  for (let level = 1; level <= MAX_LEVEL; level++) {
    assert.deepEqual(levelForXp(threshold), { level, xpIntoLevel: 0, xpForNext: level === MAX_LEVEL ? 0 : need, isMax: level === MAX_LEVEL });
    if (level > 1) assert.equal(levelForXp(threshold - 1).level, level - 1);
    if (level < MAX_LEVEL) assert.equal(levelForXp(threshold + 1).xpIntoLevel, 1);
    threshold += need; need = Math.floor(need * 112 / 100);
  }
  assert.equal(levelForXp(50).level, 2); assert.equal(levelForXp(106).level, 3); assert.equal(levelForXp(105).level, 2);
  // 후반으로 갈수록 가파르다: Lv.30까지 약 1만, Lv.50까지 약 10만 XP.
  assert.equal(levelForXp(10_041).level, 30); assert.equal(levelForXp(99_144).level, 50);
  assert.equal(levelForXp(2_000_000_000).level, 100); assert.equal(levelForXp(2_000_000_000).xpForNext, 0);
  for (const xp of [-3, NaN, Infinity]) assert.equal(levelForXp(xp).level, 1);
});
test('낚시 혜택은 레벨에서 1을 빼고 50%에서 멈춘다', () => {
  assert.equal(fishingPerkText(1), '낚시 난이도 −0%');
  assert.equal(fishingPerkText(13), '낚시 난이도 −12%');
  assert.equal(fishingPerkText(100), '낚시 난이도 −50%');
});
test('표시용 경험치는 서버 계약의 희귀도 및 대물 보너스를 따른다', () => {
  for (const [rarity, xp] of [['common', 5], ['uncommon', 10], ['rare', 25], ['legendary', 60]] as const) {
    assert.equal(fishXpDisplay(rarity), xp); assert.equal(fishXpDisplay(rarity, true), xp + 15);
  }
  assert.equal(harvestXpDisplay(), 40);
});
