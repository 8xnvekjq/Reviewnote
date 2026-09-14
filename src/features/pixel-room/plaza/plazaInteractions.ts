export const REACTIONS = {
  wave: { emoji: '👋', label: '안녕!' },
  cheer: { emoji: '🙌', label: '응원해!' },
  rest: { emoji: '🌿', label: '잠깐 쉬자' },
  wish: { emoji: '✨', label: '오늘도 한 걸음' },
} as const;
export type ReactionKind = keyof typeof REACTIONS;
export const REACTION_MS = 3200;
export const REACTION_COOLDOWN_MS = 4000;
export interface PlazaReaction { sessionId: string; kind: ReactionKind; sentAt: number }

// No free-form strings are rendered or retained. Unknown fields are discarded.
export function parseReaction(raw: unknown, now: number): PlazaReaction | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.sessionId !== 'string' || p.sessionId.length < 1 || p.sessionId.length > 128
    || typeof p.kind !== 'string' || !Object.hasOwn(REACTIONS, p.kind)
    || typeof p.sentAt !== 'number' || !Number.isFinite(p.sentAt)
    || p.sentAt < now - REACTION_MS || p.sentAt > now + 5000) return null;
  return { sessionId: p.sessionId, kind: p.kind as ReactionKind, sentAt: p.sentAt };
}
export function nearWell(cell: { x: number; y: number }): boolean {
  return ((cell.x === 6 || cell.x === 9) && cell.y === 5)
    || ((cell.x === 7 || cell.x === 8) && (cell.y === 4 || cell.y === 6));
}
export function plazaDay(now = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
const MESSAGES = [
  '작은 한 걸음도 분명 앞으로 가는 중이야.',
  '잠깐 쉬어도 괜찮아. 네 속도로 가자.',
  '어제 어려웠던 게 오늘은 조금 쉬워질지도 몰라.',
  '다 하지 못한 날에도, 해낸 건 남아 있어.',
  '궁금한 것 하나를 발견했다면 오늘도 잘한 거야.',
  '비교 대신 어제의 나에게 작은 박수를 보내자.',
  '오늘의 너에게도 따뜻한 응원을 보낼게.',
  '천천히 읽은 한 줄이 오래 남기도 해.',
  '모르는 걸 알아차린 순간부터 배움은 시작돼.',
  '물 한 모금, 기지개 한 번. 다시 시작할 힘을 모으자.',
  '잘 안 풀리면 잠깐 다른 풍경을 봐도 좋아.',
  '끝낸 작은 일 하나를 떠올려 봐. 충분히 멋진 일이야.',
  '오늘 배운 것 중 하나만 기억해도 좋아.',
  '여기서 잠깐 쉬고, 다음 한 걸음은 가볍게.',
];
export function dailyWellMessage(day: string): string {
  return MESSAGES[Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000) % MESSAGES.length] ?? MESSAGES[0];
}
export function wellStorageKey(userId: string): string { return `rn-plaza-well-v1:${userId}`; }
