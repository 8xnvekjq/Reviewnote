import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HAND, parseBag, parseHand } from '../../src/features/pixel-world-phaser/logic/bag';
import { heldToolFor, heldToolFromTag, heldToolTag } from '../../src/features/pixel-world-phaser/logic/heldTool';
import { heldToolPose } from '../../src/features/pixel-world-phaser/game/heldTool';
import { parseBugFinish, parseBugStart, parseBugState } from '../../src/features/pixel-world-phaser/ui/bugAdapter';
import { protocolExtras } from '../../src/features/pixel-room/plaza/presenceProtocol';
import { minReelMs } from '../../src/features/pixel-world-phaser/logic/reelGame';
import { BUG_AUTO_CATCH_STARS } from '../../src/features/pixel-world-phaser/logic/bugCatalog';

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
