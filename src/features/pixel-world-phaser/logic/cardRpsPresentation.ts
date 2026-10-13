// 카드 가위바위보 화면 연출용 순수 함수(2026-10-13). 화면(CardRpsGame)은 이 결과만 그린다.
import { RPS_HANDS, type RpsHand, type RpsInventory, type RpsOutcome, type RpsRoundResult, type RpsSide } from './cardRps';

export interface RevealStep {
  clash: number;
  a: RpsHand;
  b: RpsHand;
  result: 'a' | 'b' | 'draw';
  surviving: 'a' | 'b' | null;
}

// ── 낼 카드 줄(선택 → 순서 바꾸기) ─────────────────────────────
export function addQueuedCard(queue: readonly RpsHand[], hand: RpsHand, available: number): RpsHand[] {
  if (queue.filter(card => card === hand).length >= available) return [...queue];
  return [...queue, hand];
}

/** 손에서 끌어 온 카드를 줄의 index 자리에 끼운다(가진 장수를 넘으면 그대로). */
export function insertQueuedCard(queue: readonly RpsHand[], hand: RpsHand, index: number, available: number): RpsHand[] {
  if (queue.filter(card => card === hand).length >= available) return [...queue];
  const next = [...queue];
  next.splice(Math.max(0, Math.min(queue.length, index)), 0, hand);
  return next;
}

export function moveQueuedCard(queue: readonly RpsHand[], from: number, to: number): RpsHand[] {
  if (from < 0 || from >= queue.length || to < 0 || to >= queue.length || from === to) return [...queue];
  const next = [...queue];
  const [card] = next.splice(from, 1);
  next.splice(to, 0, card);
  return next;
}

export function removeQueuedCard(queue: readonly RpsHand[], index: number): RpsHand[] {
  return queue.filter((_, i) => i !== index);
}

/** 손에 남은 카드를 한 장씩(바위·가위·보 순서). 줄에 올린 카드는 빠진다. */
export function handCards(inventory: RpsInventory, queue: readonly RpsHand[]): RpsHand[] {
  return RPS_HANDS.flatMap(hand => Array.from({ length: Math.max(0, inventory[hand] - queue.filter(card => card === hand).length) }, () => hand));
}

/**
 * 끌고 있는 손가락 위치가 줄의 몇 번째 자리인지. slots는 (끌고 있는 카드를 뺀) 줄 카드들의 가운데 좌표.
 * 줄이 두 줄로 접혀도 읽는 순서(위 줄 먼저, 같은 줄이면 왼쪽 먼저)로 센다.
 */
export function dropIndex(slots: readonly { x: number; y: number; h: number }[], px: number, py: number): number {
  return slots.filter(slot => slot.y < py - slot.h / 2 || (Math.abs(slot.y - py) <= slot.h / 2 && slot.x < px)).length;
}

// ── 공개 연출 ─────────────────────────────────────────────
export function revealSteps(round: RpsRoundResult): RevealStep[] {
  return round.clashes.map((clash, index) => ({
    clash: index,
    a: clash.a,
    b: clash.b,
    result: clash.result,
    surviving: clash.result === 'draw' ? null : clash.result,
  }));
}

export const nextRevealIndex = (current: number, total: number) => Math.min(total, current + 1);

/**
 * facedown: 양쪽 낸 카드가 뒤집힌 채 줄지어 놓임(몇 장 냈는지 보기).
 * 맞붙음마다 enter(가운데로) → flip(뒤집기) → hit(승패 표시) → exit(진 카드 퇴장). 마지막에 banner.
 */
export type RevealStage = 'facedown' | 'enter' | 'flip' | 'hit' | 'exit' | 'banner';
export interface RevealBeat { stage: RevealStage; clash: number; ms: number }

const BEAT_MS: Record<RevealStage, number> = { facedown: 1000, enter: 200, flip: 420, hit: 380, exit: 240, banner: 1500 };

/** 한 판 공개 순서. 맞붙음 하나는 약 1.2초, 동작 줄이기면 그 절반 이하. */
export function roundTimeline(round: RpsRoundResult, reduced = false, short = false): RevealBeat[] {
  const ms = (stage: RevealStage) => Math.round(BEAT_MS[stage] * (short && (stage === 'facedown' || stage === 'banner') ? .65 : 1) * (reduced ? .45 : 1));
  const beats: RevealBeat[] = [{ stage: 'facedown', clash: 0, ms: ms('facedown') }];
  round.clashes.forEach((_, clash) => {
    for (const stage of ['enter', 'flip', 'hit', 'exit'] as const) beats.push({ stage, clash, ms: ms(stage) });
  });
  beats.push({ stage: 'banner', clash: round.clashes.length, ms: ms('banner') });
  return beats;
}

export type RevealSpot = 'row' | 'arena' | 'out';
export interface RevealCard {
  side: RpsSide;
  index: number;
  hand: RpsHand;
  spot: RevealSpot;
  faceUp: boolean;
  /** 이번 맞붙음 표시: 이김/짐/비김. */
  mark: 'win' | 'lose' | 'draw' | null;
  /** 이번 박자에 막 뒤집히는 카드(들어 올리기 연출). */
  flipping: boolean;
}

/** 박자 하나에서 각 카드가 어디(줄/가운데/퇴장)에 있고 앞면인지. */
export function revealCardsAt(round: RpsRoundResult, beat: Pick<RevealBeat, 'stage' | 'clash'>): RevealCard[] {
  const cards: RevealCard[] = [];
  for (const side of ['a', 'b'] as const) {
    const key = side === 'a' ? 'aIndex' : 'bIndex';
    round[side].forEach((hand, index) => {
      const start = round.clashes.findIndex(c => c[key] === index);
      const end = round.clashes.findIndex(c => c[key] === index && c.result !== side);
      const card: RevealCard = { side, index, hand, spot: 'row', faceUp: false, mark: null, flipping: false };
      if (beat.stage === 'facedown') { cards.push(card); return; }
      if (beat.stage === 'banner') {
        cards.push({ ...card, spot: end >= 0 ? 'out' : start >= 0 ? 'arena' : 'row', faceUp: true });
        return;
      }
      const cur = beat.clash;
      if (end >= 0 && (end < cur || (end === cur && beat.stage === 'exit'))) cards.push({ ...card, spot: 'out', faceUp: true });
      else if (start >= 0 && start <= cur) {
        const inClash = round.clashes[cur]?.[key] === index;
        const result = round.clashes[cur]?.result;
        cards.push({
          ...card, spot: 'arena', faceUp: start < cur || beat.stage !== 'enter',
          flipping: start === cur && beat.stage === 'flip',
          mark: inClash && (beat.stage === 'hit' || beat.stage === 'exit') ? result === 'draw' ? 'draw' : result === side ? 'win' : 'lose' : null,
        });
      } else cards.push(card);
    });
  }
  return cards;
}

/** 공개가 끝난(화면에 보여 줘도 되는) 판까지의 승수. */
export function winsAfter(rounds: readonly RpsRoundResult[], count: number): Record<RpsSide, number> {
  const wins = { a: 0, b: 0 };
  for (const round of rounds.slice(0, count)) if (round.winner !== 'draw') wins[round.winner] += 1;
  return wins;
}

/** 승부차기 한 번을 맞붙음 한 번짜리 판으로 바꿔 같은 연출을 쓴다. */
export function shootoutRound(entry: { a: RpsHand; b: RpsHand; result: RpsOutcome }): RpsRoundResult {
  return { a: [entry.a], b: [entry.b], clashes: [{ aIndex: 0, bIndex: 0, a: entry.a, b: entry.b, result: entry.result }], winner: entry.result };
}

/**
 * 이미 연출한 판 수. 처음 보는 경기면(다시 들어옴) 가장 최근 판 하나만 다시 보여 준다.
 * 승부차기 중이면 판들은 이미 본 것으로 치고 마지막 승부차기 한 번만.
 */
export function initialRevealProgress(rounds: number, shootout: number): { rounds: number; shootout: number } {
  if (shootout > 0) return { rounds, shootout: shootout - 1 };
  return { rounds: Math.max(0, rounds - 1), shootout: 0 };
}
