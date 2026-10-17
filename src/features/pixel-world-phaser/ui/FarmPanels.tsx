import { useEffect, useState } from 'react';
import type { useFarm } from '../../pixel-room/farm/useFarm';
import type { useFarmInventory } from '../../pixel-room/farm/useFarmInventory';
import { computeSubmitReward, formatHarvestDate, sizeLabel, weeklyRankLabel } from '../../pixel-room/farm/farmModel';
import type { WeeklyCropContest } from '../../pixel-room/farm/farmModel';
import type { SubmitFarmCropResult } from '../../../utils/pixelFarm';
import { TomatoSprite } from '../../pixel-room/farm/TomatoSprite';
import { Window } from './GamePanels';

// 실서버 훅과 브라우저 하네스가 같은 동작을 주입한다.
export interface FarmAdapter {
  farm: ReturnType<typeof useFarm>;
  inventory: ReturnType<typeof useFarmInventory>;
  submit: (id: string) => Promise<SubmitFarmCropResult>;
  contest: () => Promise<WeeklyCropContest>;
}
// 텃밭 칸 돌보기는 창 없이 도구 막대(GardenToolbar)로 한다 — 여기는 허수아비·수확물·펫 창만.
export type ActivityPanel = 'scarecrow' | 'collection' | 'pet';
export function FarmPanels({ kind, adapter, onClose, onTalk, onPet, onCollection }: {
  kind: ActivityPanel; adapter?: FarmAdapter; onClose: () => void; onTalk: () => void; onCollection: () => void;
  onPet: (kind: 'feed' | 'pet') => void;
}) {
  const [contest, setContest] = useState<WeeklyCropContest | null>(null);
  const [contestError, setContestError] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (kind !== 'collection' || !adapter) return;
    let cancelled = false;
    void adapter.inventory.refresh(); setContestError(false);
    void adapter.contest().then(value => { if (!cancelled) setContest(value); }).catch(() => { if (!cancelled) setContestError(true); });
    return () => { cancelled = true; };
  }, [kind, adapter?.contest, reload]);
  const title = kind === 'scarecrow' ? '허수아비' : kind === 'collection' ? '수확물 보기' : '친구와 놀기';
  return <Window title={title} onClose={onClose} compact={kind !== 'collection'}><div className="pwp-panel-content">
    {kind === 'scarecrow' ? <div className="pwp-options"><button onClick={onTalk}>이야기하기</button><button onClick={onCollection}>수확물 보기</button></div>
      : kind === 'pet' ? <div className="pwp-options"><button onClick={() => onPet('feed')}>먹이 주기</button><button onClick={() => onPet('pet')}>쓰다듬기</button></div>
      : !adapter ? <p role="status">농장 정보를 불러오지 못했어요.</p>
      : kind === 'collection' ? <>
        <h3>이번 주 토마토 대회</h3>
        {contestError ? <p role="alert">대회 정보를 불러오지 못했어요. <button onClick={() => setReload(v => v + 1)}>대회 다시 확인</button></p> : !contest ? <p role="status">대회를 확인하고 있어요…</p> : <>
          <p>{contest.mine.rank == null ? '이번 주 출품 기록이 없어요.' : '내 최고 기록 ' + contest.mine.sizeScore + '/100 · ' + contest.mine.rank + '위'} · 참가 {contest.mine.participantCount}명</p>
          <ol>{contest.top.map((entry, i) => <li key={i}>{weeklyRankLabel(entry.rank, contest.top.map(e => e.rank))} · {entry.submitterLabel} · {entry.sizeScore}/100</li>)}</ol>
        </>}
        {adapter.inventory.error ? <p role="alert">농작물 목록을 불러오지 못했어요. <button disabled={adapter.inventory.busy} onClick={() => void adapter.inventory.refresh()}>다시 확인</button></p>
          : !adapter.inventory.crops ? <p role="status">농작물을 확인하고 있어요…</p> : <div className="pwp-item-grid">
            {adapter.inventory.crops.length === 0 && <p>아직 수확한 작물이 없어요. 토마토를 심고 키워보세요!</p>}
            {adapter.inventory.crops.map(crop => <article className="pwp-item" key={crop.id} data-crop={crop.id}>
              <div className="pwp-crop-art"><TomatoSprite stage="ripe" moisture="normal" /></div><strong>{sizeLabel(crop.sizeScore)}</strong><span>{crop.sizeScore}/100 · {formatHarvestDate(crop.harvestedAt)} 수확</span>
              {/* 출품은 광장 상점 '판매'에서 한다(가방에 들고 광장까지 간다). */}
              {crop.status === 'submitted' ? <span>🏅 출품됨 · +{crop.rewardPoints}P</span> : <span>🎒 가방에 있어요 · 광장 상점에서 출품 (+{computeSubmitReward(crop.sizeScore)}P)</span>}
            </article>)}
          </div>}
      </> : null}
  </div></Window>;
}
