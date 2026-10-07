import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { usePixelShop } from '../../pixel-room/usePixelShop';
import type { usePet } from '../../pixel-room/pet/usePet';
import { isPetId } from '../../pixel-room/pet/petKinds';
import { PetPreview } from '../../pixel-room/pet/Companion';
import { AvatarSprite, FurnitureSprite } from '../../pixel-room/sprites';
import type { FurnitureType } from '../../pixel-room/model';
import type { PixelAvatarSlot, PixelItem } from '../../pixel-room/shop/types';
import { AVATAR_SLOTS, EYE_COLOR_OPTIONS, SKIN_TONE_OPTIONS, SLOT_LABELS } from '../../pixel-room/shop/appearanceRows';
import { itemState, panelItems, pointsShort } from '../logic/panels';
import type { PanelKind } from '../logic/panels';
import './panels.css';

// 실제 훅과 하네스가 같은 계약으로 데이터와 동작을 전달한다.
export interface PanelAdapter { shop: ReturnType<typeof usePixelShop>; pet: ReturnType<typeof usePet> }
export function PriceTag({ value }: { value: number }) {
  return <span className="pwp-price"><span className="pwp-coin" aria-hidden="true">P</span>{value.toLocaleString()}</span>;
}
function Tabs({ options, value, onChange }: { options: readonly (readonly [string, string])[]; value: string; onChange: (value: string) => void }) {
  return <nav className="pwp-tabs" aria-label="분류">{options.map(([key, label]) => <button type="button" key={key} aria-pressed={key === value} onClick={() => onChange(key)}>{label}</button>)}</nav>;
}
function Window({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="pwp-panel-shade" onPointerDown={event => event.stopPropagation()}>
    <div ref={box} className="pwp-window" role="dialog" aria-modal="true" aria-label={title} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const buttons = [...box.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}><header><h2>{title}</h2><button type="button" aria-label={`${title} 닫기`} onClick={onClose}>✕</button></header>{children}</div>
  </div>;
}
export function GamePanels({ kind, adapter: { shop, pet }, onClose }: { kind: PanelKind; adapter: PanelAdapter; onClose: () => void }) {
  const [category, setCategory] = useState('all');
  const [slot, setSlot] = useState('hair');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(''), 5000); return () => window.clearTimeout(timer); }, [message]);
  const busy = pending || shop.mutating || pet.busy;
  async function act(action: () => Promise<string>) {
    if (lock.current || busy) return;
    lock.current = true; setPending(true);
    try { const result = await action(); if (mounted.current) setMessage(result); }
    catch { if (mounted.current) setMessage('저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { lock.current = false; if (mounted.current) { setPending(false); setConfirming(null); } }
  }
  const changePet = (id: string | null) => act(async () => {
    if (id !== null && !isPetId(id)) return '이 친구를 선택할 수 없어요.';
    return await pet.activate(id) ? '함께할 친구를 바꿨어요.' : '펫 설정을 저장하지 못했어요.';
  });
  const art = (item: PixelItem) => item.category === 'avatar'
    ? <AvatarSprite direction="Front" frame={0} walking={false} appearance={{ ...shop.equipped, [item.slot]: item.assetKey }} />
    : item.category === 'pet' ? <PetPreview pet={item.itemId} /> : <FurnitureSprite type={item.assetKey as FurnitureType} />;
  const entries = panelItems(shop.catalog, kind === 'shop' ? category : slot, kind === 'wardrobe' ? shop.ownedIds : undefined);
  return <Window title={kind === 'shop' ? '상점' : '옷장'} onClose={onClose}>
    <div className="pwp-panel-summary">{kind === 'shop' ? <><span>마음에 드는 스타일을 골라요.</span><PriceTag value={shop.balance} /></> : <><div className="pwp-preview"><AvatarSprite direction="Front" frame={0} walking={false} appearance={shop.equipped} /></div><span>오늘의 나 · 바꾸면 바로 보여요.</span></>}</div>
    <Tabs options={kind === 'shop' ? [['all', '전체'], ...AVATAR_SLOTS.map(key => [key, SLOT_LABELS[key]] as const), ['furniture', '가구'], ['pet', '펫']] : [...AVATAR_SLOTS.map(key => [key, SLOT_LABELS[key]] as const), ['base', '기본 외형'], ['pet', '펫']]} value={kind === 'shop' ? category : slot} onChange={value => { if (kind === 'shop') setCategory(value); else setSlot(value); setConfirming(null); }} />
    <div className="pwp-panel-content">
      {!shop.ready ? <p role="status">보유 정보를 불러오는 중…</p> : shop.loadError ? <div role="alert"><p>보유 정보를 불러오지 못했어요.</p><button onClick={shop.reload}>다시 시도</button></div> : kind === 'wardrobe' && slot === 'base' ? <>
        <p>피부색과 눈동자색은 무료예요.</p>
        {([['skin', '피부색', SKIN_TONE_OPTIONS, 'tan'], ['eyes', '눈동자색', EYE_COLOR_OPTIONS, 'navy']] as const).map(([key, label, options, fallback]) => <section key={key}><h3>{label}</h3><div className="pwp-options">{options.map(option => <button key={option.key} aria-pressed={(shop.equipped[key] ?? fallback) === option.key} disabled={busy} onClick={() => void act(async () => {
          const value = option.key === fallback ? null : option.key;
          return await shop.setBaseAppearance(key === 'skin' ? value : shop.equipped.skin, key === 'eyes' ? value : shop.equipped.eyes) ? `${label}을 바꿨어요.` : '외형을 저장하지 못했어요.';
        })}>{option.label}</button>)}</div></section>)}
      </> : <div className="pwp-item-grid">
        {kind === 'wardrobe' && <button className="pwp-item" disabled={busy || (slot === 'pet' && (!pet.ready || pet.error))} aria-pressed={slot === 'pet' ? pet.active === null : shop.equipped[slot as PixelAvatarSlot] === null} onClick={() => slot === 'pet' ? void changePet(null) : void act(async () => await shop.equip(slot as PixelAvatarSlot, null) ? '기본 모습으로 바꿨어요.' : '장착하지 못했어요.')}><strong>{slot === 'pet' ? '친구 쉬게 하기' : `기본 ${SLOT_LABELS[slot as PixelAvatarSlot]}`}</strong></button>}
        {entries.map(item => {
          const state = itemState(item, shop.ownedIds, shop.equipped, pet.active);
          const short = pointsShort(item.price, shop.balance);
          const disabled = busy || (item.category === 'pet' && (!pet.ready || pet.error));
          return <article className="pwp-item" key={item.itemId} data-item={item.itemId} data-state={state}>
            <div className="pwp-item-art" aria-hidden="true">{art(item)}</div><strong>{item.displayName}</strong>
            {state !== 'available' ? <><span>{state === 'equipped' ? '장착 중' : '보유 중'}</span>{item.category === 'furniture' ? <span>집에서 배치할 수 있어요.</span> : <button disabled={disabled || state === 'equipped'} onClick={() => item.category === 'pet' ? void changePet(item.itemId) : void act(async () => await shop.equip(item.slot as PixelAvatarSlot, item.itemId) ? '장착했어요.' : '장착하지 못했어요.')}>{state === 'equipped' ? '장착 중' : item.category === 'pet' ? '함께 살기' : '장착하기'}</button>}</>
              : <><PriceTag value={item.price} />{short > 0 ? <span className="pwp-short">{short.toLocaleString()}P 더 필요해요.</span> : confirming === item.itemId ? <><span>구매할까요?</span><button disabled={disabled} onClick={() => void act(async () => {
                const result = await shop.purchase(item);
                if (!result.ok) return result.reason === 'insufficient_balance' ? '포인트가 부족해요.' : result.message;
                if (item.category === 'pet' && isPetId(item.itemId) && !await pet.activate(item.itemId)) return '구매 완료! 펫은 옷장에서 다시 선택해 주세요.';
                return result.equipFailed ? '구매 완료! 옷장에서 다시 장착해 주세요.' : `${item.displayName} 구매 완료!`;
              })}>구매 확정</button><button disabled={busy} onClick={() => setConfirming(null)}>취소</button></> : <button disabled={disabled} onClick={() => setConfirming(item.itemId)}>구매하기</button>}</>}
          </article>;
        })}
        {entries.length === 0 && <p>아직 보유한 아이템이 없어요.</p>}
      </div>}
      {pet.error && <p role="alert">펫 정보를 확인하지 못했어요. <button onClick={pet.reload}>다시 확인</button></p>}
    </div>
    {message && <div className="pwp-toast" role="status" aria-live="polite">{message}</div>}
  </Window>;
}
