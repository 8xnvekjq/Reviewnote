import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReaction, nearWell, plazaDay, dailyWellMessage, wellStorageKey, REACTION_MS } from '../../src/features/pixel-room/plaza/plazaInteractions.ts';
test('reaction payload allows fixed reactions only and drops extra personal/free-text fields', () => {
  assert.deepEqual(parseReaction({ sessionId: 'a', kind: 'wave', sentAt: 10000, text: 'free text', email: 'private' }, 10000), { sessionId: 'a', kind: 'wave', sentAt: 10000 });
  for (const kind of ['hello world', '__proto__', 'constructor', '', null]) assert.equal(parseReaction({ sessionId: 'a', kind, sentAt: 10000 }, 10000), null);
  for (const sentAt of [NaN, Infinity, '10000', 10000 - REACTION_MS - 1, 15001]) assert.equal(parseReaction({ sessionId: 'a', kind: 'cheer', sentAt }, 10000), null);
  assert.equal(parseReaction(null, 10000), null);
});
test('daily message rolls over at midnight in Korea, not UTC', () => {
  const before = plazaDay(Date.parse('2026-09-15T14:59:59Z'));
  const after = plazaDay(Date.parse('2026-09-15T15:00:00Z'));
  assert.equal(before, '2026-09-15'); assert.equal(after, '2026-09-16');
  assert.equal(dailyWellMessage(before), dailyWellMessage(before));
  assert.notEqual(dailyWellMessage(before), dailyWellMessage(after));
  assert.notEqual(wellStorageKey('a'), wellStorageKey('b'));
});
test('well requires standing next to the base', () => {
  assert.ok(nearWell({ x: 7, y: 6 })); assert.ok(nearWell({ x: 9, y: 5 }));
  assert.equal(nearWell({ x: 8, y: 10 }), false);
  assert.equal(nearWell({ x: 7, y: 5 }), false);
});
