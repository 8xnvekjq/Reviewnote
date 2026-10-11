import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPixelBag, sellPixelBag } from '../../../utils/pixelBag';
import type { Bag, BagItemKind } from '../logic/bag';

/** 가방 상태. 잡거나 수확·출품하면 refresh, 광장 상점에서 sell. 판매로 포인트가 바뀌면 onPointsChanged. */
export function useBag(userId: string, onPointsChanged?: () => void) {
  const [bag, setBag] = useState<Bag | null>(null);
  const [busy, setBusy] = useState(false);
  const pointsChanged = useRef(onPointsChanged); pointsChanged.current = onPointsChanged;
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const epoch = ++generation.current;
    const next = await fetchPixelBag();
    if (next && epoch === generation.current) setBag(next);
  }, []);
  useEffect(() => { setBag(null); void refresh(); }, [userId, refresh]);
  const sell = useCallback(async (items: { kind: BagItemKind; ref: string; qty: number }[] | null) => {
    setBusy(true);
    try {
      const result = await sellPixelBag(items);
      generation.current++;
      if (result.bag) setBag(result.bag); else void refresh();
      if (result.ok && result.awarded > 0) pointsChanged.current?.();
      return result;
    } finally { setBusy(false); }
  }, [refresh]);
  return { bag, busy, refresh, sell };
}
export type BagState = ReturnType<typeof useBag>;
