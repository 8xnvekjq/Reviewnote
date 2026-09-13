import { useState } from 'react';
import { AvatarSprite, FurnitureSprite } from '../sprites';
import type { FurnitureType, RoomState } from '../model';
import type { usePixelShop } from '../usePixelShop';
import type { PixelAvatarSlot, PixelItem } from './types';
import { AVATAR_SLOTS, SLOT_LABELS } from './appearanceRows';

type Shop = ReturnType<typeof usePixelShop>;
interface Props { shop: Shop; setMessage: (message: string) => void; busy: boolean }
export function Wardrobe({ shop, setMessage, busy, onShop }: Props & { onShop: () => void }) {
  const [slot, setSlot] = useState<PixelAvatarSlot>('hair');
  const [back, setBack] = useState(false);
  const entries = shop.catalog.filter(item => item.category === 'avatar' && item.slot === slot && shop.ownedIds.has(item.itemId));
  return <div className="pr-wardrobe">
    <div className="pr-outfit-heading"><div className="pr-outfit-preview"><AvatarSprite direction={back ? 'Back' : 'Front'} frame={0} walking={false} appearance={shop.equipped} /></div><div><h2>오늘의 나, 새롭게</h2><p>헤어부터 신발까지 하나씩 골라 보세요.</p><button className="pr-preview-turn" onClick={() => setBack(!back)}>{back ? '앞모습 보기' : '뒷모습 보기'}</button></div></div>
    <div className="pr-category-tabs" aria-label="장착 부위">{AVATAR_SLOTS.map(key => <button key={key} aria-pressed={slot === key} onClick={() => setSlot(key)}>{SLOT_LABELS[key]}</button>)}</div>
    {!shop.ready || shop.loadError ? <p className="pr-tool-hint">{shop.loadError ? '장착 정보를 불러오지 못했어요.' : '장착 정보를 불러오는 중…'}</p> : <div className="pr-wardrobe-grid">
      {[null, ...entries].map(item => {
        const key = item?.assetKey ?? null;
        return <button key={item?.itemId ?? 'default'} aria-pressed={shop.equipped[slot] === key} disabled={busy || shop.mutating} onClick={async () => {
          const ok = await shop.equip(slot, item?.itemId ?? null);
          setMessage(ok ? `${item?.displayName ?? `기본 ${SLOT_LABELS[slot]}`} 장착 완료.` : '장착 확인에 실패했어요. 다시 불러온 뒤 시도해 주세요.');
        }}><span className="pr-item-avatar"><AvatarSprite direction="Front" frame={0} walking={false} appearance={{ ...shop.equipped, [slot]: key }} /></span><strong>{item?.displayName ?? `기본 ${SLOT_LABELS[slot]}`}</strong></button>;
      })}
    </div>}
    <button className="pr-preview-turn" onClick={onShop}>상점에서 다른 스타일 찾기 →</button>
  </div>;
}

export function ShopPanel({ shop, room, setMessage, busy, onPurchase, onPlace }: Props & { room: RoomState; onPurchase: (item: PixelItem) => Promise<void>; onPlace: (type: FurnitureType) => void }) {
  const [category, setCategory] = useState<string>('all');
  const [confirming, setConfirming] = useState<string | null>(null);
  const featured = ['hair_buns', 'top_vest', 'furniture_aquarium', 'hair_long', 'bottom_denim', 'shoes_low'];
  const rank = (item: PixelItem) => { const index = featured.indexOf(item.itemId); return index < 0 ? featured.length : index; };
  const filtered = shop.catalog.filter(item => category === 'all' || item.slot === category).sort((a, b) => rank(a) - rank(b));
  return <div className="pr-shop">
    <div className="pr-shop-heading"><div><h2>작은 변화, 나다운 공간</h2><p>직접 입어 본 모습으로 골라요.</p></div><p className="pr-shop-balance"><strong>{shop.balance.toLocaleString()}P</strong></p></div>
    <div className="pr-category-tabs" aria-label="상품 분류">{[['all', '전체'], ...AVATAR_SLOTS.map(slot => [slot, SLOT_LABELS[slot]]), ['furniture', '가구']].map(([key, label]) => <button key={key} aria-pressed={category === key} onClick={() => { setCategory(key); setConfirming(null); }}>{label}</button>)}</div>
    {!shop.ready ? <p role="status">구매 정보를 불러오는 중이에요…</p> : shop.loadError ? <div className="pr-shop-empty"><p>구매 정보를 불러오지 못했어요.</p><button className="rn-button rn-button-secondary" onClick={shop.reload}>다시 시도</button></div> : <div className="pr-shop-grid">{filtered.map(item => {
      const owned = shop.ownedIds.has(item.itemId);
      const avatar = item.category === 'avatar';
      const active = owned && (avatar ? shop.equipped[item.slot as PixelAvatarSlot] === item.assetKey : room.furniture.some(entry => entry.type === item.assetKey));
      const disabled = busy || shop.mutating;
      const short = Math.max(0, item.price - shop.balance);
      return <article key={item.itemId} data-item={item.itemId} className={`pr-shop-card ${active ? 'pr-shop-active' : ''} ${item.tier === 3 ? 'pr-shop-goal' : ''}`}>
        <span className="pr-item-kind">{avatar ? SLOT_LABELS[item.slot as PixelAvatarSlot] : item.tier === 3 ? '모으고 싶은 가구' : '가구'}</span>
        <span className={`pr-shop-art ${avatar ? 'pr-item-avatar' : ''}`} aria-hidden="true">{avatar ? <AvatarSprite direction="Front" frame={0} walking={false} appearance={{ ...shop.equipped, [item.slot]: item.assetKey }} /> : <FurnitureSprite type={item.assetKey as FurnitureType} />}</span>
        <strong className="pr-shop-name">{item.displayName}</strong>
        <span className="pr-shop-status">{owned ? (active ? avatar ? '장착 중' : '배치됨' : '보유 중') : `${item.price}P`}</span>
        {owned ? <button className="pr-shop-action" disabled={disabled || (avatar && active)} onClick={async () => {
          if (!avatar) { onPlace(item.assetKey as FurnitureType); return; }
          const ok = await shop.equip(item.slot as PixelAvatarSlot, item.itemId);
          setMessage(ok ? `${item.displayName} 장착 완료.` : '장착 확인에 실패했어요. 다시 시도해 주세요.');
        }}>{avatar ? active ? '장착 중' : '장착하기' : active ? '옮기기' : '방에 놓기'}</button> : short > 0 ? <span className="pr-shop-hint">{short}P 더 모으면 만나요</span> : confirming === item.itemId ? <div className="pr-shop-confirm"><p>{item.price}P로 구매하고 {avatar ? '바로 장착' : '방에 배치'}할까요?</p><div className="pr-shop-confirm-actions"><button disabled={disabled} onClick={async () => { await onPurchase(item); setConfirming(null); }}>{disabled ? '처리 중…' : '구매'}</button><button disabled={disabled} onClick={() => setConfirming(null)}>취소</button></div></div> : <button className="pr-shop-action" disabled={disabled} onClick={() => setConfirming(item.itemId)}>구매하기</button>}
      </article>;
    })}</div>}
  </div>;
}
