import { useEffect, useRef, useState } from 'react';
import { dailyWellMessage, nearWell, plazaDay, REACTIONS, REACTION_COOLDOWN_MS, wellStorageKey } from './plazaInteractions';
import type { ReactionKind } from './plazaInteractions';
import type { Cell } from './plazaModel';

interface Props {
  userId: string;
  actor: Cell;
  moving: boolean;
  ready: boolean;
  walkTo: (cell: Cell) => void;
  sendReaction: (kind: ReactionKind) => Promise<boolean>;
}
export function PlazaActivities({ userId, actor, moving, ready, walkTo, sendReaction }: Props) {
  const [day, setDay] = useState(plazaDay);
  const [readDay, setReadDay] = useState(() => {
    try { return localStorage.getItem(wellStorageKey(userId)); } catch { return null; }
  });
  const [opened, setOpened] = useState(false);
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
  const done = readDay === day;
  async function react(kind: ReactionKind) {
    if (!ready || Date.now() < cooldown.current) return;
    cooldown.current = Date.now() + REACTION_COOLDOWN_MS;
    setCooling(true);
    const sent = await sendReaction(kind);
    if (alive.current) setNotice(sent ? `${REACTIONS[kind].emoji} ${REACTIONS[kind].label}` : '반응을 보내지 못했어요. 잠시 후 다시 해 주세요.');
  }
  function readWell() {
    if (!nearWell(actor)) { walkTo({ x: 7, y: 6 }); return; }
    if (moving) return;
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
  return <section className="pr-plaza-activities" aria-label="광장에서 잠깐 쉬기">
    <div className="pr-reaction-bar" aria-label="짧은 반응">
      {(['wave', 'cheer', 'rest'] as const).map(kind => <button type="button" key={kind} disabled={!ready || cooling} onClick={() => void react(kind)}><span aria-hidden="true">{REACTIONS[kind].emoji}</span> {REACTIONS[kind].label}</button>)}
      <span className="pr-reaction-status" role="status">{!ready ? '다시 연결하는 중…' : cooling ? '잠깐 쉬었다 보내요' : notice || '머리 위로 전하는 인사'}</span>
    </div>
    <div className="pr-well-card">
      <div><strong>✨ 우물의 오늘 한마디</strong><small>{done ? '오늘의 한마디를 만났어요' : '우물 곁에서 작은 응원을 꺼내 보세요'}</small></div>
      <button type="button" onClick={readWell} disabled={nearWell(actor) && moving}>{!nearWell(actor) ? '우물로 가기' : done ? '다시 읽기' : '꺼내 보기'}</button>
      {opened && done && <p className="pr-well-message" role="status">“{dailyWellMessage(day)}”</p>}
      <small className="pr-well-footnote">{storageFailed ? '기록을 저장하지 못했어요. 이번 방문 동안만 기억해요.' : '매일 새 한마디 · 읽음 기록은 이 기기에만 저장돼요'}</small>
    </div>
  </section>;
}
