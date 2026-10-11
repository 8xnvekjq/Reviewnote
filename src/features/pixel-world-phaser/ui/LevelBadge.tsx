import { useEffect, useRef } from 'react';
import { playSoundEffect } from '../../pixel-room/bgm/sfx';
import type { CSSProperties } from 'react';
import type { PlayerLevel, XpGain } from './useLevel';
import { LEVEL_TRACKS, TRACK_INFO, trackPerkText } from '../logic/levels';

const progress = (t: { xpIntoLevel: number; xpForNext: number }) => t.xpForNext ? Math.min(100, t.xpIntoLevel / Math.max(1, t.xpForNext) * 100) : 100;

/** 낚시·농사·채집 레벨을 한 줄씩 작게 보여 준다(누르면 레벨 정보). */
export function LevelBadge({ value, onClick, style }: { value: PlayerLevel; onClick(): void; style?: CSSProperties }) {
  const label = LEVEL_TRACKS.map(t => `${TRACK_INFO[t].label} Lv. ${value.tracks[t].level}`).join(' · ');
  return <button className="pwp-chip pwp-level-badge" style={style} onClick={onClick} aria-label={`레벨 정보 ${label}`}>
    {LEVEL_TRACKS.map(t => <span key={t} className="pwp-level-row" data-track={t}>
      <span aria-hidden="true">{TRACK_INFO[t].icon}</span><strong>{value.tracks[t].level}</strong>
      <span className="pwp-xp-track" role="progressbar" aria-label={`${TRACK_INFO[t].label} 다음 레벨 경험치`} aria-valuemin={0}
        aria-valuemax={value.tracks[t].xpForNext || 1} aria-valuenow={value.tracks[t].xpForNext ? value.tracks[t].xpIntoLevel : 1}>
        <span style={{ width: `${progress(value.tracks[t])}%` }} /></span>
    </span>)}
  </button>;
}
export function LevelToast({ gain }: { gain: XpGain }) {
  const sounded = useRef<string | null>(null);
  useEffect(() => {
    const key = `${gain.track}:${gain.level}`;
    if (sounded.current !== key) { sounded.current = key; playSoundEffect('levelUp'); }
  }, [gain.track, gain.level]);
  return <div className="pwp-level-toast" role="status"><span className="pwp-level-sparkles" aria-hidden="true">✦ ✧ ✦</span>
    <strong>{TRACK_INFO[gain.track].icon} {TRACK_INFO[gain.track].label} 레벨 업! Lv. {gain.level}</strong><small>{trackPerkText(gain.track, gain.level)}</small></div>;
}
