import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { WorldGameHandle } from '../game/boot';
import { applyPersonalClock, worldClockAt } from '../logic/worldClock';
import type { ServerWorldClock } from '../logic/worldClock';
import type { FishingAdapter, FishingOverride } from './fishingAdapter';

/** 열린 장면의 전역 시계: 보이는 동안에만 60초마다 갱신한다. */
export function useWorldClock(adapter: FishingAdapter | undefined, handle: RefObject<WorldGameHandle | null>, scene: string | undefined, ready: boolean, personal?: FishingOverride) {
  const [clock, setClock] = useState<ServerWorldClock | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    const value = await adapter?.getWorldClock?.();
    if (!value || request !== generation.current) return;
    setClock(value);
    const effective = applyPersonalClock(value, personal);
    handle.current?.setWorldTime(effective.phase, effective.weather);
  }, [adapter, handle, personal]);
  useEffect(() => {
    if (!ready || !adapter?.getWorldClock) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const visible = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (!document.hidden) {
        void refresh();
        timer = setInterval(() => { void refresh(); }, 60_000);
      }
    };
    visible();
    document.addEventListener('visibilitychange', visible);
    return () => { ++generation.current; if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [adapter, refresh, scene, ready]);
  // 서버 시각 기준으로 만료 즉시 자동으로 돌아간다. 추가 폴링은 하지 않는다.
  useEffect(() => {
    if (!clock?.override) return;
    const remaining = Date.parse(clock.override.expiresAt) - Date.parse(clock.serverNow);
    const receivedAt = Date.now();
    const timer = setTimeout(() => {
      const automatic = worldClockAt(Date.parse(clock.serverNow) + Date.now() - receivedAt, personal);
      handle.current?.setWorldTime(automatic.phase, automatic.weather);
      setClock({ ...automatic, override: null, serverNow: new Date(Date.parse(clock.serverNow) + Date.now() - receivedAt).toISOString() });
    }, Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [clock, handle, personal]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const target = window as unknown as { __pixelWorldRefreshClock?: () => Promise<void> };
    target.__pixelWorldRefreshClock = refresh;
    return () => { delete target.__pixelWorldRefreshClock; };
  }, [refresh]);
  return { clock, refresh };
}
