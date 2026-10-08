import assert from 'node:assert/strict';
import test from 'node:test';
import { createReelGame, stepReelGame, minReelMs, REEL_MARGIN_MS } from '../../src/features/pixel-world-phaser/logic/reelGame.ts';
import { rodDisplay, rodEffectText, ROD_CATALOG } from '../../src/features/pixel-room/shop/rods.ts';
import { parseCastStart, parseFishingState } from '../../src/features/pixel-world-phaser/ui/fishingAdapter.ts';
import { itemState, panelItems } from '../../src/features/pixel-world-phaser/logic/panels.ts';

test('낚싯대 속도는 겹침 구간의 진행량에만 적용된다', () => {
  const slow = stepReelGame(createReelGame(2), 50);
  const fast = stepReelGame(createReelGame(2, false, false, 0, 1.35), 50);
  assert.ok(Math.abs((fast.progress - .35) / (slow.progress - .35) - 1.35) < 1e-8);
  const outside = { ...createReelGame(2), zone: .12, fish: .8 };
  assert.equal(stepReelGame(outside, 50).progress, stepReelGame({ ...outside, speed: 1.35 }, 50).progress);
});
test('최소 릴 시간은 속도로 나눈 뒤 안전 여유를 더한다', () => {
  for (const speed of [1, 1.15, 1.25, 1.35]) {
    assert.equal(minReelMs(2.5, speed), (1500 + 1.5 * 375) / speed);
    let game = { ...createReelGame(2.5, false, false, 0, speed), progress: 1 };
    const minimum = minReelMs(game.difficulty, speed) + REEL_MARGIN_MS;
    game = stepReelGame(game, minimum - 10);
    assert.equal(game.status, 'playing');
    game = stepReelGame({ ...game, zone: game.fish, progress: 1 }, 25);
    assert.equal(game.status, 'landed');
    assert.ok(game.elapsed * 1000 >= minimum);
  }
  for (const speed of [0, -1, NaN, Infinity]) assert.equal(createReelGame(1, false, false, 0, speed).speed, 1);
});
test('낚싯대 이름, 효과, 기본 선택과 보유 필터', () => {
  assert.equal(rodDisplay().displayName, '기본 낚싯대');
  assert.equal(rodDisplay({ id: 'unknown', tier: 4 }).displayName, '기본 낚싯대');
  assert.deepEqual(ROD_CATALOG.map(r => rodDisplay({ id: r.itemId, tier: r.tier }).displayName), ['대나무 낚싯대', '강철 낚싯대', '행운의 낚싯대', '황금 낚싯대']);
  assert.equal(rodEffectText('rod_lucky'), '난이도 −0.5 · 희귀 물고기 +5% · 낚시 속도 +25%');
  const owned = new Set(['rod_gold']);
  assert.deepEqual(panelItems(ROD_CATALOG, 'rod', owned).map(r => r.itemId), ['rod_gold']);
  const appearance = { top: null, bottom: null, hair: null, shoes: null, eyes: null, skin: null };
  assert.equal(itemState(ROD_CATALOG[3], owned, appearance, null, 'rod_gold'), 'equipped');
});
test('추가 서버 필드와 구형 응답의 기본값', () => {
  const raw = { ok: true, castId: 'cast', shadow: 'M', biteDelayMs: 100 };
  const old = parseCastStart(raw);
  assert.ok(old.ok);
  if (!old.ok) return;
  assert.deepEqual(old.rod, { id: null, tier: 0 }); assert.equal(old.speed, 1); assert.equal(old.trophy, false);
  const upgraded = parseCastStart({ ...raw, rod: { id: 'rod_gold', tier: 4 }, speed: 1.35, trophy: true, difficulty: 2.2 });
  assert.ok(upgraded.ok);
  if (!upgraded.ok) return;
  assert.equal(upgraded.speed, 1.35); assert.equal(upgraded.trophy, true); assert.equal(upgraded.difficulty, 2.2);
  assert.deepEqual(parseFishingState({ rod: upgraded.rod }).rod, upgraded.rod);
  assert.deepEqual(parseFishingState({ rod: { id: 'bad', tier: 9 } }).rod, { id: null, tier: 0 });
});
