import { useEffect, useRef } from 'react';
import { playSoundEffect } from '../../pixel-room/bgm/sfx';
import type { CSSProperties } from 'react';
import type { PlayerLevel } from './useLevel';
import { fishingPerkText } from '../logic/levels';
export function LevelBadge({ value, onClick, style }: { value: PlayerLevel; onClick(): void; style?: CSSProperties }) {
  const max = value.level >= value.maxLevel;
  return <button className="pwp-chip pwp-level-badge" style={style} onClick={onClick} aria-label={`레벨 정보 Lv. ${value.level}`}>
    <strong>Lv. {value.level}</strong><span className="pwp-xp-track" role="progressbar" aria-label="다음 레벨 경험치" aria-valuemin={0} aria-valuemax={max ? 1 : value.xpForNext} aria-valuenow={max ? 1 : value.xpIntoLevel}>
      <span style={{ width: `${max ? 100 : Math.min(100, value.xpIntoLevel / Math.max(1, value.xpForNext) * 100)}%` }} /></span>
  </button>;
}
export function LevelToast({ level }: { level: number }) {
  const sounded = useRef<number | null>(null);
  useEffect(() => {
    if (sounded.current !== level) { sounded.current = level; playSoundEffect('levelUp'); }
  }, [level]);
  return <div className="pwp-level-toast" role="status"><span className="pwp-level-sparkles" aria-hidden="true">✦ ✧ ✦</span><strong>레벨 업! Lv. {level}</strong><small>{fishingPerkText(level)}</small></div>;
}
