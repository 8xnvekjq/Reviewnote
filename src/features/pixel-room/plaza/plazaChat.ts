// 광장 한마디(채팅). 실시간 broadcast로만 오가고 DB에는 남기지 않는다. 'chat' 이벤트는 새로 생긴 것이라
// 예전 화면은 이 이벤트를 듣지 않아 그냥 지나친다(오류 없음).
export const CHAT_EVENT = 'chat';
export const CHAT_MAX_CHARS = 40;
/** 보내는 쪽 간격. 받는 쪽은 네트워크 흔들림을 감안해 조금 느슨하게 본다. */
export const CHAT_COOLDOWN_MS = 1500;
export const CHAT_RECEIVE_GAP_MS = 1000;
/** 머리 위에 또렷이 보이는 시간(받은 쪽 시계 기준). 그 뒤 장면이 천천히 흐리게 지운다. */
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

// sentAt은 보낸 기기의 시계다. 학생 태블릿 시계는 몇 분씩 어긋날 수 있으므로 내 시계와 비교해 버리지 않는다
// — 같은 사람의 말 순서/중복을 가리는 데만 쓴다(chatAccepted). 보이는 시간은 받은 시각으로 잰다.
export function parseChat(raw: unknown): PlazaChat | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.sessionId !== 'string' || p.sessionId.length < 1 || p.sessionId.length > 128
    || typeof p.text !== 'string' || p.text.length > CHAT_MAX_CHARS * 4
    || typeof p.sentAt !== 'number' || !Number.isFinite(p.sentAt)) return null;
  const text = normalizeChat(p.text);
  return text ? { sessionId: p.sessionId, text, sentAt: p.sentAt } : null;
}

/** 같은 사람의 이전 말(보낸 시계 sentAt, 내 시계 receivedAt)에 비춰 이번 말을 받을지. 시계 차이와 무관하다:
 *  - 같은 sentAt = 같은 말이 두 번 온 것 → 버림.
 *  - 내 시계로 1초 안에 또 옴 → 버림(보내는 쪽 1.5초 간격 + 네트워크 흔들림 여유).
 *  - sentAt이 거꾸로 감: 보이는 동안(5초)만 늦게 도착한 옛 말로 보고 버린다. 그 뒤에는 보낸 기기 시계가
 *    뒤로 맞춰진 것일 수 있으니 받는다 — 시계가 바뀐 친구의 말이 계속 막히지 않게. */
export function chatAccepted(previous: { sentAt: number; receivedAt: number } | undefined, sentAt: number, now: number): boolean {
  if (!previous) return true;
  const since = now - previous.receivedAt;
  if (sentAt === previous.sentAt || since < CHAT_RECEIVE_GAP_MS) return false;
  return sentAt > previous.sentAt || since >= CHAT_SHOW_MS;
}
