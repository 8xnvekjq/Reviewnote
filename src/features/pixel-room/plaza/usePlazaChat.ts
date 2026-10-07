import { useEffect, useRef, useState } from 'react';
import { CHAT_SHOW_MS, chatAccepted, parseChat } from './plazaChat';
import type { PlazaChat } from './plazaChat';

// usePlazaReactions와 같은 모양: 광장에 있는 사람(또는 나)의 한마디만, 같은 사람의 새 말은 이전 말을 바꾼다.
export function usePlazaChat(sessionId: string, members: ReadonlyMap<string, unknown>) {
  // receivedAt/expires는 내 시계. 보낸 기기 시계(sentAt)는 순서·중복 판단에만 쓴다.
  const [chats, setChats] = useState<Map<string, PlazaChat & { receivedAt: number; expires: number }>>(new Map());
  const roster = useRef(members);
  roster.current = members;
  const last = useRef(new Map<string, { sentAt: number; receivedAt: number }>());
  function receive(raw: unknown) {
    const now = Date.now();
    const event = parseChat(raw);
    if (!event || (event.sessionId !== sessionId && !roster.current.has(event.sessionId))) return;
    if (!chatAccepted(last.current.get(event.sessionId), event.sentAt, now)) return;
    if (last.current.size >= 128 && !last.current.has(event.sessionId)) return;
    last.current.set(event.sessionId, { sentAt: event.sentAt, receivedAt: now });
    setChats(old => new Map(old).set(event.sessionId, { ...event, receivedAt: now, expires: now + CHAT_SHOW_MS }));
  }
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setChats(old => {
        const next = new Map([...old].filter(([id, chat]) => chat.expires > now && (id === sessionId || roster.current.has(id))));
        return next.size === old.size ? old : next;
      });
      for (const [id, value] of last.current) if (now - value.receivedAt > 15000) last.current.delete(id);
    }, 200);
    return () => clearInterval(timer);
  }, [sessionId]);
  return { chats, receive };
}
