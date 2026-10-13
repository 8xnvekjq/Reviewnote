// 천광명월 카드 가위바위보 규칙 엔진(2026-10-13). 서버(SQL)도 같은 규칙을 따른다 —
// 공용 사례 tests/pixel-world-phaser/fixtures/card-rps-cases.json 을 양쪽 테스트가 모두 통과해야 한다.
// 설명서: reference/천광명월 카드가위바위보 설명서1.png, 설명서2.png
//
// 규칙
// - 한 경기 동안 각자 바위·가위·보 3장씩(9장). 3판 2선승.
// - 한 판: 남은 카드에서 몇 장을 어떤 순서로 낼지 몰래 정하고 동시에 공개, 앞에서부터 한 장씩 맞붙인다.
//   같으면 둘 다 빠지고, 다르면 진 카드만 빠지고 이긴 카드는 남아 상대 다음 카드와 붙는다.
//   먼저 카드가 다 떨어진 쪽이 그 판을 진다. 동시에 다 떨어지면 무승부. 낸 카드는 판이 끝나면 모두 없어진다.
// - 남은 카드가 있으면 최소 1장은 내야 한다. 판 시작 때 0장이면 빈 손으로 내서 진다(둘 다 0장이면 무승부).
// - 경기 끝: 누가 2승하면 끝. 3판이 끝났거나 둘 다 카드가 없으면 승수가 많은 쪽이 이기고,
//   승수가 같으면 승부차기 — 진짜 가위바위보를 한 장씩 동시에 내서 승부가 날 때까지 반복한다.

export type RpsHand = 'rock' | 'scissors' | 'paper';
export const RPS_HANDS: readonly RpsHand[] = ['rock', 'scissors', 'paper'];
export const RPS_HAND_LABEL: Record<RpsHand, string> = { rock: '바위', scissors: '가위', paper: '보' };
export type RpsInventory = Record<RpsHand, number>;
export type RpsSide = 'a' | 'b';
export type RpsOutcome = RpsSide | 'draw';

export const RPS_CARDS_PER_HAND = 3;
export const RPS_WINS_TO_WIN = 2;
export const RPS_MAX_ROUNDS = 3;
/** 카드(또는 승부차기 손)를 내는 시간 제한. 넘기면 서버가 기권 처리한다. */
export const RPS_TURN_MS = 60_000;

export const startingInventory = (): RpsInventory => ({ rock: RPS_CARDS_PER_HAND, scissors: RPS_CARDS_PER_HAND, paper: RPS_CARDS_PER_HAND });
export const inventoryTotal = (inv: RpsInventory) => inv.rock + inv.scissors + inv.paper;

/** x가 y를 이기면 1, 지면 -1, 같으면 0. */
export function compareHands(x: RpsHand, y: RpsHand): 1 | 0 | -1 {
  if (x === y) return 0;
  return (x === 'rock' && y === 'scissors') || (x === 'scissors' && y === 'paper') || (x === 'paper' && y === 'rock') ? 1 : -1;
}
export const handThatBeats = (h: RpsHand): RpsHand => (h === 'rock' ? 'paper' : h === 'scissors' ? 'rock' : 'scissors');

/** 낼 수 있는 카드 묶음인지: 가진 카드 안에서, 남은 카드가 있으면 1장 이상. */
export function validateSubmission(inv: RpsInventory, cards: readonly RpsHand[]): { ok: true } | { ok: false; reason: 'empty' | 'not_owned' | 'bad_card' } {
  const used: RpsInventory = { rock: 0, scissors: 0, paper: 0 };
  for (const c of cards) {
    if (!RPS_HANDS.includes(c)) return { ok: false, reason: 'bad_card' };
    used[c] += 1;
    if (used[c] > inv[c]) return { ok: false, reason: 'not_owned' };
  }
  if (cards.length === 0 && inventoryTotal(inv) > 0) return { ok: false, reason: 'empty' };
  return { ok: true };
}

export function removeCards(inv: RpsInventory, cards: readonly RpsHand[]): RpsInventory {
  const next = { ...inv };
  for (const c of cards) next[c] = Math.max(0, next[c] - 1);
  return next;
}

/** 한 번 맞붙음. aIndex/bIndex는 각자 낸 묶음 안의 위치(연출에서 어느 카드가 붙는지). */
export interface RpsClash { aIndex: number; bIndex: number; a: RpsHand; b: RpsHand; result: RpsOutcome }
export interface RpsRoundResult { a: RpsHand[]; b: RpsHand[]; clashes: RpsClash[]; winner: RpsOutcome }

export function resolveRound(a: readonly RpsHand[], b: readonly RpsHand[]): RpsRoundResult {
  const clashes: RpsClash[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const r = compareHands(a[i], b[j]);
    clashes.push({ aIndex: i, bIndex: j, a: a[i], b: b[j], result: r === 0 ? 'draw' : r > 0 ? 'a' : 'b' });
    if (r === 0) { i++; j++; } else if (r > 0) j++; else i++;
  }
  const aOut = i >= a.length, bOut = j >= b.length;
  const winner: RpsOutcome = aOut && bOut ? 'draw' : aOut ? 'b' : 'a';
  return { a: [...a], b: [...b], clashes, winner };
}

export type RpsPhase = 'choosing' | 'shootout' | 'finished';
export interface RpsMatchState {
  inventory: Record<RpsSide, RpsInventory>;
  rounds: RpsRoundResult[];
  wins: Record<RpsSide, number>;
  /** 승부차기 기록(한 번에 한 장씩). 마지막 것만 승부가 났다. */
  shootout: { a: RpsHand; b: RpsHand; result: RpsOutcome }[];
  phase: RpsPhase;
  winner: RpsSide | null;
}

export const createMatch = (): RpsMatchState => ({
  inventory: { a: startingInventory(), b: startingInventory() },
  rounds: [], wins: { a: 0, b: 0 }, shootout: [], phase: 'choosing', winner: null,
});

function settle(state: RpsMatchState): RpsMatchState {
  const { wins } = state;
  if (wins.a >= RPS_WINS_TO_WIN || wins.b >= RPS_WINS_TO_WIN) return { ...state, phase: 'finished', winner: wins.a > wins.b ? 'a' : 'b' };
  const bothEmpty = inventoryTotal(state.inventory.a) === 0 && inventoryTotal(state.inventory.b) === 0;
  if (state.rounds.length < RPS_MAX_ROUNDS && !bothEmpty) return state;
  if (wins.a !== wins.b) return { ...state, phase: 'finished', winner: wins.a > wins.b ? 'a' : 'b' };
  return { ...state, phase: 'shootout' };
}

export class RpsRuleError extends Error {}

/** 양쪽이 낸 묶음으로 한 판을 진행한다. 잘못된 묶음이면 RpsRuleError. */
export function playRound(state: RpsMatchState, a: readonly RpsHand[], b: readonly RpsHand[]): RpsMatchState {
  if (state.phase !== 'choosing') throw new RpsRuleError('not_choosing');
  for (const [side, cards] of [['a', a], ['b', b]] as const) {
    const v = validateSubmission(state.inventory[side], cards);
    if (!v.ok) throw new RpsRuleError(`${side}_${v.reason}`);
  }
  const round = resolveRound(a, b);
  const wins = { ...state.wins };
  if (round.winner !== 'draw') wins[round.winner] += 1;
  return settle({
    ...state,
    inventory: { a: removeCards(state.inventory.a, a), b: removeCards(state.inventory.b, b) },
    rounds: [...state.rounds, round], wins,
  });
}

/** 승부차기 한 번. 비기면 계속 승부차기. */
export function playShootout(state: RpsMatchState, a: RpsHand, b: RpsHand): RpsMatchState {
  if (state.phase !== 'shootout') throw new RpsRuleError('not_shootout');
  const r = compareHands(a, b);
  const result: RpsOutcome = r === 0 ? 'draw' : r > 0 ? 'a' : 'b';
  const shootout = [...state.shootout, { a, b, result }];
  return result === 'draw' ? { ...state, shootout } : { ...state, shootout, phase: 'finished', winner: result };
}

/** 시간 초과·나가기 — 상대가 이긴다. */
export const forfeit = (state: RpsMatchState, loser: RpsSide): RpsMatchState =>
  state.phase === 'finished' ? state : { ...state, phase: 'finished', winner: loser === 'a' ? 'b' : 'a' };

// ── NPC(쥐 딜러) ─────────────────────────────────────────────
/** 0 이상 1 미만 난수. 테스트·서버 재현을 위해 주입한다. */
export type Rng = () => number;

/** 시드 고정 난수(mulberry32). */
export function seededRng(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const pickWeighted = <T>(items: readonly T[], weight: (t: T) => number, rng: Rng): T => {
  const total = items.reduce((s, t) => s + Math.max(0, weight(t)), 0);
  if (total <= 0) return items[Math.floor(rng() * items.length)];
  let r = rng() * total;
  for (const t of items) { r -= Math.max(0, weight(t)); if (r < 0) return t; }
  return items[items.length - 1];
};

/**
 * NPC가 이번 판에 낼 묶음. 상대 남은 카드 수(공개 정보)만 보고 정한다 — 상대가 이번에 낸 카드는 모른다.
 * - 장수: 남은 판 수로 카드를 나누되 흔들림을 준다. 이번 판을 지면 경기가 끝나면 더 많이 낸다.
 * - 순서: 상대가 많이 가진 카드를 이기는 카드를 앞에 둘 확률이 높다(완전히 읽히지 않게 무작위 섞음).
 */
export function npcChooseCards(state: RpsMatchState, npc: RpsSide, rng: Rng): RpsHand[] {
  const me = npc, opp: RpsSide = npc === 'a' ? 'b' : 'a';
  const inv = { ...state.inventory[me] };
  const total = inventoryTotal(inv);
  if (total === 0) return [];
  const roundsLeft = Math.max(1, RPS_MAX_ROUNDS - state.rounds.length);
  const mustWin = state.wins[opp] === RPS_WINS_TO_WIN - 1;
  let count = Math.round(total / roundsLeft + (rng() * 2 - 1));
  if (mustWin) count += 1 + Math.floor(rng() * 2);
  if (roundsLeft === 1) count = total;
  count = Math.max(1, Math.min(total, count));
  const oppInv = state.inventory[opp];
  const cards: RpsHand[] = [];
  for (let k = 0; k < count; k++) {
    const owned = RPS_HANDS.filter(h => inv[h] > 0);
    const h = pickWeighted(owned, x => 1 + 2 * oppInv[RPS_HANDS.find(y => compareHands(x, y) > 0)!], rng);
    cards.push(h);
    inv[h] -= 1;
  }
  return cards;
}

/** 승부차기 NPC 손: 완전 무작위. */
export const npcShootoutHand = (rng: Rng): RpsHand => RPS_HANDS[Math.floor(rng() * 3) % 3];
