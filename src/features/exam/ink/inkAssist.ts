// 도와주기 획은 저장 필기와 별개이며, 마지막 활동 후 전체가 함께 사라진다.
export interface AssistPoint { x: number; y: number }
export type AssistMessage = { version: 1; kind: 'clear'; questionId: string } | {
  version: 1; kind: 'stroke'; questionId: string; strokeId: string; points: AssistPoint[]; done: boolean; seq: number;
};
export interface AssistStroke { points: AssistPoint[]; seq: number; done: boolean }
export interface AssistState { strokes: Map<string, AssistStroke>; lastActivity: number; writing: boolean }
export const ASSIST_HOLD_MS = 10_000;
export const ASSIST_FADE_MS = 700;
export const ASSIST_BATCH_MS = 120;
export const ASSIST_MAX_POINTS = 256;
export const emptyAssist = (): AssistState => ({ strokes: new Map(), lastActivity: 0, writing: false });
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200;
export function parseAssist(value: unknown): AssistMessage | null {
  if (!value || typeof value !== 'object') return null;
  const m = value as Record<string, unknown>;
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).length > 24_000) return null;
  } catch { return null; }
  if (m.version !== 1 || !id(m.questionId)) return null;
  if (m.kind === 'clear') return { version: 1, kind: 'clear', questionId: m.questionId };
  if (m.kind !== 'stroke' || !id(m.strokeId) || typeof m.done !== 'boolean' ||
    !Number.isSafeInteger(m.seq) || (m.seq as number) < 0 || !Array.isArray(m.points) || m.points.length > ASSIST_MAX_POINTS) return null;
  const points: AssistPoint[] = [];
  for (const p of m.points) {
    if (!p || typeof p !== 'object' || !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
      p.x < 0 || p.x > 16 || p.y < 0 || p.y > 32) return null;
    points.push({ x: p.x, y: p.y });
  }
  const parsed: AssistMessage = { version: 1, kind: 'stroke', questionId: m.questionId, strokeId: m.strokeId,
    points, done: m.done, seq: m.seq as number };
  return new TextEncoder().encode(JSON.stringify(parsed)).length <= 24_000 ? parsed : null;
}
export function assistAlpha(state: AssistState, now: number): number {
  if (!state.strokes.size) return 0;
  const t = Math.max(0, Math.min(1, (now - state.lastActivity - ASSIST_HOLD_MS) / ASSIST_FADE_MS));
  return 1 - t * t * (3 - 2 * t);
}
export function receiveAssist(state: AssistState, message: AssistMessage, questionId: string, now: number): AssistState {
  if (message.questionId !== questionId) return state;
  if (message.kind === 'clear') return emptyAssist();
  if (assistAlpha(state, now) === 0) state = emptyAssist();
  const before = state.strokes.get(message.strokeId);
  if (before && (message.seq <= before.seq || before.done)) return state;
  // 예외적으로 긴 세션도 메모리·렌더 비용을 제한한다.
  const total = [...state.strokes.values()].reduce((n, s) => n + s.points.length, 0);
  if ((!before && state.strokes.size >= 128) || total + message.points.length > 32_000) return state;
  const strokes = new Map(state.strokes);
  strokes.set(message.strokeId, { points: [...(before?.points ?? []), ...message.points], seq: message.seq, done: message.done });
  return { strokes, lastActivity: now, writing: !message.done };
}
