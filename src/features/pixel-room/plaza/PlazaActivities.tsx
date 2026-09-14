import { useEffect, useRef, useState } from 'react';
import { dailyWellMessage, nearWell, plazaDay, REACTIONS, REACTION_COOLDOWN_MS, wellStorageKey } from './plazaInteractions';
import type { ReactionKind } from './plazaInteractions';
import type { Cell } from './plazaModel';

interface Props {
  userId: string;
  actor: Cell;
  moving: boolean;
  ready: boolean;
  stopMoving: () => void;
  sendReaction: (kind: ReactionKind) => Promise<boolean>;
}
export function PlazaActivities({ userId, actor, moving, ready, stopMoving, sendReaction }: Props) {
  const [day, setDay] = useState(plazaDay);
  const [readDay, setReadDay] = useState(() => {
    try { return localStorage.getItem(wellStorageKey(userId)); } catch { return null; }
  });
  const [opened, setOpened] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selfButton = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState('');
  const [cooling, setCooling] = useState(false);
  const cooldown = useRef(0);
  const alive = useRef(true);
  const [storageFailed, setStorageFailed] = useState(false);
  useEffect(() => {
    alive.current = true;
    const refresh = () => {
      setDay(plazaDay());
      if (Date.now() >= cooldown.current) setCooling(false);
    };
    const timer = window.setInterval(refresh, 250);
    window.addEventListener('focus', refresh);
    return () => { alive.current = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) { setChoosing(false); setOpened(false); }
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  useEffect(() => { setChoosing(false); setOpened(false); }, [actor.x, actor.y]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  const done = readDay === day;
  async function react(kind: ReactionKind) {
    if (!ready || Date.now() < cooldown.current) return;
    cooldown.current = Date.now() + REACTION_COOLDOWN_MS;
    setCooling(true);
    const sent = await sendReaction(kind);
    if (alive.current) setNotice(sent ? `${REACTIONS[kind].emoji} ${REACTIONS[kind].label}` : '반응을 보내지 못했어요. 잠시 후 다시 해 주세요.');
  }
  function readWell() {
    if (!nearWell(actor) || moving) return;
    setChoosing(false);
    const today = plazaDay();
    setDay(today);
    setOpened(true);
    let alreadyRead = readDay === today;
    try { alreadyRead ||= localStorage.getItem(wellStorageKey(userId)) === today; } catch { /* Optional device record. */ }
    if (alreadyRead) { setReadDay(today); return; }
    setReadDay(today);
    try { localStorage.setItem(wellStorageKey(userId), today); }
    catch { setStorageFailed(true); }
    if (ready && Date.now() >= cooldown.current) void react('wish');
  }
  // Clamp the chooser within the map; use the space below avatars near its top edge.
  const chooserStyle = {
    left: `clamp(108px, ${(actor.x + .5) / 16 * 100}%, calc(100% - 108px))`,
    ...(actor.y < 3 ? { top: `${(actor.y + 1) / 12 * 100}%` } : { bottom: `${(12 - actor.y + .5) / 12 * 100}%` }),
  };
  return <div ref={root} className="pr-world-interactions" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); setChoosing(false); setOpened(false); selfButton.current?.focus(); }
  }}>
    <button type="button" className="pr-well-target" aria-label="우물의 오늘 한마디 읽기" disabled={!nearWell(actor) || moving} aria-expanded={opened && done} onClick={readWell}><span aria-hidden="true">{nearWell(actor) ? '✨' : ''}</span></button>
    <button ref={selfButton} type="button" className="pr-self-target" aria-label="내 캐릭터 리액션 선택" aria-expanded={choosing} style={{ left: `${(actor.x + .5) / 16 * 100}%`, bottom: `${Math.min(83, (11 - actor.y) / 12 * 100)}%` }} onClick={() => { stopMoving(); setOpened(false); setChoosing(value => !value); }} />
    {choosing && <div className="pr-reaction-chooser" role="group" aria-label="리액션 선택" style={chooserStyle}>
      {(['wave', 'cheer', 'rest'] as const).map(kind => <button type="button" key={kind} aria-label={REACTIONS[kind].label} disabled={!ready || cooling} onClick={() => { setChoosing(false); void react(kind); }}><span aria-hidden="true">{REACTIONS[kind].emoji}</span> {{ wave: '안녕', cheer: '응원', rest: '쉬자' }[kind]}</button>)}
      {(!ready || cooling) && <span className="pr-reaction-status" role="status">{!ready ? '다시 연결하는 중…' : '잠깐 쉬었다 보내요'}</span>}
    </div>}
    {opened && done && <div className="pr-well-popup" role="group" aria-label="우물의 오늘 한마디">
      <strong>✨ 오늘의 한마디</strong><button type="button" aria-label="한마디 닫기" onClick={() => setOpened(false)}>×</button>
      <p className="pr-well-message" role="status">“{dailyWellMessage(day)}”</p>
      {storageFailed && <small>이번 방문 동안만 기억해요.</small>}
    </div>}
    {notice && <span className="pr-world-notice" role="status">{notice}</span>}
  </div>;
}
