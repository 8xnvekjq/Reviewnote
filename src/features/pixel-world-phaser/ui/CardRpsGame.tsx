// 천광명월 카드 가위바위보 화면(2026-10-13 다시 그림). 웹 창 대신 화면 전체를 덮는 픽셀 게임 화면.
// 위: HUD(판 표시·별·남은 카드·모래시계) / 가운데: 선술집 탁자 무대(hd/room.webp, 16:10 고정으로 줄어듦) / 아래: 손패 쟁반(항상 보임).
// 무대는 설명서 2쪽(전투 진행 예시 & 화면 연출) 위 그림처럼: 맞은편 의자에 상대, 앞쪽 아래에 내 뒷모습, 탁자 위 세 줄(상대·가운데·나).
// 공개 연출은 logic/cardRpsPresentation.ts 의 박자표(roundTimeline·revealCardsAt)를 그대로 그린다.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { PublicAvatarAppearance } from '../../pixel-room/shop/types';
import { composeAvatar } from '../game/avatarTexture';
import { AVATAR_FRAME, AVATAR_POSES } from '../logic/avatarPlan';
import { inventoryTotal, RPS_HAND_LABEL, RPS_HANDS, RPS_MAX_ROUNDS, RPS_TURN_MS, RPS_WINS_TO_WIN, type RpsHand, type RpsRoundResult } from '../logic/cardRps';
import type { CardRpsAdapter, RpsMatchView } from '../logic/cardRpsContract';
import {
  addQueuedCard, dropIndex, handCards, initialRevealProgress, insertQueuedCard, moveQueuedCard, removeQueuedCard,
  revealCardsAt, roundTimeline, shootoutRound, winsAfter, type RevealCard,
} from '../logic/cardRpsPresentation';
import {
  cardRpsAssets, cardRpsHd, CARD_COLUMNS, CARD_ORDER, CARD_ROWS,
  HD_CARD_H, HD_CARD_W, HD_CHEESE_ORDER, HD_LAYOUT, HD_ROOM_H, HD_ROOM_W,
} from '../assets/cardRps';
import './cardRpsGame.css';

const LABEL = RPS_HAND_LABEL;
const DEFAULT_APPEARANCE: PublicAvatarAppearance = { skin: null, eyes: null, top: null, bottom: null, shoes: null, hair: null };
/** 무대 논리 크기 = room.webp 크기(layout.json 좌표계). 화면에 맞게 통째로 확대·축소한다. */
const STAGE_W = HD_ROOM_W;
const STAGE_H = HD_ROOM_H;
const DRAG_SLOP = 6;
/** 카드 비율은 그림 칸(192×256)에서만 — CSS가 비율을 따라간다. */
const CARD_VARS = { '--card-ratio': `${HD_CARD_W} / ${HD_CARD_H}`, '--card-hr': HD_CARD_H / HD_CARD_W } as CSSProperties;

// 고해상도 그림은 모듈을 처음 불러올 때 한 번만 미리 받아 둔다(경기 화면을 열 때 깜빡이지 않게).
const preloaded = typeof Image === 'undefined' ? [] : Object.values(cardRpsHd).map(src => { const image = new Image(); image.decoding = 'async'; image.src = src; return image; });
void preloaded;

/** 어느 판·승부차기까지 연출을 보여 줬는지(창을 닫았다 열어도 다시 보지 않게). */
const revealProgress = new Map<string, { rounds: number; shootout: number }>();

type Mode = 'loading' | 'invited' | 'choosing' | 'waiting' | 'reveal' | 'shootout' | 'result' | 'closed';
type Anim = { kind: 'round' | 'shootout'; index: number; round: RpsRoundResult };
type Mood = (typeof HD_CHEESE_ORDER)[number];

const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function CardRpsGame({ adapter, appearance, opponentAppearance, onClose, onFinished }: { adapter: CardRpsAdapter; appearance?: PublicAvatarAppearance; opponentAppearance?: PublicAvatarAppearance; onClose(): void; onFinished?: (matchId: string) => void }) {
  const [match, setMatch] = useState<RpsMatchView | null>(null);
  const [queue, setQueue] = useState<RpsHand[]>([]);
  const [submitted, setSubmitted] = useState<{ matchId: string; round: number; cards: RpsHand[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [avatar, setAvatar] = useState('');
  const [opponentAvatar, setOpponentAvatar] = useState('');
  const [reduced] = useState(prefersReducedMotion);
  const [progress, setProgress] = useState<{ id: string; rounds: number; shootout: number } | null>(null);
  const [beatState, setBeatState] = useState<{ key: string; beat: number }>({ key: '', beat: 0 });
  const initialized = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void avatarFrame(appearance ?? DEFAULT_APPEARANCE, 'Idle_Back').then(value => { if (!cancelled) setAvatar(value); }).catch(() => {});
    return () => { cancelled = true; };
  }, [appearance]);
  useEffect(() => {
    if (!opponentAppearance) { setOpponentAvatar(''); return; }
    let cancelled = false;
    void avatarFrame(opponentAppearance, 'Idle_Front').then(value => { if (!cancelled) setOpponentAvatar(value); }).catch(() => {});
    return () => { cancelled = true; };
  }, [opponentAppearance]);
  useEffect(() => {
    const unsubscribe = adapter.subscribe({ onMatch: setMatch });
    if (!initialized.current) {
      initialized.current = true;
      void adapter.getActive().then(active => active ?? adapter.startNpc()).then(setMatch).catch(() => { setFailed(true); setMessage('경기를 시작하지 못했어요.'); });
    }
    return unsubscribe;
  }, [adapter]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);

  // ── 연출 감독: 서버 상태가 앞서 가도(끝남·승부차기) 공개가 끝날 때까지 화면은 붙잡아 둔다 ──
  const seen = !match ? null : progress?.id === match.matchId ? progress
    : { id: match.matchId, ...(revealProgress.get(match.matchId) ?? initialRevealProgress(match.rounds.length, match.shootout.length)) };
  const anim: Anim | null = !match || !seen ? null
    : seen.rounds < match.rounds.length ? { kind: 'round', index: seen.rounds, round: match.rounds[seen.rounds] }
      : seen.shootout < match.shootout.length ? { kind: 'shootout', index: seen.shootout, round: shootoutRound(match.shootout[seen.shootout]) }
        : null;
  const animKey = anim && match ? `${match.matchId}:${anim.kind}:${anim.index}` : '';
  const beats = useMemo(() => anim ? roundTimeline(anim.round, reduced, anim.kind === 'shootout') : [], [anim?.round, anim?.kind, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const beatIndex = beatState.key === animKey ? beatState.beat : 0;
  const beat = anim ? beats[Math.min(beatIndex, beats.length - 1)] : null;
  // 1초마다 다시 그려져도 타이머가 처음부터 다시 시작하지 않게, 끝내기 함수는 ref로 최신 것만 쓴다.
  const finishAnim = useRef(() => {});
  finishAnim.current = () => {
    if (!match || !seen || !anim) return;
    const next = { id: match.matchId, rounds: seen.rounds + (anim.kind === 'round' ? 1 : 0), shootout: seen.shootout + (anim.kind === 'shootout' ? 1 : 0) };
    revealProgress.set(match.matchId, { rounds: next.rounds, shootout: next.shootout });
    setProgress(next);
  };
  const beatMs = beat?.ms ?? 0;
  useEffect(() => {
    if (!animKey || !beatMs) return;
    const timer = window.setTimeout(() => {
      if (beatIndex + 1 < beats.length) setBeatState({ key: animKey, beat: beatIndex + 1 });
      else finishAnim.current();
    }, beatMs);
    return () => clearTimeout(timer);
  }, [animKey, beatIndex, beats.length, beatMs]);

  const revealedRounds = !match ? 0 : anim?.kind === 'round' ? anim.index + (beat?.stage === 'banner' ? 1 : 0) : match.rounds.length;
  const mode: Mode = !match ? 'loading'
    : anim ? 'reveal'
      : match.status === 'finished' ? 'result'
        : match.status === 'shootout' ? 'shootout'
          : match.status === 'invited' ? 'invited'
            : match.status === 'choosing' || match.status === 'revealing'
              ? (match.me.submitted || match.status === 'revealing' || (submitted?.matchId === match.matchId && submitted.round === match.rounds.length) ? 'waiting' : 'choosing')
              : 'closed';

  useEffect(() => { setQueue([]); }, [match?.matchId, match?.rounds.length]);
  useEffect(() => { if (mode === 'result' && match) onFinished?.(match.matchId); }, [mode, match?.matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (task: () => Promise<RpsMatchView>) => {
    setBusy(true); setMessage('');
    try { setMatch(await task()); return true; } catch { setMessage('잠시 뒤 다시 해 주세요.'); return false; } finally { setBusy(false); }
  };
  const submit = () => {
    if (!match || !queue.length || busy) return;
    const cards = [...queue];
    setSubmitted({ matchId: match.matchId, round: match.rounds.length, cards });
    void act(() => adapter.submitCards(match.matchId, cards)).then(ok => { if (!ok) setSubmitted(null); });
  };
  const leaveNow = () => { if (match && !['finished', 'declined', 'expired', 'cancelled'].includes(match.status)) void adapter.leave(match.matchId).catch(() => {}); onClose(); };
  const active = !!match && !['finished', 'declined', 'expired', 'cancelled'].includes(match.status);
  const requestClose = () => { if (active) setConfirmLeave(true); else onClose(); };

  // ── HUD 값(공개 전에는 결과를 미리 보여 주지 않는다) ──
  const wins = match ? winsAfter(match.rounds, revealedRounds) : { a: 0, b: 0 };
  // 아직 연출하지 않은 다음 판들에서 낸 카드는 손에 있는 것으로 센다(보통 0장).
  const laterCards = (side: 'a' | 'b') => !match || anim?.kind !== 'round' ? 0 : match.rounds.slice(anim.index + 1).reduce((sum, r) => sum + r[side].length, 0);
  const myLeft = match ? inventoryTotal(match.me.inventory) + laterCards('a') : 0;
  const theirLeft = match ? inventoryTotal(match.opponent.inventory) + laterCards('b') : 0;
  const currentRound = mode === 'reveal' && anim?.kind === 'round' ? anim.index : Math.min(RPS_MAX_ROUNDS - 1, match?.rounds.length ?? 0);
  const seconds = match?.deadlineAt ? Math.max(0, Math.ceil((match.deadlineAt - now) / 1000)) : null;
  const showTimer = seconds !== null && (mode === 'choosing' || mode === 'waiting' || mode === 'shootout');

  // 표정: 그 판 공개가 다 끝난 뒤(배너)와 경기 결과에서만 — 공개 중에는 스포일러 없음. 상대 기준 win/lose.
  const lastOutcome = (() => {
    if (!match) return null;
    if (mode === 'reveal') return beat?.stage === 'banner' && anim ? anim.round.winner : null;
    if (mode === 'result') return match.winnerId ? match.winnerId === match.me.id ? 'a' : 'b' : null;
    return null;
  })();
  const face: Mood | null = lastOutcome === 'a' ? 'lose' : lastOutcome === 'b' ? 'win' : lastOutcome === 'draw' ? 'draw' : null;
  // 내가 고르는 동안은 카드를 섞고, 공개 중에는 가만히 지켜본다.
  const opponentMood: Mood = face ?? (mode === 'choosing' || mode === 'shootout' || mode === 'loading' ? 'shuffle' : 'idle');

  const pointsText = !match ? '' : match.mode === 'npc' ? match.prize > 0 ? `오늘 첫 승리 보상 ${match.prize}P` : '오늘 보상 받음 · 연습 판' : `판돈 ${match.stake}P`;
  const iWon = !!match && match.winnerId === match.me.id;

  return <GameOverlay label="천광명월 카드 가위바위보" onCancel={confirmLeave ? () => setConfirmLeave(false) : onClose}
    className="pwp-rps" data={{ 'data-status': match?.status ?? 'loading', 'data-mode': mode, 'data-beat': beat?.stage ?? '' }}>
    <header className="pwp-rps-hud">
      <SidePlate who="them" name={match?.opponent.nickname ?? '치즈'} wins={wins.b} left={theirLeft} />
      <div className="pwp-rps-hud-mid">
        <div className="pwp-rps-pips" aria-label={`${currentRound + 1}판 / ${RPS_MAX_ROUNDS}판`}>
          {Array.from({ length: RPS_MAX_ROUNDS }, (_, k) => {
            const result = k < revealedRounds ? match?.rounds[k]?.winner : undefined;
            return <i key={k} className={result ? `done ${result === 'a' ? 'me' : result === 'b' ? 'them' : 'draw'}` : k === currentRound && mode !== 'result' ? 'now' : ''} />;
          })}
          <b>{mode === 'shootout' || anim?.kind === 'shootout' ? '승부차기' : `${currentRound + 1}판`}</b>
        </div>
        {showTimer ? <Hourglass seconds={seconds!} /> : <small className="pwp-rps-points">{pointsText}</small>}
      </div>
      <SidePlate who="me" name="나" wins={wins.a} left={myLeft} />
      <button type="button" className="pwp-rps-close" aria-label="카드 대결 닫기" onClick={requestClose}><span aria-hidden="true">✕</span></button>
    </header>

    <StageBox>
      <TableStage match={match} mode={mode} anim={anim} beat={beat} avatar={avatar} opponentAvatar={opponentAvatar}
        mood={opponentMood} face={face} submitted={submitted?.matchId === match?.matchId ? submitted?.cards ?? [] : []} />
    </StageBox>

    <section className="pwp-rps-tray" aria-label="내 카드">
      {!match ? <p className="pwp-rps-tray-note" role="status">{failed ? message : '치즈가 카드를 섞고 있어요…'}</p>
        : mode === 'result' ? <div className="pwp-rps-result" role="status">
          <b className="pwp-rps-result-title">경기 결과</b>
          <ol className="pwp-rps-rounds" aria-label="판별 결과">
            {match.rounds.map((round, k) => <li key={k} data-result={round.winner === 'a' ? 'win' : round.winner === 'b' ? 'lose' : 'draw'}>{k + 1}판 <b>{round.winner === 'a' ? '승' : round.winner === 'b' ? '패' : '무'}</b></li>)}
            {match.shootout.length > 0 && <li data-result={match.winnerId === match.me.id ? 'win' : 'lose'}>승부차기 <b>{match.winnerId === match.me.id ? '승' : '패'}</b></li>}
          </ol>
          <p className="pwp-rps-delta" data-sign={(match.pointDelta ?? 0) > 0 ? 'plus' : (match.pointDelta ?? 0) < 0 ? 'minus' : 'zero'}>
            <span className="pwp-rps-coin" aria-hidden="true">P</span>
            {(match.pointDelta ?? 0) > 0 ? '+' : ''}{match.pointDelta ?? 0}P
            <small>{match.endReason === 'timeout' ? (iWon ? '상대 시간 초과' : '시간 초과') : match.endReason === 'left' ? (iWon ? '상대가 나갔어요' : '경기를 나갔어요') : match.mode === 'npc' && match.prize === 0 && match.pointDelta === 0 ? '연습 판이라 포인트는 그대로' : ''}</small>
          </p>
          <div className="pwp-rps-actions">
            {match.mode === 'npc' && <PixelButton tone="gold" disabled={busy} onClick={() => { setSubmitted(null); void act(() => adapter.startNpc()); }}>다시 하기</PixelButton>}
            <PixelButton tone="wood" onClick={onClose}>나가기</PixelButton>
          </div>
        </div>
        : mode === 'shootout' ? <ShootoutTray disabled={busy || match.me.submitted} waiting={match.me.submitted} again={match.shootout.length > 0}
          onPick={hand => void act(() => adapter.submitShootout(match.matchId, hand))} />
        : mode === 'invited' ? <p className="pwp-rps-tray-note" role="status">친구가 수락하기를 기다리는 중…</p>
        : mode === 'closed' ? <div className="pwp-rps-result"><p className="pwp-rps-tray-note">{match.status === 'declined' ? '친구가 대결을 거절했어요.' : match.status === 'expired' ? '신청 시간이 지났어요.' : '대결이 취소됐어요.'}</p><div className="pwp-rps-actions"><PixelButton tone="wood" onClick={onClose}>나가기</PixelButton></div></div>
        : <HandTray inventory={match.me.inventory} queue={queue} setQueue={setQueue}
          locked={mode !== 'choosing' || busy} note={mode === 'waiting' ? `${match.opponent.isNpc ? '치즈가' : '상대가'} 고르는 중…` : mode === 'reveal' ? '카드를 공개하는 중…' : null}
          onSubmit={submit} canSubmit={mode === 'choosing' && !busy && queue.length > 0} />}
      {!!message && match && <p className="pwp-rps-message" role="alert">{message}</p>}
    </section>

    {confirmLeave && <div className="pwp-rps-confirm" role="alertdialog" aria-label="경기 나가기">
      <div className="pwp-rps-frame">
        <p>지금 나가면 이 경기는 <b>지게</b> 돼요.<br />정말 나갈까요?</p>
        <div className="pwp-rps-actions">
          <PixelButton tone="red" onClick={() => { setConfirmLeave(false); leaveNow(); }}>나가기</PixelButton>
          <PixelButton tone="wood" autoFocus onClick={() => setConfirmLeave(false)}>계속하기</PixelButton>
        </div>
      </div>
    </div>}
  </GameOverlay>;
}

// ── 공용 틀 ─────────────────────────────────────────────
/** 화면 전체를 덮는 게임 화면. Esc·B(뒤로)·✕로 닫고, Tab은 안에서만 돈다. */
function GameOverlay({ label, onCancel, className = '', data, children }: { label: string; onCancel(): void; className?: string; data?: Record<string, string>; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef(onCancel); cancel.current = onCancel;
  useEffect(() => {
    const element = box.current;
    const back = () => cancel.current();
    element?.addEventListener('pwp-cancel', back);
    return () => element?.removeEventListener('pwp-cancel', back);
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    box.current?.focus({ preventScroll: true });
    return () => previous?.focus?.();
  }, []);
  const onKeyDown = (event: ReactKeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); if (!event.repeat) cancel.current(); }
    if (event.key === 'Tab') {
      const buttons = [...box.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === box.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };
  // pwp-window: GameShell의 B 버튼이 가장 위 창에 pwp-cancel을 보낸다.
  return <div ref={box} className={`pwp-window pwp-rps-screen ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} style={CARD_VARS}
    onKeyDown={onKeyDown} onPointerDown={event => event.stopPropagation()} onContextMenu={event => event.preventDefault()} {...data}>
    {children}
  </div>;
}

function PixelButton({ tone, children, className = '', ...props }: { tone: 'gold' | 'wood' | 'red' | 'green'; children: ReactNode; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`pwp-rps-btn ${tone} ${className}`} {...props}><span>{children}</span></button>;
}

function SidePlate({ who, name, wins, left }: { who: 'me' | 'them'; name: string; wins: number; left: number }) {
  return <div className={`pwp-rps-plate ${who}`} aria-label={`${name} ${wins}승, 남은 카드 ${left}장`}>
    <b className="pwp-rps-plate-name">{name}</b>
    <span className="pwp-rps-stars" aria-hidden="true">{Array.from({ length: RPS_WINS_TO_WIN }, (_, k) => <i key={k} className={k < wins ? 'on' : ''} />)}</span>
    <span className="pwp-rps-left" aria-hidden="true"><i className="pwp-rps-mini-back" />{left}</span>
  </div>;
}

function Hourglass({ seconds }: { seconds: number }) {
  const ratio = Math.max(0, Math.min(1, seconds / (RPS_TURN_MS / 1000)));
  return <div className={`pwp-rps-timer ${seconds <= 10 ? 'urgent' : ''}`} role="timer" aria-label={`남은 시간 ${seconds}초`}>
    <svg viewBox="0 0 9 12" width="18" height="24" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="0" y="0" width="9" height="1" fill="#5a3418" /><rect x="0" y="11" width="9" height="1" fill="#5a3418" />
      <rect x="1" y="1" width="1" height="3" fill="#2b1a10" /><rect x="7" y="1" width="1" height="3" fill="#2b1a10" />
      <rect x="2" y="4" width="1" height="1" fill="#2b1a10" /><rect x="6" y="4" width="1" height="1" fill="#2b1a10" />
      <rect x="3" y="5" width="3" height="2" fill="#2b1a10" />
      <rect x="2" y="7" width="1" height="1" fill="#2b1a10" /><rect x="6" y="7" width="1" height="1" fill="#2b1a10" />
      <rect x="1" y="8" width="1" height="3" fill="#2b1a10" /><rect x="7" y="8" width="1" height="3" fill="#2b1a10" />
      <rect x="2" y={1 + Math.round((1 - ratio) * 3)} width="5" height={Math.round(ratio * 3)} fill="#f2c14e" />
      <rect x="4" y="5" width="1" height="2" fill="#f2c14e" />
      <rect x="2" y={11 - Math.round((1 - ratio) * 3)} width="5" height={Math.round((1 - ratio) * 3)} fill="#f2c14e" />
    </svg>
    <span className="pwp-rps-timebar"><i style={{ width: `${ratio * 100}%` }} /></span>
    <b>{seconds}</b>
  </div>;
}

/** 스프라이트 시트의 한 칸. 요소 크기는 CSS가 정하고 그림은 퍼센트로 맞춘다(카드 크기가 바뀌어도 그대로). */
function Sprite({ image, columns, rows, column, row, className = '', label, style }: { image: string; columns: number; rows: number; column: number; row: number; className?: string; label?: string; style?: CSSProperties }) {
  return <span className={`pwp-rps-sprite ${className}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    style={{ backgroundImage: `url(${image})`, backgroundSize: `${columns * 100}% ${rows * 100}%`,
      backgroundPosition: `${columns > 1 ? column / (columns - 1) * 100 : 0}% ${rows > 1 ? row / (rows - 1) * 100 : 0}%`, ...style }} />;
}

const CARD_SHEET_ROWS = Object.keys(CARD_ROWS).length;
/** HD 카드 한 장(hd/cards.png — 옛 작은 cards.png와 칸 순서가 같다). */
function CardFace({ hand, side, className = '' }: { hand?: RpsHand; side: 'mine' | 'theirs'; className?: string }) {
  return <Sprite className={`pwp-rps-cardface hd ${className}`} image={cardRpsHd.cards} columns={CARD_COLUMNS} rows={CARD_SHEET_ROWS}
    column={CARD_ORDER.indexOf(hand ?? 'back')} row={CARD_ROWS[side === 'mine' ? 'player' : 'opponent']} />;
}

// ── 탁자 무대 ─────────────────────────────────────────────
/** 남은 자리에 맞춰 논리 무대(방 그림 1600×1000)를 통째로 확대·축소한다. 남는 곳은 어두운 나무 틀(레터박스). */
function StageBox({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(.25);
  useLayoutEffect(() => {
    const element = box.current; if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const width = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      if (width > 0 && height > 0) setScale(Math.max(.1, Math.min(width / STAGE_W, height / STAGE_H)));
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  return <div ref={box} className="pwp-rps-stagebox">
    <div className="pwp-rps-stage-frame" style={{ width: Math.floor(STAGE_W * scale), height: Math.floor(STAGE_H * scale) }}>
      <div className="pwp-rps-stage" style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, backgroundImage: `url(${cardRpsHd.room})` }}>{children}</div>
    </div>
  </div>;
}

const L = HD_LAYOUT;
/** 탁자 위 카드는 가운데 줄 크기로 그리고, 줄마다 scale로 원근(먼 줄은 작게)을 준다. */
const TCARD_H = L.cardHeight.clash;
const TCARD_W = Math.round(TCARD_H * HD_CARD_W / HD_CARD_H);
const SEAT = L.opponentSeat;
const [TABLE_FL, TABLE_FR, TABLE_NR, TABLE_NL] = L.tableTop;
/** 탁자 윗면의 y 높이에서 왼쪽·오른쪽 끝 x. */
function tableEdges(y: number) {
  const t = Math.max(0, Math.min(1, (y - TABLE_FL[1]) / (TABLE_NL[1] - TABLE_FL[1])));
  return { left: TABLE_FL[0] + (TABLE_NL[0] - TABLE_FL[0]) * t, right: TABLE_FR[0] + (TABLE_NR[0] - TABLE_FR[0]) * t };
}
function rowSpot(side: 'a' | 'b', index: number, count: number) {
  const y = side === 'a' ? L.rows.mine : L.rows.opponent;
  const h = side === 'a' ? L.cardHeight.mine : L.cardHeight.opponent;
  const w = h * HD_CARD_W / HD_CARD_H;
  const { left, right } = tableEdges(y);
  const room = right - left - w * 1.2;
  const spacing = count > 1 ? Math.min(w * 1.1, room / (count - 1)) : 0;
  return { x: (left + right) / 2 + (index - (count - 1) / 2) * spacing, y, s: h / TCARD_H };
}
/** 가운데 맞붙는 자리: 두 장이면 나란히(내 카드 왼쪽 아래, 상대 오른쪽 위), 한 장(살아남은 카드)이면 한가운데. */
function arenaSpot(side: 'a' | 'b', alone: boolean) {
  if (alone) return { x: SEAT.x, y: L.rows.clash, s: 1.3 };
  const dir = side === 'a' ? -1 : 1;
  return { x: SEAT.x + dir * (TCARD_W * .66 + 14), y: L.rows.clash - dir * 12, s: 1.2 };
}

const FACE_TEXT: Record<Mood, string> = { lose: '×.×', win: '^.^', draw: '-.-', idle: '', shuffle: '' };
const FACE_LABEL: Record<Mood, string> = { lose: '상대가 울상이에요', win: '상대가 웃어요', draw: '상대가 덤덤해요', idle: '', shuffle: '' };

function TableStage({ match, mode, anim, beat, avatar, opponentAvatar, mood, face, submitted }: {
  match: RpsMatchView | null; mode: Mode; anim: Anim | null; beat: { stage: string; clash: number } | null;
  avatar: string; opponentAvatar: string; mood: Mood; face: Mood | null; submitted: RpsHand[];
}) {
  const cards: RevealCard[] = anim && beat ? revealCardsAt(anim.round, beat as Parameters<typeof revealCardsAt>[1]) : [];
  const clash = anim && beat && (beat.stage === 'hit' || beat.stage === 'exit') ? anim.round.clashes[beat.clash] : null;
  const arenaCount = cards.filter(card => card.spot === 'arena').length;
  const shootout = anim?.kind === 'shootout' || mode === 'shootout';
  const result = mode === 'result' && match ? match.winnerId === match.me.id ? 'win' : 'lose' : null;
  const banner = !match ? null
    : mode === 'reveal' && beat?.stage === 'banner' && anim ? anim.kind === 'shootout'
      ? anim.round.winner === 'draw' ? { text: '한 번 더!', tone: 'draw' } : anim.round.winner === 'a' ? { text: '승부차기 승리!', tone: 'win' } : { text: '승부차기 패배', tone: 'lose' }
      : anim.round.winner === 'a' ? { text: '이번 판 승리!', tone: 'win' } : anim.round.winner === 'b' ? { text: '이번 판 패배', tone: 'lose' } : { text: '이번 판 무승부', tone: 'draw' }
      : result ? result === 'win' ? { text: '승리!', tone: 'win big' } : { text: '패배', tone: 'lose big' } : null;
  const matText = mode === 'shootout' ? match?.shootout.length ? '한 번 더!' : '승부차기!' : shootout ? '한 장씩!' : 'VS';
  const waitingMine = mode === 'waiting' ? submitted : [];
  const opponentIsNpc = match?.opponent.isNpc ?? true;
  const opponentName = match?.opponent.nickname ?? '치즈';
  return <>
    {/* 맞은편 의자: 상대는 탁자 뒤에 앉아 있다(아래 끝 = 탁자 먼 가장자리). */}
    <div className={`pwp-rps-opponent mood-${mood} ${result ? `result-${result === 'win' ? 'lose' : 'win'}` : ''}`}
      style={{ left: SEAT.x, top: SEAT.bottomY - L.opponentScale, width: L.opponentScale, height: L.opponentScale }}>
      {opponentIsNpc
        ? <span className="pwp-rps-cheese" role="img" aria-label={`쥐 카드 딜러 치즈${mood === 'shuffle' ? ' — 카드를 섞는 중' : ''}`}
          style={{ backgroundImage: `url(${cardRpsHd.cheese})`, backgroundPosition: `${HD_CHEESE_ORDER.indexOf(mood) / (HD_CHEESE_ORDER.length - 1) * 100}% 0` }} />
        : opponentAvatar ? <img className="pwp-rps-foe" src={opponentAvatar} alt={`${opponentName} 앞모습`} /> : <span className="pwp-rps-foe placeholder" aria-hidden="true" />}
    </div>
    {face && FACE_TEXT[face] && <span key={face} className={`pwp-rps-face ${face}`} role="img" aria-label={FACE_LABEL[face]}
      style={{ left: SEAT.x + L.opponentScale * .42, top: SEAT.bottomY - L.opponentScale * .98 }}><b>{FACE_TEXT[face]}</b></span>}
    {mode === 'waiting' && match && <span className="pwp-rps-speech" style={{ left: SEAT.x - L.opponentScale * .45, top: SEAT.bottomY - L.opponentScale * .72 }}>{match.opponent.submitted ? '다 골랐어요!' : '고르는 중…'}</span>}

    {/* 가운데 맞붙는 자리(설명서 2쪽의 탁자 가운데 판). */}
    <div className={`pwp-rps-mat ${result ? 'hidden' : ''}`} style={{ left: SEAT.x, top: L.rows.clash }} aria-hidden="true">
      {(anim ? beat?.stage === 'facedown' : mode !== 'result' && mode !== 'closed') && <b>{matText}</b>}
    </div>

    {/* 줄·가운데 카드: 위치·크기는 CSS 변수, 옮겨 가는 동작은 transition. */}
    <div className="pwp-rps-cards" aria-live="polite">
      {cards.map(card => {
        const spot = card.spot === 'row' ? rowSpot(card.side, card.index, anim!.round[card.side].length)
          : card.spot === 'arena' ? arenaSpot(card.side, arenaCount === 1)
            : (() => { const from = arenaSpot(card.side, false); const dir = card.side === 'a' ? -1 : 1; return { x: from.x + dir * 230, y: from.y - dir * 70, s: .8 }; })();
        const survivor = card.spot === 'arena' && arenaCount === 1 && !!beat && beat.stage !== 'flip' && beat.stage !== 'enter';
        return <TableCard key={`${anim!.kind}${anim!.index}-${card.side}${card.index}`} card={card} spot={spot} halo={card.mark === 'win' || survivor} />;
      })}
      {waitingMine.map((_, index) => <TableCard key={`wait-${index}`} card={{ side: 'a', index, hand: 'rock', spot: 'row', faceUp: false, mark: null, flipping: false }} spot={rowSpot('a', index, waitingMine.length)} halo={false} />)}
      {clash && <span key={`${anim!.index}-${beat!.clash}`} className={`pwp-rps-burst ${clash.result === 'draw' ? 'draw' : ''}`} role="img" aria-label="카드 충돌"
        style={{ left: SEAT.x, top: L.rows.clash, backgroundImage: `url(${cardRpsHd.fx})` }} />}
    </div>

    {/* 나: 앞쪽 아래, 뒷모습이 화면 아래 끝에 잘린다(설명서 2쪽의 플레이어 A). */}
    <div className={`pwp-rps-me-wrap ${result ? `result-${result}` : ''}`}>
      {avatar ? <img className="pwp-rps-me" src={avatar} alt="내 아바타 뒷모습" /> : <span className="pwp-rps-me placeholder" aria-hidden="true" />}
      {result === 'lose' && <span className="pwp-rps-face lose mine" role="img" aria-label="내가 울상이에요"><b>×.×</b></span>}
    </div>

    {banner && <div key={banner.text} className={`pwp-rps-banner ${banner.tone}`} role="status"><span>{banner.text}</span></div>}
  </>;
}

function TableCard({ card, spot, halo }: { card: RevealCard; spot: { x: number; y: number; s: number }; halo: boolean }) {
  const side = card.side === 'a' ? 'mine' : 'theirs';
  const label = card.faceUp ? `${card.side === 'a' ? '내' : '상대'} ${LABEL[card.hand]} 카드` : `${card.side === 'a' ? '내' : '상대'} 뒤집힌 카드`;
  return <span className={`pwp-rps-tcard ${side} spot-${card.spot} ${card.faceUp ? 'up' : 'down'} ${card.mark ? `mark-${card.mark}` : ''} ${card.flipping ? 'flipping' : ''}`}
    style={{ '--x': `${spot.x - TCARD_W / 2}px`, '--y': `${spot.y - TCARD_H / 2}px`, '--s': spot.s, width: TCARD_W, height: TCARD_H } as CSSProperties} role="img" aria-label={label}>
    <span className="pwp-rps-lift">
      {halo && <span className="pwp-rps-halo" aria-hidden="true" style={{ backgroundImage: `url(${cardRpsHd.fx})` }}><i /><i /><i /><i /></span>}
      <span className="pwp-rps-flip">
        <CardFace className="front" hand={card.hand} side={side} />
        <CardFace className="back" side={side} />
      </span>
    </span>
  </span>;
}

// ── 손패 쟁반: 누르면 "내가 낼 카드" 줄로, 줄에서 끌어 순서 바꾸기, 다시 누르면 손으로 ──
type DragSource = { kind: 'hand'; hand: RpsHand; handIndex: number } | { kind: 'queue'; index: number };
interface DragState {
  source: DragSource; pointerId: number; startX: number; startY: number; x: number; y: number;
  offsetX: number; offsetY: number; width: number; active: boolean; target: number | null; overHand: boolean;
}

function HandTray({ inventory, queue, setQueue, locked, note, onSubmit, canSubmit }: {
  inventory: RpsMatchView['me']['inventory']; queue: RpsHand[]; setQueue(update: (q: RpsHand[]) => RpsHand[]): void;
  locked: boolean; note: string | null; onSubmit(): void; canSubmit: boolean;
}) {
  const hand = handCards(inventory, queue);
  const total = inventoryTotal(inventory);
  const rowRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const slotsRef = useRef<{ x: number; y: number; h: number }[]>([]);
  const suppressClickUntil = useRef(0);
  const detach = useRef<(() => void) | null>(null);
  const tap = useCallback((source: DragSource) => {
    if (source.kind === 'hand') setQueue(q => addQueuedCard(q, source.hand, inventory[source.hand]));
    else setQueue(q => removeQueuedCard(q, source.index));
  }, [inventory, setQueue]);
  const latest = useRef({ tap, inventory }); latest.current = { tap, inventory };
  useEffect(() => () => detach.current?.(), []);
  useEffect(() => { if (locked) { detach.current?.(); dragRef.current = null; setDrag(null); } }, [locked]);

  const update = (next: DragState | null) => { dragRef.current = next; setDrag(next); };
  const onMove = (event: PointerEvent) => {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const moved = Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > DRAG_SLOP;
    if (!current.active && !moved) return;
    event.preventDefault();
    if (!current.active) {
      // 끌기 시작: 줄 카드들의 자리를 잰다(끄는 카드는 뺀다).
      slotsRef.current = [...(rowRef.current?.querySelectorAll<HTMLElement>('[data-queue-slot]') ?? [])]
        .filter(el => current.source.kind !== 'queue' || Number(el.dataset.queueSlot) !== current.source.index)
        .map(el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }; });
    }
    const row = rowRef.current?.getBoundingClientRect(), handBox = handRef.current?.getBoundingClientRect();
    const inside = (r: DOMRect | undefined, pad: number) => !!r && event.clientX >= r.left - pad && event.clientX <= r.right + pad && event.clientY >= r.top - pad && event.clientY <= r.bottom + pad;
    const overRow = inside(row, 28);
    const overHand = !overRow && current.source.kind === 'queue' && inside(handBox, 12);
    const target = overRow ? Math.min(dropIndex(slotsRef.current, event.clientX, event.clientY), slotsRef.current.length)
      : current.source.kind === 'queue' && !overHand ? current.source.index : null;
    update({ ...current, active: true, x: event.clientX, y: event.clientY, target, overHand });
  };
  const onEnd = (event: PointerEvent) => {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    detach.current?.();
    update(null);
    if (event.type === 'pointercancel') return;
    // 손가락·펜을 뗀 뒤 따라오는 click은 무시(키보드 Enter의 click만 받는다).
    suppressClickUntil.current = performance.now() + 600;
    const { tap: tapNow, inventory: inv } = latest.current;
    if (!current.active) { tapNow(current.source); return; }
    const source = current.source, target = current.target;
    if (source.kind === 'queue') {
      if (current.overHand) setQueue(q => removeQueuedCard(q, source.index));
      else if (target !== null) setQueue(q => moveQueuedCard(q, source.index, target));
    } else if (target !== null) setQueue(q => insertQueuedCard(q, source.hand, target, inv[source.hand]));
  };
  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>, source: DragSource) => {
    if (locked || (event.pointerType === 'mouse' && event.button !== 0) || dragRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    update({ source, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width, active: false, target: null, overHand: false });
    // 창 전체에서 듣는다: 끄는 동안 카드 요소가 줄 안에서 자리를 옮겨도 놓치지 않게.
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    detach.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      detach.current = null;
    };
  };
  const onClick = (source: DragSource) => { if (performance.now() < suppressClickUntil.current || locked) return; tap(source); };
  const onQueueKey = (event: ReactKeyboardEvent, index: number) => {
    if (locked) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setQueue(q => moveQueuedCard(q, index, index + (event.key === 'ArrowLeft' ? -1 : 1)));
    }
  };

  // 끄는 동안 미리 보기: 줄에 빈 자리(떨어질 곳)를 끼워 보여 준다.
  const dragging = drag?.active ? drag : null;
  type Slot = { kind: 'card'; hand: RpsHand; index: number } | { kind: 'hole' };
  let slots: Slot[] = queue.map((card, index) => ({ kind: 'card', hand: card, index }));
  if (dragging?.source.kind === 'queue') {
    const from = dragging.source.index;
    slots = slots.filter(slot => slot.kind !== 'card' || slot.index !== from);
    if (!dragging.overHand) slots.splice(dragging.target ?? from, 0, { kind: 'hole' });
  } else if (dragging?.source.kind === 'hand' && dragging.target !== null) slots.splice(dragging.target, 0, { kind: 'hole' });
  const hiddenHand = dragging?.source.kind === 'hand' ? dragging.source.handIndex : -1;
  const ghostHand = dragging ? dragging.source.kind === 'hand' ? dragging.source.hand : queue[dragging.source.index] : null;

  return <div className={`pwp-rps-handtray ${locked ? 'locked' : ''}`} data-dragging={dragging ? 'true' : undefined}>
    <div className="pwp-rps-tray-head">
      <b>내가 낼 카드 <em>{queue.length}장</em></b>
      <small>{note ?? (queue.length ? '끌어서 순서를 바꿔요 · 누르면 손으로' : `1장부터 ${total}장까지 원하는 만큼 골라요`)}</small>
    </div>
    <div ref={rowRef} className="pwp-rps-queue" role="list" aria-label="낼 카드 순서">
      {slots.length === 0 && <span className="pwp-rps-queue-empty">손에서 카드를 눌러 올려요</span>}
      {slots.map((slot, i) => slot.kind === 'hole'
        ? <span key="hole" className="pwp-rps-slot hole" aria-hidden="true"><i>{i + 1}</i></span>
        : <button key={`q${slot.index}`} type="button" role="listitem" className="pwp-rps-slot" data-queue-slot={slot.index} data-hand={slot.hand} disabled={locked}
          aria-label={`${i + 1}번째 ${LABEL[slot.hand]} — 누르면 손으로, 화살표로 순서 바꾸기`}
          onPointerDown={event => startDrag(event, { kind: 'queue', index: slot.index })} onClick={() => onClick({ kind: 'queue', index: slot.index })} onKeyDown={event => onQueueKey(event, slot.index)}>
          <CardFace hand={slot.hand} side="mine" /><i>{i + 1}</i>
        </button>)}
    </div>
    <div className="pwp-rps-tray-head hand"><b>내 손 <em>{hand.length}장</em></b></div>
    <div ref={handRef} className={`pwp-rps-hand ${dragging?.overHand ? 'drop' : ''}`} role="list" aria-label="내 손패">
      {hand.length === 0 && <span className="pwp-rps-queue-empty">{total === 0 ? '카드가 없어요' : '모두 올렸어요'}</span>}
      {hand.map((card, index) => <button key={`h${index}`} type="button" role="listitem" className={`pwp-rps-handcard ${index === hiddenHand ? 'lifted' : ''}`} data-hand={card} disabled={locked}
        aria-label={`${LABEL[card]} 카드 올리기`} onPointerDown={event => startDrag(event, { kind: 'hand', hand: card, handIndex: index })} onClick={() => onClick({ kind: 'hand', hand: card, handIndex: index })}>
        <CardFace hand={card} side="mine" />
      </button>)}
    </div>
    <PixelButton tone="gold" className="pwp-rps-submit" disabled={!canSubmit} onClick={onSubmit}>
      {canSubmit ? `${queue.length}장 내기!` : '내기'}
    </PixelButton>
    {dragging && ghostHand && <span className="pwp-rps-ghost" aria-hidden="true"
      style={{ left: dragging.x - dragging.offsetX, top: dragging.y - dragging.offsetY, width: dragging.width }}><CardFace hand={ghostHand} side="mine" /></span>}
  </div>;
}

function ShootoutTray({ disabled, waiting, again, onPick }: { disabled: boolean; waiting: boolean; again: boolean; onPick(hand: RpsHand): void }) {
  return <div className="pwp-rps-shootout">
    <div className="pwp-rps-tray-head"><b>{again ? '한 번 더! 한 장 골라요' : '승부차기! 한 장 골라요'}</b><small>{waiting ? '상대가 고르는 중…' : '둘 다 동시에 뒤집어요'}</small></div>
    <div className="pwp-rps-shoot-cards">
      {RPS_HANDS.map(hand => <button key={hand} type="button" className="pwp-rps-shoot-card" data-hand={hand} disabled={disabled} onClick={() => onPick(hand)} aria-label={`${LABEL[hand]} 내기`}>
        <CardFace hand={hand} side="mine" /><b>{LABEL[hand]}</b>
      </button>)}
    </div>
  </div>;
}

async function avatarFrame(appearance: PublicAvatarAppearance, pose: 'Idle_Front' | 'Idle_Back') {
  const sheet = await composeAvatar(appearance).canvas;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = AVATAR_FRAME;
  const ctx = canvas.getContext('2d'); if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, 0, AVATAR_POSES.indexOf(pose) * AVATAR_FRAME, AVATAR_FRAME, AVATAR_FRAME, 0, 0, AVATAR_FRAME, AVATAR_FRAME);
  // 그림이 있는 부분만 잘라 낸다(무대에서 키를 정확히 맞추려고).
  const { data } = ctx.getImageData(0, 0, AVATAR_FRAME, AVATAR_FRAME);
  let left = AVATAR_FRAME, top = AVATAR_FRAME, right = -1, bottom = -1;
  for (let y = 0; y < AVATAR_FRAME; y++) for (let x = 0; x < AVATAR_FRAME; x++) {
    if (data[(y * AVATAR_FRAME + x) * 4 + 3] < 16) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < 0) return canvas.toDataURL();
  const cut = document.createElement('canvas'); cut.width = right - left + 1; cut.height = bottom - top + 1;
  cut.getContext('2d')?.drawImage(canvas, left, top, cut.width, cut.height, 0, 0, cut.width, cut.height);
  return cut.toDataURL();
}

export function CardRpsRules({ onClose }: { onClose(): void }) {
  const [page, setPage] = useState(0);
  const images = [cardRpsAssets.rules1, cardRpsAssets.rules2];
  return <GameOverlay label="카드 대결 설명서" onCancel={onClose} className="pwp-rps-rules-screen"><div className="pwp-rps-rules">
    <header className="pwp-rps-rules-head"><b>카드 대결 설명서</b><button type="button" className="pwp-rps-close" aria-label="설명서 닫기" onClick={onClose}><span aria-hidden="true">✕</span></button></header>
    <div className="pwp-rps-rules-page">
      {images[page] ? <img src={images[page]} alt={`카드 가위바위보 설명서 ${page + 1}쪽`} /> : <div className="pwp-rps-rules-placeholder"><b>설명서 {page + 1}쪽</b><p>가위·바위·보 카드를 골라 순서대로 맞붙여 먼저 2승을 달성하세요.</p></div>}
    </div>
    <nav><PixelButton tone="wood" disabled={page === 0} onClick={() => setPage(0)}>◀ 이전</PixelButton><span>{page + 1} / 2</span><PixelButton tone="wood" disabled={page === 1} onClick={() => setPage(1)}>다음 ▶</PixelButton></nav>
  </div></GameOverlay>;
}

