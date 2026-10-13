import assert from 'node:assert/strict';
import test from 'node:test';
import { createMatch, playRound } from '../../src/features/pixel-world-phaser/logic/cardRps.ts';
import { addQueuedCard, moveQueuedCard, nextRevealIndex, removeQueuedCard, revealSteps } from '../../src/features/pixel-world-phaser/logic/cardRpsPresentation.ts';
import { createMockCardRpsAdapter } from '../../src/features/pixel-world-phaser/ui/cardRpsAdapterMock.ts';

test('카드를 남은 수만큼 줄 세우고 빼거나 순서를 바꾼다', () => {
  let queue = addQueuedCard([], 'rock', 1);
  queue = addQueuedCard(queue, 'rock', 1);
  queue = addQueuedCard(queue, 'paper', 2);
  queue = addQueuedCard(queue, 'scissors', 3);
  assert.deepEqual(queue, ['rock', 'paper', 'scissors']);
  assert.deepEqual(moveQueuedCard(queue, 2, 0), ['scissors', 'rock', 'paper']);
  assert.deepEqual(removeQueuedCard(queue, 1), ['rock', 'scissors']);
});

test('공개 단계는 규칙 엔진의 맞붙는 순서를 그대로 한 단계씩 진행한다', () => {
  const round = playRound(createMatch(), ['scissors', 'paper'], ['rock', 'rock']).rounds[0];
  const steps = revealSteps(round);
  assert.deepEqual(steps.map(step => [step.a, step.b, step.result]), [
    ['scissors', 'rock', 'b'], ['paper', 'rock', 'a'], ['paper', 'rock', 'a'],
  ]);
  assert.equal(nextRevealIndex(0, steps.length), 1);
  assert.equal(nextRevealIndex(steps.length, steps.length), steps.length);
});

test('가짜 어댑터로 치즈와 한 경기를 끝까지 진행한다', async () => {
  const adapter = createMockCardRpsAdapter({ seed: 9 });
  let match = await adapter.startNpc();
  for (let guard = 0; guard < 10 && match.status !== 'finished'; guard++) {
    if (match.status === 'shootout') match = await adapter.submitShootout(match.matchId, 'rock');
    else {
      const cards = (['rock', 'scissors', 'paper'] as const).flatMap(hand => Array.from({ length: match.me.inventory[hand] }, () => hand));
      match = await adapter.submitCards(match.matchId, cards);
    }
  }
  assert.equal(match.status, 'finished');
  assert.ok(match.winnerId);
  assert.equal(typeof match.pointDelta, 'number');
  assert.ok(adapter.history.length >= 2);
});
