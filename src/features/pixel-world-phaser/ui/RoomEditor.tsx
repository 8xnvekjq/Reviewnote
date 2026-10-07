import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { Cell, FurnitureType, Placement } from '../../pixel-room/model';
import type { WorldGameHandle } from '../game/boot';
import type { PanelAdapter } from './GamePanels';
import { PanelArt } from './PanelArt';
import { moveFurniture, ownedFurniture, snapRoomPoint } from '../logic/roomEditing';
import { FURNITURE_NAMES } from '../logic/roomLines';

interface Props {
  game: WorldGameHandle;
  furniture: readonly Placement[];
  shop: PanelAdapter['shop'];
  save: (layout: Placement[]) => Promise<void>;
  onClose: () => void;
}
type Drag = { id: number; start: Cell; item: Placement; before: Placement[] };

export function RoomEditor({ game, furniture, shop, save, onClose }: Props) {
  const [layout, setLayout] = useState<Placement[]>(() => furniture.map(item => ({ ...item })));
  const draft = useRef(layout); draft.current = layout;
  const [selected, setSelected] = useState<FurnitureType | null>(null);
  const [message, setMessage] = useState('가구를 누르거나 끌어서 옮겨 주세요.');
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const alive = useRef(true);
  const drag = useRef<Drag | null>(null);
  const items = ownedFurniture(shop.catalog, shop.ownedIds);
  const owned = new Set(items.map(item => item.assetKey as FurnitureType));
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement as HTMLElement | null;
    done.current?.focus();
    return () => { alive.current = false; game.previewFurniture(null); previous?.focus(); };
  }, [game]);
  useEffect(() => { game.previewFurniture(layout, selected); }, [game, layout, selected]);

  const change = (next: Placement[]) => { draft.current = next; setLayout(next); };
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return game.roomEditPoint(event.clientX - rect.left, event.clientY - rect.top);
  };
  const place = (type: FurnitureType, cell: Cell, actor: Cell) => {
    const current = draft.current.find(item => item.type === type);
    if (current?.x === cell.x && current?.y === cell.y) return;
    const next = moveFurniture(draft.current, type, cell, owned, actor);
    if (next) { change(next); setMessage(`${FURNITURE_NAMES[type]}을 옮겼어요.`); }
    else setMessage('방 안의 빈 칸에 놓아 주세요. 캐릭터가 있는 칸에는 놓을 수 없어요.');
  };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (saving.current || drag.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const at = point(event);
    if (!at) return;
    event.preventDefault();
    if (at.item) {
      setSelected(at.item.type);
      drag.current = { id: event.pointerId, start: at.point, item: at.item, before: draft.current };
      event.currentTarget.setPointerCapture(event.pointerId);
    } else if (selected) place(selected, snapRoomPoint(at.point), at.actor);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const held = drag.current, at = point(event);
    if (!held || held.id !== event.pointerId || !at || saving.current) return;
    place(held.item.type, { x: held.item.x + Math.round(at.point.x - held.start.x),
      y: held.item.y + Math.round(at.point.y - held.start.y) }, at.actor);
  };
  const release = (event: PointerEvent<HTMLDivElement>, cancel: boolean) => {
    const held = drag.current;
    if (!held || held.id !== event.pointerId) return;
    if (cancel) change(held.before);
    else move(event);
    drag.current = null;
  };
  async function finish() {
    if (saving.current || drag.current) return;
    saving.current = true; setPending(true);
    const next = draft.current.map(item => ({ ...item }));
    try {
      await save(next);
      if (!alive.current) return;
      game.previewFurniture(null);
      game.setFurniture(next);
      onClose();
    } catch (error) {
      if (alive.current) setMessage(error instanceof Error ? error.message : '저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      saving.current = false;
      if (alive.current) setPending(false);
    }
  }
  const placed = layout.find(item => item.type === selected);
  return <div className="pwp-room-editor" role="dialog" aria-modal="true" aria-label="내 방 꾸미기"
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape' && !saving.current) onClose();
      if (event.key === 'Tab') {
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        if (!buttons.length) { event.preventDefault(); return; }
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    <div className="pwp-room-edit-surface" data-testid="room-edit-surface" onPointerDown={down} onPointerMove={move}
      onPointerUp={event => release(event, false)} onPointerCancel={event => release(event, true)}
      onLostPointerCapture={event => release(event, true)} />
    <header className="pwp-room-edit-toolbar"><strong>내 방 꾸미기</strong>
      <button type="button" disabled={pending} onClick={onClose}>취소</button>
      <button ref={done} type="button" disabled={pending} onClick={() => void finish()}>{pending ? '저장 중…' : '완료'}</button>
    </header>
    <footer className="pwp-room-edit-inventory">
      <p role="status" aria-live="polite">{message}</p>
      <div className="pwp-room-edit-actions">
        <button type="button" disabled={pending || !placed} onClick={() => {
          change(draft.current.filter(item => item.type !== selected));
          setMessage('가구를 보관함으로 돌려놓았어요.');
        }}>보관함에 넣기</button>
        {([['←', -1, 0, '왼쪽으로'], ['↑', 0, -1, '위로'], ['↓', 0, 1, '아래로'], ['→', 1, 0, '오른쪽으로']] as const).map(([label, x, y, name]) =>
          <button key={name} type="button" aria-label={`${name} 한 칸`} disabled={pending || !selected} onClick={() => {
            const actor = game.roomEditPoint(0, 0)?.actor;
            if (selected && actor) place(selected, { x: (placed?.x ?? 0) + x, y: (placed?.y ?? 0) + y }, actor);
          }}>{label}</button>)}
      </div>
      <div className="pwp-room-edit-strip pwp-panel-content" aria-label="보유 가구">
        {items.map(item => {
          const type = item.assetKey as FurnitureType;
          return <button key={item.itemId} type="button" data-room-item={type} aria-pressed={selected === type} disabled={pending}
            onClick={() => { setSelected(type); setMessage(`${FURNITURE_NAMES[type]}: 원하는 빈 칸을 눌러 주세요.`); }}>
            <span><PanelArt furniture={type} /></span><strong>{FURNITURE_NAMES[type]}</strong>
            <small>{layout.some(item => item.type === type) ? '배치 중' : '보관 중'}</small>
          </button>;
        })}
        {!items.length && <p>상점에서 구매한 가구를 여기에 보관해요.</p>}
      </div>
    </footer>
  </div>;
}
