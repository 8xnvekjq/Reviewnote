import assert from 'node:assert/strict';
import test from 'node:test';
import { FISH_CATALOG, fishById } from '../../src/features/pixel-world-phaser/logic/fishCatalog.ts';
import { fishHint } from '../../src/features/pixel-world-phaser/logic/fishHints.ts';
import { turtleLines } from '../../src/features/pixel-world-phaser/logic/turtleLines.ts';
import { fishingPanelFor, panelFrozen } from '../../src/features/pixel-world-phaser/logic/panels.ts';
import type { FishingState } from '../../src/features/pixel-world-phaser/ui/fishingAdapter.ts';

const state: FishingState = { kstDate: '2026-10-08', phase: 'day', weather: 'clear', remaining: 6, sparkleShadow: null, pigeonHint: null, album: [] };
test('도감 힌트는 시간과 날씨 제한을 빠짐없이 알려 준다', () => {
  assert.equal(fishHint(fishById('moonfish')!), '밤 · 맑음');
  assert.equal(fishHint(fishById('rainbow_koi')!), '비 오는 날');
  assert.equal(fishHint(fishById('eel')!), '밤');
  assert.equal(fishHint(fishById('trout')!), '아침 · 맑음');
  assert.equal(fishHint(fishById('catfish')!), '저녁·밤 · 비 오는 날');
  assert.equal(fishHint(fishById('mandarin')!), '낮·저녁 · 맑음·흐림');
  assert.equal(fishHint(fishById('pirami')!), '언제든 만날 수 있어요');
  for (const fish of FISH_CATALOG) assert.ok(fishHint(fish));
});
test('거북이는 비와 밤, 새 친구, 다 쓴 낚시 횟수에 반응한다', () => {
  assert.match(turtleLines({ ...state, weather: 'rain' })[0], /메기/);
  assert.match(turtleLines({ ...state, phase: 'night' })[0], /달빛/);
  assert.match(turtleLines(state, 'eel')[0], /뱀장어, 새 친구/);
  assert.equal(turtleLines({ ...state, remaining: 0, weather: 'rain' }, 'eel')[0], '오늘은 물고기들이 쉬고 있어요. 내일 또 와요!');
  assert.match(turtleLines(state, 'unknown')[0], /천천히/);
});
test('비둘기 힌트는 휴식 대사와 함께 남고 서버 문장도 보존한다', () => {
  const lines = turtleLines({ ...state, remaining: 0, pigeonHint: 'moonfish' });
  assert.equal(lines.length, 2);
  assert.match(lines[1], /밤 · 맑음에 달빛 피라미/);
  assert.deepEqual(turtleLines({ ...state, pigeonHint: '밤에 맑으면…' }).slice(1), ['비둘기가 알려 줬어요: 밤에 맑으면…']);
  assert.equal(turtleLines(state).length, 1);
});
test('거북이와 게시판은 같은 창 등록 및 이동 잠금을 사용한다', () => {
  assert.equal(fishingPanelFor('turtle'), 'turtle');
  assert.equal(fishingPanelFor('fishboard'), 'fishboard');
  assert.equal(fishingPanelFor('other'), null);
  assert.equal(panelFrozen('turtle', false), true);
  assert.equal(panelFrozen('fishboard', false), true);
});
