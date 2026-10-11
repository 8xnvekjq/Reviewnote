import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { usePixelShop } from '../../pixel-room/usePixelShop';
import type { usePet } from '../../pixel-room/pet/usePet';
import { isPetId } from '../../pixel-room/pet/petKinds';
import baitIcon from '../assets/fishing/bait.png';
import { BAIT_ITEM } from '../../pixel-room/shop/catalog';
import { RodIcon } from './RodIcon';
import { rodEffectText } from '../../pixel-room/shop/rods';
import { petEffectText } from '../../pixel-room/shop/petEffects';
import { PanelArt } from './PanelArt';
import { KnowledgeShardIcon } from '../../../components/KnowledgeShardIcon';
import { CRYSTAL_BAIT, formatShards, shardsShort } from '../../../utils/knowledgeShards';
import type { FurnitureType } from '../../pixel-room/model';
import type { PixelAvatarSlot, PixelItem } from '../../pixel-room/shop/types';
import { AVATAR_SLOTS, EYE_COLOR_OPTIONS, SKIN_TONE_OPTIONS, SLOT_LABELS } from '../../pixel-room/shop/appearanceRows';
import { itemState, panelItems, pointsShort } from '../logic/panels';
import type { PanelKind } from '../logic/panels';
import './panels.css';
import { FishAlbum } from './FishAlbum';
import { FishBoard } from './FishBoard';
import type { FishingAdapter } from './fishingAdapter';
import type { FishingPanelKind } from '../logic/panels';

export function FishingPanels({ kind, adapter, shop, onClose, newSpeciesId }: { kind: FishingPanelKind; adapter?: FishingAdapter; shop?: PanelAdapter; onClose: () => void; newSpeciesId?: string | null }) {
  return kind === 'turtle' ? <TurtlePanel adapter={adapter} shop={shop} onClose={onClose} newSpeciesId={newSpeciesId} /> : <FishBoard adapter={adapter} onClose={onClose} />;
}
// 거북이를 누르면 도감과 낚시 상점(낚싯대·미끼)을 탭으로 오간다 — 미끼를 사러 광장까지 가지 않아도 된다.
function TurtlePanel({ adapter, shop, onClose, newSpeciesId }: { adapter?: FishingAdapter; shop?: PanelAdapter; onClose: () => void; newSpeciesId?: string | null }) {
  const [tab, setTab] = useState<'album' | 'tackle'>('album');
  const tabs = shop ? <Tabs label="거북이 메뉴" options={[['album', '도감 보기'], ['tackle', '상점']]} value={tab} onChange={value => setTab(value as 'album' | 'tackle')} /> : undefined;
  return tab === 'tackle' && shop ? <GamePanels kind="tackle" adapter={shop} onClose={onClose} top={tabs} /> : <FishAlbum adapter={adapter} onClose={onClose} newSpeciesId={newSpeciesId} top={tabs} />;
}

// 실제 훅과 하네스가 같은 계약으로 데이터와 동작을 전달한다.
type ShopOptional = 'baitCharges' | 'buyBait' | 'refreshBait' | 'shards' | 'purchaseShardItem' | 'buyBaitWithShards';
export interface PanelAdapter { shop: Omit<ReturnType<typeof usePixelShop>, ShopOptional> & Partial<Pick<ReturnType<typeof usePixelShop>, ShopOptional>>; pet: ReturnType<typeof usePet> }
export function PriceTag({ value }: { value: number }) {
  return <span className="pwp-price"><span className="pwp-coin" aria-hidden="true">P</span>{value.toLocaleString()}</span>;
}
/** 지식의 조각 가격/잔액 — 소수 둘째 자리까지. null은 아직 불러오지 못한 잔액. */
export function ShardTag({ value, label }: { value: number | null; label?: string }) {
  return <span className="pwp-price pwp-shard-price" aria-label={`${label ?? '지식의 조각'} ${value == null ? '확인 중' : formatShards(value)}`}><KnowledgeShardIcon size={18} />{value == null ? '…' : formatShards(value)}</span>;
}
function Tabs({ options, value, onChange, label = '분류' }: { options: readonly (readonly [string, string])[]; value: string; onChange: (value: string) => void; label?: string }) {
  return <nav className="pwp-tabs" aria-label={label}>{options.map(([key, label]) => <button type="button" key={key} aria-pressed={key === value} onClick={() => onChange(key)}>{label}</button>)}</nav>;
}
export function Window({ title, onClose, onCancel = onClose, children, compact = false, small = false, top }: { title: string; onClose: () => void; onCancel?: () => void; children: ReactNode; compact?: boolean; small?: boolean; top?: ReactNode }) {
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
    box.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="pwp-panel-shade" onPointerDown={event => {
    event.stopPropagation();
    if (event.target === event.currentTarget && event.button === 0) { event.preventDefault(); onCancel(); }
  }}>
    <div ref={box} className={(compact ? "pwp-window pwp-window-compact" : "pwp-window") + (small ? " pwp-window-small" : "")} role="dialog" aria-modal="true" aria-label={title} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape' || event.key.toLowerCase() === 'x') { event.preventDefault(); if (!event.repeat) onCancel(); }
      if (event.key === 'Tab') {
        const buttons = [...box.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}><header><h2>{title}</h2><button type="button" aria-label={`${title} 닫기`} onClick={onClose}>✕</button></header>{top}{children}</div>
  </div>;
}
// 'tackle' = 거북이 낚시 상점(낚싯대·미끼만). 광장 'shop'에서는 낚시 도구를 팔지 않는다.
export function GamePanels({ kind, adapter: { shop, pet }, onClose, top }: { kind: Exclude<PanelKind, FishingPanelKind> | 'tackle'; adapter: PanelAdapter; onClose: () => void; top?: ReactNode }) {
  const refreshBait = useRef(shop.refreshBait); refreshBait.current = shop.refreshBait;
  useEffect(() => { if (kind === 'tackle') void refreshBait.current?.(); }, [kind]);
  const selling = kind !== 'wardrobe';
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
    ? <PanelArt appearance={{ ...shop.equipped, [item.slot]: item.assetKey }} />
    : item.category === 'rod' ? <RodIcon rod={{ id: item.itemId, tier: item.tier }} /> : item.category === 'pet' ? <PanelArt pet={item.itemId} /> : <PanelArt furniture={item.assetKey as FurnitureType} />;
  const shardTab = kind === 'shop' && category === 'shard';
  // 조각 전용 아이템은 상점의 '지식의 조각' 칸에만 놓는다(옷장에서는 다른 보유 아이템과 같이 보인다).
  const stock = shop.catalog.filter(item => kind === 'tackle' ? item.category === 'rod' : kind === 'shop' ? item.category !== 'rod' && item.category !== 'bait' && (item.shardPrice != null) === shardTab : item.category !== 'bait');
  const wardrobeOwned = new Set([...shop.ownedIds, 'hair_bald']);
  const entries = shardTab ? stock : panelItems(stock, selling ? category : slot, kind === 'wardrobe' ? wardrobeOwned : undefined);
  const tabOptions: readonly (readonly [string, string])[] = kind === 'tackle' ? [['all', '전체'], ['rod', '낚싯대'], ['bait', '미끼']]
    : kind === 'shop' ? [['all', '전체'], ['shard', '지식의 조각'], ...AVATAR_SLOTS.map(key => [key, SLOT_LABELS[key]] as const), ['furniture', '가구'], ['pet', '펫'], ['tool', '도구']]
    : [...AVATAR_SLOTS.map(key => [key, SLOT_LABELS[key]] as const), ['base', '기본 외형'], ['pet', '펫'], ['rod', '낚싯대']];
  return <Window title={kind === 'tackle' ? '거북이 낚시 상점' : kind === 'shop' ? '상점' : '옷장'} top={top} onClose={onClose} onCancel={() => { if (confirming) { if (!busy) setConfirming(null); } else onClose(); }}>
    <div className="pwp-panel-summary">{selling ? <><span>{kind === 'tackle' ? '좋은 낚싯대와 미끼가 있어요.' : shardTab ? '오답 복습으로 모은 지식의 조각으로만 살 수 있어요.' : '마음에 드는 스타일을 골라요. 낚싯대·미끼는 강가 거북이에게!'}</span>{shardTab ? <ShardTag value={shop.shards ?? null} /> : <PriceTag value={shop.balance} />}</> : <><div className="pwp-preview"><PanelArt appearance={shop.equipped} /></div><span>오늘의 나 · 바꾸면 바로 보여요.</span></>}</div>
    <Tabs options={tabOptions} value={selling ? category : slot} onChange={value => { if (selling) setCategory(value); else setSlot(value); setConfirming(null); }} />
    <div className="pwp-panel-content">
      {!shop.ready ? <p role="status">보유 정보를 불러오는 중…</p> : shop.loadError ? <div role="alert"><p>보유 정보를 불러오지 못했어요.</p><button onClick={shop.reload}>다시 시도</button></div> : kind === 'wardrobe' && slot === 'base' ? <>
        <p>피부색과 눈동자색은 무료예요.</p>
        {([['skin', '피부색', SKIN_TONE_OPTIONS, 'tan'], ['eyes', '눈동자색', EYE_COLOR_OPTIONS, 'navy']] as const).map(([key, label, options, fallback]) => <section key={key}><h3>{label}</h3><div className="pwp-options">{options.map(option => <button key={option.key} aria-pressed={(shop.equipped[key] ?? fallback) === option.key} disabled={busy} onClick={() => void act(async () => {
          const value = option.key === fallback ? null : option.key;
          return await shop.setBaseAppearance(key === 'skin' ? value : shop.equipped.skin, key === 'eyes' ? value : shop.equipped.eyes) ? `${label}을 바꿨어요.` : '외형을 저장하지 못했어요.';
        })}>{option.label}</button>)}</div></section>)}
      </> : <div className="pwp-item-grid">
        {kind === 'tackle' && (category === 'all' || category === 'bait') && <article className="pwp-item" data-item="bait_worm">
          <div className="pwp-item-art"><img className="pwp-bait-icon" src={baitIcon} alt="지렁이가 든 미끼 통" /></div>
          <strong>{BAIT_ITEM.displayName}</strong><small>희귀 물고기 2배 · 난이도 −0.3 · 100번 낚시</small>
          <span>남은 미끼 {shop.baitCharges == null ? '확인 중' : `${shop.baitCharges}회`}</span><PriceTag value={BAIT_ITEM.price} />
          <button disabled={busy || !shop.buyBait || shop.balance < BAIT_ITEM.price} onClick={() => void act(async () => {
            const result = await shop.buyBait!(); return result.ok ? `미끼 구매 완료! 남은 미끼 ${result.charges}회` : result.message;
          })}>미끼 구매하기</button>
        </article>}
        {shardTab && <article className="pwp-item" data-item={CRYSTAL_BAIT.itemId}>
          <div className="pwp-item-art"><img className="pwp-bait-icon pwp-bait-crystal" src={baitIcon} alt="보랏빛 결정이 든 미끼 통" /></div>
          <strong>{CRYSTAL_BAIT.displayName}</strong><small>지렁이 미끼와 같은 효과 · {CRYSTAL_BAIT.charges}번 낚시</small>
          <span>남은 미끼 {shop.baitCharges == null ? '확인 중' : `${shop.baitCharges}회`}</span><ShardTag value={CRYSTAL_BAIT.shardPrice} label="가격" />
          <button disabled={busy || !shop.buyBaitWithShards || shop.shards == null || shardsShort(CRYSTAL_BAIT.shardPrice, shop.shards) > 0} onClick={() => void act(async () => {
            const result = await shop.buyBaitWithShards!(); return result.ok ? `결정 미끼 구매 완료! 남은 미끼 ${result.charges}회` : result.message;
          })}>조각으로 구매하기</button>
        </article>}
        {kind === 'wardrobe' && <button className="pwp-item" disabled={busy || (slot === 'pet' && (!pet.ready || pet.error))} aria-pressed={slot === 'rod' ? shop.equippedRod === null : slot === 'pet' ? pet.active === null : shop.equipped[slot as PixelAvatarSlot] === null} onClick={() => slot === 'rod' ? void act(async () => await shop.equipRod(null) ? '기본 낚싯대로 바꿨어요.' : '장착하지 못했어요.') : slot === 'pet' ? void changePet(null) : void act(async () => await shop.equip(slot as PixelAvatarSlot, null) ? '기본 모습으로 바꿨어요.' : '장착하지 못했어요.')}>{slot === 'rod' && <RodIcon />}<strong>{slot === 'rod' ? '기본 낚싯대' : slot === 'pet' ? '친구 쉬게 하기' : `기본 ${SLOT_LABELS[slot as PixelAvatarSlot]}`}</strong></button>}
        {entries.map(item => {
          const state = itemState(item, wardrobeOwned, shop.equipped, pet.active, shop.equippedRod);
          const shardPrice = item.shardPrice;
          const short = shardPrice != null ? (shop.shards == null ? shardPrice : shardsShort(shardPrice, shop.shards)) : pointsShort(item.price, shop.balance);
          const disabled = busy || (item.category === 'pet' && (!pet.ready || pet.error));
          return <article className="pwp-item" key={item.itemId} data-item={item.itemId} data-state={state}>
            <div className="pwp-item-art" aria-hidden="true">{art(item)}</div><strong>{item.displayName}</strong>{item.category === 'rod' && <><span aria-label={`${item.tier}등급`}>{'★'.repeat(item.tier)}</span><small className="pwp-rod-effects">{rodEffectText(item.itemId)}</small>{state !== 'available' && <PriceTag value={item.price} />}</>}{item.category === 'pet' && <small className="pwp-rod-effects pwp-pet-effects">{petEffectText(item.itemId)}</small>}
            {state !== 'available' ? <><span>{state === 'equipped' ? '장착 중' : '보유 중'}</span>{item.category === 'furniture' ? <span>집에서 배치할 수 있어요.</span> : item.category === 'tool' ? <span>잠자리 가까이에서 A로 휘둘러요.</span> : <button disabled={disabled || state === 'equipped'} onClick={() => item.category === 'rod' ? void act(async () => await shop.equipRod(item.itemId) ? '낚싯대를 장착했어요.' : '장착하지 못했어요.') : item.category === 'pet' ? void changePet(item.itemId) : void act(async () => await shop.equip(item.slot as PixelAvatarSlot, item.itemId) ? '장착했어요.' : '장착하지 못했어요.')}>{state === 'equipped' ? '장착 중' : item.category === 'pet' ? '함께 살기' : '장착하기'}</button>}</>
              : <>{shardPrice != null ? <ShardTag value={shardPrice} label="가격" /> : <PriceTag value={item.price} />}{short > 0 ? <span className="pwp-short">{shardPrice != null ? `조각 ${formatShards(short)}개 더 필요해요.` : `${short.toLocaleString()}P 더 필요해요.`}</span> : confirming === item.itemId ? <><span>구매할까요?</span><button disabled={disabled} onClick={() => void act(async () => {
                if (shardPrice != null && !shop.purchaseShardItem) return '지금은 조각으로 살 수 없어요.';
                const result = shardPrice != null ? await shop.purchaseShardItem!(item) : await shop.purchase(item);
                if (!result.ok) return result.reason === 'insufficient_balance' ? (shardPrice != null ? '지식의 조각이 부족해요.' : '포인트가 부족해요.') : result.message;
                if (item.category === 'pet' && isPetId(item.itemId) && !await pet.activate(item.itemId)) return '구매 완료! 펫은 옷장에서 다시 선택해 주세요.';
                return result.equipFailed ? '구매 완료! 옷장에서 다시 장착해 주세요.' : `${item.displayName} 구매 완료!`;
              })}>구매 확정</button><button disabled={busy} onClick={() => setConfirming(null)}>취소</button></> : <button disabled={disabled} onClick={() => setConfirming(item.itemId)}>구매하기</button>}</>}
          </article>;
        })}
        {entries.length === 0 && category !== 'bait' && <p>아직 보유한 아이템이 없어요.</p>}
      </div>}
      {pet.error && <p role="alert">펫 정보를 확인하지 못했어요. <button onClick={pet.reload}>다시 확인</button></p>}
    </div>
    {message && <div className="pwp-toast" role="status" aria-live="polite">{message}</div>}
  </Window>;
}
