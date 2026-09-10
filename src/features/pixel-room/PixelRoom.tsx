import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { FURNITURE, ROOM_HEIGHT, ROOM_WIDTH, findSpawn, isCellFree, loadRoom, placeFurniture, removeFurniture, saveRoom } from './model';
import type { Cell, FurnitureType, RoomState, StorageLike } from './model';
import { AvatarSprite, FurnitureSprite } from './sprites';
import './pixel-room.css';

export type Direction = 'Front' | 'Back' | 'Left' | 'Right';
const directions: Record<Direction, Cell> = { Front: { x: 0, y: 1 }, Back: { x: 0, y: -1 }, Left: { x: -1, y: 0 }, Right: { x: 1, y: 0 } };
const keys: Record<string, Direction> = { ArrowDown: 'Front', s: 'Front', ArrowUp: 'Back', w: 'Back', ArrowLeft: 'Left', a: 'Left', ArrowRight: 'Right', d: 'Right' };
const names: Record<FurnitureType, string> = { bed: '포근한 침대', desk: '나무 책상', chair: '작은 의자', bookshelf: '나의 책장', plant: '초록 화분', decoration: '작은 장식' };
const shirts = [{ id: 'default', label: '코랄', color: '#de7668' }, { id: 'blue', label: '블루', color: '#75a5d6' }, { id: 'sage', label: '그린', color: '#90b67c' }] as const;
const cells = Array.from({ length: ROOM_WIDTH * ROOM_HEIGHT }, (_, i) => ({ x: i % ROOM_WIDTH, y: Math.floor(i / ROOM_WIDTH) }));
function browserStorage(): StorageLike | undefined { try { return window.localStorage; } catch { return undefined; } }
// 장착 칭호/말투/테마는 새 프로필을 만들지 않고 기존 equipped state를 재사용한다. 단, 이 파일은
// gachaCatalog/aiVoiceCheers를 직접 import하지 않는다 — 그 모듈은 App.tsx(항상 로드됨)에도 이미
// 쓰이는데, 지연 로드되는 이 Pixel Room 청크에서 다시 import하면 번들러가 두 진입점 모두에 코드를
// 포함시켜 메인 번들이 커진다(실측: gzip +5KB). 그래서 App.tsx가 이미 계산해둔 결과값(문구/배지
// 스타일/색상)만 plain prop으로 받는다 — 전체 앱 테마(applyThemeColor)는 여기서 절대 호출하지 않는다.
interface Props {
  userId?: string; displayName?: string; onExit: () => void;
  title?: string; titleBadgeStyle?: string; titleBadgeIcon?: string;
  themePrimary?: string; themeAccent?: string;
  onSpeak?: () => string;
}

/** Keyed at the identity boundary: even a direct A → B switch starts from B's snapshot. */
export default function PixelRoom(props: Props) {
  const { userId, onExit } = props;
  if (!userId?.trim()) return <section className="pr-login"><p>로그인 후 내 방에 들어올 수 있어요.</p><button className="rn-button rn-button-secondary" onClick={onExit}>← Reviewnote</button></section>;
  return <RoomForUser key={userId} {...props} userId={userId} />;
}

function RoomForUser({ userId, displayName, onExit, title, titleBadgeStyle, titleBadgeIcon, themePrimary, themeAccent, onSpeak }: Props & { userId: string }) {
  const [initial] = useState(() => loadRoom(userId, browserStorage()));
  const [room, setRoom] = useState(initial.state);
  const [actor, setActor] = useState(() => findSpawn(initial.state) ?? { x: 0, y: 7 });
  const [direction, setDirection] = useState<Direction>('Front');
  const [frame, setFrame] = useState(0);
  const [held, setHeld] = useState<Direction | null>(null);
  const [decorating, setDecorating] = useState(false);
  const [panel, setPanel] = useState<'clothes' | 'furniture'>('clothes');
  const [selected, setSelected] = useState<FurnitureType | null>(null);
  const [message, setMessage] = useState('방을 눌러 방향키로 걷거나, 아래 이동 버튼을 사용해 보세요.');
  const [storageError, setStorageError] = useState(initial.ok ? '' : initial.error);
  const [speech, setSpeech] = useState('');
  const board = useRef<HTMLDivElement>(null);
  const speechTimer = useRef<number | undefined>(undefined);

  // 장착 테마는 전체 앱 테마(applyThemeColor)를 건드리지 않고, room 안 CSS 변수로만 좁혀서 반영한다.
  const roomStyle = themePrimary ? ({ '--pr-theme-primary': themePrimary, '--pr-theme-accent': themeAccent || themePrimary } as CSSProperties) : undefined;

  function speak() {
    if (!onSpeak) return;
    window.clearTimeout(speechTimer.current);
    setSpeech(onSpeak());
    speechTimer.current = window.setTimeout(() => setSpeech(''), 3200);
  }
  useEffect(() => () => window.clearTimeout(speechTimer.current), []);

  function persist(next: RoomState) {
    setRoom(next);
    const result = saveRoom(userId, next, browserStorage());
    setStorageError(result.ok ? '' : result.error);
  }
  // A single timer runs only during input. No animation loop remains after exit/blur.
  useEffect(() => {
    if (!held || decorating) return;
    function step() {
      const delta = directions[held!];
      setActor(previous => {
        const next = { x: previous.x + delta.x, y: previous.y + delta.y };
        return isCellFree(room, next) ? next : previous;
      });
      setFrame(previous => (previous + 1) % 4);
    }
    step();
    const timer = window.setInterval(step, 170);
    const stop = () => setHeld(null);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', stop);
    return () => { clearInterval(timer); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', stop); };
  }, [held, decorating, room]);

  function begin(next: Direction) { setDirection(next); setHeld(next); }
  function chooseCell(cell: Cell) {
    if (!decorating) { board.current?.focus({ preventScroll: true }); return; }
    if (!selected) {
      const item = room.furniture.find(item => cell.x >= item.x && cell.x < item.x + FURNITURE[item.type].width && cell.y >= item.y && cell.y < item.y + FURNITURE[item.type].height);
      if (item) { setSelected(item.type); setMessage(`${names[item.type]}: 새 칸을 누르면 이동해요.`); }
      else setMessage('아래에서 놓을 가구를 먼저 골라 주세요.');
      return;
    }
    const next = placeFurniture(room, selected, cell, actor);
    if (!next) { setMessage('가구와 캐릭터가 없는, 방 안의 빈 공간을 골라 주세요.'); return; }
    persist(next);
    setMessage(`${names[selected]} 배치 완료. 다른 칸을 누르면 이동해요.`);
  }
  const placed = selected && room.furniture.some(item => item.type === selected);
  return <section className="pr-shell" aria-label="Pixel Room" style={roomStyle}>
    <header className="pr-toolbar">
      <button className="rn-button rn-button-ghost" onClick={onExit}>← Reviewnote</button>
      <button className={`rn-button ${decorating ? 'rn-button-primary' : 'rn-button-secondary'}`} aria-pressed={decorating} onClick={() => {
        setDecorating(!decorating); setHeld(null); setSelected(null); setPanel('furniture');
        setMessage(decorating ? '방을 누르면 다시 걸을 수 있어요.' : '가구를 고르고 방의 원하는 칸을 눌러 주세요.');
      }}>{decorating ? '꾸미기 완료' : '꾸미기'}</button>
    </header>
    <div className="pr-heading"><div><p className="rn-eyebrow">MY LITTLE CORNER · EXPERIMENT</p><h1>나만의 Pixel Room</h1></div><span className="pr-badge">작은 쉼표</span></div>
    {title && <p className={`pr-title-badge text-[10px] font-black border px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${titleBadgeStyle || ''}`}>{titleBadgeIcon && <span aria-hidden="true">{titleBadgeIcon}</span>}{title}</p>}
    <p className="pr-owner">{displayName || '나'}의 방 <span>· 이 브라우저에 저장돼요</span></p>
    <div className="pr-room-frame">
      <div className="pr-wall" aria-hidden="true"><div className="pr-window"><i /><i /><i /><i /></div><span>HOME, SWEET HOME</span></div>
      <div ref={board} className={`pr-board ${decorating ? 'pr-board-edit' : ''}`} tabIndex={0} role="group" aria-label="내 방. 방향키 또는 WASD로 이동" aria-describedby="pr-instructions"
        onKeyDown={event => {
          if (event.target !== event.currentTarget || decorating || event.altKey || event.ctrlKey || event.metaKey) return;
          const next = keys[event.key.length === 1 ? event.key.toLowerCase() : event.key];
          if (next) { event.preventDefault(); if (!event.repeat) begin(next); }
        }} onKeyUp={event => {
          const next = keys[event.key.length === 1 ? event.key.toLowerCase() : event.key];
          if (next && event.target === event.currentTarget) { event.preventDefault(); if (held === next) setHeld(null); }
        }} onBlur={() => setHeld(null)}>
        <div className="pr-grid">{cells.map(cell => <button key={`${cell.x}-${cell.y}`} type="button" tabIndex={decorating ? 0 : -1} aria-label={`${cell.x + 1}열 ${cell.y + 1}행에 배치`} onClick={() => chooseCell(cell)} />)}</div>
        {room.furniture.map(item => <div key={item.type} data-furniture={item.type} className={`pr-furniture ${selected === item.type ? 'pr-selected' : ''}`} style={{ left: `${item.x * 10}%`, top: `${item.y * 12.5}%`, width: `${FURNITURE[item.type].width * 10}%`, height: `${FURNITURE[item.type].height * 12.5}%`, zIndex: item.y + FURNITURE[item.type].height }}><FurnitureSprite type={item.type} /></div>)}
        <button type="button" className="pr-actor" data-x={actor.x} data-y={actor.y} data-direction={direction} data-shirt={room.avatar.shirt} style={{ left: `${actor.x * 10 - 5}%`, bottom: `${(ROOM_HEIGHT - actor.y - 1) * 12.5}%`, zIndex: actor.y + 1, pointerEvents: decorating ? 'none' : 'auto' }} tabIndex={decorating ? -1 : 0} onClick={event => { event.stopPropagation(); speak(); }} aria-label={`내 캐릭터, ${actor.x + 1}열 ${actor.y + 1}행. 눌러서 말 걸어보기`}>
          {speech && <span className="pr-bubble" role="status">{speech}</span>}
          <span className="pr-shadow" /><AvatarSprite direction={direction} frame={held ? frame : 0} walking={!!held} shirt={room.avatar.shirt} />
        </button>
      </div>
      <div className="pr-threshold" aria-hidden="true" />
    </div>
    <div className="pr-below-room">
      <p id="pr-instructions" className="pr-instructions" role="status">{message}</p>
      {!decorating && <div className="pr-controls" aria-label="캐릭터 이동">{(['Back', 'Left', 'Front', 'Right'] as Direction[]).map(next => <button key={next} className={`pr-direction pr-direction-${next}`} aria-label={`${{ Back: '위', Front: '아래', Left: '왼쪽', Right: '오른쪽' }[next]}로 이동`} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); begin(next); }} onPointerUp={() => setHeld(null)} onPointerCancel={() => setHeld(null)} onLostPointerCapture={() => setHeld(null)} onBlur={() => setHeld(null)} onClick={event => {
        if (event.detail !== 0) return;
        setDirection(next); const delta = directions[next];
        setActor(previous => { const cell = { x: previous.x + delta.x, y: previous.y + delta.y }; return isCellFree(room, cell) ? cell : previous; });
      }}>{ { Back: '↑', Front: '↓', Left: '←', Right: '→' }[next]}</button>)}</div>}
    </div>
    <div className="pr-tools">
      <div className="pr-tabs" aria-label="꾸미기 도구"><button aria-pressed={panel === 'clothes'} onClick={() => setPanel('clothes')}>옷</button><button aria-pressed={panel === 'furniture'} onClick={() => setPanel('furniture')}>가구 <small>6</small></button></div>
      {panel === 'clothes' ? <div className="pr-clothes"><div className="pr-portrait"><AvatarSprite direction="Front" frame={0} walking={false} shirt={room.avatar.shirt} /></div><div><h2>오늘은 어떤 색?</h2><p>가볍게 갈아입어 보세요.</p><div className="pr-swatches">{shirts.map(shirt => <button key={shirt.id} aria-pressed={room.avatar.shirt === shirt.id} onClick={() => { persist({ ...room, avatar: { ...room.avatar, shirt: shirt.id } }); setMessage(`${shirt.label} 옷으로 갈아입었어요.`); }}><i style={{ '--swatch': shirt.color } as CSSProperties} />{shirt.label}</button>)}</div></div></div>
        : <><p className="pr-tool-hint">{decorating ? '가구를 선택 → 방의 칸을 터치. 배치한 가구도 다시 옮길 수 있어요.' : '꾸미기를 켜면 가구를 놓고 옮길 수 있어요.'}</p><div className="pr-catalog">{(Object.keys(FURNITURE) as FurnitureType[]).map(type => <button key={type} aria-pressed={selected === type} onClick={() => { setDecorating(true); setHeld(null); setSelected(selected === type ? null : type); setMessage(`${names[type]}: 원하는 칸을 눌러 주세요.`); }}><span className="pr-catalog-art"><FurnitureSprite type={type} /></span><strong>{names[type]}</strong><small>{room.furniture.some(item => item.type === type) ? '배치 중' : '보유 1개'}</small></button>)}</div>{placed && <button className="rn-button rn-button-secondary pr-remove" onClick={() => { persist(removeFurniture(room, selected)); setMessage(`${names[selected]}을 보관함으로 돌려놓았어요.`); setSelected(null); }}>선택한 가구 치우기</button>}</>}
    </div>
    {storageError && <p className="pr-storage-error" role="alert">{storageError} 변경 내용은 현재 화면에서만 유지될 수 있어요.</p>}
    <p className="pr-footnote">실험실의 작은 방 · 모든 옷과 가구는 자유롭게 사용해요.<br />저장은 이 계정·이 브라우저에만 적용되며 다른 기기와 동기화되지 않아요.</p>
  </section>;
}
