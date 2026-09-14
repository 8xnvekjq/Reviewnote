import { useEffect, useRef, useState } from 'react';
import { parseReaction, REACTION_COOLDOWN_MS, REACTION_MS } from './plazaInteractions';
import type { PlazaReaction } from './plazaInteractions';

export function usePlazaReactions(sessionId: string, members: ReadonlyMap<string, unknown>) {
  const [reactions, setReactions] = useState<Map<string, PlazaReaction & { expires: number }>>(new Map());
  const roster = useRef(members);
  roster.current = members;
  const last = useRef(new Map<string, { sentAt: number; receivedAt: number }>());
  function receive(raw: unknown) {
    const now = Date.now();
    const event = parseReaction(raw, now);
    if (!event || (event.sessionId !== sessionId && !roster.current.has(event.sessionId))) return;
    const previous = last.current.get(event.sessionId);
    if (previous && (event.sentAt <= previous.sentAt || now - previous.receivedAt < REACTION_COOLDOWN_MS)) return;
    if (last.current.size >= 128 && !last.current.has(event.sessionId)) return;
    last.current.set(event.sessionId, { sentAt: event.sentAt, receivedAt: now });
    setReactions(old => new Map(old).set(event.sessionId, { ...event, expires: now + REACTION_MS }));
  }
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setReactions(old => {
        const next = new Map([...old].filter(([id, event]) => event.expires > now && (id === sessionId || roster.current.has(id))));
        return next.size === old.size ? old : next;
      });
      for (const [id, value] of last.current) if (now - value.receivedAt > 10000) last.current.delete(id);
    }, 200);
    return () => clearInterval(timer);
  }, [sessionId]);
  return { reactions, receive };
}
