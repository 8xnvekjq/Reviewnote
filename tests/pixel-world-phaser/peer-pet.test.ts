import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepPeerPetFollow } from '../../src/features/pixel-world-phaser/logic/peerPetFollow.ts';
import { PET_SHEETS, petFollowSpot } from '../../src/features/pixel-world-phaser/logic/petSheets.ts';
import { createPetFollowState, stepPetFollow } from '../../src/features/pixel-world-phaser/logic/petFollow.ts';
import { moveFeet } from '../../src/features/pixel-world-phaser/logic/world.ts';
import { protocolExtras, continuousPayload } from '../../src/features/pixel-room/plaza/presenceProtocol.ts';
import { createPlazaStoreState, plazaStoreReducer } from '../../src/features/pixel-room/plaza/presenceStore.ts';
import { riverPayload, RIVER_BOUNDS } from '../../src/features/pixel-world-phaser/logic/riverPresence.ts';
import type { PetId } from '../../src/features/pixel-room/pet/petKinds.ts';

for (const pet of Object.keys(PET_SHEETS) as PetId[]) {
  test(`${pet}: blocked peers recover near their owner instead of roaming`, () => {
    const owner = { x: 400, y: 200 };
    let here = { x: 100, y: 200 }, state = createPetFollowState(here), recovered = false;
    for (let i = 0; i < 400; i++) {
      const result = stepPeerPetFollow(state, here, owner, 'Right', pet, 1000 / 60, cell => cell.x === 10);
      recovered ||= result.teleported;
      state = result.state; here = result.position;
    }
    assert.equal(recovered, true);
    assert.ok(Math.hypot(here.x - owner.x, here.y - owner.y) < 30);
  });
  test(`${pet}: peers use local smoothing, trail walking/running owners and never roam at rest`, () => {
    const owner = { x: 200, y: 200 };
    let here = petFollowSpot(owner, 'Right');
    let state = createPetFollowState(here);
    for (let i = 0; i < 900; i++) {
      owner.x += i < 300 ? 56 / 60 : i < 600 ? 96 / 60 : 0;
      const actual = stepPeerPetFollow(state, here, owner, 'Right', pet, 1000 / 60, () => false);
      const local = stepPetFollow(state, here, owner, 'Right', PET_SHEETS[pet], 1000 / 60, 96,
        { blocked: () => false, move: (from, dx, dy) => moveFeet(from, dx, dy, () => false) });
      assert.deepEqual(actual, local);
      state = actual.state; here = actual.position;
      assert.ok(Math.hypot(here.x - owner.x, here.y - owner.y) < 65);
    }
    const settled = { ...here };
    for (let i = 0; i < 1200; i++) {
      const result = stepPeerPetFollow(state, here, owner, 'Right', pet, 1000 / 60, () => false);
      assert.deepEqual(result.position, settled);
      assert.equal(result.walking, false);
      state = result.state; here = result.position;
    }
  });
}

const legacy = { sessionId: 'peer', x: 3, y: 4, direction: 'Right' as const, moving: false,
  seq: 1, updatedAt: 1, appearance: { top: null, bottom: null, hair: null, shoes: null, eyes: null, skin: null } };
for (const [scene, payload, bounds] of [
  ['plaza', continuousPayload({ x: 200, y: 200 }), undefined],
  ['river', riverPayload({ x: 200, y: 200 }), RIVER_BOUNDS],
] as const) {
  test(`${scene}: riding encodes, survives presence/broadcast, clears and defaults off for old payloads`, () => {
    let store = createPlazaStoreState();
    for (const [i, extras, expected] of [
      [0, { ...payload, pet: 'pet_bear', riding: true }, true],
      [1, { ...payload, pet: 'pet_bear', riding: false }, false],
      [2, { ...payload, pet: 'pet_bear' }, false],
      [3, {}, false],
      [4, { ...payload, pet: 'pet_duck', riding: true }, false],
      [5, { ...payload, pet: 'pet_bear', riding: 'true' }, false],
    ] as const) {
      const raw = { ...legacy, ...extras, seq: i + 1 } as typeof legacy;
      const encoded = { ...raw, ...protocolExtras(raw, bounds) };
      store = plazaStoreReducer(store, i === 0
        ? { type: 'presence-join', players: [{ player: encoded, presenceRef: 'ref' }] }
        : { type: 'broadcast', player: encoded }, bounds);
      assert.equal(store.players.get('peer')!.riding === true, expected);
      assert.equal(encoded.x, raw.x);
    }
    assert.deepEqual(protocolExtras(legacy), {});
  });
}
