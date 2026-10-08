import { useCallback, useEffect, useRef, useState } from 'react';
import { levelForXp, MAX_LEVEL } from '../logic/levels';
import type { FishingAdapter, FishingState } from './fishingAdapter';
export interface PlayerLevel { level: number; xp: number; xpIntoLevel: number; xpForNext: number; maxLevel: number }
export interface XpGain { gained: number; xp: number; level: number; leveledUp: boolean }
export type LevelFishingAdapter = FishingAdapter & { getLevel?: () => Promise<PlayerLevel> };
export type LevelFishingState = FishingState & { level?: PlayerLevel; bait?: { charges: number } };
export const gainFrom = (value: unknown): XpGain | undefined => {
  const gain = (value as { xpGain?: XpGain } | null)?.xpGain;
  return gain && Number.isFinite(gain.gained) && gain.gained > 0 && Number.isFinite(gain.xp) && Number.isFinite(gain.level) ? gain : undefined;
};
export function useLevel(adapter?: FishingAdapter, source?: FishingState | null) {
  const [value, setValue] = useState<PlayerLevel>({ xp: 0, ...levelForXp(0), maxLevel: MAX_LEVEL });
  const [celebration, setCelebration] = useState<XpGain | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const epoch = ++generation.current;
    try {
      const client = adapter as LevelFishingAdapter | undefined;
      const next = client?.getLevel ? await client.getLevel() : (await client?.state() as LevelFishingState | undefined)?.level;
      if (next && epoch === generation.current) setValue(next);
    } catch { /* 다음 서버 갱신에서 확인한다. */ }
  }, [adapter]);
  useEffect(() => {
    setValue({ xp: 0, ...levelForXp(0), maxLevel: MAX_LEVEL }); setCelebration(null);
    void refresh(); return () => { generation.current++; };
  }, [refresh]);
  useEffect(() => { const next = (source as LevelFishingState | null)?.level; if (next) setValue(next); }, [source]);
  useEffect(() => { if (!celebration) return; const timer = setTimeout(() => setCelebration(null), 3000); return () => clearTimeout(timer); }, [celebration]);
  const onXp = useCallback((gain?: XpGain) => {
    if (gain) {
      generation.current++;
      setValue({ xp: gain.xp, ...levelForXp(gain.xp), maxLevel: MAX_LEVEL });
      if (gain.leveledUp) setCelebration(gain);
    }
    void refresh();
  }, [refresh]);
  return { ...value, refresh, onXp, celebration };
}
