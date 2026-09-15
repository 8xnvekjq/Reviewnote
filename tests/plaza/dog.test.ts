import { test } from 'node:test';
import assert from 'node:assert/strict';
import './register-typescript.mjs';
const { advanceDog, dogFits, dogRoute, spawnDog } = await import('../../src/features/pixel-room/pet/dogModel.ts');
const { roomDogWorld, yardDogWorld } = await import('../../src/features/pixel-room/pet/dogWorld.ts');
const { defaultState } = await import('../../src/features/pixel-room/model.ts');

test('long room/yard simulation keeps both body cells and every path off furniture, doors, player and road', () => {
  const room = defaultState();
  room.furniture = [{type:'bed',x:0,y:0},{type:'desk',x:6,y:2}];
  let seed = 12;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (const outdoors of [false,true]) {
    let world = outdoors ? yardDogWorld({x:11,y:7}) : roomDogWorld(room,{x:2,y:4});
    let state = spawnDog(world,0);
    const actions = new Set<string>();
    let travelled = 0;
    for (let now=100;now<180000;now+=100) {
      if (now===60000) world = outdoors ? yardDogWorld(state!.cell) : roomDogWorld(room,state!.cell);
      const previous = state;
      state = advanceDog(state,world,now,false,random);
      assert.ok(state); assert.ok(dogFits(world,state.cell)); assert.ok(dogFits(world,state.from));
      assert.ok(state.route.every(p=>dogFits(world,p)));
      actions.add(state.action);
      if (previous && (previous.cell.x!==state.cell.x || previous.cell.y!==state.cell.y)) travelled++;
    }
    assert.ok(travelled>15); assert.ok(actions.has('sit')); assert.ok(actions.has('bark')); assert.ok(actions.has('idle'));
  }
});
test('editing rests; furniture changes select a safe spawn; completely full room hides pet', () => {
  const room = defaultState(); room.furniture=[];
  const world = roomDogWorld(room,{x:4,y:5});
  let state = spawnDog(world,0)!;
  state = advanceDog(state,world,2000,true)!;
  assert.equal(state.action,'sit'); assert.equal(state.route.length,0);
  const blocked = {...world,free:()=>false};
  assert.equal(advanceDog(state,blocked,3000,false),null);
  assert.ok(advanceDog(null,world,4000,false));
  const route = dogRoute(world,state.cell,()=>.9);
  let previous=state.cell;
  for(const cell of route) { assert.equal(Math.abs(cell.x-previous.x)+Math.abs(cell.y-previous.y),1); previous=cell; }
});
