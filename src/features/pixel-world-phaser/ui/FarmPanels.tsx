import { useEffect, useRef, useState } from 'react';
import type { useFarm } from '../../pixel-room/farm/useFarm';
import type { useFarmInventory } from '../../pixel-room/farm/useFarmInventory';
import { computeSubmitReward, formatHarvestDate, growthLabel, sizeLabel, weeklyRankLabel } from '../../pixel-room/farm/farmModel';
import type { WeeklyCropContest } from '../../pixel-room/farm/farmModel';
import type { SubmitFarmCropResult } from '../../../utils/pixelFarm';
import { TomatoSprite } from '../../pixel-room/farm/TomatoSprite';
import { farmAction } from '../logic/farmActions';
import { gainFrom } from './useLevel';
import type { XpGain } from './useLevel';
import { harvestXpDisplay } from '../logic/levels';
import { Window } from './GamePanels';

// 실서버 훅과 브라우저 하네스가 같은 동작을 주입한다.
export interface FarmAdapter {
  farm: ReturnType<typeof useFarm>;
  inventory: ReturnType<typeof useFarmInventory>;
  submit: (id: string) => Promise<SubmitFarmCropResult>;
  contest: () => Promise<WeeklyCropContest>;
}
export type ActivityPanel = 'scarecrow' | 'collection' | 'pet' | `farm:${number}`;
export function FarmPanels({ kind, adapter, onClose, onTalk, onPet, onFx, onCollection, onXp }: {
  onXp?: (gain?: XpGain) => void;
  kind: ActivityPanel; adapter?: FarmAdapter; onClose: () => void; onTalk: () => void; onCollection: () => void;
  onPet: (kind: 'feed' | 'pet') => void; onFx: (index: number, action: string) => void;
}) {
  const [xpDisplay, setXpDisplay] = useState<number | null>(null);
  const harvestGain = useRef<XpGain | undefined>(undefined);
  const [message, setMessage] = useState('');
  const [effect, setEffect] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [contest, setContest] = useState<WeeklyCropContest | null>(null);
  const [contestError, setContestError] = useState(false);
  const [reload, setReload] = useState(0);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (kind !== 'collection' || !adapter) return;
    let cancelled = false;
    void adapter.inventory.refresh(); setContestError(false);
    void adapter.contest().then(value => { if (!cancelled) setContest(value); }).catch(() => { if (!cancelled) setContestError(true); });
    return () => { cancelled = true; };
  }, [kind, adapter?.contest, reload]);
  async function act(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setPending(true); setMessage('');
    try { await action(); }
    catch { if (alive.current) setMessage('저장 결과를 확인하지 못했어요. 다시 확인해 주세요.'); }
    finally { lock.current = false; if (alive.current) setPending(false); }
  }
  const title = kind === 'scarecrow' ? '허수아비' : kind === 'collection' ? '수확물 보기' : kind === 'pet' ? '친구와 놀기' : (Number(kind.split(':')[1]) + 1) + '번 토마토 밭';
  const index = Number(kind.split(':')[1]);
  const farm = adapter?.farm;
  const plot = farm?.snapshot?.plots.find(p => p.index === index);
  const option = farmAction(plot, farm?.now ?? 0);
  const revision = plot?.revision;
  const lastRevision = useRef(revision);
  useEffect(() => {
    if (revision !== lastRevision.current && effect && farm?.message && !farm.error && /^(심었어요|물을 줬어요|수확 기록)/.test(farm.message)) {
      if (effect === 'harvest') { const gain = harvestGain.current ?? gainFrom(farm); setXpDisplay(gain?.gained ?? harvestXpDisplay()); onXp?.(gain); harvestGain.current = undefined; }
      onFx(index, effect); setEffect(null);
    }
    lastRevision.current = revision;
  }, [revision, effect, farm?.message, farm?.error, index, onFx, onXp, farm]);
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
        {adapter.inventory.error ? <p role="alert">농작물 목록을 불러오지 못했어요. <button disabled={pending} onClick={() => void adapter.inventory.refresh()}>다시 확인</button></p>
          : !adapter.inventory.crops ? <p role="status">농작물을 확인하고 있어요…</p> : <div className="pwp-item-grid">
            {adapter.inventory.crops.length === 0 && <p>아직 수확한 작물이 없어요. 토마토를 심고 키워보세요!</p>}
            {adapter.inventory.crops.map(crop => <article className="pwp-item" key={crop.id} data-crop={crop.id}>
              <div className="pwp-crop-art"><TomatoSprite stage="ripe" moisture="normal" /></div><strong>{sizeLabel(crop.sizeScore)}</strong><span>{crop.sizeScore}/100 · {formatHarvestDate(crop.harvestedAt)} 수확</span>
              {crop.status === 'submitted' ? <span>🏅 출품됨 · +{crop.rewardPoints}P</span> : <button disabled={pending || adapter.inventory.busy} onClick={() => void act(async () => {
                const result = await adapter.submit(crop.id);
                if (alive.current) setMessage(result.ok ? '출품 완료! +' + result.rewardPoints + 'P' : result.reason === 'already_submitted' ? '이미 출품된 작물이에요.' : result.message);
                await adapter.inventory.refresh(); if (alive.current) setReload(v => v + 1);
              })}>출품하기 (+{computeSubmitReward(crop.sizeScore)}P)</button>}
            </article>)}
          </div>}
      </> : <>
        <p>{plot?.crop ? growthLabel(plot.crop, farm!.now) : '씨앗은 무료 · 4일 후 수확'}</p>
        {farm?.error ? <p role="alert">밭을 불러오지 못했어요. <button disabled={pending || farm.busy} onClick={() => void farm.refresh()}>다시 확인</button></p> : <button disabled={pending || farm?.busy || option.disabled} onClick={() => void act(async () => {
          setXpDisplay(null); setEffect(option.action); const result: unknown = await farm!.act(index, option.action); harvestGain.current = gainFrom(result);
          if (option.action === 'harvest') await adapter.inventory.refresh();
        })}>{option.label}</button>}
        {farm?.message && <article className="pwp-item" role="status" aria-label="밭 작업 결과"><strong>{farm.message}</strong>{farm.message.startsWith('수확 기록') && farm.snapshot?.lastHarvestSize != null && <><div className="pwp-crop-art"><TomatoSprite stage="ripe" moisture="normal" /></div><span>{sizeLabel(farm.snapshot.lastHarvestSize)} · {farm.snapshot.lastHarvestSize}/100</span></>}</article>}
      </>}
    {xpDisplay !== null && <p className="pwp-xp-gain" role="status">+{xpDisplay} XP</p>}
    {message && <p role="status" aria-live="polite">{message}</p>}
  </div></Window>;
}
