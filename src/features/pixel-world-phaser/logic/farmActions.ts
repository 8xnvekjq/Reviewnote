import { farmDay, farmStage } from '../../pixel-room/farm/farmModel';
import type { FarmAction, FarmPlot } from '../../pixel-room/farm/farmModel';

// 서버 시계와 기존 규칙으로 메뉴를 고른다. 최종 판정은 기존 RPC가 맡는다.
export function farmAction(plot: FarmPlot | undefined, now: number): { action: FarmAction; disabled: boolean; label: string } {
  if (!plot) return { action: 'plant', disabled: true, label: '밭을 확인하고 있어요…' };
  if (!plot.crop) return { action: 'plant', disabled: false, label: '토마토 심기' };
  if (farmStage(plot.crop, now) === 'ripe') return { action: 'harvest', disabled: false, label: '토마토 수확하기' };
  const watered = plot.crop.lastWateredOn === farmDay(now);
  return { action: 'water', disabled: watered, label: watered ? '오늘은 촉촉해요' : '물주기 · 무료' };
}
