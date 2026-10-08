import { useCallback, useEffect, useRef, useState } from 'react';
import { levelForXp, MAX_LEVEL } from '../logic/levels';
import type { FishingAdapter, FishingState } from './fishingAdapter';
import { parseXpGain } from '../logic/levels';
import type { PlayerLevel, XpGain } from '../logic/levels';
export type { PlayerLevel, XpGain } from '../logic/levels';
export type LevelFishingAdapter = FishingAdapter;
export type LevelFishingState = FishingState;
export const gainFrom = (value: unknown): XpGain | undefined =>
  parseXpGain((value as { xpGain?: unknown } | null)?.xpGain);
export function useLevel(adapter?: FishingAdapter, source?: FishingState | null) {
  const [value, setValue] = useState<PlayerLevel>({ xp: 0, ...levelForXp(0), maxLevel: MAX_LEVEL });
  const [celebration, setCelebration] = useState<XpGain | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const epoch = ++generation.current;
    try {
      const client = adapter;
      const next = (await client?.getLevel?.()) ?? (await client?.state())?.level;
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
