import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublicAvatarAppearance } from '../../pixel-room/shop/types';
import { composeAvatar } from '../game/avatarTexture';
import { inventoryTotal, RPS_HANDS, type RpsHand } from '../logic/cardRps';
import type { CardRpsAdapter, RpsMatchView } from '../logic/cardRpsContract';
import { addQueuedCard, moveQueuedCard, nextRevealIndex, removeQueuedCard, revealSteps } from '../logic/cardRpsPresentation';
import { Window } from './GamePanels';
import './cardRpsGame.css';

const LABEL: Record<RpsHand, string> = { rock: '바위', scissors: '가위', paper: '보' };
const ICON: Record<RpsHand, string> = { rock: '✊', scissors: '✌️', paper: '✋' };
const assetModules = import.meta.glob('../assets/cardRps/*.{png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const asset = (name: string) => Object.entries(assetModules).find(([path]) => path.endsWith('/' + name))?.[1];

export function CardRpsGame({ adapter, appearance, onClose }: { adapter: CardRpsAdapter; appearance?: PublicAvatarAppearance; onClose(): void }) {
  const [match, setMatch] = useState<RpsMatchView | null>(null);
  const [queue, setQueue] = useState<RpsHand[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('치즈가 카드를 섞고 있어요…');
  const [reveal, setReveal] = useState(0);
  const [auto, setAuto] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [avatar, setAvatar] = useState('');
  const currentRound = match?.rounds.at(-1);
  const steps = useMemo(() => currentRound ? revealSteps(currentRound) : [], [currentRound]);
  const initialized = useRef(false);

  useEffect(() => {
    if (!appearance) return;
    let cancelled = false;
    void composeAvatar(appearance).canvas.then(canvas => { if (!cancelled) setAvatar(canvas.toDataURL()); });
    return () => { cancelled = true; };
  }, [appearance]);
  useEffect(() => {
    const unsubscribe = adapter.subscribe({ onMatch: setMatch });
    if (!initialized.current) {
      initialized.current = true;
      void adapter.getActive().then(active => active ?? adapter.startNpc()).then(setMatch).catch(() => setMessage('경기를 시작하지 못했어요.'));
    }
    return unsubscribe;
  }, [adapter]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!auto || reveal >= steps.length) return;
    const timer = window.setTimeout(() => setReveal(index => nextRevealIndex(index, steps.length)), 850);
    return () => clearTimeout(timer);
  }, [auto, reveal, steps.length]);
  useEffect(() => { setReveal(0); setAuto(false); setQueue([]); }, [match?.rounds.length, match?.status]);

  const act = async (task: () => Promise<RpsMatchView>) => {
    setBusy(true); setMessage('');
    try { setMatch(await task()); } catch { setMessage('잠시 뒤 다시 해 주세요.'); } finally { setBusy(false); }
  };
  const remaining = match?.me.inventory;
  const seconds = match?.deadlineAt ? Math.max(0, Math.ceil((match.deadlineAt - now) / 1000)) : 0;
  const face = !currentRound ? '' : currentRound.winner === 'a' ? '×.×' : currentRound.winner === 'b' ? '^.^' : '-.-';
  const shown = steps.slice(0, reveal);
  const last = shown.at(-1);

  return <Window title="천광명월 카드 가위바위보" onClose={() => { if (match && match.status !== 'finished') void adapter.leave(match.matchId); onClose(); }} onCancel={onClose} compact>
    <div className="pwp-rps" data-status={match?.status ?? 'loading'}>
      {!match ? <p role="status">{message}</p> : <>
        <header className="pwp-rps-status">
          <b>{Math.min(match.round, 3)}판</b><span>나 {match.me.wins}승 ●○ · {match.opponent.nickname} {match.opponent.wins}승</span>
          <span>내 카드 {inventoryTotal(match.me.inventory)} · 상대 {inventoryTotal(match.opponent.inventory)}</span>
          {match.deadlineAt && <strong className={seconds <= 10 ? 'urgent' : ''}>⏳ {seconds}초</strong>}
          <span>{match.mode === 'npc' ? `참가비 ${match.stake}P · 승리 보상 ${match.prize}P` : `판돈 ${match.stake}P`}</span>
        </header>
        <section className="pwp-rps-table" style={asset('table.png') ? { backgroundImage: `url(${asset('table.png')})` } : undefined}>
          <div className="pwp-rps-player opponent">
            {match.opponent.isNpc && asset('mouse-dealer.png') ? <img src={asset('mouse-dealer.png')} alt="쥐 카드 딜러 치즈" /> : <span className="pwp-rps-avatar">🐭</span>}
            <b>{match.opponent.nickname}</b>{face && <span className="pwp-rps-face">{face}</span>}
          </div>
          <div className="pwp-rps-clash" aria-live="polite">
            {match.status === 'choosing' && <span className="pwp-rps-card back">상대 카드</span>}
            {last && <><Card hand={last.a} side="mine" glow={last.result === 'a'} /><i>⚔</i><Card hand={last.b} side="theirs" glow={last.result === 'b'} /></>}
            {currentRound && reveal >= steps.length && <strong>{currentRound.winner === 'a' ? '이번 판 승리!' : currentRound.winner === 'b' ? '이번 판 패배' : '이번 판 무승부'}</strong>}
          </div>
          <div className="pwp-rps-player me">{avatar ? <img src={avatar} alt="내 아바타 뒷모습" /> : <span className="pwp-rps-avatar">🧑</span>}<b>나</b></div>
        </section>

        {currentRound && reveal < steps.length && <div className="pwp-rps-playback">
          <span>{reveal}/{steps.length}단계</span>
          <button type="button" onClick={() => setReveal(index => nextRevealIndex(index, steps.length))}>▶ 한 단계</button>
          <button type="button" aria-pressed={auto} onClick={() => setAuto(value => !value)}>▶▶ 자동 재생</button>
        </div>}

        {match.status === 'choosing' && remaining && (!currentRound || reveal >= steps.length) && <section className="pwp-rps-choose">
          <p>낼 카드를 차례대로 눌러 주세요.</p>
          <div className="pwp-rps-hand">{RPS_HANDS.map(hand => <button type="button" key={hand} disabled={busy || queue.filter(c => c === hand).length >= remaining[hand]} onClick={() => setQueue(q => addQueuedCard(q, hand, remaining[hand]))}>
            <Card hand={hand} side="mine" /><small>{LABEL[hand]} {remaining[hand] - queue.filter(c => c === hand).length}장</small>
          </button>)}</div>
          <div className="pwp-rps-queue" aria-label="낼 카드 순서">{queue.map((hand, index) => <span key={`${hand}-${index}`}>
            <button type="button" aria-label={`${LABEL[hand]} 빼기`} onClick={() => setQueue(q => removeQueuedCard(q, index))}>{ICON[hand]}</button>
            <span><button type="button" disabled={index === 0} onClick={() => setQueue(q => moveQueuedCard(q, index, index - 1))}>←</button><button type="button" disabled={index === queue.length - 1} onClick={() => setQueue(q => moveQueuedCard(q, index, index + 1))}>→</button></span>
          </span>)}</div>
          <button className="pwp-rps-submit" type="button" disabled={busy || queue.length === 0} onClick={() => void act(() => adapter.submitCards(match.matchId, queue))}>내기</button>
        </section>}

        {match.status === 'shootout' && <section className="pwp-rps-shootout"><h3>승부차기!</h3><p>한 손을 골라 동시에 내요.</p><div>{RPS_HANDS.map(hand => <button type="button" key={hand} disabled={busy} onClick={() => void act(() => adapter.submitShootout(match.matchId, hand))}>{ICON[hand]} {LABEL[hand]}</button>)}</div></section>}
        {match.status === 'finished' && <section className="pwp-rps-result" role="status"><h3>{match.winnerId === match.me.id ? '경기에서 이겼어요! ^.^' : '아쉽게 졌어요 ×.×'}</h3><p>{match.endReason === 'timeout' ? '시간 초과로 경기가 끝났어요.' : match.endReason === 'left' ? '한쪽이 나가서 경기가 끝났어요.' : `포인트 ${match.pointDelta && match.pointDelta > 0 ? '+' : ''}${match.pointDelta ?? 0}P`}</p><button type="button" onClick={() => void act(() => adapter.startNpc())}>다시 하기</button><button type="button" onClick={onClose}>나가기</button></section>}
        {!!message && <p className="pwp-rps-message" role="alert">{message}</p>}
      </>}
    </div>
  </Window>;
}

function Card({ hand, side, glow = false }: { hand: RpsHand; side: 'mine' | 'theirs'; glow?: boolean }) {
  return <span className={`pwp-rps-card ${side} ${glow ? 'glow' : ''}`} aria-label={`${side === 'mine' ? '내' : '상대'} ${LABEL[hand]} 카드`}><span>{ICON[hand]}</span><small>{LABEL[hand]}</small></span>;
}

export function CardRpsRules({ onClose }: { onClose(): void }) {
  const [page, setPage] = useState(0);
  const images = [asset('rules-1.webp'), asset('rules-2.webp')];
  return <Window title="카드 대결 설명서" onClose={onClose} onCancel={onClose} compact><div className="pwp-rps-rules">
    {images[page] ? <img src={images[page]} alt={`카드 가위바위보 설명서 ${page + 1}쪽`} /> : <div className="pwp-rps-rules-placeholder"><b>설명서 {page + 1}쪽</b><p>그림을 준비하고 있어요. 가위·바위·보 카드를 골라 순서대로 맞붙여 먼저 2승을 달성하세요.</p></div>}
    <nav><button type="button" disabled={page === 0} onClick={() => setPage(0)}>← 이전</button><span>{page + 1} / 2</span><button type="button" disabled={page === 1} onClick={() => setPage(1)}>다음 →</button></nav>
  </div></Window>;
}
