import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { FURNITURE, ROOM_HEIGHT, ROOM_WIDTH, findSpawn, isCellFree, loadRoom, placeFurniture, planWalk, removeFurniture, saveRoom } from './model';
import type { Cell, FurnitureType, RoomState, StorageLike } from './model';
import { AvatarSprite, FurnitureSprite } from './sprites';
import './pixel-room.css';

export type Direction = 'Front' | 'Back' | 'Left' | 'Right';
const directions: Record<Direction, Cell> = { Front: { x: 0, y: 1 }, Back: { x: 0, y: -1 }, Left: { x: -1, y: 0 }, Right: { x: 1, y: 0 } };
const keys: Record<string, Direction> = { ArrowDown: 'Front', s: 'Front', ArrowUp: 'Back', w: 'Back', ArrowLeft: 'Left', a: 'Left', ArrowRight: 'Right', d: 'Right' };
const names: Record<FurnitureType, string> = { bed: '포근한 침대', desk: '나무 책상', chair: '작은 의자', bookshelf: '나의 책장', plant: '초록 화분', decoration: '작은 장식' };
const shirts = [{ id: 'default', label: '코랄', color: '#de7668' }, { id: 'blue', label: '블루', color: '#75a5d6' }, { id: 'sage', label: '그린', color: '#90b67c' }] as const;
const cells = Array.from({ length: ROOM_WIDTH * ROOM_HEIGHT }, (_, i) => ({ x: i % ROOM_WIDTH, y: Math.floor(i / ROOM_WIDTH) }));
type WalkStep = { cell: Cell; direction: Direction };
type Panel = 'clothes' | 'furniture';
function stepDirection(from: Cell, to: Cell): Direction {
  if (to.x > from.x) return 'Right';
  if (to.x < from.x) return 'Left';
  return to.y > from.y ? 'Front' : 'Back';
}
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
  const [walkQueue, setWalkQueue] = useState<WalkStep[]>([]);
  const [decorating, setDecorating] = useState(false);
  const [panel, setPanel] = useState<Panel>('clothes');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dpadOpen, setDpadOpen] = useState(false);
  const [selected, setSelected] = useState<FurnitureType | null>(null);
  const [message, setMessage] = useState('방의 바닥을 누르면 그 자리로 걸어가요.');
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

  // Tap-to-walk consumes one precomputed step per tick; re-fires itself as walkQueue shrinks by
  // one each render, so it self-terminates without a manual interval to tear down mid-walk.
  useEffect(() => {
    if (walkQueue.length === 0 || decorating || held) return;
    const [next, ...rest] = walkQueue;
    const timer = window.setTimeout(() => {
      setActor(previous => isCellFree(room, next.cell) ? next.cell : previous);
      setDirection(next.direction);
      setFrame(previous => (previous + 1) % 4);
      setWalkQueue(rest);
    }, 170);
    const stop = () => setWalkQueue([]);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', stop);
    return () => { clearTimeout(timer); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', stop); };
  }, [walkQueue, decorating, held, room]);

  function begin(next: Direction) { setWalkQueue([]); setDirection(next); setHeld(next); }
  function walkTo(target: Cell) {
    if (decorating || (target.x === actor.x && target.y === actor.y)) return;
    const path = planWalk(room, actor, target);
    if (path.length === 0) { setMessage('그 칸에는 갈 수 없어요. 가구가 없는 바닥을 눌러 주세요.'); return; }
    const steps: WalkStep[] = [];
    let from = actor;
    for (const cell of path) { steps.push({ cell, direction: stepDirection(from, cell) }); from = cell; }
    setHeld(null);
    setWalkQueue(steps);
  }
  // 꾸미기 모드에 진입/재진입할 때마다 시트를 가구 탭으로 열어 catalog가 바로 보이게 하고,
  // 나갈 때는 방을 다시 꽉 채워 보여주기 위해 시트도 함께 접는다.
  function enterDecorating() { setDecorating(true); setHeld(null); setWalkQueue([]); setPanel('furniture'); setSheetOpen(true); }
  function exitDecorating(nextMessage: string) { setDecorating(false); setSelected(null); setSheetOpen(false); setMessage(nextMessage); }
  function chooseCell(cell: Cell) {
    if (!decorating) { board.current?.focus({ preventScroll: true }); walkTo(cell); return; }
    if (!selected) {
      const item = room.furniture.find(item => cell.x >= item.x && cell.x < item.x + FURNITURE[item.type].width && cell.y >= item.y && cell.y < item.y + FURNITURE[item.type].height);
      if (item) { setSelected(item.type); setMessage(`${names[item.type]}: 새 칸을 누르면 이동해요.`); }
      else setMessage('아래에서 놓을 가구를 먼저 골라 주세요.');
      return;
    }
    const next = placeFurniture(room, selected, cell, actor);
    if (!next) { setMessage('가구와 캐릭터가 없는, 방 안의 빈 공간을 골라 주세요.'); return; }
    persist(next);
    exitDecorating(`${names[selected]} 배치 완료! 이제 방을 누르면 그 자리로 걸어가요.`);
  }
  const placed = selected && room.furniture.some(item => item.type === selected);
  function openPanel(next: Panel) { setSheetOpen(open => !(open && panel === next)); setPanel(next); }
  return <section className="pr-shell" aria-label="Pixel Room" style={roomStyle}>
    <h1 className="sr-only">나만의 Pixel Room</h1>
    <header className="pr-toolbar">
      <button className="rn-button rn-button-ghost" onClick={onExit}>← Reviewnote</button>
      <button className={`rn-button ${decorating ? 'rn-button-primary' : 'rn-button-secondary'}`} aria-pressed={decorating} onClick={() => {
        if (decorating) exitDecorating('방을 누르면 그 자리로 걸어가요.');
        else { enterDecorating(); setMessage('가구를 고르고 방의 원하는 칸을 눌러 주세요.'); }
      }}>{decorating ? '꾸미기 완료' : '꾸미기'}</button>
    </header>
    {storageError && <p className="pr-storage-error" role="alert">{storageError} 변경 내용은 현재 화면에서만 유지될 수 있어요.</p>}
    <div className={`pr-room-frame ${decorating ? 'pr-decorating' : ''}`}>
      {(displayName || title) && <div className="pr-nameplate" title="이 브라우저에 저장돼요">
        <span className="pr-nameplate-name">{displayName || '나'}</span>
        {title && <span className={`text-[10px] font-black border px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${titleBadgeStyle || ''}`}>{titleBadgeIcon && <span aria-hidden="true">{titleBadgeIcon}</span>}{title}</span>}
      </div>}
      <div className="pr-wall" aria-hidden="true"><div className="pr-window"><i /><i /><i /><i /></div><span>HOME, SWEET HOME</span></div>
      <div className="pr-stage">
        <div ref={board} className={`pr-board ${decorating ? 'pr-board-edit' : ''}`} tabIndex={0} role="group" aria-label="내 방. 바닥을 눌러 이동하거나 방향키/WASD로 이동" aria-describedby="pr-instructions"
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
          <button type="button" className="pr-actor" data-x={actor.x} data-y={actor.y} data-direction={direction} data-shirt={room.avatar.shirt} style={{ left: `${actor.x * 10 - 6}%`, bottom: `${(ROOM_HEIGHT - actor.y - 1) * 12.5}%`, zIndex: actor.y + 1, pointerEvents: decorating ? 'none' : 'auto' }} tabIndex={decorating ? -1 : 0} onClick={event => { event.stopPropagation(); speak(); }} aria-label={`내 캐릭터, ${actor.x + 1}열 ${actor.y + 1}행. 눌러서 말 걸어보기`}>
            {speech && <span className="pr-bubble" role="status">{speech}</span>}
            <span className="pr-shadow" /><AvatarSprite direction={direction} frame={held || walkQueue.length > 0 ? frame : 0} walking={!!held || walkQueue.length > 0} shirt={room.avatar.shirt} />
          </button>
        </div>
      </div>
      <div className="pr-threshold" aria-hidden="true" />
      {!decorating && <div className="pr-dpad-dock">
        {dpadOpen && <div className="pr-controls" aria-label="캐릭터 이동">{(['Back', 'Left', 'Front', 'Right'] as Direction[]).map(next => <button key={next} className={`pr-direction pr-direction-${next}`} aria-label={`${{ Back: '위', Front: '아래', Left: '왼쪽', Right: '오른쪽' }[next]}로 이동`} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); begin(next); }} onPointerUp={() => setHeld(null)} onPointerCancel={() => setHeld(null)} onLostPointerCapture={() => setHeld(null)} onBlur={() => setHeld(null)} onClick={event => {
          if (event.detail !== 0) return;
          setWalkQueue([]); setDirection(next); const delta = directions[next];
          setActor(previous => { const cell = { x: previous.x + delta.x, y: previous.y + delta.y }; return isCellFree(room, cell) ? cell : previous; });
        }}>{ { Back: '↑', Front: '↓', Left: '←', Right: '→' }[next]}</button>)}</div>}
        <button type="button" className="pr-dpad-toggle" aria-pressed={dpadOpen} onClick={() => setDpadOpen(open => !open)} aria-label={dpadOpen ? '방향키 숨기기' : '방향키로 이동하기'}>⛶</button>
      </div>}
    </div>
    <div className="pr-below-room"><p id="pr-instructions" className="pr-instructions" role="status">{message}</p></div>
    <div className="pr-sheet">
      <div className="pr-sheet-trigger">
        <button aria-pressed={sheetOpen && panel === 'clothes'} aria-expanded={sheetOpen && panel === 'clothes'} aria-controls="pr-sheet-panel" onClick={() => openPanel('clothes')}>옷</button>
        <button aria-pressed={sheetOpen && panel === 'furniture'} aria-expanded={sheetOpen && panel === 'furniture'} aria-controls="pr-sheet-panel" onClick={() => openPanel('furniture')}>가구 <small>6</small></button>
      </div>
      {sheetOpen && <div className="pr-sheet-panel" id="pr-sheet-panel">
        {/* Visual-only duplicate: the live region that actually announces changes stays the one
           in .pr-below-room (always mounted) — this one is just here because the sheet panel
           visually covers that region while open, per Codex review finding #10. */}
        <p className="pr-sheet-status" aria-hidden="true">{message}</p>
        {panel === 'clothes' ? <div className="pr-clothes"><div className="pr-portrait"><AvatarSprite direction="Front" frame={0} walking={false} shirt={room.avatar.shirt} /></div><div><h2>오늘은 어떤 색?</h2><p>가볍게 갈아입어 보세요.</p><div className="pr-swatches">{shirts.map(shirt => <button key={shirt.id} aria-pressed={room.avatar.shirt === shirt.id} onClick={() => { persist({ ...room, avatar: { ...room.avatar, shirt: shirt.id } }); setMessage(`${shirt.label} 옷으로 갈아입었어요.`); }}><i style={{ '--swatch': shirt.color } as CSSProperties} />{shirt.label}</button>)}</div></div></div>
          : <><p className="pr-tool-hint">{decorating ? '가구를 선택 → 방의 칸을 터치. 배치한 가구도 다시 옮길 수 있어요.' : '꾸미기를 켜면 가구를 놓고 옮길 수 있어요.'}</p><div className="pr-catalog">{(Object.keys(FURNITURE) as FurnitureType[]).map(type => <button key={type} aria-pressed={selected === type} onClick={() => { enterDecorating(); setSelected(selected === type ? null : type); setMessage(`${names[type]}: 원하는 칸을 눌러 주세요.`); }}><span className="pr-catalog-art"><FurnitureSprite type={type} /></span><strong>{names[type]}</strong><small>{room.furniture.some(item => item.type === type) ? '배치 중' : '보유 1개'}</small></button>)}</div>{placed && <button className="rn-button rn-button-secondary pr-remove" onClick={() => { persist(removeFurniture(room, selected)); exitDecorating(`${names[selected]}을 보관함으로 돌려놓았어요. 이제 방을 누르면 그 자리로 걸어가요.`); }}>선택한 가구 치우기</button>}</>}
      </div>}
    </div>
  </section>;
}
