// 광장 한마디(채팅). 실시간 broadcast로만 오가고 DB에는 남기지 않는다. 'chat' 이벤트는 새로 생긴 것이라
// 예전 화면은 이 이벤트를 듣지 않아 그냥 지나친다(오류 없음).
export const CHAT_EVENT = 'chat';
export const CHAT_MAX_CHARS = 40;
/** 보내는 쪽 간격. 받는 쪽은 네트워크 흔들림을 감안해 조금 느슨하게 본다. */
export const CHAT_COOLDOWN_MS = 1500;
export const CHAT_RECEIVE_GAP_MS = 1000;
/** 머리 위에 또렷이 보이는 시간. 그 뒤 장면이 천천히 흐리게 지운다. */
export const CHAT_SHOW_MS = 5000;
export const CHAT_FADE_MS = 1000;
export interface PlazaChat { sessionId: string; text: string; sentAt: number }

// 줄바꿈·제어 문자·글자 방향을 뒤집는 보이지 않는 문자는 공백으로 바꾸고, 공백을 하나로 모아 앞뒤를 자른다.
// 글자 수는 코드 포인트로 센다(이모지 하나 = 한 글자).
// eslint-disable-next-line no-control-regex
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2028\u2029\u2066-\u2069\ufeff]/g;
export function normalizeChat(raw: string): string {
  const text = raw.replace(HIDDEN, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(text).slice(0, CHAT_MAX_CHARS).join('').trim();
}

export function parseChat(raw: unknown, now: number): PlazaChat | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.sessionId !== 'string' || p.sessionId.length < 1 || p.sessionId.length > 128
    || typeof p.text !== 'string' || p.text.length > CHAT_MAX_CHARS * 4
    || typeof p.sentAt !== 'number' || !Number.isFinite(p.sentAt)
    || p.sentAt < now - CHAT_SHOW_MS || p.sentAt > now + 5000) return null;
  const text = normalizeChat(p.text);
  return text ? { sessionId: p.sessionId, text, sentAt: p.sentAt } : null;
}
