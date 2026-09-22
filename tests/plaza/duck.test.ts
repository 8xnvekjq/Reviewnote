import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceDuck, duckPosition, duckStepMs, spawnDuck } from '../../src/features/pixel-room/pet/duckModel.ts';
import { dogFits, dogStepMs } from '../../src/features/pixel-room/pet/dogModel.ts';
import { roomDogWorld, yardDogWorld } from '../../src/features/pixel-room/pet/dogWorld.ts';
import { defaultState, placeFurniture } from '../../src/features/pixel-room/model.ts';
import { isPetId } from '../../src/features/pixel-room/pet/petKinds.ts';
test('duck long simulation uses safe paths and all distinctive motions indoors and outdoors', () => {
  for (const world of [roomDogWorld(defaultState(),{x:4,y:6}),yardDogWorld({x:10,y:5})]) {
    let state = spawnDuck(world,0), seed = 987;
    const random = () => {seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    const actions=new Set(); const visited=new Set();
    for(let now=0;now<600000;now+=50){
      state=advanceDuck(state,world,now,false,random);
      assert.ok(state && dogFits(world,state.cell) && dogFits(world,state.from));
      assert.ok(state.route.length <= (world.outdoors ? 3 : 2));
      assert.ok(state.route.every(p=>dogFits(world,p)));
      actions.add(state.action);visited.add(`${state.cell.x},${state.cell.y}`);
      const p=duckPosition(state,world,now);
      assert.ok(p.x>=Math.min(state.from.x,state.cell.x)&&p.x<=Math.max(state.from.x,state.cell.x));
      assert.ok(p.y>=Math.min(state.from.y,state.cell.y)&&p.y<=Math.max(state.from.y,state.cell.y));
    }
    assert.deepEqual([...actions].sort(),['hop','idle','peck','tilt','walk']);
    assert.ok(visited.size>8);
  }
});
test('editing, changing furniture, blocked player cells and scene changes remain safe', () => {
  const room=defaultState(); const world=roomDogWorld(room,{x:4,y:6});
  let state=spawnDuck(world,0);assert.ok(state);
  state=advanceDuck(state,world,2000,true);assert.ok(state);
  assert.equal(state.action,'idle');assert.deepEqual(state.route,[]);assert.deepEqual(state.cell,state.from);
  const changed=placeFurniture(room,'chair',state.cell);assert.ok(changed);
  const nextWorld=roomDogWorld(changed,{x:4,y:6});
  state=advanceDuck(state,nextWorld,3000,false);assert.ok(state && dogFits(nextWorld,state.cell));
  const playerWorld=roomDogWorld(changed,state.cell);
  state=advanceDuck(state,playerWorld,4000,false);assert.ok(state && dogFits(playerWorld,state.cell));
  assert.equal(advanceDuck(state,{...world,free:()=>false},5000,false),null);
  for(let i=0;i<20;i++){ const yard=yardDogWorld({x:6,y:7});const spawned=spawnDuck(yard,0);assert.ok(spawned&&dogFits(yard,spawned.cell)); }
});
test('duck short steps have distinct pacing; server pet values remain allowlisted', () => {
  const room=roomDogWorld(defaultState(),{x:4,y:6}),yard=yardDogWorld({x:6,y:7});
  assert.ok(duckStepMs(room)>duckStepMs(yard));assert.notEqual(duckStepMs(room),dogStepMs(room));
  assert.ok(isPetId('pet_duck')&&isPetId('pet_dog'));
  for(const invalid of ['dog','cat','furniture_chair',null,{},true])assert.equal(isPetId(invalid),false);
});
