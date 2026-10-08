import { Window } from './GamePanels';
import type { PlayerLevel } from './useLevel';
import { fishingPerkText } from '../logic/levels';
export function LevelPanel({ value, onClose }: { value: PlayerLevel; onClose(): void }) {
  const max = value.level >= value.maxLevel;
  return <Window title="레벨 정보" onClose={onClose} small><div className="pwp-panel-content pwp-level-panel">
    <h3>Lv. {value.level}</h3><p>{max ? `누적 ${value.xp.toLocaleString()} XP` : `${value.xpIntoLevel} / ${value.xpForNext} XP`}</p>
    <p>{max ? '최고 레벨에 도달했어요!' : `다음 레벨까지 ${Math.max(0, value.xpForNext - value.xpIntoLevel)} XP`}</p>
    <p>수확 +40 XP</p><p>물고기: 일반 5 / 고급 10 / 희귀 25 / 전설 60 XP<br />대물 +15 XP</p>
    <strong>{fishingPerkText(value.level)}</strong><p>전설 물고기는 최대 −15%</p>
  </div></Window>;
}
