import { useEffect, useState } from 'react';
import { GARDEN_FENCE, GARDEN_SIZE, gardenStage } from './gardenModel';
import type { useFarm } from './useFarm';
import { TomatoSprite } from './TomatoSprite';
import './farm.css';

// 예전 Pixel World(관리자 비교용) 마당의 텃밭 자리. 2×2 밭 두 개는 울타리 친 텃밭(칸마다 도구로 가꾸기)으로 바뀌었고,
// 칸 하나하나를 돌보는 것은 새 Pixel World 앞마당에서만 한다 — 여기서는 같은 서버 상태를 읽기만 하고 안내한다
// (심기·물주기·수확 요청을 보내지 않는다). 수확물·출품(농작물 탭)은 그대로 쓴다.
export function Farm({ farm }: { farm: ReturnType<typeof useFarm> }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  const crops = (farm.snapshot?.plots ?? []).flatMap(plot => plot.crop ? [plot.crop] : []);
  const ripe = crops.filter(crop => gardenStage(crop, farm.now) === 'ripe').length;
  // 마당 판(16×12칸) 안에 보이는 텃밭 윗부분(울타리 윗줄과 첫 줄)에 놓는다.
  const style = { left: `${GARDEN_FENCE.x / 16 * 100}%`, top: `${GARDEN_FENCE.y / 12 * 100}%`, width: `${(GARDEN_SIZE.cols + 2) / 16 * 100}%`, height: `${2 / 12 * 100}%`, zIndex: GARDEN_FENCE.y + 1 };
  return <>
    <button type="button" className="pr-farm-garden" style={style} data-crops={crops.length} data-ripe={ripe} aria-expanded={open}
      aria-label={`텃밭 · ${farm.snapshot ? `자라는 작물 ${crops.length - ripe}개, 익은 작물 ${ripe}개` : '확인 중'} · 안내 보기`} onClick={() => setOpen(value => !value)}>
      <span className="pr-farm-garden-sign"><TomatoSprite stage={ripe ? 'ripe' : crops.length ? 'leaf' : 'empty'} moisture="normal" />텃밭</span>
    </button>
    {open && <div className="pr-farm-bubble" role="dialog" aria-label="텃밭 안내" style={{ top: '8px' }}>
      <button className="pr-farm-close" type="button" aria-label="안내 닫기" onClick={() => setOpen(false)}>×</button>
      <strong>울타리 텃밭 ({GARDEN_SIZE.cols}×{GARDEN_SIZE.rows}칸)</strong>
      {!farm.snapshot ? <p>{farm.error ? '밭을 불러오지 못했어요.' : '밭을 확인하고 있어요…'}</p> : <>
        <p>자라는 작물 {crops.length - ripe}개 · 익은 작물 {ripe}개</p>
        <small>텃밭은 새 Pixel World 앞마당에서 괭이·씨앗·물뿌리개로 칸마다 가꿔요.</small>
        <span className="pr-farm-total">지금까지 토마토 수확 {farm.snapshot.harvestCount}개{farm.snapshot.bestSize ? ` · 최고 기록 ${farm.snapshot.bestSize}` : ''}{farm.snapshot.lastHarvestSize ? ` · 최근 ${farm.snapshot.lastHarvestSize}` : ''}</span>
      </>}
    </div>}
  </>;
}
