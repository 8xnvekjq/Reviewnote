import test from 'node:test';
import assert from 'node:assert/strict';
import { createBugGame, segmentDistance, stepBugGame, swingBugNet, predictBugSwipe, parseNetSwing, emptyRoamingBug, stepRoamingBug, removeRoamingBug } from '../../src/features/pixel-world-phaser/logic/bugGame';

test('선분의 끝과 짧은 휘두름도 올바르게 판정한다', () => {
  assert.equal(segmentDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 }), 5);
  const game = { ...createBugGame(1), position: { x: 0, y: 0 } };
  assert.equal(swingBugNet(game, { x: -40, y: 0 }, { x: 40, y: 0 }).status, 'caught');
  assert.equal(swingBugNet(game, { x: -40, y: 50 }, { x: 40, y: 50 }).status, 'playing');
  assert.equal(swingBugNet(game, { x: 0, y: 0 }, { x: 1, y: 1 }).status, 'playing');
});
test('10초 타이머와 350ms 회복을 지킨다', () => {
  const game = { ...createBugGame(1), position: { x: 0, y: 0 } };
  const missed = swingBugNet(game, { x: -40, y: 80 }, { x: 40, y: 80 });
  assert.equal(swingBugNet({ ...missed, elapsed: 349 }, { x: -40, y: 0 }, { x: 40, y: 0 }).status, 'playing');
  assert.equal(swingBugNet({ ...missed, elapsed: 350 }, { x: -40, y: 0 }, { x: 40, y: 0 }).status, 'caught');
  assert.equal(stepBugGame(game, 9999).status, 'playing');
  const timeout = stepBugGame(game, 10000);
  assert.equal(timeout.elapsed, 10000); assert.equal(timeout.status, 'missed');
  assert.equal(swingBugNet(timeout, { x: -100, y: 0 }, { x: 100, y: 0 }).status, 'missed');
  assert.equal(stepBugGame(game, NaN), game);
});
test('별 다섯은 지연 후 피하고 체력을 무한히 쓰지 않는다', () => {
  const base = { ...createBugGame(5), position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, turnAt: 1000 };
  const predicted = predictBugSwipe(base, { x: -60, y: 0 }, { x: 60, y: 0 }, true);
  assert.equal(stepBugGame(predicted, 119).stamina, 3);
  const dodged = stepBugGame(predicted, 160);
  assert.equal(dodged.stamina, 2); assert.ok(Math.abs(dodged.position.y) > 0);
  assert.equal(predictBugSwipe({ ...base, stamina: 0 }, { x: -60, y: 0 }, { x: 60, y: 0 }, true).dodge, null);
  assert.equal(predictBugSwipe(createBugGame(1), { x: -60, y: 0 }, { x: 60, y: 0 }, true).dodge, null);
  assert.deepEqual(predictBugSwipe({ ...predicted, elapsed: 61 }, { x: 0, y: 0 }, { x: 0, y: 60 }).dodge, predicted.dodge);
});

// 한 봇이 관찰 후 260ms 반응하고 180ms 동안 쓴다. 한 판에 세 번, 같은 규칙을 모든 별에 적용한다.
function bot(stars: number, seed: number, evasive = true) {
  let game = createBugGame(stars, seed);
  for (const time of [800, 3800, 6800]) {
    game = stepBugGame(game, time - game.elapsed);
    const target = { ...game.position }, vertical = seed % 2 === 0;
    const from = { x: target.x - (vertical ? 0 : 45), y: target.y - (vertical ? 45 : 0) };
    const to = { x: target.x + (vertical ? 0 : 45), y: target.y + (vertical ? 45 : 0) };
    game = stepBugGame(game, 260);
    if (evasive) game = predictBugSwipe(game, from, to, true);
    game = stepBugGame(game, 180);
    game = swingBugNet(game, from, to);
    if (game.status === 'caught') return true;
  }
  return false;
}
const rates = [1, 2, 3, 4, 5].map(stars => Array.from({ length: 300 }, (_, i) => bot(stars, i + 1)).filter(Boolean).length / 300);
test('같은 별 다섯이라도 입력 회피가 있으면 더 어렵다', () => {
  const withoutDodge = Array.from({ length: 300 }, (_, i) => bot(5, i + 1, false)).filter(Boolean).length / 300;
  assert.ok(rates[4] < withoutDodge); assert.ok(rates[4] < rates[0]);
});
for (let stars = 1; stars <= 5; stars++) test(`별 ${stars} 가벼운 봇 균형 확인`, () => {
  console.log(`별 ${stars}: ${(rates[stars - 1] * 100).toFixed(1)}%`);
  if (stars === 1) assert.ok(rates[0] >= .9);
  if (stars === 3) assert.ok(rates[2] >= .5 && rates[2] <= .8);
  if (stars === 5) assert.ok(rates[4] >= .15 && rates[4] <= .4);
  assert.ok(rates[stars - 1] <= (stars === 1 ? 1 : rates[stars - 2]));
});
test('기존 이벤트와 잘못된 휘두름 페이로드를 무시한다', () => {
  for (const value of [null, {}, { phase: 'casting' }, { sessionId: 'a', direction: 'Up', at: 1 }, { sessionId: 'a', direction: 'Front', at: NaN }]) assert.equal(parseNetSwing(value), null);
  assert.deepEqual(parseNetSwing({ sessionId: 'a', direction: 'Right', at: 123, future: true }), { sessionId: 'a', direction: 'Right', at: 123 });
});
test('배회는 막힌 칸을 피하고 잡힌 후 30~60초 뒤 다시 나타난다', () => {
  let seed = 8;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const grid = { cols: 10, rows: 10, solid: (p: { x: number; y: number }) => p.x === 5 || p.x < 0 || p.y < 0 || p.x >= 10 || p.y >= 10 };
  let bug = emptyRoamingBug();
  for (let time = 0; time < 40000; time += 50) {
    bug = stepRoamingBug(bug, grid, time, 50, random);
    if (bug.position) assert.equal(grid.solid({ x: Math.floor(bug.position.x / 16), y: Math.floor(bug.position.y / 16) }), false);
  }
  bug = removeRoamingBug(40000, random);
  assert.ok(bug.nextAt >= 70000 && bug.nextAt <= 100000);
  assert.equal(stepRoamingBug(bug, grid, bug.nextAt - 1, 16, random).position, null);
  assert.ok(stepRoamingBug(bug, grid, bug.nextAt, 16, random).position);
  assert.equal(stepRoamingBug(emptyRoamingBug(), { ...grid, solid: () => true }, 0, 16, random).position, null);
});
