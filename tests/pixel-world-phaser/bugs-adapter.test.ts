import test from 'node:test';
import assert from 'node:assert/strict';
import { BUG_CATALOG } from '../../src/features/pixel-world-phaser/logic/bugCatalog.ts';
import { createBugAdapter, createMockBugAdapter, parseBugState, parseBugStart, parseBugFinish } from '../../src/features/pixel-world-phaser/ui/bugAdapter.ts';

test('잘못된 응답을 거르고 RPC 오류가 밖으로 나오지 않는다', async () => {
  const entry = { bugId: 'dragonfly_red',count: 1,firstAt: '2026-10-11T03:00:00Z' };
  assert.deepEqual(parseBugState({ netOwned: 'true',album: [entry,entry,{ ...entry,count: 0 },{ ...entry,bugId: 'fake' },{ ...entry,firstAt: 'bad' }] }), { netOwned: false,album: [entry] });
  for (const raw of [null,[],false,{ ok: true,catchId: 'x',bugId: 'fake',difficulty: 1 },{ ok: true,catchId: 'x',bugId: 'dragonfly_red',difficulty: 2 },{ ok: true,catchId: '',bugId: 'dragonfly_red',difficulty: 1 }]) assert.deepEqual(parseBugStart(raw), { ok: false,reason: 'error' });
  assert.deepEqual(parseBugStart({ ok: false,reason: 'no_net' }), { ok: false,reason: 'no_net' });
  const valid = { ok: true,caught: true,bugId: 'dragonfly_red',isNew: true };
  assert.deepEqual(parseBugFinish({ ...valid,xpGain: {},points: { awarded: -1 } }),valid);
  const points = { awarded: 2,todayEarned: 2,cap: 50,capped: false };
  assert.deepEqual(parseBugFinish({ ...valid,points }), { ...valid,points });
  for (const p of [{ ...points,cap: 51 },{ ...points,capped: true },{ ...points,todayEarned: 1 },{ ...points,awarded: '2' }]) assert.equal('points' in parseBugFinish({ ...valid,points: p }),false);
  assert.deepEqual(parseBugFinish({ ...valid,isNew: 'true' }), { ok: false });
  const calls: any[] = [];
  const adapter = createBugAdapter({ rpc: async (name,args) => { calls.push([name,args]); return { data: name==='get_bug_state' ? { netOwned: true,album: [entry] } : name==='start_bug_catch' ? { ok: true,catchId: 'id',bugId: 'dragonfly_red',difficulty: 1 } : valid,error: null }; } });
  assert.equal((await adapter.state()).netOwned,true);
  assert.equal((await adapter.start('yard')).ok,true); assert.equal((await adapter.finish('id',true)).ok,true);
  assert.deepEqual(calls,[['get_bug_state',undefined],['start_bug_catch',{ p_scene: 'yard' }],['finish_bug_catch',{ p_catch_id: 'id',p_caught: true }]]);
  await adapter.start('bad'); await adapter.finish('',true); assert.equal(calls.length,3);
  for (const rpc of [() => { throw Error('오류'); },async () => { throw Error('오류'); },async () => ({ data: valid,error: {} }),async () => ({ data: null,error: null })]) {
    const bad = createBugAdapter({ rpc });
    assert.deepEqual(await bad.state(), { netOwned: false,album: [] });
    assert.deepEqual(await bad.start('plaza'), { ok: false,reason: 'error' });
    assert.deepEqual(await bad.finish('id',true), { ok: false });
  }
});

test('모의 채 소유·대기·스로틀·시간 경계·재생·도감', async () => {
  let time = Date.parse('2026-10-11T03:00:00Z');
  const options = { netOwned: false,now: () => time,random: () => 0 };
  const adapter = createMockBugAdapter(options);
  assert.deepEqual(await adapter.start('plaza'), { ok: false,reason: 'no_net' });
  options.netOwned = true;
  let start = await adapter.start('plaza'); assert.ok(start.ok);
  assert.deepEqual(await adapter.start('plaza'), { ok: false,reason: 'pending' });
  time+=599; assert.deepEqual(await adapter.finish(start.catchId,true), { ok: true,caught: false });
  assert.deepEqual(await adapter.finish(start.catchId,true), { ok: false });
  assert.deepEqual(await adapter.start('plaza'), { ok: false,reason: 'pending' });
  time+=1401; start = await adapter.start('river'); assert.ok(start.ok);
  assert.deepEqual(await adapter.finish('wrong',true), { ok: false });
  time+=600; const first = await adapter.finish(start.catchId,true); assert.ok(first.ok && first.caught && first.isNew);
  assert.equal(first.xpGain?.gained,5); assert.equal(first.points?.awarded,2);
  const album = (await adapter.state()).album;
  album[0].count = 99; assert.equal((await adapter.state()).album[0].count,1);
  time+=1400; start = await adapter.start('yard'); assert.ok(start.ok);
  time+=15000; const last = await adapter.finish(start.catchId,true); assert.ok(last.ok && last.caught && !last.isNew);
  assert.equal((await adapter.state()).album[0].count,2);
  assert.equal((await adapter.state()).album[0].firstAt,new Date(Date.parse('2026-10-11T03:00:00Z')+2600).toISOString());
  start = await adapter.start('yard'); assert.ok(start.ok); time+=15001;
  assert.deepEqual(await adapter.finish(start.catchId,true), { ok: false });
  start = await adapter.start('yard'); assert.ok(start.ok); time+=15001;
  const replacement = await adapter.start('yard'); assert.ok(replacement.ok);
  assert.deepEqual(await adapter.finish(start.catchId,true), { ok: false });
  assert.deepEqual(await adapter.finish(replacement.catchId,false), { ok: true,caught: false });
});

test('모의 가중치·경험치·상한 뒤 1/5과 이월·별 4·5 전액·KST 자정', async () => {
  let time = Date.parse('2026-10-11T14:00:00Z'),roll = 0;
  const adapter = createMockBugAdapter({ netOwned: true,now: () => time,random: () => roll,todayEarned: 49 });
  const rolls = [0,0.5,0.78,0.92,0.98];
  const awards = [1,0,2,15,33];
  let xp = 0;
  for (let i=0;i<BUG_CATALOG.length;i++) {
    roll=rolls[i]; const start = await adapter.start('plaza'); assert.ok(start.ok);
    assert.equal(start.bugId,BUG_CATALOG[i].id); assert.equal(start.difficulty,BUG_CATALOG[i].stars);
    time+=1000; const result = await adapter.finish(start.catchId,true); assert.ok(result.ok && result.caught);
    xp+=BUG_CATALOG[i].xp; assert.equal(result.xpGain?.xp,xp); assert.equal(result.points?.awarded,awards[i]);
    time+=1000;
  }
  time=Date.parse('2026-10-11T15:00:00Z'); roll=0.5;
  let start=await adapter.start('plaza'); assert.ok(start.ok); time+=1000;
  let result=await adapter.finish(start.catchId,true); assert.ok(result.ok && result.caught);
  assert.deepEqual(result.points, { awarded: 3,todayEarned: 3,cap: 50,capped: false });
  const capped = createMockBugAdapter({ netOwned: true,now: () => time,random: () => 0.5,todayEarned: 50 });
  for (const awarded of [0,1]) {
    start=await capped.start('plaza'); assert.ok(start.ok); time+=1000;
    result=await capped.finish(start.catchId,true); assert.ok(result.ok && result.caught); assert.equal(result.points?.awarded,awarded); time+=1000;
  }
  const sample = createMockBugAdapter({ netOwned: true,now: () => time,seed: 123 });
  const counts = new Map<string,number>();
  for (let i=0;i<5000;i++) {
    time+=2000; const s=await sample.start('plaza'); assert.ok(s.ok);
    counts.set(s.bugId,(counts.get(s.bugId)??0)+1); await sample.finish(s.catchId,false);
  }
  for (const b of BUG_CATALOG) assert.ok(Math.abs((counts.get(b.id)??0)/5000-b.weight/100)<0.02);
});
