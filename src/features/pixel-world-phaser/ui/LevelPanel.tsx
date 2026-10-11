import { Window } from './GamePanels';
import type { PlayerLevel } from './useLevel';
import { LEVEL_TRACKS, TRACK_INFO, trackPerkText } from '../logic/levels';

// 활동마다 얻는 경험치(서버 지급량과 같은 값).
const SOURCES: Record<(typeof LEVEL_TRACKS)[number], string> = {
  fishing: '물고기 일반 5 · 고급 10 · 희귀 25 · 전설 60 · 신화 120 XP, 대물 +15, 잡동사니 1',
  farming: '토마토 수확 +40 XP',
  gathering: '잠자리 5 · 10 · 25 · 60 · 120 XP (별 개수에 따라)',
};

export function LevelPanel({ value, onClose }: { value: PlayerLevel; onClose(): void }) {
  return <Window title="레벨 정보" onClose={onClose} small><div className="pwp-panel-content pwp-level-panel">
    <p>레벨은 활동마다 따로 올라요. 높은 레벨일수록 다음 레벨까지 더 많은 경험치가 필요해요.</p>
    {LEVEL_TRACKS.map(t => {
      const track = value.tracks[t], max = track.level >= value.maxLevel;
      return <section key={t} className="pwp-level-track" data-track={t}>
        <h3>{TRACK_INFO[t].icon} {TRACK_INFO[t].label} Lv. {track.level}</h3>
        <p>{max ? `누적 ${track.xp.toLocaleString()} XP · 최고 레벨!` : `${track.xpIntoLevel.toLocaleString()} / ${track.xpForNext.toLocaleString()} XP · 다음 레벨까지 ${Math.max(0, track.xpForNext - track.xpIntoLevel).toLocaleString()} XP`}</p>
        <small className="pwp-level-sources">{SOURCES[t]}</small>
        <p><strong>{trackPerkText(t, track.level)}</strong>{t === 'fishing' && ' (전설 물고기는 최대 −15%)'}</p>
      </section>;
    })}
  </div></Window>;
}
