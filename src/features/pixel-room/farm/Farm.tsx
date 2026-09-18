import { useEffect, useRef, useState } from 'react';
import { FARM_BEDS, farmDay, farmMoisture, farmStage, growthLabel } from './farmModel';
import type { FarmAction } from './farmModel';
import type { useFarm } from './useFarm';
import { TomatoSprite } from './TomatoSprite';
import type { YardCell } from '../yard/yardModel';
import './farm.css';

const names = { empty: '빈 밭', sprout: '토마토 새싹', leaf: '자라는 토마토', fruit: '초록 토마토', ripe: '익은 토마토' };
const moistureLabel = { moist: '흙이 촉촉해요', normal: '흙이 적당해요', dry: '흙이 말랐어요' };
// farm is owned by the caller (FrontYard) and shared with <Scarecrow> so both react to the exact
// same snapshot — a second independent useFarm() here would poll/fetch separately and could show
// the scarecrow and the beds slightly out of sync.
export function Farm({ farm, actor, moving, walkTo }: { farm: ReturnType<typeof useFarm>; actor: YardCell; moving: boolean; walkTo: (cell: YardCell) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const popover = useRef<HTMLDivElement>(null);
  const near = selected !== null && actor.x === FARM_BEDS[selected].x - 1 && actor.y === FARM_BEDS[selected].y + 1 && !moving;
  // Open only on arrival; subsequent movement dismisses the bubble without stealing movement keys.
  const wasNear = useRef(false);
  useEffect(() => {
    if (near && !wasNear.current) popover.current?.focus({ preventScroll: true });
    if (!near && (wasNear.current || !moving)) setSelected(null);
    wasNear.current = near;
  }, [near, moving, selected]);
  function close() { setSelected(null); walkTo(actor); }
  useEffect(() => {
    if (!near) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelected(null); walkTo(actor); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [near, actor, walkTo]);
  const plot = farm.snapshot?.plots.find(p => p.index === selected);
  const crop = plot?.crop ?? null;
  const stage = farmStage(crop, farm.now);
  const watered = !!crop && crop.lastWateredOn === farmDay(farm.now);
  const action: FarmAction = !crop ? 'plant' : stage === 'ripe' ? 'harvest' : 'water';
  return <>
    {FARM_BEDS.map((bed, index) => {
      const current = farm.snapshot?.plots.find(p => p.index === index)?.crop ?? null;
      const currentStage = farmStage(current, farm.now);
      return <button key={index} type="button" className="pr-farm-bed" data-plot={index} data-stage={currentStage} data-moisture={farmMoisture(current, farm.now)}
        // +1 to match the yard's dog (Math.floor(y)+1 in Dog.tsx) — this stays tie-free against the
        // dog at every reachable row near a bed (its own footprint rows are unwalkable, so it can
        // never land exactly on bed.y). The player (.pr-plaza-actor uses y+2, not y+1, a pre-existing
        // yard-specific offset) ties with this at exactly one row above a bed instead — a corner
        // position, not the approach cell where tending actually happens, and far less likely to be
        // noticed than the dog visibly vanishing behind a bed it's standing in front of would be.
        style={{ left: `${bed.x / 16 * 100}%`, top: `${bed.y / 12 * 100}%`, zIndex: bed.y + 1 }}
        aria-label={`${index + 1}번 밭 · ${farm.snapshot ? names[currentStage] : '농장 확인'} · 돌보러 가기`}
        aria-expanded={selected === index && near} onClick={() => { wasNear.current = false; farm.clearMessage(); setSelected(index); walkTo({ x: bed.x - 1, y: bed.y + 1 }); }}>
        <TomatoSprite stage={currentStage} moisture={farmMoisture(current, farm.now)} />
        <span className="pr-farm-marker" aria-hidden="true">{!farm.snapshot ? '…' : currentStage === 'ripe' ? '✓' : currentStage === 'empty' ? '+' : ''}</span>
      </button>;
    })}
    {selected !== null && near && <div ref={popover} className="pr-farm-bubble" tabIndex={-1} role="dialog" aria-label={`${selected + 1}번 토마토 밭`}
      style={{ top: selected === 0 ? '8px' : 'min(30%, max(8px, calc(100% - 210px)))' }}>
      <button className="pr-farm-close" type="button" aria-label="밭 닫기" onClick={close}>×</button>
      <strong>{crop ? names[stage] : '작은 토마토 밭'}</strong>
      {!farm.snapshot ? <p>{farm.error ? '밭을 불러오지 못했어요.' : '밭을 확인하고 있어요…'}</p> : <>
        <p>{crop ? growthLabel(crop, farm.now) : '씨앗은 무료 · 4일 후 수확'}</p>
        {crop && <small>{moistureLabel[farmMoisture(crop, farm.now)]}{watered ? '' : ' · 오늘의 물을 주세요'} · 돌봄 {crop.careCount}회</small>}
        {!crop && <small>물주기를 놓쳐도 시들지 않아요.</small>}
        <span className="pr-farm-total">지금까지 수확 {farm.snapshot.harvestCount}개{farm.snapshot.bestSize ? ` · 최고 기록 ${farm.snapshot.bestSize}` : ''}{farm.snapshot.lastHarvestSize ? ` · 최근 ${farm.snapshot.lastHarvestSize}` : ''}</span>
      </>}
      <p className="pr-farm-feedback" role="status">{farm.message || (farm.error ? '연결을 확인하고 다시 불러와 주세요.' : '')}</p>
      {farm.error ? <button type="button" className="pr-farm-action" disabled={farm.busy} onClick={() => void farm.refresh()}>다시 확인</button>
        : <button type="button" className="pr-farm-action" disabled={!plot || farm.busy || (action === 'water' && watered)} onClick={() => void farm.act(selected, action)}>
          {farm.busy ? '확인 중…' : action === 'plant' ? '토마토 심기' : action === 'harvest' ? '토마토 수확하기' : watered ? '오늘은 촉촉해요' : '물주기 · 무료'}
        </button>}
    </div>}
  </>;
}
