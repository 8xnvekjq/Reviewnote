import { useState } from 'react';
import { AvatarSprite, FurnitureSprite } from '../sprites';
import type { FurnitureType, RoomState } from '../model';
import type { usePixelShop } from '../usePixelShop';
import type { PixelAvatarSlot, PixelItem } from './types';
import { AVATAR_SLOTS, EYE_COLOR_OPTIONS, SKIN_TONE_OPTIONS, SLOT_LABELS } from './appearanceRows';

type Shop = ReturnType<typeof usePixelShop>;
interface Props { shop: Shop; setMessage: (message: string) => void; busy: boolean }
// 장착 아이템(상의/하의/신발/헤어) 탭 + 무료 기본 appearance('base') 탭 — 상점 카탈로그가 없는
// 탭이라 PixelAvatarSlot이 아니라 이 파일 안에서만 쓰는 별도 유니언으로 둔다.
type WardrobeTab = PixelAvatarSlot | 'base';
export function Wardrobe({ shop, setMessage, busy, onShop }: Props & { onShop: () => void }) {
  const [tab, setTab] = useState<WardrobeTab>('hair');
  const [back, setBack] = useState(false);
  const entries = tab === 'base' ? [] : shop.catalog.filter(item => item.category === 'avatar' && item.slot === tab && shop.ownedIds.has(item.itemId));
  return <div className="pr-wardrobe">
    <div className="pr-outfit-heading"><div className="pr-outfit-preview"><AvatarSprite direction={back ? 'Back' : 'Front'} frame={0} walking={false} appearance={shop.equipped} /></div><div><h2>오늘의 나, 새롭게</h2><p>헤어부터 신발까지 하나씩 골라 보세요.</p><button className="pr-preview-turn" onClick={() => setBack(!back)}>{back ? '앞모습 보기' : '뒷모습 보기'}</button></div></div>
    <div className="pr-category-tabs" aria-label="장착 부위">{AVATAR_SLOTS.map(key => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{SLOT_LABELS[key]}</button>)}<button aria-pressed={tab === 'base'} onClick={() => setTab('base')}>기본 외형</button></div>
    {!shop.ready || shop.loadError ? <p className="pr-tool-hint">{shop.loadError ? '장착 정보를 불러오지 못했어요.' : '장착 정보를 불러오는 중…'}</p>
      : tab === 'base' ? <BaseAppearancePicker shop={shop} setMessage={setMessage} busy={busy} />
      : <div className="pr-wardrobe-grid">
      {[null, ...entries].map(item => {
        const key = item?.assetKey ?? null;
        return <button key={item?.itemId ?? 'default'} aria-pressed={shop.equipped[tab] === key} disabled={busy || shop.mutating} onClick={async () => {
          const ok = await shop.equip(tab, item?.itemId ?? null);
          setMessage(ok ? `${item?.displayName ?? `기본 ${SLOT_LABELS[tab]}`} 장착 완료.` : '장착 확인에 실패했어요. 다시 불러온 뒤 시도해 주세요.');
        }}><span className="pr-item-avatar"><AvatarSprite direction="Front" frame={0} walking={false} appearance={{ ...shop.equipped, [tab]: key }} /></span><strong>{item?.displayName ?? `기본 ${SLOT_LABELS[tab]}`}</strong></button>;
      })}
    </div>}
    <button className="pr-preview-turn" onClick={onShop}>상점에서 다른 스타일 찾기 →</button>
  </div>;
}

// 피부색/눈동자색 — 구매/소유 없이 무료로 바로 바뀐다. 눈동자색은 실제 캐릭터에서는 작아서 잘
// 안 보이므로, 확대한 얼굴 미리보기를 따로 둔다(요청사항: "확대 preview에서 확인 가능하면 충분").
function BaseAppearancePicker({ shop, setMessage, busy }: Props) {
  const disabled = busy || shop.mutating;
  return <div className="pr-base-appearance">
    <div className="pr-face-zoom" aria-hidden="true"><AvatarSprite direction="Front" frame={0} walking={false} appearance={shop.equipped} /></div>
    <p className="pr-tool-hint">피부색과 눈동자색은 무료로 바로 바꿀 수 있어요.</p>
    <div className="pr-base-appearance-group">
      <h3>피부색</h3>
      <div className="pr-swatch-row">
        {SKIN_TONE_OPTIONS.map(({ key, label }) => {
          const value = key === 'tan' ? null : key; // 'tan' === 기본값(row 0) === null, 서버 표현과 동일하게
          return <button key={key} type="button" className={`pr-swatch pr-swatch-skin-${key}`} aria-pressed={(shop.equipped.skin ?? 'tan') === key} aria-label={label} disabled={disabled} onClick={async () => {
            const ok = await shop.setBaseAppearance(value, shop.equipped.eyes);
            setMessage(ok ? `${label} 피부색으로 바꿨어요.` : '피부색을 바꾸지 못했어요. 다시 시도해 주세요.');
          }} />;
        })}
      </div>
    </div>
    <div className="pr-base-appearance-group">
      <h3>눈동자색</h3>
      <div className="pr-swatch-row">
        {EYE_COLOR_OPTIONS.map(({ key, label }) => {
          const value = key === 'navy' ? null : key;
          return <button key={key} type="button" className={`pr-swatch pr-swatch-eye-${key}`} aria-pressed={(shop.equipped.eyes ?? 'navy') === key} aria-label={label} disabled={disabled} onClick={async () => {
            const ok = await shop.setBaseAppearance(shop.equipped.skin, value);
            setMessage(ok ? `${label} 눈동자색으로 바꿨어요.` : '눈동자색을 바꾸지 못했어요. 다시 시도해 주세요.');
          }} />;
        })}
      </div>
    </div>
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
