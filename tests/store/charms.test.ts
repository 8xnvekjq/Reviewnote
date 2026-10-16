import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GACHA_ITEMS } from '../../src/utils/gachaCatalog.ts';
import { CHARM_DECORATIONS, pickCharmMessage } from '../../src/features/charms/definitions.ts';
import { charmVisibilityKey, isCharmShown, saveCharmShown } from '../../src/features/charms/visibility.ts';

test('every charm has a distinct decoration and at least three warm messages', () => {
  const charms = GACHA_ITEMS.filter(item => item.category === 'CHARM');
  assert.equal(charms.length, 4);
  assert.equal(new Set(charms.map(item => CHARM_DECORATIONS[item.id].color)).size, 4);
  assert.equal(new Set(charms.map(item => CHARM_DECORATIONS[item.id].symbol)).size, 4);
  for (const item of charms) {
    const decoration = CHARM_DECORATIONS[item.id];
    assert.ok(decoration.label);
    assert.ok(decoration.messages.length >= 3);
    for (let i = 0; i < decoration.messages.length; i++) {
      assert.ok(decoration.messages[i].length > 5);
      assert.equal(pickCharmMessage(item.id, () => (i + .1) / decoration.messages.length), decoration.messages[i]);
    }
    assert.match(item.description, /오답노트.*장식/);
    assert.match(item.description, /응원/);
  }
});

test('catalog identity and reward metadata remain unchanged from HEAD snapshot', () => {
  const before = JSON.parse(readFileSync(new URL('./catalog-before.json', import.meta.url), 'utf8'));
  assert.equal(GACHA_ITEMS.length, before.length);
  for (const [index, item] of GACHA_ITEMS.entries()) {
    for (const key of ['id', 'effectValue', 'rarity', 'category'] as const) assert.equal(item[key], before[index][key]);
    assert.equal(item.isLimited, before[index].isLimited === 'true' ? true : undefined);
  }
});

test('copy avoids unsupported hype, animation, sound and speed promises', () => {
  for (const item of GACHA_ITEMS) assert.doesNotMatch(item.description, /눈뽕|토식 라이믹|콧소리 억양|0\.001초|3차 복습|3회차|흩날리|폭풍|정답률이 솟구|실수를 싹 막/);
  for (const item of GACHA_ITEMS.filter(item => item.category === 'STAMP')) assert.match(item.description, /맞힌 복습 칸/);
});

test('visibility defaults shown, persists hidden, and tolerates unavailable storage', () => {
  const data = new Map<string, string>();
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => data.get(key), setItem: (key: string, value: string) => data.set(key, value) } });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: () => true } });
    assert.equal(isCharmShown('charm_grade_one'), true);
    saveCharmShown('charm_grade_one', false);
    assert.equal(data.get(charmVisibilityKey('charm_grade_one')), 'true');
    assert.equal(isCharmShown('charm_grade_one'), false);
    saveCharmShown('charm_grade_one', true);
    assert.equal(isCharmShown('charm_grade_one'), true);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('blocked'); } });
    assert.equal(isCharmShown('charm_grade_one'), true);
    assert.doesNotThrow(() => saveCharmShown('charm_grade_one', false));
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage); else Reflect.deleteProperty(globalThis, 'localStorage');
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window');
  }
});
