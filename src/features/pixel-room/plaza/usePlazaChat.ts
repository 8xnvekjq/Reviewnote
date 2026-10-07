import { useEffect, useRef, useState } from 'react';
import { CHAT_RECEIVE_GAP_MS, CHAT_SHOW_MS, parseChat } from './plazaChat';
import type { PlazaChat } from './plazaChat';

// usePlazaReactions와 같은 모양: 광장에 있는 사람(또는 나)의 한마디만, 같은 사람의 새 말은 이전 말을 바꾼다.
export function usePlazaChat(sessionId: string, members: ReadonlyMap<string, unknown>) {
  const [chats, setChats] = useState<Map<string, PlazaChat & { expires: number }>>(new Map());
  const roster = useRef(members);
  roster.current = members;
  const last = useRef(new Map<string, { sentAt: number; receivedAt: number }>());
  function receive(raw: unknown) {
    const now = Date.now();
    const event = parseChat(raw, now);
    if (!event || (event.sessionId !== sessionId && !roster.current.has(event.sessionId))) return;
    const previous = last.current.get(event.sessionId);
    if (previous && (event.sentAt <= previous.sentAt || now - previous.receivedAt < CHAT_RECEIVE_GAP_MS)) return;
    if (last.current.size >= 128 && !last.current.has(event.sessionId)) return;
    last.current.set(event.sessionId, { sentAt: event.sentAt, receivedAt: now });
    setChats(old => new Map(old).set(event.sessionId, { ...event, expires: now + CHAT_SHOW_MS }));
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
