import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createMatch, forfeit, inventoryTotal, npcChooseCards, npcShootoutHand, playRound, playShootout, resolveRound,
  RpsRuleError, seededRng, startingInventory, validateSubmission, type RpsHand, type RpsMatchState,
} from '../../src/features/pixel-world-phaser/logic/cardRps';

const cases = JSON.parse(readFileSync(new URL('./fixtures/card-rps-cases.json', import.meta.url), 'utf8'));

for (const c of cases.rounds) {
  test(`한 판: ${c.name}`, () => {
    const r = resolveRound(c.a, c.b);
    assert.equal(r.winner, c.winner);
    assert.deepEqual(r.clashes.map(x => [x.a, x.b, x.result]), c.clashes);
  });
}

for (const c of cases.matches) {
  test(`경기: ${c.name}`, () => {
    let s = createMatch();
    for (const [a, b] of c.rounds) s = playRound(s, a, b);
    for (const [a, b] of c.shootout) s = playShootout(s, a, b);
    assert.equal(s.phase, c.phase);
    assert.equal(s.winner, c.winner);
    assert.deepEqual(s.wins, c.wins);
  });
}

for (const c of cases.invalid) {
  test(`잘못 낸 카드: ${c.name}`, () => {
    const v = validateSubmission(startingInventory(), c.cards);
    assert.deepEqual(v, { ok: false, reason: c.reason });
    assert.throws(() => playRound(createMatch(), c.cards, ['rock']), RpsRuleError);
  });
}

test('낸 카드는 판이 끝나면 없어지고, 끝난 경기는 더 진행되지 않는다', () => {
  let s = playRound(createMatch(), ['rock', 'paper'], ['scissors']);
  assert.deepEqual(s.inventory.a, { rock: 2, scissors: 3, paper: 2 });
  assert.equal(inventoryTotal(s.inventory.b), 8);
  s = playRound(s, ['rock'], ['scissors']);
  assert.equal(s.phase, 'finished');
  assert.throws(() => playRound(s, ['rock'], ['rock']), RpsRuleError);
  assert.throws(() => playShootout(s, 'rock', 'rock'), RpsRuleError);
});

test('기권하면 상대가 이기고, 이미 끝난 경기는 바뀌지 않는다', () => {
  assert.equal(forfeit(createMatch(), 'a').winner, 'b');
  const done = playRound(playRound(createMatch(), ['paper'], ['rock']), ['paper'], ['rock']);
  assert.equal(forfeit(done, 'a').winner, 'a');
});

test('NPC는 항상 규칙에 맞는 묶음을 내고, 경기는 언제나 끝난다', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rng = seededRng(seed);
    let s: RpsMatchState = createMatch();
    let guard = 0;
    while (s.phase !== 'finished' && guard++ < 50) {
      if (s.phase === 'choosing') {
        const a = npcChooseCards(s, 'a', rng), b = npcChooseCards(s, 'b', rng);
        assert.ok(validateSubmission(s.inventory.a, a).ok, `seed ${seed} a`);
        assert.ok(validateSubmission(s.inventory.b, b).ok, `seed ${seed} b`);
        s = playRound(s, a, b);
      } else s = playShootout(s, npcShootoutHand(rng), npcShootoutHand(rng));
    }
    assert.equal(s.phase, 'finished', `seed ${seed}`);
  }
});

test('NPC는 마지막 판에 남은 카드를 모두 내고, 같은 시드면 같은 선택을 한다', () => {
  let s = playRound(createMatch(), ['rock'], ['scissors']);
  s = playRound(s, ['scissors'], ['rock']);
  const cards = npcChooseCards(s, 'b', seededRng(7));
  assert.equal(cards.length, inventoryTotal(s.inventory.b));
  assert.deepEqual(npcChooseCards(createMatch(), 'b', seededRng(42)), npcChooseCards(createMatch(), 'b', seededRng(42)));
});

test('NPC는 상대가 많이 가진 카드를 이기는 카드를 더 자주 앞에 둔다', () => {
  const s: RpsMatchState = { ...createMatch(), inventory: { a: { rock: 3, scissors: 0, paper: 0 }, b: startingInventory() } };
  let paperFirst = 0;
  for (let seed = 1; seed <= 400; seed++) if (npcChooseCards(s, 'b', seededRng(seed))[0] === 'paper') paperFirst++;
  assert.ok(paperFirst > 400 / 3 * 1.5, `paper first ${paperFirst}`);
  const hands = new Set<RpsHand>();
  for (let seed = 1; seed <= 60; seed++) hands.add(npcShootoutHand(seededRng(seed)));
  assert.equal(hands.size, 3);
});
