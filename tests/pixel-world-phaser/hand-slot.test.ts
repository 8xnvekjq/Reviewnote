import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HAND, parseBag, parseHand } from '../../src/features/pixel-world-phaser/logic/bag';
import { heldToolFor, heldToolFromTag, heldToolTag } from '../../src/features/pixel-world-phaser/logic/heldTool';
import { heldToolPose, rodTip } from '../../src/features/pixel-world-phaser/logic/heldTool';
import { parseBugFinish, parseBugStart, parseBugState } from '../../src/features/pixel-world-phaser/ui/bugAdapter';
import { protocolExtras } from '../../src/features/pixel-room/plaza/presenceProtocol';
import { minReelMs } from '../../src/features/pixel-world-phaser/logic/reelGame';
import { BUG_AUTO_CATCH_STARS } from '../../src/features/pixel-world-phaser/logic/bugCatalog';
import { dizzyEyes, netHits } from '../../src/features/pixel-world-phaser/logic/netHit';
import { BUG_FLEE, bugThreat, stepRoamingBug } from '../../src/features/pixel-world-phaser/logic/bugGame';
import { createBugAdapter, parseBugSpawn } from '../../src/features/pixel-world-phaser/ui/bugAdapter';

test('손 칸 응답: 낚싯대·잠자리채·맨손, 이상한 값은 기본 낚싯대를 든 것으로', () => {
  assert.deepEqual(parseHand({ hand: 'net', rod: { id: 'rod_gold', tier: 4 }, netOwned: true, rods: ['rod_gold', 3] }),
    { hand: 'net', rod: { id: 'rod_gold', tier: 4 }, netOwned: true, rods: ['rod_gold'] });
  assert.equal(parseHand({ hand: 'bare' }).hand, 'bare');
  assert.deepEqual(parseHand({ hand: 'sword', rod: { id: 5 } }), DEFAULT_HAND);
  assert.deepEqual(parseHand(null), DEFAULT_HAND);
  // 가방 응답에 손 칸이 붙어 오고, 없으면(판매 응답) 기본값.
  const bag = parseBag({ capacity: 30, weight: 1, items: [], crops: [], hand: 'net', rod: { id: null, tier: 0 }, netOwned: true, rods: [] });
  assert.equal(bag?.capacity, 30); assert.equal(bag?.hand, 'net');
  assert.equal(parseBag({ capacity: 20, weight: 0 })?.hand, 'rod');
});

test('손에 든 도구 그리기·친구에게 보내는 표시', () => {
  assert.equal(heldToolFor('bare', 'rod_gold'), null);
  assert.equal(heldToolFor(null, null), null);
  assert.deepEqual(heldToolFor('net', null), { kind: 'net', color: 0 });
  assert.equal(heldToolFor('rod', 'rod_gold')?.kind, 'rod');
  assert.notEqual(heldToolFor('rod', 'rod_gold')?.color, heldToolFor('rod', null)?.color, '낚싯대 등급 색');
  assert.equal(heldToolTag(heldToolFor('rod', null), null), 'rod_basic');
  assert.equal(heldToolTag(heldToolFor('rod', 'rod_lucky'), 'rod_lucky'), 'rod_lucky');
  assert.equal(heldToolTag(heldToolFor('net', null), null), 'net');
  assert.equal(heldToolTag(null, 'rod_gold'), undefined);
  assert.equal(heldToolFromTag('net')?.kind, 'net');
  assert.equal(heldToolFromTag('rod_gold')?.kind, 'rod');
  for (const bad of ['sword', 'rod_<script>', 'rod_', 42, null]) assert.equal(heldToolFromTag(bad), null);
  // 위를 볼 때만 몸 뒤, 왼쪽·오른쪽은 반대편 손.
  assert.equal(heldToolPose('Back').behind, true); assert.equal(heldToolPose('Front').behind, false);
  assert.ok(heldToolPose('Left').hand.x < 0 && heldToolPose('Right').hand.x > 0);
  // 낚싯대: A를 누르면 뒤로 젖히고(끝이 등 뒤), 던지면 앞으로 내밀어 줄이 그 끝에서 나간다.
  assert.ok(heldToolPose('Right', 'windup').tip.x < 0 && heldToolPose('Left', 'windup').tip.x > 0);
  assert.ok(heldToolPose('Right', 'cast').tip.x > heldToolPose('Right').tip.x);
  assert.deepEqual(rodTip({ x: 100, y: 200 }, 'Right', 'cast'), { x: 124, y: 181 });
});

test('광장·강가 신호: 도구 표시는 정해진 모양만 통과한다', () => {
  const base = { x: 1, y: 1, version: 2 as const, position: { x: 1, y: 1 }, pet: null, riding: false };
  assert.equal(protocolExtras({ ...base, tool: 'net' }).tool, 'net');
  assert.equal(protocolExtras({ ...base, tool: 'rod_steel' }).tool, 'rod_steel');
  assert.equal(protocolExtras({ ...base, tool: '<b>' }).tool, undefined);
  assert.equal(protocolExtras({ x: 1, y: 1, tool: 'net' }).tool, 'net', '구형(v1) 신호에도');
});

test('잠자리: 손에 안 든 채 거절·업적 응답을 읽는다, 별1~2는 바로 잡힌다', () => {
  assert.deepEqual(parseBugStart({ ok: false, reason: 'net_not_equipped' }), { ok: false, reason: 'net_not_equipped' });
  const state = parseBugState({ netOwned: true, album: [], achievements: { star5: 3, species: 5, speciesTotal: 5, earned: ['bug_doctor', 'hack'] } });
  assert.deepEqual(state.achievements, { star5: 3, species: 5, speciesTotal: 5, earned: ['bug_doctor'] });
  assert.equal(parseBugState({ netOwned: true, album: [], achievements: { star5: -1 } }).achievements, undefined);
  const finish = parseBugFinish({ ok: true, caught: true, bugId: 'dragonfly_gold', isNew: false, achievements: ['bug_master'] });
  assert.ok(finish.ok && finish.caught && finish.achievements?.[0] === 'bug_master');
  const plain = parseBugFinish({ ok: true, caught: true, bugId: 'dragonfly_red', isNew: false, achievements: [] });
  assert.ok(plain.ok && plain.caught && plain.achievements === undefined);
  assert.equal(BUG_AUTO_CATCH_STARS, 2);
});

test('맨손 낚시 속도 0.8: 최소 릴 시간이 서버와 같게 25% 길어진다', () => {
  assert.equal(minReelMs(3, 0.8), (1500 + 2 * 375) / 0.8);
  assert.ok(minReelMs(3, 0.8) > minReelMs(3, 1));
});

test('허공 휘두르기: 채 앞 그물 안의 사람만 맞고, 맞으면 x 눈 자리', () => {
  const people = new Map([['front', { x: 115, y: 100 }], ['behind', { x: 85, y: 100 }], ['far', { x: 140, y: 100 }]]);
  assert.deepEqual(netHits({ x: 100, y: 100 }, 'Right', people), ['front']);
  assert.deepEqual(netHits({ x: 100, y: 100 }, 'Left', people), ['behind']);
  assert.equal(dizzyEyes('Front').length, 2); assert.equal(dizzyEyes('Back').length, 0);
});

test('별3 이상 잠자리: 가까이 오면 사람 반대쪽으로 Z자로 빠르게 도망', () => {
  const grid = { cols: 40, rows: 40, solid: () => false };
  const bug = { position: { x: 300, y: 300 }, target: null, nextAt: 0, leaveAt: 1e9 };
  const person = { x: 280, y: 300 };
  assert.deepEqual(bugThreat(bug.position, [person, { x: 0, y: 0 }]), person);
  assert.equal(bugThreat(bug.position, [{ x: 300 - BUG_FLEE.radius - 1, y: 300 }]), null);
  // 두 구간(좌우로 꺾임)에서 모두 사람에게서 멀어지고, 옆으로는 서로 반대쪽.
  const a = stepRoamingBug(bug, grid, 0, 100, Math.random, person), b = stepRoamingBug(bug, grid, BUG_FLEE.zigzagMs, 100, Math.random, person);
  assert.ok(a.position!.x > 300 && b.position!.x > 300);
  assert.ok(Math.sign(a.position!.y - 300) === -Math.sign(b.position!.y - 300));
  assert.ok(Math.hypot(a.position!.x - 300, a.position!.y - 300) > 56 * 0.1, '걷기보다 빠르다');
  // 사람이 없으면 예전처럼 천천히.
  const calm = stepRoamingBug({ ...bug, target: { x: 400, y: 300 } }, grid, 0, 100);
  assert.ok(calm.position!.x - 300 <= 12 * 0.1 + 1e-9);
});

test('서버가 정한 잠자리: 별이 종류와 맞아야 받는다', () => {
  assert.deepEqual(parseBugSpawn({ ok: true, spawnId: 's1', bugId: 'dragonfly_gold', stars: 5 }), { spawnId: 's1', bugId: 'dragonfly_gold', stars: 5 });
  assert.equal(parseBugSpawn({ ok: true, spawnId: 's1', bugId: 'dragonfly_gold', stars: 1 }), null);
  assert.equal(parseBugSpawn({ ok: false, reason: 'wait' }), null);
});

test('서버에 잠자리 미리 정하기가 아직 없으면 unsupported(예전처럼 난다)', async () => {
  const old = createBugAdapter({ rpc: async () => ({ data: null, error: { code: 'PGRST202' } }) });
  assert.equal(await old.spawn!('plaza'), 'unsupported');
  const busy = createBugAdapter({ rpc: async () => ({ data: { ok: false, reason: 'wait' }, error: null }) });
  assert.equal(await busy.spawn!('plaza'), null);
});
