import test from 'node:test';
import assert from 'node:assert/strict';
import { MENU_RECENT_SHOWN, MENU_RECENT_STORED, loadMenuRecent, menuRecentStorageKey, parseMenuRecent, pickVisibleMenuRecent, pushMenuRecent, recordMenuRecent } from '../../src/components/menuRecent.ts';

const memoryStorage = () => {
  const map = new Map<string, string>();
  return { map, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } };
};
const brokenStorage = { getItem: (): string | null => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };

test('storage key is per user and absent when logged out', () => {
  assert.equal(menuRecentStorageKey('u1'), 'rn-menu-recent-v1:u1');
  assert.equal(menuRecentStorageKey(undefined), null);
  assert.equal(menuRecentStorageKey(''), null);
});

test('push puts newest first, dedupes, and caps the stored list', () => {
  assert.deepEqual(pushMenuRecent([], 'stats'), ['stats']);
  assert.deepEqual(pushMenuRecent(['stats', 'guide'], 'guide'), ['guide', 'stats']);
  let list: string[] = [];
  for (const key of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) list = pushMenuRecent(list, key);
  assert.equal(list.length, MENU_RECENT_STORED);
  assert.deepEqual(list, ['g', 'f', 'e', 'd', 'c']);
});

test('pick shows at most two items and skips ones not visible now', () => {
  assert.equal(MENU_RECENT_SHOWN, 2);
  assert.deepEqual(pickVisibleMenuRecent(['pixelRoom', 'stats', 'slides', 'guide'], ['stats', 'slides', 'guide']), ['stats', 'slides']);
  assert.deepEqual(pickVisibleMenuRecent(['examPrep'], ['stats']), []);
  assert.deepEqual(pickVisibleMenuRecent(['stats', 'stats', 'guide'], ['stats', 'guide']), ['stats', 'guide']);
});

test('parse tolerates garbage', () => {
  assert.deepEqual(parseMenuRecent(null), []);
  assert.deepEqual(parseMenuRecent('not json'), []);
  assert.deepEqual(parseMenuRecent('{"a":1}'), []);
  assert.deepEqual(parseMenuRecent('["stats", 3, "", "guide"]'), ['stats', 'guide']);
});

test('record and load round-trip per user', () => {
  const storage = memoryStorage();
  assert.deepEqual(recordMenuRecent('u1', 'stats', storage), ['stats']);
  assert.deepEqual(recordMenuRecent('u1', 'slides', storage), ['slides', 'stats']);
  assert.deepEqual(loadMenuRecent('u1', storage), ['slides', 'stats']);
  assert.deepEqual(loadMenuRecent('u2', storage), []);
  assert.deepEqual(recordMenuRecent(undefined, 'stats', storage), []);
  assert.equal(storage.map.size, 1);
});

test('storage failures never throw', () => {
  assert.deepEqual(loadMenuRecent('u1', brokenStorage), []);
  assert.deepEqual(recordMenuRecent('u1', 'stats', brokenStorage), ['stats']);
  assert.deepEqual(loadMenuRecent('u1', null), []);
  assert.deepEqual(recordMenuRecent('u1', 'stats', null), ['stats']);
});
