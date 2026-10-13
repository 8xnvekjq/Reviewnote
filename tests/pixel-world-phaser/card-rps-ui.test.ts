import assert from 'node:assert/strict';
import test from 'node:test';
import { createMatch, playRound } from '../../src/features/pixel-world-phaser/logic/cardRps.ts';
import {
  addQueuedCard, dropIndex, handCards, initialRevealProgress, insertQueuedCard, moveQueuedCard, nextRevealIndex, removeQueuedCard,
  revealCardsAt, revealSteps, roundTimeline, shootoutRound, winsAfter,
} from '../../src/features/pixel-world-phaser/logic/cardRpsPresentation.ts';
import { RPS_NPC_ENTRY, RPS_NPC_REWARD } from '../../src/features/pixel-world-phaser/logic/cardRpsContract.ts';
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

test('한 판에 낼 수 있는 장수는 고정이 아니다 — 손패 9장을 모두 줄에 올릴 수 있다', () => {
  const inv = { rock: 3, scissors: 3, paper: 3 };
  let queue: ReturnType<typeof addQueuedCard> = [];
  assert.equal(handCards(inv, queue).length, 9);
  for (const hand of handCards(inv, [])) queue = addQueuedCard(queue, hand, inv[hand]);
  assert.equal(queue.length, 9);
  assert.deepEqual(handCards(inv, queue), []);
  assert.deepEqual(addQueuedCard(queue, 'rock', 3), queue);
  assert.deepEqual(handCards({ rock: 1, scissors: 0, paper: 2 }, ['paper']), ['rock', 'paper']);
});

test('손에서 끌어 온 카드를 원하는 자리에 끼운다', () => {
  assert.deepEqual(insertQueuedCard(['rock', 'paper'], 'scissors', 1, 3), ['rock', 'scissors', 'paper']);
  assert.deepEqual(insertQueuedCard(['rock'], 'paper', 9, 1), ['rock', 'paper']);
  assert.deepEqual(insertQueuedCard(['rock'], 'paper', -2, 1), ['paper', 'rock']);
  assert.deepEqual(insertQueuedCard(['rock'], 'rock', 0, 1), ['rock']);
});

test('끄는 위치를 줄 자리 번호로 바꾼다(두 줄로 접혀도 읽는 순서)', () => {
  const slots = [{ x: 10, y: 10, h: 20 }, { x: 40, y: 10, h: 20 }, { x: 70, y: 10, h: 20 }, { x: 10, y: 40, h: 20 }];
  assert.equal(dropIndex(slots, 0, 10), 0);
  assert.equal(dropIndex(slots, 50, 12), 2);
  assert.equal(dropIndex(slots, 99, 10), 3);
  assert.equal(dropIndex(slots, 5, 40), 3);
  assert.equal(dropIndex(slots, 30, 42), 4);
  assert.equal(dropIndex([], 30, 42), 0);
});

test('공개 박자표: 뒤집힌 줄 → 맞붙음마다 들어옴·뒤집기·승패·퇴장 → 배너', () => {
  const round = playRound(createMatch(), ['scissors', 'paper'], ['rock', 'rock']).rounds[0];
  const beats = roundTimeline(round);
  assert.deepEqual(beats.map(b => b.stage), ['facedown', ...round.clashes.flatMap(() => ['enter', 'flip', 'hit', 'exit']), 'banner']);
  const perClash = beats.filter(b => b.clash === 0 && b.stage !== 'facedown').reduce((sum, b) => sum + b.ms, 0);
  assert.ok(perClash >= 900 && perClash <= 1300, `맞붙음 하나 ${perClash}ms`);
  assert.ok(beats[0].ms >= 900, '뒤집힌 줄을 1초쯤 먼저 보여 준다');
  const reduced = roundTimeline(round, true);
  assert.ok(reduced.reduce((s, b) => s + b.ms, 0) < beats.reduce((s, b) => s + b.ms, 0) / 2);

  const facedown = revealCardsAt(round, { stage: 'facedown', clash: 0 });
  assert.equal(facedown.filter(c => c.side === 'a').length, 2);
  assert.equal(facedown.filter(c => c.side === 'b').length, 2);
  assert.ok(facedown.every(c => c.spot === 'row' && !c.faceUp && !c.mark));

  // 첫 맞붙음: 가위 vs 바위. 들어올 땐 뒷면, 뒤집기에서 앞면, 승패에서 표시, 퇴장에서 가위만 빠진다.
  const enter = revealCardsAt(round, { stage: 'enter', clash: 0 });
  assert.deepEqual(enter.filter(c => c.spot === 'arena').map(c => [c.side, c.index, c.faceUp]), [['a', 0, false], ['b', 0, false]]);
  const flip = revealCardsAt(round, { stage: 'flip', clash: 0 });
  assert.ok(flip.filter(c => c.spot === 'arena').every(c => c.faceUp && c.flipping && !c.mark));
  const hit = revealCardsAt(round, { stage: 'hit', clash: 0 });
  assert.equal(hit.find(c => c.side === 'a' && c.index === 0)?.mark, 'lose');
  assert.equal(hit.find(c => c.side === 'b' && c.index === 0)?.mark, 'win');
  const exit = revealCardsAt(round, { stage: 'exit', clash: 0 });
  assert.equal(exit.find(c => c.side === 'a' && c.index === 0)?.spot, 'out');
  assert.equal(exit.find(c => c.side === 'b' && c.index === 0)?.spot, 'arena');
  // 두 번째 맞붙음: 살아남은 바위는 앞면 그대로 가운데에 남고, 보만 새로 뒤집힌다.
  const enter2 = revealCardsAt(round, { stage: 'enter', clash: 1 });
  const rock = enter2.find(c => c.side === 'b' && c.index === 0)!;
  assert.equal(rock.spot, 'arena'); assert.equal(rock.faceUp, true);
  const paper = enter2.find(c => c.side === 'a' && c.index === 1)!;
  assert.equal(paper.spot, 'arena'); assert.equal(paper.faceUp, false);
  assert.equal(enter2.find(c => c.side === 'b' && c.index === 1)?.spot, 'row');
  // 배너: 진 카드는 모두 퇴장, 이긴 보는 가운데.
  const banner = revealCardsAt(round, { stage: 'banner', clash: round.clashes.length });
  assert.deepEqual(banner.filter(c => c.spot !== 'out').map(c => [c.side, c.hand, c.spot]), [['a', 'paper', 'arena']]);
});

test('비기면 둘 다 빠지고, 맞붙지 못한 카드는 배너에서 줄에 앞면으로 남는다', () => {
  const round = playRound(createMatch(), ['rock', 'paper', 'paper'], ['rock']).rounds[0];
  const exit = revealCardsAt(round, { stage: 'exit', clash: 0 });
  assert.deepEqual(exit.filter(c => c.spot === 'out').map(c => c.side), ['a', 'b']);
  const banner = revealCardsAt(round, { stage: 'banner', clash: round.clashes.length });
  assert.deepEqual(banner.filter(c => c.spot === 'row').map(c => [c.side, c.index, c.faceUp]), [['a', 1, true], ['a', 2, true]]);
  assert.equal(round.winner, 'a');
});

test('HUD 승수는 공개가 끝난 판까지만 센다', () => {
  let state = createMatch();
  state = playRound(state, ['rock'], ['scissors']);
  state = playRound(state, ['rock'], ['paper']);
  assert.deepEqual(winsAfter(state.rounds, 0), { a: 0, b: 0 });
  assert.deepEqual(winsAfter(state.rounds, 1), { a: 1, b: 0 });
  assert.deepEqual(winsAfter(state.rounds, 2), { a: 1, b: 1 });
});

test('다시 들어오면 가장 최근 판(또는 승부차기) 하나만 다시 보여 준다', () => {
  assert.deepEqual(initialRevealProgress(0, 0), { rounds: 0, shootout: 0 });
  assert.deepEqual(initialRevealProgress(2, 0), { rounds: 1, shootout: 0 });
  assert.deepEqual(initialRevealProgress(3, 2), { rounds: 3, shootout: 1 });
  const shoot = shootoutRound({ a: 'rock', b: 'rock', result: 'draw' });
  assert.equal(shoot.clashes.length, 1);
  assert.deepEqual(revealCardsAt(shoot, { stage: 'flip', clash: 0 }).map(c => c.faceUp), [true, true]);
});

test('NPC 대결은 무료이고 보상은 처음 이겼을 때 한 번만', async () => {
  assert.equal(RPS_NPC_ENTRY, 0);
  assert.equal(RPS_NPC_REWARD, 20);
  const adapter = createMockCardRpsAdapter({ seed: 3 });
  let wonOnce = false;
  for (let game = 0; game < 30; game++) {
    let match = await adapter.startNpc();
    assert.equal(match.stake, 0);
    assert.equal(match.prize, wonOnce ? 0 : RPS_NPC_REWARD);
    for (let guard = 0; guard < 12 && match.status !== 'finished'; guard++) {
      if (match.status === 'shootout') match = await adapter.submitShootout(match.matchId, (['rock', 'paper', 'scissors'] as const)[(game + guard) % 3]);
      else {
        // 판마다 다른 장수·순서로 낸다(1~3장, 손패를 돌려 가며).
        const hand = handCards(match.me.inventory, []);
        const shift = (game * 5 + guard * 2) % hand.length;
        const rotated = [...hand.slice(shift), ...hand.slice(0, shift)];
        const last = match.rounds.length === 2;
        match = await adapter.submitCards(match.matchId, last ? rotated : rotated.slice(0, 1 + (game + guard) % 3));
      }
    }
    const won = match.winnerId === match.me.id;
    assert.equal(match.pointDelta, won ? (wonOnce ? 0 : RPS_NPC_REWARD) : 0);
    if (won) wonOnce = true;
  }
  assert.ok(wonOnce, '30판 중 한 번은 이긴다');
});
