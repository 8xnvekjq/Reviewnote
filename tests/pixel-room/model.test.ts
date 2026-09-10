import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, storageKey, loadRoom, saveRoom, validateRoom, canPlace, placeFurniture, removeFurniture, isCellFree, findSpawn, planWalk, FURNITURE, ROOM_WIDTH } from '../../src/features/pixel-room/model.ts';
import type { RoomState, StorageLike } from '../../src/features/pixel-room/model.ts';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}

test('defaults never share nested state and preserve only the approved appearance schema', () => {
  const first = defaultState(), second = defaultState();
  first.avatar.shirt = 'blue';
  first.furniture.push({ type: 'chair', x: 1, y: 1 });
  assert.deepEqual(second, { version: 1, avatar: { id: 'base', shirt: 'default', hat: 'none' }, furniture: [] });
  for (const avatar of [{ id: 'other', shirt: 'default', hat: 'none' }, { id: 'base', shirt: 'gold', hat: 'none' }, { id: 'base', shirt: 'default', hat: 'crown' }, { id: 'base', shirt: 'default', hat: 'cap' }]) {
    assert.equal(validateRoom({ ...second, avatar }), null);
  }
});

test('account keys are encoded and blank accounts never touch storage', () => {
  assert.equal(storageKey('a:b/한글'), 'pixelRoom:a%3Ab%2F%ED%95%9C%EA%B8%80:v1');
  assert.notEqual(storageKey('a:b'), storageKey('a%3Ab'));
  for (const blank of ['', '  ', '\n\t']) {
    assert.throws(() => storageKey(blank));
    const storage: StorageLike = { getItem() { assert.fail('read for blank user'); }, setItem() { assert.fail('write for blank user'); } };
    assert.equal(loadRoom(blank, storage).ok, false);
    assert.equal(saveRoom(blank, defaultState(), storage).ok, false);
  }
});

test('A and B rooms remain independent across save, load and unknown accounts', () => {
  const storage = memoryStorage();
  const a = placeFurniture(defaultState(), 'bed', { x: 8, y: 5 })!;
  a.avatar.shirt = 'sage'; a.avatar.hat = 'none';
  const b = placeFurniture(defaultState(), 'desk', { x: 3, y: 2 })!;
  assert.equal(saveRoom('A', a, storage).ok, true);
  assert.equal(saveRoom('B', b, storage).ok, true);
  assert.deepEqual(loadRoom('A', storage), { ok: true, state: a });
  assert.deepEqual(loadRoom('B', storage), { ok: true, state: b });
  assert.deepEqual(loadRoom('C', storage), { ok: true, state: defaultState() });
});

test('malformed, oversized and unsupported stored data fail visibly without rewriting it', () => {
  const storage = memoryStorage();
  const invalid = ['{', 'null', '[]', JSON.stringify({ ...defaultState(), version: 2 }), ' '.repeat(16_385)];
  for (const raw of invalid) {
    storage.data.set(storageKey('A'), raw);
    const result = loadRoom('A', storage);
    assert.equal(result.ok, false);
    assert.deepEqual(result.state, defaultState());
    assert.equal(storage.data.get(storageKey('A')), raw);
  }
});

test('validation rejects fractional/outside/unknown, duplicate and overlapping placements', () => {
  const badPlacements = [
    [{ type: 'chair', x: -1, y: 0 }], [{ type: 'chair', x: 10, y: 0 }],
    [{ type: 'chair', x: 0, y: 8 }], [{ type: 'chair', x: 0.1, y: 0 }],
    [{ type: 'bed', x: 9, y: 0 }], [{ type: 'bed', x: 0, y: 6 }],
    [{ type: 'chair', x: NaN, y: 0 }], [{ type: 'chair', x: Infinity, y: 0 }],
    [{ type: 'chair', x: '1', y: 0 }], [{ type: 'toString', x: 0, y: 0 }],
    [{ type: 'chair', x: 0, y: 0 }, { type: 'chair', x: 2, y: 2 }],
    [{ type: 'bed', x: 0, y: 0 }, { type: 'plant', x: 1, y: 2 }],
    Array.from({ length: 7 }, (_, x) => ({ type: 'chair', x, y: 0 })),
  ];
  for (const furniture of badPlacements) assert.equal(validateRoom({ ...defaultState(), furniture }), null, JSON.stringify(furniture));
  assert.equal(Object.keys(FURNITURE).length, 6);
});

test('placement observes footprints, touching edges, actor occupancy and immutability', () => {
  const empty = defaultState();
  const room = placeFurniture(empty, 'bed', { x: 0, y: 0 })!;
  assert.deepEqual(empty.furniture, []);
  assert.equal(canPlace(room, 'desk', { x: 2, y: 0 }), true);
  assert.equal(canPlace(room, 'desk', { x: 1, y: 2 }), false);
  assert.equal(canPlace(room, 'bed', { x: 8, y: 5 }), true);
  assert.equal(canPlace(room, 'bed', { x: 8, y: 6 }), false);
  assert.equal(placeFurniture(room, 'desk', { x: 4, y: 4 }, { x: 5, y: 4 }), null);
  assert.equal(canPlace(room, 'desk', { x: 4, y: 4 }, { x: 6, y: 4 }), false);
  assert.equal(canPlace(room, 'desk', { x: 4, y: 4 }, { x: 7, y: 4 }), true);
  assert.equal(isCellFree(room, { x: 1, y: 2 }), false);
  assert.equal(isCellFree(room, { x: 2, y: 2 }), true);
  assert.equal(isCellFree(room, { x: 10, y: 2 }), false);
  assert.equal(isCellFree(room, { x: 2.5, y: 2 }), false);
});

test('move ignores only the same owned item, and remove returns its footprint to the room', () => {
  const room = placeFurniture(placeFurniture(defaultState(), 'bed', { x: 0, y: 0 })!, 'plant', { x: 3, y: 0 })!;
  const moved = placeFurniture(room, 'bed', { x: 1, y: 0 })!;
  assert.equal(moved.furniture.filter(item => item.type === 'bed').length, 1);
  assert.equal(placeFurniture(moved, 'bed', { x: 2, y: 0 }), null);
  assert.equal(isCellFree(room, { x: 0, y: 0 }), false);
  assert.equal(isCellFree(moved, { x: 0, y: 0 }), true);
  const removed = removeFurniture(moved, 'bed');
  assert.deepEqual(removed.furniture, [{ type: 'plant', x: 3, y: 0 }]);
  assert.equal(moved.furniture.length, 2);
});

test('spawn deterministically skips blocked door squares', () => {
  const room = placeFurniture(defaultState(), 'desk', { x: 0, y: 7 })!;
  assert.deepEqual(findSpawn(defaultState()), { x: 0, y: 7 });
  assert.deepEqual(findSpawn(room), { x: 3, y: 7 });
});

test('storage access and quota failures are returned to UI rather than thrown or reported as saved', () => {
  assert.equal(loadRoom('A').ok, false);
  assert.equal(saveRoom('A', defaultState()).ok, false);
  const blocked: StorageLike = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  const read = loadRoom('A', blocked), write = saveRoom('A', defaultState(), blocked);
  assert.equal(read.ok, false); assert.equal(write.ok, false);
  if (!read.ok) assert.ok(read.error.length > 0);
  if (!write.ok) assert.ok(write.error.length > 0);
  const storage = memoryStorage();
  const invalid = { ...defaultState(), version: 2 } as unknown as RoomState;
  assert.equal(saveRoom('A', invalid, storage).ok, false);
  assert.equal(storage.data.size, 0);
});

test('planWalk reaches the target in a straight line and diagonally via a greedy Manhattan walk', () => {
  const room = defaultState();
  assert.deepEqual(planWalk(room, { x: 0, y: 0 }, { x: 3, y: 0 }), [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
  assert.deepEqual(planWalk(room, { x: 0, y: 0 }, { x: 0, y: 0 }), []);
  const diagonal = planWalk(room, { x: 0, y: 0 }, { x: 2, y: 2 });
  assert.equal(diagonal.length, 4);
  assert.deepEqual(diagonal[diagonal.length - 1], { x: 2, y: 2 });
  // Every intermediate step must itself be a free, in-bounds cell (no teleporting through walls).
  for (const cell of diagonal) assert.equal(isCellFree(room, cell), true);
});

test('planWalk refuses a blocked or out-of-room target and returns a partial path when boxed in', () => {
  const room = defaultState();
  assert.deepEqual(planWalk(room, { x: 0, y: 0 }, { x: -1, y: 0 }), []);
  assert.deepEqual(planWalk(room, { x: 0, y: 0 }, { x: ROOM_WIDTH, y: 0 }), []);
  const withBed = placeFurniture(room, 'bed', { x: 1, y: 0 })!; // 2 wide x 3 tall, blocks x:1-2, y:0-2
  assert.deepEqual(planWalk(withBed, { x: 1, y: 0 }, { x: 1, y: 2 }), []); // target itself is covered
  assert.deepEqual(planWalk(withBed, { x: 0, y: 0 }, { x: 3, y: 0 }), []); // straight into the bed, no vertical delta to route around it
  // L-shaped block (bed + chair) traps a diagonal walk after 2 steps — partial path, not a crash.
  const boxed = placeFurniture(placeFurniture(room, 'bed', { x: 1, y: 0 })!, 'chair', { x: 0, y: 3 })!;
  const partial = planWalk(boxed, { x: 0, y: 0 }, { x: 3, y: 3 });
  assert.deepEqual(partial, [{ x: 0, y: 1 }, { x: 0, y: 2 }]);
  for (const cell of partial) assert.equal(isCellFree(boxed, cell), true);
});

test('asset footprints fit exactly at their final valid column', () => {
  const room = defaultState();
  for (const [type, size] of Object.entries(FURNITURE)) {
    assert.equal(canPlace(room, type as keyof typeof FURNITURE, { x: 10 - size.width, y: 8 - size.height }), true);
    assert.equal(canPlace(room, type as keyof typeof FURNITURE, { x: 11 - size.width, y: 8 - size.height }), false);
  }
  assert.deepEqual(FURNITURE.desk, { width: 3, height: 1 });
  assert.deepEqual(FURNITURE.bookshelf, { width: 1, height: 1 });
  assert.deepEqual(FURNITURE.decoration, { width: 2, height: 1 });
});
