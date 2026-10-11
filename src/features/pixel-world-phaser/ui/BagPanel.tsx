// 가방: 잡은 물고기·곤충(종류별로 겹쳐 쌓임)과 보관 중인 토마토. 무게가 용량을 넘으면 점점 느려진다.
// sell이 있으면(광장 상점 '판매' 칸) 팔기·출품 버튼을 보여 준다.
import { useState } from 'react';
import { FISH_CATALOG } from '../logic/fishCatalog';
import { BUG_CATALOG } from '../logic/bugCatalog';
import { bagSpeedFactor, bagValue, type Bag, type BagItem } from '../logic/bag';
import { computeSubmitReward, sizeLabel } from '../../pixel-room/farm/farmModel';
import { TomatoSprite } from '../../pixel-room/farm/TomatoSprite';
import type { BagState } from './useBag';
import type { SubmitFarmCropResult } from '../../../utils/pixelFarm';

export const itemName = (item: Pick<BagItem, 'kind' | 'ref'>) =>
  (item.kind === 'fish' ? FISH_CATALOG.find(f => f.id === item.ref)?.name : BUG_CATALOG.find(b => b.id === item.ref)?.name) ?? item.ref;
const kg = (value: number) => `${(Math.round(value * 10) / 10).toLocaleString()}kg`;

/** 무게 막대 + 속도 안내(가방 칩·창 공통). */
export function BagWeight({ bag }: { bag: Bag }) {
  const factor = bagSpeedFactor(bag.weight, bag.capacity);
  const ratio = Math.min(1, bag.weight / Math.max(1, bag.capacity * 2));
  return <div className="pwp-bag-weight" data-heavy={factor < 1}>
    <span className="pwp-bag-meter" role="progressbar" aria-label="가방 무게" aria-valuemin={0} aria-valuemax={bag.capacity * 2} aria-valuenow={bag.weight}>
      <span style={{ width: `${ratio * 100}%` }} /><i style={{ left: '50%' }} aria-hidden="true" /></span>
    <small>{kg(bag.weight)} / {kg(bag.capacity)} · {factor < 1 ? `무거워서 속도 ${Math.round(factor * 100)}%` : '가볍게 걸어요'}</small>
  </div>;
}

export function BagContents({ bag, selling }: { bag: Bag; selling?: { state: BagState; submitCrop: (id: string) => Promise<SubmitFarmCropResult> } }) {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const busy = pending || !!selling?.state.busy;
  const act = async (run: () => Promise<string>) => {
    if (busy) return;
    setPending(true);
    try { setMessage(await run()); } catch { setMessage('처리하지 못했어요. 다시 시도해 주세요.'); } finally { setPending(false); }
  };
  const sell = (items: { kind: BagItem['kind']; ref: string; qty: number }[] | null) => act(async () => {
    const result = await selling!.state.sell(items);
    return result.ok ? `${result.sold}개를 팔았어요! +${result.awarded}P${result.awarded < result.value ? ' (오늘 상한 적용)' : ''}` : result.message;
  });
  const empty = bag.items.length === 0 && bag.crops.length === 0;
  return <div className="pwp-bag">
    <BagWeight bag={bag} />
    {selling && bag.items.length > 0 && <div className="pwp-bag-sell-all">
      <span>물고기·곤충 전부 {bagValue(bag).toLocaleString()}P</span>
      <button type="button" disabled={busy} onClick={() => void sell(null)}>모두 팔기</button>
    </div>}
    {empty ? <p>가방이 비어 있어요. 낚시·잠자리 잡기·수확으로 채워 보세요!</p> : <ul className="pwp-bag-list" aria-label="가방 속 물건">
      {bag.items.map(item => <li key={item.kind + ':' + item.ref} data-bag-item={item.ref}>
        <span aria-hidden="true">{item.kind === 'fish' ? '🐟' : '🦋'}</span>
        <strong>{itemName(item)} ×{item.qty}</strong>
        <small>{kg(item.unitWeight * item.qty)} · {(item.unitPoints * item.qty).toLocaleString()}P</small>
        {selling && <span className="pwp-bag-actions">
          {item.qty > 1 && <button type="button" disabled={busy} aria-label={`${itemName(item)} 1개 팔기`} onClick={() => void sell([{ kind: item.kind, ref: item.ref, qty: 1 }])}>1개</button>}
          <button type="button" disabled={busy} aria-label={`${itemName(item)} 모두 팔기`} onClick={() => void sell([{ kind: item.kind, ref: item.ref, qty: item.qty }])}>팔기</button>
        </span>}
      </li>)}
      {bag.crops.map(crop => <li key={crop.id} data-bag-crop={crop.id}>
        <span className="pwp-bag-tomato" aria-hidden="true"><TomatoSprite stage="ripe" moisture="normal" /></span>
        <strong>토마토 · {sizeLabel(crop.sizeScore)}</strong>
        <small>{kg(crop.unitWeight)} · 크기 {crop.sizeScore}/100 · 출품 +{computeSubmitReward(crop.sizeScore)}P</small>
        {selling && <span className="pwp-bag-actions"><button type="button" disabled={busy} aria-label={`토마토 ${crop.sizeScore}점 출품하기`} onClick={() => void act(async () => {
          const result = await selling.submitCrop(crop.id);
          return result.ok ? `출품 완료! +${result.rewardPoints}P` : result.reason === 'already_submitted' ? '이미 출품된 작물이에요.' : result.message;
        })}>출품</button></span>}
      </li>)}
    </ul>}
    {!selling && !empty && <p className="pwp-bag-hint">광장 상점의 '판매'에서 팔고 토마토를 출품할 수 있어요.</p>}
    {message && <p role="status">{message}</p>}
  </div>;
}
